/**
 * Simple functions for OpenAI to call
 * Each function does ONE thing well
 */

import { createOrgScopedDb } from '@/lib/db/org-scoped-db';
import { ArmedState, ActionableState, DisplayState, ON, OFF } from '@/lib/mappings/definitions';
import { actionHandlers } from '@/lib/device-actions';
import type { ChatAction, DeviceActionMetadata, AreaActionMetadata, ActionableResponse } from '@/types/ai/chat-actions';

// OpenAI function definitions
export const openAIFunctions = [
  {
    name: "count_events",
    description: "Count events matching criteria. Use this for questions about how many events occurred. For relative time queries like 'today', 'yesterday', calculate the exact time range in the user's timezone first, then convert to UTC.",
    parameters: {
      type: "object",
      properties: {
        timeStart: { 
          type: "string", 
          format: "date-time",
          description: "Start time for filtering (UTC ISO date string). For 'today', use start of today in user timezone converted to UTC." 
        },
        timeEnd: { 
          type: "string", 
          format: "date-time",
          description: "End time for filtering (UTC ISO date string). For 'today', use end of today in user timezone converted to UTC." 
        },
        deviceNames: { 
          type: "array", 
          items: { type: "string" },
          description: "Filter by specific device names"
        },
        eventTypes: { 
          type: "array", 
          items: { type: "string" },
          description: "Filter by event types"
        }
      }
    }
  },
  {
    name: "count_devices",
    description: "Count devices matching criteria. Use this for questions about how many devices there are.",
    parameters: {
      type: "object",
      properties: {
        connectorCategories: { 
          type: "array", 
          items: { type: "string" },
          description: "Filter by connector categories like 'piko', 'yolink', 'genea', etc."
        },
        deviceTypes: { 
          type: "array", 
          items: { type: "string" },
          description: "Filter by device types"
        },
        statuses: { 
          type: "array", 
          items: { type: "string" },
          description: "Filter by device statuses"
        }
      }
    }
  },
  {
    name: "query_events",
    description: "Search and filter security events with optional aggregation",
    parameters: {
      type: "object",
      properties: {
        timeRange: { 
          type: "object",
          properties: {
            start: { type: "string", format: "date-time" },
            end: { type: "string", format: "date-time" }
          }
        },
        filters: {
          type: "object",
          properties: {
            deviceNames: { type: "array", items: { type: "string" } },
            eventTypes: { type: "array", items: { type: "string" } },
            locations: { type: "array", items: { type: "string" } },
            areas: { type: "array", items: { type: "string" } }
          }
        },
        aggregation: {
          type: "object",
          properties: {
            groupBy: { type: "string", enum: ["device", "type", "location", "area", "time"] },
            timeBucket: { type: "string", enum: ["hour", "day", "week", "month"] }
          }
        },
        limit: { type: "integer", default: 100 }
      }
    }
  },
  {
    name: "check_device_status",
    description: "Get current status and health of devices",
    parameters: {
      type: "object",
      properties: {
        deviceFilter: {
          type: "object",
          properties: {
            names: { type: "array", items: { type: "string" } },
            types: { type: "array", items: { type: "string" } },
            connectorCategories: { type: "array", items: { type: "string" }, description: "Filter by connector categories like 'piko', 'yolink', 'genea', etc." },
            locations: { type: "array", items: { type: "string" } },
            statuses: { type: "array", items: { type: "string" } }
          }
        },
        includeMetrics: { type: "boolean", default: false }
      }
    }
  },
  {
    name: "find_controllable_devices",
    description: "Find devices that can be controlled (turned on/off, activated/deactivated). Use this when users want to control devices, turn devices on/off, or ask about controllable devices.",
    parameters: {
      type: "object",
      properties: {
        deviceFilter: {
          type: "object",
          properties: {
            names: { type: "array", items: { type: "string" } },
            types: { type: "array", items: { type: "string" } },
            connectorCategories: { type: "array", items: { type: "string" }, description: "Filter by connector categories like 'piko', 'yolink', 'genea', etc." }
          }
        },
        actionIntent: {
          type: "string",
          enum: ["turn_on", "turn_off", "list_all"],
          description: "Specific action intent: 'turn_on' for turn on requests, 'turn_off' for turn off requests, 'list_all' to show all available actions"
        }
      }
    }
  },
  {
    name: "check_area_status",
    description: "Get current armed state and status of areas",
    parameters: {
      type: "object",
      properties: {
        areaFilter: {
          type: "object",
          properties: {
            names: { type: "array", items: { type: "string" } },
            locations: { type: "array", items: { type: "string" } },
            armedStates: { type: "array", items: { type: "string" } }
          }
        }
      }
    }
  },
  {
    name: "get_system_overview",
    description: "Get system overview including counts and current status",
    parameters: {
      type: "object",
      properties: {}
    }
  }
];

