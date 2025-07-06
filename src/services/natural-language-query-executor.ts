import { createOrgScopedDb } from '@/lib/db/org-scoped-db';
import { db } from '@/data/db';
import { devices, areas, locations, events } from '@/data/db/schema';
import { eq, and, gte, lte, inArray, desc, count, sql } from 'drizzle-orm';
import type {
  InterpretedQuery,
  QueryResults,
  QueryType,
  QueryError
} from '@/types/ai/natural-language-query-types';
import { getDeviceTypeInfo } from '@/lib/mappings/identification';
import { EVENT_TYPE_DISPLAY_MAP, EVENT_CATEGORY_DISPLAY_MAP } from '@/lib/mappings/definitions';

export class NaturalLanguageQueryExecutor {
  constructor(private organizationId: string) {}

  /**
   * Executes an interpreted query and returns results
   */
  async executeQuery(interpretation: InterpretedQuery): Promise<QueryResults> {
    const startTime = Date.now();
    
    try {
      let results: QueryResults;
      
      switch (interpretation.queryType) {
        case 'events':
          results = await this.executeEventQuery(interpretation);
          break;
        case 'status':
          results = await this.executeStatusQuery(interpretation);
          break;
        case 'analytics':
          results = await this.executeAnalyticsQuery(interpretation);
          break;
        default:
          throw new Error(`Unsupported query type: ${interpretation.queryType}`);
      }
      
      // Add execution metadata
      results.executionTime = Date.now() - startTime;
      results.queryExecutedAt = new Date();
      results.interpretation = interpretation.interpretation;
      results.queryType = interpretation.queryType;
      
      return results;
      
    } catch (error) {
      console.error('[QueryExecutor] Error executing query:', error);
      throw error;
    }
  }

