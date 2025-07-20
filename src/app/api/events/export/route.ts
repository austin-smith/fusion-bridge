import { NextRequest, NextResponse } from 'next/server';
import { withOrganizationAuth, type OrganizationAuthContext } from '@/lib/auth/withOrganizationAuth';
import { createOrgScopedDb } from '@/lib/db/org-scoped-db';
import { EventsExportService } from '@/services/events-export-service';
import type { EnrichedEvent } from '@/types/events';
import { getDeviceTypeInfo } from '@/lib/mappings/identification';
import { EventCategory, EventSubtype } from '@/lib/mappings/definitions';
import { PikoConfig } from '@/services/drivers/piko';
import { shouldApiEventTriggerAlarmInZone } from '@/lib/alarm-event-evaluation';

// Define the enriched event structure (same as main events API)
interface OrgEnrichedEvent {
  id: number;
  eventUuid: string;
  deviceId: string;
  timestamp: Date;
  standardizedEventCategory: string;
  standardizedEventType: string;
  standardizedEventSubtype: string | null;
  standardizedPayload: unknown;
  rawPayload: unknown;
  rawEventType: string | null;
  connectorId: string;
  deviceInternalId: string | null;
  deviceName: string | null;
  rawDeviceType: string | null;
  connectorName: string | null;
  connectorCategory: string | null;
  connectorConfig: string | null;
  spaceId: string | null;
  spaceName: string | null;
  locationId: string | null;
  locationName: string | null;
  locationPath: string | null;
  // Alarm zone fields
  alarmZoneId: string | null;
  alarmZoneName: string | null;
  alarmZoneTriggerBehavior: string | null;
}

interface ApiEnrichedEvent {
  id: number;
  eventUuid: string;
  deviceId: string;
  deviceInternalId?: string;
  deviceName?: string;
  connectorId: string;
  connectorName?: string;
  connectorCategory: string;
  spaceId?: string;
  spaceName?: string;
  locationId?: string;
  locationName?: string;
  timestamp: number; // Epoch ms
  eventCategory: string;
  eventType: string;
  eventSubtype?: EventSubtype;
  payload: Record<string, any> | null;
  rawPayload: Record<string, any> | null;
  deviceTypeInfo: any;
  displayState?: string;
  rawEventType?: string;
  bestShotUrlComponents?: {
    type: 'cloud' | 'local';
    pikoSystemId?: string;
    connectorId: string;
    objectTrackId: string;
    cameraId: string;
  };
}