// Function implementations
export async function executeFunction(
  name: string, 
  args: any, 
  organizationId: string
): Promise<any> {
  const orgDb = createOrgScopedDb(organizationId);
  
  switch (name) {
    case 'count_events':
      return countEvents(args, organizationId);
    
    case 'count_devices':
      return countDevices(args, organizationId);
    
    case 'query_events':
      return queryEvents(orgDb, args);
    
    case 'check_device_status':
      return checkDeviceStatus(orgDb, args);
    
    case 'find_controllable_devices':
      return findControllableDevices(orgDb, args);
    
    case 'check_area_status':
      return checkAreaStatus(orgDb, args);
      
    case 'get_system_overview':
      return getSystemOverview(orgDb);
      
    default:
      throw new Error(`Unknown function: ${name}`);
  }
}

// Count events using direct database query (proper database counting)
async function countEvents(args: any, organizationId: string) {
  const { timeStart, timeEnd, deviceNames, eventTypes } = args;
  
  try {
    // Import dependencies at the top level or here
    const { db } = await import('@/data/db');
    const { events, devices, connectors } = await import('@/data/db/schema');
    const { and, eq, gte, lte, inArray, count } = await import('drizzle-orm');
    
    // Build WHERE conditions
    const conditions = [eq(connectors.organizationId, organizationId)];
    
    // Time range filtering
    if (timeStart && timeEnd) {
      const startDate = new Date(timeStart);
      const endDate = new Date(timeEnd);
      conditions.push(gte(events.timestamp, startDate));
      conditions.push(lte(events.timestamp, endDate));
    }
    
    // Event category filtering (ensure uppercase to match database)
    if (eventTypes?.length) {
      const upperCaseEventTypes = eventTypes.map((type: string) => type.toUpperCase());
      conditions.push(inArray(events.standardizedEventCategory, upperCaseEventTypes));
    }
    
    // Build the count query
    let query = db
      .select({ count: count() })
      .from(events)
      .innerJoin(connectors, eq(connectors.id, events.connectorId));
    
    // Add device join if needed for device name filtering
    if (deviceNames?.length) {
      query = query.leftJoin(devices, and(
        eq(devices.connectorId, events.connectorId),
        eq(devices.deviceId, events.deviceId)
      ));
      conditions.push(inArray(devices.name, deviceNames));
    }
    
    const result = await query.where(and(...conditions));
    const eventCount = result[0]?.count || 0;
    
    return {
      count: eventCount,
      filters: {
        timeStart,
        timeEnd,
        deviceNames,
        eventTypes
      }
    };
  } catch (error) {
    console.error('Error counting events:', error);
    return {
      error: error instanceof Error ? error.message : 'Failed to count events',
      count: 0
    };
  }
}

// Count devices using the same counting logic as the API (consistent approach)
async function countDevices(args: any, organizationId: string) {
  const { connectorCategories, deviceTypes, statuses } = args;
  
  try {
    // Import the counting function from the API route
    // This way we reuse the exact same logic without HTTP overhead
    const { db } = await import('@/data/db');
    const { devices, connectors } = await import('@/data/db/schema');
    const { and, eq, count } = await import('drizzle-orm');
    
    // Build WHERE conditions (same logic as API)
    const conditions = [eq(connectors.organizationId, organizationId)];
    
    // Connector category filtering (use first category if multiple)
    const connectorCategory = connectorCategories?.[0];
    if (connectorCategory && connectorCategory.toLowerCase() !== 'all') {
      conditions.push(eq(connectors.category, connectorCategory.toLowerCase()));
    }
    
    // Device type filtering (use first type if multiple)
    const deviceType = deviceTypes?.[0];
    if (deviceType && deviceType.toLowerCase() !== 'all') {
      conditions.push(eq(devices.type, deviceType));
    }
    
    // Status filtering (use first status if multiple)
    const status = statuses?.[0];
    if (status && status.toLowerCase() !== 'all') {
      conditions.push(eq(devices.status, status));
    }
    
    // Build the count query (same as API)
    const result = await db
      .select({ count: count() })
      .from(devices)
      .innerJoin(connectors, eq(devices.connectorId, connectors.id))
      .where(and(...conditions));
    
    const deviceCount = result[0]?.count || 0;
    
    return {
      count: deviceCount,
      filters: {
        connectorCategories,
        deviceTypes,
        statuses
      }
    };
  } catch (error) {
    console.error('Error counting devices:', error);
    return {
      error: error instanceof Error ? error.message : 'Failed to count devices',
      count: 0
    };
  }
}