  /**
   * Executes event queries - "show door events from building A"
   */
  private async executeEventQuery(interpretation: InterpretedQuery): Promise<QueryResults> {
    const orgDb = createOrgScopedDb(this.organizationId);
    
    // Prepare filters for the event repository query
    const filters = {
      eventCategories: interpretation.filters.eventCategories,
      connectorCategory: undefined, // Not directly supported yet
      locationId: interpretation.filters.locationIds?.[0] // Take first location if multiple
    };
    
    // Calculate pagination parameters
    const limit = 100; // Default limit for natural language queries
    const offset = 0;   // Always start from the beginning for now
    
    try {
      // Use existing organization-scoped event query
      const rawEvents = await orgDb.events.findRecent(limit + 1, offset, filters);
      
      // Filter results based on additional criteria from interpretation
      let filteredEvents = rawEvents.slice(0, limit); // Remove the +1 pagination check
      
      // Apply time range filter if specified
      if (interpretation.timeRange) {
        filteredEvents = filteredEvents.filter(event => {
          const eventTime = new Date(event.timestamp);
          return eventTime >= interpretation.timeRange!.start && 
                 eventTime <= interpretation.timeRange!.end;
        });
      }
      
      // Apply device name filters if specified
      if (interpretation.filters.deviceNames && interpretation.filters.deviceNames.length > 0) {
        const deviceNameSet = new Set(interpretation.filters.deviceNames.map(name => name.toLowerCase()));
        filteredEvents = filteredEvents.filter(event => 
          event.deviceName && deviceNameSet.has(event.deviceName.toLowerCase())
        );
      }
      
      // Apply device type filters if specified
      if (interpretation.filters.deviceTypes && interpretation.filters.deviceTypes.length > 0) {
        const deviceTypeSet = new Set(interpretation.filters.deviceTypes.map(type => type.toLowerCase()));
        filteredEvents = filteredEvents.filter(event => {
          const deviceTypeInfo = getDeviceTypeInfo(event.connectorCategory || 'unknown', event.rawDeviceType || 'unknown');
          return deviceTypeSet.has(deviceTypeInfo.type.toLowerCase()) ||
                 deviceTypeSet.has(deviceTypeInfo.subtype?.toLowerCase() || '') ||
                 deviceTypeSet.has((event.rawDeviceType || '').toLowerCase());
        });
      }
      
      // Apply area name filters if specified
      if (interpretation.filters.areaNames && interpretation.filters.areaNames.length > 0) {
        const areaNameSet = new Set(interpretation.filters.areaNames.map(name => name.toLowerCase()));
        filteredEvents = filteredEvents.filter(event =>
          event.areaName && areaNameSet.has(event.areaName.toLowerCase())
        );
      }
      
      // Apply location name filters if specified
      if (interpretation.filters.locationNames && interpretation.filters.locationNames.length > 0) {
        const locationNameSet = new Set(interpretation.filters.locationNames.map(name => name.toLowerCase()));
        filteredEvents = filteredEvents.filter(event =>
          event.locationName && locationNameSet.has(event.locationName.toLowerCase())
        );
      }
      
      // Transform database results to QueryResults format
      const events = filteredEvents.map(event => {
        // Parse payload if it's a string
        let payload = null;
        try {
          if (typeof event.standardizedPayload === 'string' && event.standardizedPayload) {
            payload = JSON.parse(event.standardizedPayload);
          } else if (event.standardizedPayload) {
            payload = event.standardizedPayload as any;
          }
        } catch (e) {
          console.warn(`Failed to parse payload for event ${event.eventUuid}:`, e);
        }
        
        return {
          id: event.id.toString(),
          eventUuid: event.eventUuid,
          timestamp: new Date(event.timestamp),
          deviceName: event.deviceName || undefined,
          eventType: EVENT_TYPE_DISPLAY_MAP[event.standardizedEventType as keyof typeof EVENT_TYPE_DISPLAY_MAP] || event.standardizedEventType,
          eventCategory: EVENT_CATEGORY_DISPLAY_MAP[event.standardizedEventCategory as keyof typeof EVENT_CATEGORY_DISPLAY_MAP] || event.standardizedEventCategory,
          locationName: event.locationName || undefined,
          areaName: event.areaName || undefined,
          displayState: payload?.displayState,
          payload
        };
      });
      
      return {
        interpretation: interpretation.interpretation,
        queryType: 'events' as QueryType,
        events,
        totalResults: events.length,
        executionTime: 0, // Will be set by caller
        queryExecutedAt: new Date()
      };
      
    } catch (error) {
      console.error('[QueryExecutor] Error executing event query:', error);
      throw new Error(`Failed to execute event query: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Executes status queries - "what sensors are offline"
   */
  private async executeStatusQuery(interpretation: InterpretedQuery): Promise<QueryResults> {
    try {
      // Get all devices using organization-scoped approach
      const orgDb = createOrgScopedDb(this.organizationId);
      const allDevices = await orgDb.devices.findAll();
      
      let filteredDevices = allDevices;
      
      // Apply device type filters
      if (interpretation.filters.deviceTypes && interpretation.filters.deviceTypes.length > 0) {
        const deviceTypeSet = new Set(interpretation.filters.deviceTypes.map(type => type.toLowerCase()));
        filteredDevices = filteredDevices.filter(device => {
          const deviceTypeInfo = getDeviceTypeInfo(device.connector?.category || 'unknown', device.type);
          return deviceTypeSet.has(deviceTypeInfo.type.toLowerCase()) ||
                 deviceTypeSet.has(deviceTypeInfo.subtype?.toLowerCase() || '') ||
                 deviceTypeSet.has(device.type.toLowerCase());
        });
      }
      
      // Apply device name filters
      if (interpretation.filters.deviceNames && interpretation.filters.deviceNames.length > 0) {
        const deviceNameSet = new Set(interpretation.filters.deviceNames.map(name => name.toLowerCase()));
        filteredDevices = filteredDevices.filter(device =>
          device.name && deviceNameSet.has(device.name.toLowerCase())
        );
      }
      
      // Apply area name filters - need to query area names separately since orgDb doesn't include them
      if (interpretation.filters.areaNames && interpretation.filters.areaNames.length > 0) {
        // Get area IDs by names first
        const areas = await orgDb.areas.findAll();
        const areaNameSet = new Set(interpretation.filters.areaNames.map(name => name.toLowerCase()));
        const matchingAreaIds = areas
          .filter(area => areaNameSet.has(area.name.toLowerCase()))
          .map(area => area.id);
        
        filteredDevices = filteredDevices.filter(device =>
          device.areaId && matchingAreaIds.includes(device.areaId)
        );
      }
      
      // Apply location name filters - need to query location names separately
      if (interpretation.filters.locationNames && interpretation.filters.locationNames.length > 0) {
        // Get location IDs by names first
        const locations = await orgDb.locations.findAll();
        const locationNameSet = new Set(interpretation.filters.locationNames.map(name => name.toLowerCase()));
        const matchingLocationIds = locations
          .filter(location => locationNameSet.has(location.name.toLowerCase()))
          .map(location => location.id);
        
        filteredDevices = filteredDevices.filter(device =>
          device.locationId && matchingLocationIds.includes(device.locationId)
        );
      }
      
      // Apply online status filter if specified
      if (interpretation.filters.onlineStatus !== undefined) {
        const wantOnline = interpretation.filters.onlineStatus;
        filteredDevices = filteredDevices.filter(device => {
          const isOnline = device.status && device.status !== 'offline';
          return wantOnline ? isOnline : !isOnline;
        });
      }
      
      // Transform to QueryResults format
      const deviceStatuses = filteredDevices.map(device => {
        // For area and location names, we need to do a lookup since the device only has IDs
        // This could be optimized by including area/location names in the orgDb.devices.findAll query
        return {
          deviceId: device.id,
          deviceName: device.name || 'Unknown Device',
          deviceType: device.type,
          status: device.status || 'unknown',
          lastSeen: device.updatedAt || undefined,
          locationName: undefined, // TODO: Could lookup location name by locationId if needed
          areaName: undefined // TODO: Could lookup area name by areaId if needed
        };
      });
      
      return {
        interpretation: interpretation.interpretation,
        queryType: 'status' as QueryType,
        deviceStatuses,
        totalResults: deviceStatuses.length,
        executionTime: 0, // Will be set by caller
        queryExecutedAt: new Date()
      };
      
    } catch (error) {
      console.error('[QueryExecutor] Error executing status query:', error);
      throw new Error(`Failed to execute status query: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Executes analytics queries - "how many events occurred last week"
   */
  private async executeAnalyticsQuery(interpretation: InterpretedQuery): Promise<QueryResults> {
    try {
      const orgDb = createOrgScopedDb(this.organizationId);
      
      // For now, implement basic count analytics
      // TODO: Extend this for more complex analytics based on aggregation.type
      
      // Prepare base filters
      const filters = {
        eventCategories: interpretation.filters.eventCategories,
        connectorCategory: undefined,
        locationId: interpretation.filters.locationIds?.[0]
      };
      
      // Get events for analytics (use a higher limit for counting)
      const rawEvents = await orgDb.events.findRecent(10000, 0, filters);
      
      let analyticsEvents = rawEvents;
      
      // Apply time range filter
      if (interpretation.timeRange) {
        analyticsEvents = analyticsEvents.filter(event => {
          const eventTime = new Date(event.timestamp);
          return eventTime >= interpretation.timeRange!.start && 
                 eventTime <= interpretation.timeRange!.end;
        });
      }
      
      // Apply additional filters (similar to event query)
      if (interpretation.filters.deviceNames && interpretation.filters.deviceNames.length > 0) {
        const deviceNameSet = new Set(interpretation.filters.deviceNames.map(name => name.toLowerCase()));
        analyticsEvents = analyticsEvents.filter(event => 
          event.deviceName && deviceNameSet.has(event.deviceName.toLowerCase())
        );
      }
      
      // Calculate analytics based on aggregation type
      const analytics: any = {};
      
      if (!interpretation.aggregation || interpretation.aggregation.type === 'count') {
        analytics.count = analyticsEvents.length;
      }
      
      if (interpretation.aggregation?.type === 'groupBy') {
        // Group by the specified field
        const field = interpretation.aggregation.field || 'eventType';
        const breakdown: Record<string, number> = {};
        
        analyticsEvents.forEach(event => {
          let groupKey = 'unknown';
          
          switch (field.toLowerCase()) {
            case 'eventtype':
            case 'type':
              groupKey = event.standardizedEventType || 'unknown';
              break;
            case 'category':
              groupKey = event.standardizedEventCategory || 'unknown';
              break;
            case 'device':
            case 'devicename':
              groupKey = event.deviceName || 'unknown';
              break;
            case 'area':
            case 'areaname':
              groupKey = event.areaName || 'unassigned';
              break;
            case 'location':
            case 'locationname':
              groupKey = event.locationName || 'unknown';
              break;
            default:
              groupKey = 'unknown';
          }
          
          breakdown[groupKey] = (breakdown[groupKey] || 0) + 1;
        });
        
        analytics.breakdown = breakdown;
        analytics.count = analyticsEvents.length;
      }
      
      return {
        interpretation: interpretation.interpretation,
        queryType: 'analytics' as QueryType,
        analytics,
        totalResults: analyticsEvents.length,
        executionTime: 0, // Will be set by caller
        queryExecutedAt: new Date()
      };
      
    } catch (error) {
      console.error('[QueryExecutor] Error executing analytics query:', error);
      throw new Error(`Failed to execute analytics query: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
} 