export const GET = withOrganizationAuth(async (request: NextRequest, authContext: OrganizationAuthContext) => {
  try {
    const searchParams = request.nextUrl.searchParams;
    
    // Parse export parameters
    const format = searchParams.get('format') as 'csv' | 'xlsx' | 'json' || 'csv';
    const scope = searchParams.get('scope') || 'filtered';
    const columnsParam = searchParams.get('columns') || 'essential';
    const includeMetadata = searchParams.get('includeMetadata') === 'true';
    
    // Parse columns selection
    let columns: string[];
    if (columnsParam.includes(',')) {
      // Custom column selection
      columns = columnsParam.split(',').map(c => c.trim()).filter(c => c.length > 0);
    } else {
      // Use preset
      const presets = EventsExportService.getColumnPresets();
      const preset = presets.find(p => p.key === columnsParam);
      columns = preset ? preset.columns : presets[0].columns; // Default to essential
    }

    // Parse filter parameters (reuse existing logic from events/route.ts)
    const eventCategoriesRaw = searchParams.get('eventCategories');
    const connectorCategory = searchParams.get('connectorCategory') || undefined;
    const locationId = searchParams.get('locationId') || undefined;
    const spaceId = searchParams.get('spaceId') || undefined;
    const alarmEventsOnly = searchParams.get('alarmEventsOnly') === 'true';
    const timeStart = searchParams.get('timeStart');
    const timeEnd = searchParams.get('timeEnd');

    // Column filter parameters
    const deviceNameFilter = searchParams.get('deviceNameFilter') || undefined;
    const eventTypeFilter = searchParams.get('eventTypeFilter') || undefined;
    const deviceTypeFilter = searchParams.get('deviceTypeFilter') || undefined;
    const connectorNameFilter = searchParams.get('connectorNameFilter') || undefined;

    let eventCategories: string[] | undefined = undefined;
    if (eventCategoriesRaw) {
      eventCategories = eventCategoriesRaw.split(',').map(cat => cat.trim()).filter(cat => cat.length > 0);
      if (eventCategories.length === 0) {
        eventCategories = undefined;
      }
    }

    const filters = {
      eventCategories: eventCategories,
      connectorCategory: connectorCategory,
      locationId: locationId,
      spaceId: spaceId,
      deviceNameFilter: deviceNameFilter,
      eventTypeFilter: eventTypeFilter,
      deviceTypeFilter: deviceTypeFilter,
      connectorNameFilter: connectorNameFilter,
      timeStart: timeStart || undefined,
      timeEnd: timeEnd || undefined
    };

    // Determine export limits based on scope
    let limit: number;
    switch (scope) {
      case 'page':
        limit = 50;
        break;
      case 'filtered':
        limit = 10000; // Reasonable limit for filtered data
        break;
      case 'custom':
        limit = 50000; // Higher limit for custom exports
        break;
      default:
        limit = 50;
    }

    // Use organization-scoped event query
    const orgDb = createOrgScopedDb(authContext.organizationId);
    const recentEnrichedEvents: OrgEnrichedEvent[] = await orgDb.events.findRecent(limit, 0, filters);

    // Apply alarm filtering if requested
    let filteredEvents = recentEnrichedEvents;
    if (alarmEventsOnly) {
      console.log(`[Export API] Applying alarm-only filtering to ${recentEnrichedEvents.length} events`);
      const alarmFilterPromises = recentEnrichedEvents.map(async (event) => {
        // Only events from devices assigned to alarm zones can be alarm events
        if (!event.alarmZoneId || !event.alarmZoneTriggerBehavior) {
          return null; // Not an alarm event - device not in alarm zone
        }

        try {
          // Parse payload for alarm evaluation
          let payload: Record<string, any> | null = null;
          try {
            if (typeof event.standardizedPayload === 'string' && event.standardizedPayload) {
              payload = JSON.parse(event.standardizedPayload);
            } else {
              payload = event.standardizedPayload as Record<string, any> | null;
            }
          } catch (e) {
            console.warn(`Failed to parse payload for alarm evaluation on event ${event.eventUuid}:`, e);
          }

          // Use shared alarm evaluation logic
          const wouldTriggerAlarm = await shouldApiEventTriggerAlarmInZone(
            event.standardizedEventType,
            event.standardizedEventSubtype,
            payload,
            {
              id: event.alarmZoneId,
              triggerBehavior: event.alarmZoneTriggerBehavior as 'standard' | 'custom'
            },
            authContext.organizationId
          );

          return wouldTriggerAlarm ? event : null;
        } catch (error) {
          console.warn(`Error evaluating alarm status for event ${event.eventUuid}:`, error);
          return null; // Exclude on error for safety
        }
      });

      const alarmFilterResults = await Promise.all(alarmFilterPromises);
      filteredEvents = alarmFilterResults.filter((event): event is OrgEnrichedEvent => event !== null);
      console.log(`[Export API] Alarm filtering: ${recentEnrichedEvents.length} -> ${filteredEvents.length} events`);
    }

    // Transform to API format (reuse existing transformation logic)
    const apiEvents: ApiEnrichedEvent[] = filteredEvents.map((event: OrgEnrichedEvent) => {
      let payload: Record<string, any> | null = null;
      let rawPayload: Record<string, any> | null = null;
      let displayState: string | undefined = undefined;
      let bestShotUrlComponents: ApiEnrichedEvent['bestShotUrlComponents'] | undefined = undefined;
      const connectorCategory = event.connectorCategory ?? 'unknown';

      // Try to parse standardized payload
      try {
        if (typeof event.standardizedPayload === 'string' && event.standardizedPayload) {
             payload = JSON.parse(event.standardizedPayload);
        } else {
             payload = event.standardizedPayload as Record<string, any> | null;
        }
      } catch (e) {
        console.warn(`Failed to parse standardized payload for event ${event.eventUuid}:`, e);
      }

      // Try to parse raw payload
      try {
        if (typeof event.rawPayload === 'string' && event.rawPayload) {
             rawPayload = JSON.parse(event.rawPayload);
        } else {
             rawPayload = event.rawPayload as Record<string, any> | null;
        }
      } catch (e) {
        console.warn(`Failed to parse raw payload for event ${event.eventUuid}:`, e);
      }

      // Derive deviceTypeInfo using the joined rawDeviceType
      const deviceTypeInfo = getDeviceTypeInfo(connectorCategory, event.rawDeviceType ?? 'Unknown');

      // Derive displayState from parsed payload
      displayState = payload?.displayState;
      
      // Handle Piko bestShotUrlComponents
      if (
        connectorCategory === 'piko' &&
        event.standardizedEventCategory === EventCategory.ANALYTICS &&
        payload?.objectTrackId && 
        typeof payload.objectTrackId === 'string' &&
        event.deviceId
      ) {
        if (event.connectorConfig) {
            try {
                const config = JSON.parse(event.connectorConfig) as PikoConfig;
                
                if (config.type === 'cloud' && config.selectedSystem) {
                    bestShotUrlComponents = {
                        type: 'cloud',
                        pikoSystemId: config.selectedSystem,
                        objectTrackId: payload.objectTrackId,
                        cameraId: event.deviceId,
                        connectorId: event.connectorId
                    };
                } else if (config.type === 'local') {
                    bestShotUrlComponents = {
                        type: 'local',
                        objectTrackId: payload.objectTrackId,
                        cameraId: event.deviceId,
                        connectorId: event.connectorId
                    };
                }
            } catch (e) {
                console.warn(`Failed to parse Piko config for connector ${event.connectorId} on event ${event.eventUuid}:`, e);
            }
        }
      }

      return {
        id: event.id,
        eventUuid: event.eventUuid,
        deviceId: event.deviceId,
        deviceInternalId: event.deviceInternalId ?? undefined,
        deviceName: event.deviceName ?? undefined,
        connectorId: event.connectorId,
        connectorName: event.connectorName ?? undefined,
        connectorCategory: connectorCategory,
        timestamp: event.timestamp.getTime(),
        eventCategory: event.standardizedEventCategory,
        eventType: event.standardizedEventType,
        eventSubtype: event.standardizedEventSubtype as EventSubtype ?? undefined,
        payload: payload,
        deviceTypeInfo: deviceTypeInfo,
        displayState: displayState,
        rawPayload: rawPayload,
        rawEventType: event.rawEventType ?? undefined,
        bestShotUrlComponents: bestShotUrlComponents,
        spaceId: event.spaceId ?? undefined,
        spaceName: event.spaceName ?? undefined,
        locationId: event.locationId ?? undefined,
        locationName: event.locationName ?? undefined,
      };
    });

    // Export using EventsExportService
    const exportService = new EventsExportService();
    const result = await exportService.exportEventsForAPI(
      apiEvents as EnrichedEvent[], 
      { format, columns, includeMetadata }
    );

    const headers = {
      'Content-Type': result.contentType,
      'Content-Disposition': `attachment; filename="${result.filename}"`,
      'Content-Length': result.data.length.toString(),
    };

    console.log(`[Export API] Exported ${apiEvents.length} events in ${format} format with ${columns.length} columns`);

    return new Response(result.data, { headers });

  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json(
      { success: false, error: 'Export failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}); 