// Query events with optional filtering and aggregation
async function queryEvents(orgDb: any, args: any) {
  const { timeRange, filters, aggregation, limit = 100 } = args;
  
  // If this is just a count request, use the API directly
  if (!aggregation && limit === 0) {
    try {
      const params = new URLSearchParams();
      params.append('count', 'true');
      
      // Add time range
      if (timeRange) {
        params.append('timeStart', timeRange.start);
        params.append('timeEnd', timeRange.end);
      }
      
      // Add device names filter
      if (filters?.deviceNames?.length) {
        params.append('deviceNames', filters.deviceNames.join(','));
      }
      
      // Add event types filter
      if (filters?.eventTypes?.length) {
        params.append('eventCategories', filters.eventTypes.join(','));
      }
      
      const response = await fetch(`/api/events?${params.toString()}`);
      const data = await response.json();
      
      if (data.success) {
        return {
          count: data.count,
          timeRange: data.timeRange
        };
      } else {
        throw new Error(data.error || 'Failed to count events');
      }
    } catch (error) {
      console.error('Error counting events via API:', error);
      // Fall back to old method
    }
  }
  
  // For non-count queries or fallback, use the existing method
  // Build simple filter object
  const queryFilters: any = {};
  
  // Get events
  const events = await orgDb.events.findRecent(limit, 0, queryFilters);
  
  // Filter by time if specified
  let filteredEvents = events;
  if (timeRange?.start && timeRange?.end) {
    const start = new Date(timeRange.start);
    const end = new Date(timeRange.end);
    filteredEvents = events.filter((e: any) => {
      const eventTime = new Date(e.timestamp);
      return eventTime >= start && eventTime <= end;
    });
  }
  
  // Filter by device names if specified
  if (filters?.deviceNames?.length) {
    const deviceNameSet = new Set(filters.deviceNames.map((n: string) => n.toLowerCase()));
    filteredEvents = filteredEvents.filter((e: any) => 
      e.deviceName && deviceNameSet.has(e.deviceName.toLowerCase())
    );
  }
  
  // Simple aggregation if requested
  if (aggregation?.groupBy) {
    const groups = new Map<string, number>();
    
    filteredEvents.forEach((event: any) => {
      let key = 'unknown';
      switch (aggregation.groupBy) {
        case 'device':
          key = event.deviceName || 'Unknown Device';
          break;
        case 'type':
          key = event.standardizedEventType || 'Unknown Type';
          break;
        case 'location':
          key = event.locationName || 'Unknown Location';
          break;
        case 'area':
          key = event.areaName || 'Unknown Area';
          break;
      }
      groups.set(key, (groups.get(key) || 0) + 1);
    });
    
    return {
      totalCount: filteredEvents.length,
      groups: Array.from(groups.entries()).map(([name, count]) => ({ name, count }))
    };
  }
  
  // Return simple event list
  return {
    count: filteredEvents.length,
    events: filteredEvents.map((e: any) => ({
      id: e.eventUuid,
      timestamp: e.timestamp,
      device: e.deviceName,
      type: e.standardizedEventType,
      area: e.areaName,
      location: e.locationName
    }))
  };
}

// Check device status
async function checkDeviceStatus(orgDb: any, args: any): Promise<ActionableResponse> {
  const { deviceFilter, includeMetrics } = args;
  
  // Get all devices
  const devices = await orgDb.devices.findAll();
  
  // Apply filters
  let filteredDevices = devices;
  
  if (deviceFilter?.names?.length) {
    const nameSet = new Set(deviceFilter.names.map((n: string) => n.toLowerCase()));
    filteredDevices = filteredDevices.filter((d: any) => 
      d.name && nameSet.has(d.name.toLowerCase())
    );
  }
  
  if (deviceFilter?.types?.length) {
    const typeSet = new Set(deviceFilter.types.map((t: string) => t.toLowerCase()));
    filteredDevices = filteredDevices.filter((d: any) => 
      d.type && typeSet.has(d.type.toLowerCase())
    );
  }
  
  if (deviceFilter?.connectorCategories?.length) {
    const categorySet = new Set(deviceFilter.connectorCategories.map((c: string) => c.toLowerCase()));
    filteredDevices = filteredDevices.filter((d: any) => 
      d.connector?.category && categorySet.has(d.connector.category.toLowerCase())
    );
  }
  
  if (deviceFilter?.statuses?.length) {
    const statusSet = new Set(deviceFilter.statuses);
    filteredDevices = filteredDevices.filter((d: any) => 
      d.status && statusSet.has(d.status)
    );
  }
  
  // Generate actions for controllable devices
  const actions: ChatAction[] = [];
  
  try {
    filteredDevices.forEach((device: any) => {
      // Input validation - skip devices with missing required data
      if (!device?.id || !device?.name || !device?.connector?.category) {
        console.warn('[checkDeviceStatus] Skipping device with missing required data:', device?.id);
        return;
      }

      // Check if any action handler can control this device
      const supportedHandler = actionHandlers.find(handler => 
        handler.category === device.connector.category
      );
      
      if (supportedHandler) {
        const deviceContext = {
          id: device.id,
          deviceId: device.deviceId,
          type: device.type,
          connectorId: device.connectorId,
          rawDeviceData: device.rawDeviceData
        };
        
        // Check if device supports ON/OFF actions
        const canTurnOn = supportedHandler.canHandle(deviceContext, ActionableState.SET_ON);
        const canTurnOff = supportedHandler.canHandle(deviceContext, ActionableState.SET_OFF);
        
        if (canTurnOn || canTurnOff) {
          // Fix: Handle undefined displayState properly
          const currentState = device.displayState as DisplayState | undefined;
          
          // Only add actions that would change the current state
          if (canTurnOn && currentState !== ON) {
            actions.push({
              id: `device-${device.id}-on`,
              type: 'device',
              label: `Turn On ${device.name}`,
              icon: 'Power', // Use proper lucide-react icon name
              metadata: {
                internalDeviceId: device.id,
                deviceName: device.name,
                action: ActionableState.SET_ON,
                currentState: currentState,
                connectorCategory: device.connector.category,
                deviceType: device.type
              } as DeviceActionMetadata
            });
          }
          
          if (canTurnOff && currentState !== OFF) {
            actions.push({
              id: `device-${device.id}-off`,
              type: 'device',
              label: `Turn Off ${device.name}`,
              icon: 'PowerOff', // Use proper lucide-react icon name
              metadata: {
                internalDeviceId: device.id,
                deviceName: device.name,
                action: ActionableState.SET_OFF,
                currentState: currentState,
                connectorCategory: device.connector.category,
                deviceType: device.type
              } as DeviceActionMetadata
            });
          }
        }
      }
    });
  } catch (error) {
    console.error('[checkDeviceStatus] Error generating device actions:', error);
    // Continue execution - don't let action generation errors break the whole response
  }
  
  // Return device status with actions
  const results: ActionableResponse = {
    totalCount: filteredDevices.length,
    devices: filteredDevices.map((d: any) => ({
      id: d.id,
      name: d.name,
      type: d.type,
      connectorCategory: d.connector?.category,
      status: d.status || 'unknown',
      area: d.areaId,
      location: d.locationId,
      displayState: d.displayState
    })),
    actions: actions.length > 0 ? actions : undefined
  };
  
  if (includeMetrics) {
    const statusCounts = new Map<string, number>();
    const connectorCategoryCounts = new Map<string, number>();
    
    filteredDevices.forEach((d: any) => {
      const status = d.status || 'unknown';
      statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
      
      const category = d.connector?.category || 'unknown';
      connectorCategoryCounts.set(category, (connectorCategoryCounts.get(category) || 0) + 1);
    });
    
    results.metrics = {
      byStatus: Array.from(statusCounts.entries()).map(([status, count]) => ({ status, count })),
      byConnectorCategory: Array.from(connectorCategoryCounts.entries()).map(([category, count]) => ({ category, count }))
    };
  }
  
  return results;
}

// Find controllable devices
async function findControllableDevices(orgDb: any, args: any): Promise<ActionableResponse> {
  const { deviceFilter, actionIntent = "list_all" } = args;
  
  // Get all devices
  const devices = await orgDb.devices.findAll();
  
  // Apply filters
  let filteredDevices = devices;
  
  if (deviceFilter?.names?.length) {
    const nameSet = new Set(deviceFilter.names.map((n: string) => n.toLowerCase()));
    filteredDevices = filteredDevices.filter((d: any) => 
      d.name && nameSet.has(d.name.toLowerCase())
    );
  }
  
  if (deviceFilter?.types?.length) {
    const typeSet = new Set(deviceFilter.types.map((t: string) => t.toLowerCase()));
    filteredDevices = filteredDevices.filter((d: any) => 
      d.type && typeSet.has(d.type.toLowerCase())
    );
  }
  
  if (deviceFilter?.connectorCategories?.length) {
    const categorySet = new Set(deviceFilter.connectorCategories.map((c: string) => c.toLowerCase()));
    filteredDevices = filteredDevices.filter((d: any) => 
      d.connector?.category && categorySet.has(d.connector.category.toLowerCase())
    );
  }
  
  // Filter to ONLY controllable devices
  const controllableDevices: any[] = [];
  const actions: ChatAction[] = [];
  
  try {
    filteredDevices.forEach((device: any) => {
      // Input validation - skip devices with missing required data
      if (!device?.id || !device?.name || !device?.connector?.category) {
        console.warn('[findControllableDevices] Skipping device with missing required data:', device?.id);
        return;
      }

      // Check if any action handler can control this device
      const supportedHandler = actionHandlers.find(handler => 
        handler.category === device.connector.category
      );
      
      if (supportedHandler) {
        const deviceContext = {
          id: device.id,
          deviceId: device.deviceId,
          type: device.type,
          connectorId: device.connectorId,
          rawDeviceData: device.rawDeviceData
        };
        
        // Check if device supports ON/OFF actions
        const canTurnOn = supportedHandler.canHandle(deviceContext, ActionableState.SET_ON);
        const canTurnOff = supportedHandler.canHandle(deviceContext, ActionableState.SET_OFF);
        
        if (canTurnOn || canTurnOff) {
          // This device is controllable - add to list
          controllableDevices.push(device);
          
          const currentState = device.displayState as DisplayState | undefined;
          
          // Add actions based on intent
          const shouldShowTurnOn = (actionIntent === "list_all" || actionIntent === "turn_on") && 
                                  canTurnOn && currentState !== ON;
          const shouldShowTurnOff = (actionIntent === "list_all" || actionIntent === "turn_off") && 
                                  canTurnOff && currentState !== OFF;
          
          if (shouldShowTurnOn) {
            actions.push({
              id: `device-${device.id}-on`,
              type: 'device',
              label: `Turn On ${device.name}`,
              icon: 'Power',
              metadata: {
                internalDeviceId: device.id,
                deviceName: device.name,
                action: ActionableState.SET_ON,
                currentState: currentState,
                connectorCategory: device.connector.category,
                deviceType: device.type
              } as DeviceActionMetadata
            });
          }
           
          if (shouldShowTurnOff) {
            actions.push({
              id: `device-${device.id}-off`,
              type: 'device',
              label: `Turn Off ${device.name}`,
              icon: 'PowerOff',
              metadata: {
                internalDeviceId: device.id,
                deviceName: device.name,
                action: ActionableState.SET_OFF,
                currentState: currentState,
                connectorCategory: device.connector.category,
                deviceType: device.type
              } as DeviceActionMetadata
            });
          }
        }
      }
    });
  } catch (error) {
    console.error('[findControllableDevices] Error processing devices:', error);
    // Continue execution - don't let errors break the whole response
  }
  
  // Return only controllable devices with their actions
  return {
    totalCount: controllableDevices.length,
    devices: controllableDevices.map((d: any) => ({
      id: d.id,
      name: d.name,
      type: d.type,
      connectorCategory: d.connector?.category,
      status: d.status || 'unknown',
      area: d.areaId,
      location: d.locationId,
      displayState: d.displayState
    })),
    actions: actions.length > 0 ? actions : undefined
  };
}

// Check area status
async function checkAreaStatus(orgDb: any, args: any): Promise<ActionableResponse> {
  const { areaFilter } = args;
  
  // Get all areas
  const areas = await orgDb.areas.findAll();
  
  // Apply filters
  let filteredAreas = areas;
  
  if (areaFilter?.names?.length) {
    const nameSet = new Set(areaFilter.names.map((n: string) => n.toLowerCase()));
    filteredAreas = filteredAreas.filter((a: any) => 
      a.name && nameSet.has(a.name.toLowerCase())
    );
  }
  
  if (areaFilter?.armedStates?.length) {
    const stateSet = new Set(areaFilter.armedStates);
    filteredAreas = filteredAreas.filter((a: any) => 
      a.armedState && stateSet.has(a.armedState)
    );
  }
  
  // Generate actions for areas
  const actions: ChatAction[] = [];
  
  try {
    filteredAreas.forEach((area: any) => {
      // Input validation - skip areas with missing required data
      if (!area?.id || !area?.name) {
        console.warn('[checkAreaStatus] Skipping area with missing required data:', area?.id);
        return;
      }

      const currentState = area.armedState || ArmedState.DISARMED;
      
      // Improved armed state logic - handle all possible states
      const isArmed = currentState === ArmedState.ARMED_AWAY || 
                     currentState === ArmedState.ARMED_STAY || 
                     currentState === ArmedState.TRIGGERED;
      
      // Only add ARM action if area is not already armed (and not triggered)
      if (!isArmed) {
        actions.push({
          id: `area-${area.id}-arm`,
          type: 'area',
          label: `Arm ${area.name}`,
          icon: 'ShieldCheck', // Use proper lucide-react icon name
          metadata: {
            areaId: area.id,
            areaName: area.name,
            targetState: ArmedState.ARMED_AWAY,
            currentState: currentState
          } as AreaActionMetadata
        });
      }
      
      // Only add DISARM action if area is not already disarmed
      if (currentState !== ArmedState.DISARMED) {
        actions.push({
          id: `area-${area.id}-disarm`,
          type: 'area',
          label: `Disarm ${area.name}`,
          icon: 'ShieldOff', // Use proper lucide-react icon name
          metadata: {
            areaId: area.id,
            areaName: area.name,
            targetState: ArmedState.DISARMED,
            currentState: currentState
          } as AreaActionMetadata
        });
      }
    });
  } catch (error) {
    console.error('[checkAreaStatus] Error generating area actions:', error);
    // Continue execution - don't let action generation errors break the whole response
  }
  
  // Return area status with actions
  return {
    totalCount: filteredAreas.length,
    areas: filteredAreas.map((a: any) => ({
      id: a.id,
      name: a.name,
      armedState: a.armedState || ArmedState.DISARMED,
      location: a.locationId
    })),
    actions: actions.length > 0 ? actions : undefined
  };
}

// Get system overview
async function getSystemOverview(orgDb: any): Promise<ActionableResponse> {
  const [devices, areas, locations] = await Promise.all([
    orgDb.devices.findAll(),
    orgDb.areas.findAll(),
    orgDb.locations.findAll()
  ]);
  
  // Count armed states
  const armedStateCounts = new Map<string, number>();
  areas.forEach((a: any) => {
    const state = a.armedState || ArmedState.DISARMED;
    armedStateCounts.set(state, (armedStateCounts.get(state) || 0) + 1);
  });
  
  // Generate quick actions for system overview
  const actions: ChatAction[] = [];
  
  // Note: Removed broken "arm all"/"disarm all" actions as they require 
  // individual API calls per area. This will be implemented properly in 
  // a future phase with batch operations.
  
  return {
    deviceCount: devices.length,
    areaCount: areas.length,
    locationCount: locations.length,
    armedStates: Array.from(armedStateCounts.entries()).map(([state, count]) => ({ state, count })),
    actions: actions.length > 0 ? actions : undefined
  };
} 