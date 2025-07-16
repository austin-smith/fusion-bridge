/**
 * Simple functions for OpenAI to call
 * Each function does ONE thing well
 */

import { createOrgScopedDb } from '@/lib/db/org-scoped-db';
import { ArmedState, ActionableState, DisplayState, ON, OFF } from '@/lib/mappings/definitions';
import { actionHandlers } from '@/lib/device-actions';
import type { ChatAction, DeviceActionMetadata, AlarmZoneActionMetadata } from '@/types/ai/chat-actions';
import type { FunctionExecutionResult, AiFunctionResult } from '@/types/ai/chat-types';
import pluralize from 'pluralize';

// OpenAI function definitions
export const openAIFunctions = [
  {
    name: "count_events",
    description: "Count events matching criteria. REQUIRED for ALL event counting questions including follow-up questions in conversations about events. ALWAYS use this function for any quantity questions about events. For relative time queries like 'today', 'yesterday', calculate the exact time range in the user's timezone first, then convert to UTC.",
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
            spaces: { type: "array", items: { type: "string" } }
          }
        },
        aggregation: {
          type: "object",
          properties: {
            groupBy: { type: "string", enum: ["device", "type", "location", "space", "time"] },
            timeBucket: { type: "string", enum: ["hour", "day", "week", "month"] }
          }
        },
        limit: { type: "integer", default: 100 }
      }
    }
  },
  {
    name: "list_devices",
    description: "List and search ALL devices. Use this when users want to see, list, or check status of devices. Shows all matching devices regardless of controllability. Can filter by space names and alarm zone names.",
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
            spaces: { type: "array", items: { type: "string" } },
            alarmZones: { type: "array", items: { type: "string" } },
            statuses: { type: "array", items: { type: "string" } }
          }
        },
        includeMetrics: { type: "boolean", default: false }
      }
    }
  },
  {
    name: "find_controllable_devices",
    description: "Find ONLY devices that can be controlled (turned on/off). Use this when users want to control devices, NOT when they just want to see or list devices. This filters out devices cannot be controlled. For listing ALL devices, use list_devices instead.",
    parameters: {
      type: "object",
      properties: {
        searchTerm: { 
          type: "string", 
          description: "Search term to find controllable devices. Searches device names, types, and categories automatically. Examples: 'lights', 'office lights', 'switches', 'outlets'" 
        },
        spaceName: {
          type: "string",
          description: "Optional: filter devices to a specific space name"
        },
        alarmZoneName: {
          type: "string",
          description: "Optional: filter devices to a specific alarm zone name"
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
    name: "list_spaces",
    description: "List and search physical spaces with their device assignments",
    parameters: {
      type: "object",
      properties: {
        spaceFilter: {
          type: "object",
          properties: {
            names: { type: "array", items: { type: "string" } },
            locations: { type: "array", items: { type: "string" } }
          }
        }
      }
    }
  },
  {
    name: "list_alarm_zones",
    description: "List and search alarm zones with their current armed state and status",
    parameters: {
      type: "object",
      properties: {
        zoneFilter: {
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
  },
  // Dedicated bulk operation functions for consistent bulk actions
  {
    name: "arm_all_alarm_zones",
    description: "Arm all alarm zones in the organization. Use this when user says 'arm all zones', 'arm everything', 'set all zones to armed', etc. Always returns bulk arm action regardless of current state.",
    parameters: {
      type: "object",
      properties: {
        zoneFilter: {
          type: "object",
          properties: {
            locations: { type: "array", items: { type: "string" }, description: "Optional: filter to specific locations" },
            excludeNames: { type: "array", items: { type: "string" }, description: "Optional: exclude specific zone names" }
          }
        }
      }
    }
  },
  {
    name: "disarm_all_alarm_zones",
    description: "Disarm all alarm zones in the organization. Use this when user says 'disarm all zones', 'disarm everything', 'set all zones to disarmed', etc. Always returns bulk disarm action regardless of current state.",
    parameters: {
      type: "object",
      properties: {
        zoneFilter: {
          type: "object",
          properties: {
            locations: { type: "array", items: { type: "string" }, description: "Optional: filter to specific locations" },
            excludeNames: { type: "array", items: { type: "string" }, description: "Optional: exclude specific zone names" }
          }
        }
      }
    }
  },
  // Dedicated bulk operation functions for consistent bulk actions
  {
    name: "turn_on_all_devices",
    description: "Turn on all controllable devices. Use this when user says 'turn on all devices', 'turn everything on', 'power on all switches', etc. Always returns bulk turn-on action regardless of current state.",
    parameters: {
      type: "object",
      properties: {
        deviceFilter: {
          type: "object",
          properties: {
            types: { type: "array", items: { type: "string" }, description: "Optional: filter to specific device types" },
            connectorCategories: { type: "array", items: { type: "string" }, description: "Optional: filter by connector categories" },
            locations: { type: "array", items: { type: "string" }, description: "Optional: filter to specific locations" },
            excludeNames: { type: "array", items: { type: "string" }, description: "Optional: exclude specific device names" }
          }
        }
      }
    }
  },
  {
    name: "turn_off_all_devices",
    description: "Turn off all controllable devices. Use this when user says 'turn off all devices', 'turn everything off', 'power off all switches', etc. Always returns bulk turn-off action regardless of current state.",
    parameters: {
      type: "object",
      properties: {
        deviceFilter: {
          type: "object",
          properties: {
            types: { type: "array", items: { type: "string" }, description: "Optional: filter to specific device types" },
            connectorCategories: { type: "array", items: { type: "string" }, description: "Optional: filter by connector categories" },
            locations: { type: "array", items: { type: "string" }, description: "Optional: filter to specific locations" },
            excludeNames: { type: "array", items: { type: "string" }, description: "Optional: exclude specific device names" }
          }
        }
      }
    }
  },
  // Individual action functions for specific alarm zones/devices
  {
    name: "arm_alarm_zone",
    description: "Arm a specific alarm zone by its exact name. ONLY use this when you know the precise zone name. For multiple zones or unclear references, use arm_all_alarm_zones or list_alarm_zones first.",
    parameters: {
      type: "object",
      properties: {
        zoneName: { type: "string", description: "Exact name of the specific alarm zone to arm" }
      },
      required: ["zoneName"]
    }
  },
  {
    name: "disarm_alarm_zone", 
    description: "Disarm a specific alarm zone by its exact name. ONLY use this when you know the precise zone name. For multiple zones or unclear references, use disarm_all_alarm_zones or list_alarm_zones first.",
    parameters: {
      type: "object",
      properties: {
        zoneName: { type: "string", description: "Exact name of the specific alarm zone to disarm" }
      },
      required: ["zoneName"]
    }
  },
  {
    name: "turn_on_device",
    description: "Turn on a specific device by its exact name. ONLY use this when you know the precise device name. For partial names or search patterns like 'lights' or 'office lights', use find_controllable_devices instead.",
    parameters: {
      type: "object", 
      properties: {
        deviceName: { type: "string", description: "Exact name of the specific device to turn on" }
      },
      required: ["deviceName"]
    }
  },
  {
    name: "turn_off_device",
    description: "Turn off a specific device by its exact name. ONLY use this when you know the precise device name. For partial names or search patterns like 'lights' or 'office lights', use find_controllable_devices instead.",
    parameters: {
      type: "object",
      properties: {
        deviceName: { type: "string", description: "Exact name of the specific device to turn off" }
      },
      required: ["deviceName"]
    }
  },
  {
    name: "get_api_documentation",
    description: "Get information about the Fusion API documentation, endpoints, and how to use the API. Use this when users ask about API docs, endpoints, authentication, or how to integrate with the system.",
    parameters: {
      type: "object",
      properties: {
        requestType: {
          type: "string",
          enum: ["overview", "endpoints", "authentication", "examples"],
          description: "Type of API information requested: 'overview' for general info, 'endpoints' for available endpoints, 'authentication' for auth info, 'examples' for usage examples"
        }
      }
    }
  }
];

// Function implementations
export async function executeFunction(
  name: string, 
  args: any, 
  organizationId: string
): Promise<FunctionExecutionResult> {
  const orgDb = createOrgScopedDb(organizationId);
  
  switch (name) {
    case 'count_events':
      return countEvents(args, organizationId);
    
    case 'count_devices':
      return countDevices(args, organizationId);
    
    case 'query_events':
      return queryEvents(orgDb, args);
    
    case 'list_devices':
      return listDevices(orgDb, args);
    
    case 'find_controllable_devices':
      return findControllableDevices(orgDb, args);
    
    case 'list_spaces':
      return listSpaces(orgDb, args);
      
    case 'list_alarm_zones':
      return listAlarmZones(orgDb, args);
      
    case 'get_system_overview':
      return getSystemOverview(orgDb);
      
    // Dedicated bulk operation functions
    case 'arm_all_alarm_zones':
      return armAllAlarmZones(orgDb, args);
      
    case 'disarm_all_alarm_zones':
      return disarmAllAlarmZones(orgDb, args);
      
    case 'turn_on_all_devices':
      return turnOnAllDevices(orgDb, args);
      
    case 'turn_off_all_devices':
      return turnOffAllDevices(orgDb, args);
      
    // Individual action functions
    case 'arm_alarm_zone':
      return armAlarmZone(orgDb, args);
      
    case 'disarm_alarm_zone':
      return disarmAlarmZone(orgDb, args);
      
    case 'turn_on_device':
      return turnOnDevice(orgDb, args);
      
    case 'turn_off_device':
      return turnOffDevice(orgDb, args);
      
    case 'get_api_documentation':
      return getApiDocumentation(args);
      
    default:
      throw new Error(`Unknown function: ${name}`);
  }
}

// Count events
async function countEvents(args: any, organizationId: string): Promise<FunctionExecutionResult> {
  try {
    const params = new URLSearchParams();
    params.append('count', 'true');
    
    // Add filters to params
    if (args.timeStart) params.append('timeStart', args.timeStart);
    if (args.timeEnd) params.append('timeEnd', args.timeEnd);
    if (args.deviceNames?.length) params.append('deviceNames', args.deviceNames.join(','));
    if (args.eventTypes?.length) params.append('eventCategories', args.eventTypes.join(','));
    
    const response = await fetch(`/api/events?${params.toString()}`);
    const data = await response.json();
    
    if (data.success) {
      return {
        aiData: {
          count: data.count,
          timeRange: data.timeRange
        }
      };
    } else {
      throw new Error(data.error || 'Failed to count events');
    }
  } catch (error) {
    console.error('Error counting events:', error);
    return {
      aiData: {
        error: error instanceof Error ? error.message : 'Failed to count events',
        count: 0
      }
    };
  }
}

// Count devices  
async function countDevices(args: any, organizationId: string): Promise<FunctionExecutionResult> {
  try {
    const params = new URLSearchParams();
    params.append('count', 'true');
    
    // Add filters
    if (args.connectorCategories?.length) params.append('connectorCategories', args.connectorCategories.join(','));
    if (args.deviceTypes?.length) params.append('deviceTypes', args.deviceTypes.join(','));
    if (args.statuses?.length) params.append('statuses', args.statuses.join(','));
    
    const response = await fetch(`/api/devices?${params.toString()}`);
    const data = await response.json();
    
    if (data.success) {
      return {
        aiData: {
          count: data.count,
          filters: args
        }
      };
    } else {
      throw new Error(data.error || 'Failed to count devices');
    }
  } catch (error) {
    console.error('Error counting devices:', error);
    return {
      aiData: {
        error: error instanceof Error ? error.message : 'Failed to count devices',
        count: 0
      }
    };
  }
}

// Query events with optional filtering and aggregation
async function queryEvents(orgDb: any, args: any): Promise<FunctionExecutionResult> {
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
          aiData: {
          count: data.count,
          timeRange: data.timeRange
          }
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
        case 'space':
          key = event.spaceName || 'Unknown Space';
          break;
      }
      groups.set(key, (groups.get(key) || 0) + 1);
    });
    
    return {
      aiData: {
      totalCount: filteredEvents.length,
        metrics: {
          byType: Array.from(groups.entries()).map(([name, count]) => ({ type: name, count }))
        }
      }
    };
  }
  
  // Return simple event list
  return {
    aiData: {
    count: filteredEvents.length,
    events: filteredEvents.map((e: any) => ({
      id: e.eventUuid,
      timestamp: e.timestamp,
      device: e.deviceName,
      type: e.standardizedEventType,
      space: e.spaceName,
      location: e.locationName
    }))
    }
  };
}

async function listDevices(orgDb: any, args: any): Promise<FunctionExecutionResult> {
  const { deviceFilter, includeMetrics = false } = args;
  
  // Get all devices
  const devices = await orgDb.devices.findAll();
  
  // Apply filters
  let filteredDevices = devices;
  
  if (deviceFilter?.names?.length) {
    const searchNames = deviceFilter.names.map((n: string) => n.toLowerCase());
    filteredDevices = filteredDevices.filter((device: any) => {
      if (!device.name) return false;
      
      const deviceName = device.name.toLowerCase();
      
      // Check if any of the search names match this device
      return searchNames.some((searchName: string) => {
        // Strategy 1: Exact match
        if (deviceName === searchName) {
          return true;
        }
        
        // Strategy 2: Partial match (search term is contained in device name)
        if (deviceName.includes(searchName)) {
          return true;
        }
        
        // Strategy 3: Word-based match (all search words found in device name)
        const searchWords = searchName.split(/\s+/);
        const deviceWords = deviceName.split(/\s+/);
        
        if (searchWords.length === 1) {
          // Single word search - check if it matches any device word
          return deviceWords.some((deviceWord: string) => deviceWord === searchName);
        } else {
          // Multi-word search - check if all search words are found in device
          return searchWords.every((searchWord: string) => 
            deviceWords.some((deviceWord: string) => deviceWord === searchWord)
          );
        }
      });
    });
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
  
  if (deviceFilter?.locations?.length) {
    const locationSet = new Set(deviceFilter.locations);
    filteredDevices = filteredDevices.filter((d: any) => 
      d.locationId && locationSet.has(d.locationId)
    );
  }
  
  if (deviceFilter?.spaces?.length) {
    const spaceSet = new Set(deviceFilter.spaces.map((s: string) => s.toLowerCase()));
    filteredDevices = filteredDevices.filter((d: any) => 
      d.spaceName && spaceSet.has(d.spaceName.toLowerCase())
    );
  }

  if (deviceFilter?.alarmZones?.length) {
    const alarmZoneSet = new Set(deviceFilter.alarmZones.map((z: string) => z.toLowerCase()));
    filteredDevices = filteredDevices.filter((d: any) => 
      d.alarmZoneName && alarmZoneSet.has(d.alarmZoneName.toLowerCase())
    );
  }

  if (deviceFilter?.statuses?.length) {
    const statusSet = new Set(deviceFilter.statuses.map((s: string) => s.toLowerCase()));
    filteredDevices = filteredDevices.filter((d: any) => {
      const status = (d.status || 'unknown').toLowerCase();
      return statusSet.has(status);
    });
  }
  
  // Don't generate any action buttons for list_devices - it's for listing/status queries only
  // If users want to control devices, they should use find_controllable_devices instead
  const actions: ChatAction[] = [];
  
  // Return device status with actions
    const statusCounts = new Map<string, number>();
    const connectorCategoryCounts = new Map<string, number>();
    
    filteredDevices.forEach((d: any) => {
      const status = d.status || 'unknown';
      statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
      
      const category = d.connector?.category || 'unknown';
      connectorCategoryCounts.set(category, (connectorCategoryCounts.get(category) || 0) + 1);
    });
    
  return {
    aiData: {
    totalCount: filteredDevices.length,
    devices: filteredDevices.map((d: any) => ({
      id: d.id,
      name: d.name,
      type: d.type,
      connectorCategory: d.connector?.category,
      status: d.status || 'unknown',
      space: d.spaceId,
      location: d.locationId,
      displayState: d.displayState
    })),
      ...(includeMetrics && {
        metrics: {
      byStatus: Array.from(statusCounts.entries()).map(([status, count]) => ({ status, count })),
      byConnectorCategory: Array.from(connectorCategoryCounts.entries()).map(([category, count]) => ({ category, count }))
        }
      })
    },
    uiData: {
    actions: actions.length > 0 ? actions : undefined
    }
  };
}

// Find controllable devices
async function findControllableDevices(orgDb: any, args: any): Promise<FunctionExecutionResult> {
  const { searchTerm, spaceName, alarmZoneName, actionIntent = "list_all" } = args;
  
  console.log(`[findControllableDevices] Called - searchTerm: "${searchTerm}", spaceName: "${spaceName}", alarmZoneName: "${alarmZoneName}", actionIntent: "${actionIntent}"`);
  
  // Get all devices
  const devices = await orgDb.devices.findAll();
  console.log(`[findControllableDevices] Found ${devices.length} total devices:`);
  devices.forEach((d: any, i: number) => {
    console.log(`[findControllableDevices] Device ${i}: "${d.name}" (type: ${d.type}, category: ${d.connector?.category})`);
  });
  
  // Apply search filter with multiple strategies
  let filteredDevices = devices;
  
      if (searchTerm && searchTerm.trim()) {
      const lowerCaseSearchTerm = searchTerm.toLowerCase().trim();
      const singularSearchTerm = pluralize.singular(lowerCaseSearchTerm);
      console.log(`[findControllableDevices] Searching for: "${searchTerm}" (singular: "${singularSearchTerm}")`);
      
      // Strategy 1: Exact name match (try both plural and singular)
      let matches = devices.filter((d: any) => 
        d.name && (
          d.name.toLowerCase() === lowerCaseSearchTerm ||
          d.name.toLowerCase() === singularSearchTerm
        )
      );
      
      console.log(`[findControllableDevices] Strategy 1 (Exact match): ${matches.length} matches`);
      
      if (matches.length === 0) {
        // Strategy 2: Partial name match (contains search term)
        matches = devices.filter((d: any) => 
          d.name && d.name.toLowerCase().includes(lowerCaseSearchTerm)
        );
        console.log(`[findControllableDevices] Strategy 2 (Partial match): ${matches.length} matches`);
      }
      
      if (matches.length === 0) {
        // Strategy 3: Device type match
        matches = devices.filter((d: any) => 
          d.type && (
            d.type.toLowerCase().includes(lowerCaseSearchTerm) ||
            d.type.toLowerCase().includes(singularSearchTerm)
          )
        );
        console.log(`[findControllableDevices] Strategy 3 (Type match): ${matches.length} matches`);
      }
      
      if (matches.length === 0) {
        // Strategy 4: Connector category match
        matches = devices.filter((d: any) => 
          d.connector?.category && (
            d.connector.category.toLowerCase().includes(lowerCaseSearchTerm) ||
            d.connector.category.toLowerCase().includes(singularSearchTerm)
          )
        );
        console.log(`[findControllableDevices] Strategy 4 (Category match): ${matches.length} matches`);
      }
      
      if (matches.length === 0) {
        // Strategy 5: Type + category combined search (e.g., "yolink switches")
        const searchWords = lowerCaseSearchTerm.split(/\s+/);
                 if (searchWords.length > 1) {
           matches = devices.filter((d: any) => {
             const deviceText = `${d.name || ''} ${d.type || ''} ${d.connector?.category || ''}`.toLowerCase();
             return searchWords.every((word: string) => deviceText.includes(word));
           });
           console.log(`[findControllableDevices] Strategy 5 (Multi-word match): ${matches.length} matches`);
         }
      }
      
      filteredDevices = matches;
    }
    
    // Apply space filter if provided
    if (spaceName && spaceName.trim()) {
      const lowerCaseSpaceName = spaceName.toLowerCase().trim();
      filteredDevices = filteredDevices.filter((d: any) => 
        d.spaceName && d.spaceName.toLowerCase() === lowerCaseSpaceName
      );
      console.log(`[findControllableDevices] After space filter "${spaceName}": ${filteredDevices.length} devices`);
    }
    
    // Apply alarm zone filter if provided
    if (alarmZoneName && alarmZoneName.trim()) {
      const lowerCaseAlarmZoneName = alarmZoneName.toLowerCase().trim();
      filteredDevices = filteredDevices.filter((d: any) => 
        d.alarmZoneName && d.alarmZoneName.toLowerCase() === lowerCaseAlarmZoneName
      );
      console.log(`[findControllableDevices] After alarm zone filter "${alarmZoneName}": ${filteredDevices.length} devices`);
    }
    
    console.log(`[findControllableDevices] Total filtered devices: ${filteredDevices.length}`);
  
  // Filter for controllable devices and build action buttons
  const controllableDevices: any[] = [];
  const actions: ChatAction[] = [];
  
  try {
    filteredDevices.forEach((device: any, index: number) => {
      console.log(`[findControllableDevices] Checking device ${index}: "${device?.name}"`);
      
      // Input validation - skip devices with missing required data
      if (!device?.id || !device?.name || !device?.connector?.category) {
        console.warn(`[findControllableDevices] Skipping device ${index} with missing required data:`, {
          id: device?.id,
          name: device?.name,
          category: device?.connector?.category
        });
        return;
      }

      // Check if any action handler can control this device
      const supportedHandler = actionHandlers.find(handler => 
        handler.category === device.connector.category
      );
      
      if (!supportedHandler) {
        console.log(`[findControllableDevices] No action handler found for category: ${device.connector.category}`);
        return;
      }
      
      console.log(`[findControllableDevices] Found action handler for category: ${device.connector.category}`);
      
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
      
      console.log(`[findControllableDevices] Device "${device.name}" controllability: canTurnOn=${canTurnOn}, canTurnOff=${canTurnOff}`);

        
        if (canTurnOn || canTurnOff) {
          // This device is controllable - add to list
        console.log(`[findControllableDevices] Device "${device.name}" is controllable!`);
          controllableDevices.push(device);
          
          const currentState = device.displayState as DisplayState | undefined;
          
        // Add actions based on intent (original state-aware logic)
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
      } else {
        console.log(`[findControllableDevices] Device "${device.name}" is not controllable (no ON/OFF support)`);
      }
    });
  } catch (error) {
    console.error('[findControllableDevices] Error processing devices:', error);
    // Continue execution - don't let errors break the whole response
  }
  
  console.log(`[findControllableDevices] Final result: ${controllableDevices.length} controllable devices, ${actions.length} actions`);
  
  // Return only controllable devices with their actions
  return {
    aiData: {
    totalCount: controllableDevices.length,
    devices: controllableDevices.map((d: any) => ({
      id: d.id,
      name: d.name,
      type: d.type,
      connectorCategory: d.connector?.category,
      status: d.status || 'unknown',
      space: d.spaceId,
      location: d.locationId,
      displayState: d.displayState
    })),
    },
    uiData: {
    actions: actions.length > 0 ? actions : undefined
    }
  };
}

// List spaces
async function listSpaces(orgDb: any, args: any): Promise<FunctionExecutionResult> {
  const { spaceFilter } = args;
  
  // Get all spaces
  const spaces = await orgDb.spaces.findAll();
  
  // Apply filters
  let filteredSpaces = spaces;
  
  if (spaceFilter?.names?.length) {
    const searchNames = spaceFilter.names.map((n: string) => n.toLowerCase());
    filteredSpaces = filteredSpaces.filter((space: any) => {
      if (!space.name) return false;
      
      const spaceName = space.name.toLowerCase();
      
      // Check if any of the search names match this space
      return searchNames.some((searchName: string) => {
        // Strategy 1: Exact match
        if (spaceName === searchName) {
          return true;
        }
        
        // Strategy 2: Partial match (search term is contained in space name)
        if (spaceName.includes(searchName)) {
          return true;
        }
        
        // Strategy 3: Word-based match (all search words found in space name)
        const searchWords = searchName.split(/\s+/);
        const spaceWords = spaceName.split(/\s+/);
        
        if (searchWords.length === 1) {
          // Single word search - check if it matches any space word
          return spaceWords.some((spaceWord: string) => spaceWord === searchName);
        } else {
          // Multi-word search - check if all search words are found in space
          return searchWords.every((searchWord: string) => 
            spaceWords.some((spaceWord: string) => spaceWord === searchWord)
          );
        }
      });
    });
  }
  
  if (spaceFilter?.locations?.length) {
    const locationSet = new Set(spaceFilter.locations);
    filteredSpaces = filteredSpaces.filter((s: any) => 
      s.locationId && locationSet.has(s.locationId)
    );
  }
  
  // Get device counts for each space
  const spacesWithDevices = await Promise.all(
    filteredSpaces.map(async (space: any) => {
      const devices = await orgDb.devices.findBySpace(space.id);
      return {
        id: space.id,
        name: space.name,
        description: space.description,
        locationId: space.locationId,
        deviceIds: devices.map((d: any) => d.id),
        deviceCount: devices.length
      };
    })
  );

  // Return space data (no actions for spaces, they're just physical containers)
  return {
    aiData: {
      totalCount: filteredSpaces.length,
      spaces: spacesWithDevices
    }
  };
}

// List alarm zones
async function listAlarmZones(orgDb: any, args: any): Promise<FunctionExecutionResult> {
  const { zoneFilter } = args;
  
  // Get all alarm zones
  const alarmZones = await orgDb.alarmZones.findAll();
  
  // Apply filters
  let filteredZones = alarmZones;
  
  if (zoneFilter?.names?.length) {
    const searchNames = zoneFilter.names.map((n: string) => n.toLowerCase());
    filteredZones = filteredZones.filter((zone: any) => {
      if (!zone.name) return false;
      
      const zoneName = zone.name.toLowerCase();
      
      // Check if any of the search names match this zone
      return searchNames.some((searchName: string) => {
        // Strategy 1: Exact match
        if (zoneName === searchName) {
          return true;
        }
        
        // Strategy 2: Partial match (search term is contained in zone name)
        if (zoneName.includes(searchName)) {
          return true;
        }
        
        // Strategy 3: Word-based match (all search words found in zone name)
        const searchWords = searchName.split(/\s+/);
        const zoneWords = zoneName.split(/\s+/);
        
        if (searchWords.length === 1) {
          // Single word search - check if it matches any zone word
          return zoneWords.some((zoneWord: string) => zoneWord === searchName);
        } else {
          // Multi-word search - check if all search words are found in zone
          return searchWords.every((searchWord: string) => 
            zoneWords.some((zoneWord: string) => zoneWord === searchWord)
          );
        }
      });
    });
  }
  
  if (zoneFilter?.armedStates?.length) {
    const stateSet = new Set(zoneFilter.armedStates);
    filteredZones = filteredZones.filter((z: any) => 
      z.armedState && stateSet.has(z.armedState)
    );
  }

  if (zoneFilter?.locations?.length) {
    const locationSet = new Set(zoneFilter.locations);
    filteredZones = filteredZones.filter((z: any) => 
      z.locationId && locationSet.has(z.locationId)
    );
  }
  
  // Generate actions for alarm zones
  const actions: ChatAction[] = [];
  
  try {
    filteredZones.forEach((zone: any) => {
      // Input validation - skip zones with missing required data
      if (!zone?.id || !zone?.name) {
        console.warn('[listAlarmZones] Skipping zone with missing required data:', zone?.id);
        return;
      }

      const currentState = zone.armedState || ArmedState.DISARMED;
      
      // Only add actions that would change the current state
      const isArmed = currentState === ArmedState.ARMED || 
                   currentState === ArmedState.TRIGGERED;
      
      // Only add ARM action if zone is not already armed (and not triggered)
      if (!isArmed) {
        actions.push({
          id: `alarm-zone-${zone.id}-arm`,
          type: 'alarm-zone',
          label: `Arm ${zone.name}`,
          icon: 'ShieldCheck',
          metadata: {
            alarmZoneId: zone.id,
            alarmZoneName: zone.name,
            targetState: ArmedState.ARMED,
            currentState: currentState
          } as AlarmZoneActionMetadata
        });
      }
      
      // Only add DISARM action if zone is not already disarmed
      if (currentState !== ArmedState.DISARMED) {
        actions.push({
          id: `alarm-zone-${zone.id}-disarm`,
          type: 'alarm-zone',
          label: `Disarm ${zone.name}`,
          icon: 'ShieldOff',
          metadata: {
            alarmZoneId: zone.id,
            alarmZoneName: zone.name,
            targetState: ArmedState.DISARMED,
            currentState: currentState
          } as AlarmZoneActionMetadata
        });
      }
    });
  } catch (error) {
    console.error('[listAlarmZones] Error generating zone actions:', error);
    // Continue execution - don't let action generation errors break the whole response
  }
  
  // Return alarm zone status with actions
  return {
    aiData: {
      totalCount: filteredZones.length,
      alarmZones: filteredZones.map((z: any) => ({
        id: z.id,
        name: z.name,
        armedState: z.armedState || ArmedState.DISARMED,
        locationId: z.locationId,
        description: z.description,
        triggerBehavior: z.triggerBehavior
      }))
    },
    uiData: {
      actions: actions.length > 0 ? actions : undefined
    }
  };
}

// Get system overview
async function getSystemOverview(orgDb: any): Promise<FunctionExecutionResult> {
  const [devices, locations, spaces, alarmZones] = await Promise.all([
    orgDb.devices.findAll(),
    orgDb.locations.findAll(),
    orgDb.spaces.findAll(),
    orgDb.alarmZones.findAll()
  ]);
  
  // Count device states
  const deviceStateCounts = new Map<string, number>();
  devices.forEach((d: any) => {
    const currentState = d.displayState as DisplayState | undefined;
    if (currentState === ON) {
      deviceStateCounts.set('ON', (deviceStateCounts.get('ON') || 0) + 1);
    } else {
      deviceStateCounts.set('OFF', (deviceStateCounts.get('OFF') || 0) + 1);
    }
  });
  
  // Count alarm zone states
  const alarmZoneStateCounts = new Map<string, number>();
  alarmZones.forEach((z: any) => {
    const state = z.armedState || ArmedState.DISARMED;
    alarmZoneStateCounts.set(state, (alarmZoneStateCounts.get(state) || 0) + 1);
  });
  
  // Generate quick actions for system overview
  const actions: ChatAction[] = [];
  
  return {
    aiData: {
      deviceCount: devices.length,
      locationCount: locations.length,
      spaceCount: spaces.length,
      alarmZoneCount: alarmZones.length,
      armedStates: [
        ...Array.from(deviceStateCounts.entries()).map(([state, count]) => ({ state: `Devices ${state}`, count })),
        ...Array.from(alarmZoneStateCounts.entries()).map(([state, count]) => ({ state: `Zones ${state}`, count }))
      ]
    },
    uiData: {
      actions: actions.length > 0 ? actions : undefined
    }
  };
}

interface BulkOperationConfig {
  entityType: 'devices' | 'alarmZones';
  actionType: string;
  actionState?: ActionableState | ArmedState;
}

async function createBulkOperation(
  orgDb: any, 
  args: any, 
  config: BulkOperationConfig
): Promise<FunctionExecutionResult> {
  const { deviceFilter } = args;
  const filter = deviceFilter || {};
  
  try {
    // Get all entities
    let entities = await orgDb[config.entityType].findAll();
    
    // Apply common filters
    if (filter.locations?.length) {
      const locationSet = new Set(filter.locations);
      entities = entities.filter((e: any) => e.locationId && locationSet.has(e.locationId));
    }
    
    if (filter.excludeNames?.length) {
      const excludeSet = new Set(filter.excludeNames.map((n: string) => n.toLowerCase()));
      entities = entities.filter((e: any) => !e.name || !excludeSet.has(e.name.toLowerCase()));
    }
    
    // Apply device-specific filters
    if (config.entityType === 'devices') {
      if (filter.types?.length) {
        const typeSet = new Set(filter.types.map((t: string) => t.toLowerCase()));
        entities = entities.filter((d: any) => d.type && typeSet.has(d.type.toLowerCase()));
      }
      
      if (filter.connectorCategories?.length) {
        const categorySet = new Set(filter.connectorCategories.map((c: string) => c.toLowerCase()));
        entities = entities.filter((d: any) => d.connector?.category && categorySet.has(d.connector.category.toLowerCase()));
      }
    }
    
    // Filter for controllable devices if needed
    const validEntities: any[] = [];
    const actions: ChatAction[] = [];
    
    entities.forEach((entity: any) => {
      if (config.entityType === 'devices') {
        // Check if device is controllable
        if (!entity?.id || !entity?.name || !entity?.connector?.category) {
          return;
        }
        
        const supportedHandler = actionHandlers.find(handler => 
          handler.category === entity.connector.category
        );
        
        if (!supportedHandler) {
          return;
        }
        
        const deviceContext = {
          id: entity.id,
          deviceId: entity.deviceId,
          type: entity.type,
          connectorId: entity.connectorId,
          rawDeviceData: entity.rawDeviceData
        };
        
        const canPerformAction = supportedHandler.canHandle(deviceContext, config.actionState as ActionableState);
        
        if (!canPerformAction) {
          return;
        }
        
        validEntities.push(entity);
        
        // Create action for this device
        actions.push({
          id: `device-${entity.id}-${config.actionType.replace('_', '-')}`,
          type: 'device',
          label: `${config.actionType === 'turn_on' ? 'Turn On' : 'Turn Off'} ${entity.name}`,
          icon: config.actionType === 'turn_on' ? 'Power' : 'PowerOff',
          metadata: {
            internalDeviceId: entity.id,
            deviceName: entity.name,
            action: config.actionState as ActionableState,
            currentState: entity.displayState,
            connectorCategory: entity.connector.category,
            deviceType: entity.type
          } as DeviceActionMetadata
        });
      }
    });
    
    // Build response data
    const entityData = validEntities.map((e: any) => {
      return {
        id: e.id,
        name: e.name,
        type: e.type,
        connectorCategory: e.connector?.category,
        status: e.displayState || 'unknown',
        space: e.spaceId,
        location: e.locationId,
        displayState: e.displayState
      };
    });
    
    return {
      aiData: {
        totalCount: validEntities.length,
        summary: `Found ${validEntities.length} ${config.entityType} available for ${config.actionType.replace('_', ' ')}`,
        [config.entityType]: entityData
      },
      uiData: {
        actions
      }
    };
  } catch (error) {
    console.error(`[${config.actionType}] Error:`, error);
    return {
      aiData: {
        error: error instanceof Error ? error.message : `Failed to prepare bulk ${config.actionType.replace('_', ' ')} operation`,
        totalCount: 0
      }
    };
  }
}

  // Simplified bulk operation functions using the helper
  async function armAllAlarmZones(orgDb: any, args: any): Promise<FunctionExecutionResult> {
    const { zoneFilter } = args;
    
    try {
      // Get all alarm zones
      const alarmZones = await orgDb.alarmZones.findAll();
      
      // Apply filters
      let filteredZones = alarmZones;
      
      if (zoneFilter?.locations?.length) {
        const locationSet = new Set(zoneFilter.locations);
        filteredZones = filteredZones.filter((z: any) => z.locationId && locationSet.has(z.locationId));
      }
      
      if (zoneFilter?.excludeNames?.length) {
        const excludeSet = new Set(zoneFilter.excludeNames.map((n: string) => n.toLowerCase()));
        filteredZones = filteredZones.filter((z: any) => !z.name || !excludeSet.has(z.name.toLowerCase()));
      }
      
      const actions: ChatAction[] = [];
      
      filteredZones.forEach((zone: any) => {
        const currentState = zone.armedState || ArmedState.DISARMED;
        const isArmed = currentState === ArmedState.ARMED || currentState === ArmedState.TRIGGERED;
        
        // Only add ARM action if zone is not already armed
        if (!isArmed) {
          actions.push({
            id: `alarm-zone-${zone.id}-arm`,
            type: 'alarm-zone',
            label: `Arm ${zone.name}`,
            icon: 'ShieldCheck',
            metadata: {
              alarmZoneId: zone.id,
              alarmZoneName: zone.name,
              targetState: ArmedState.ARMED,
              currentState: currentState
            } as AlarmZoneActionMetadata
          });
        }
      });
      
      return {
        aiData: {
          totalCount: filteredZones.length,
          summary: `Found ${filteredZones.length} alarm zones available for arming`,
          alarmZones: filteredZones.map((z: any) => ({
            id: z.id,
            name: z.name,
            armedState: z.armedState || ArmedState.DISARMED,
            locationId: z.locationId
          }))
        },
        uiData: {
          actions
        }
      };
    } catch (error) {
      console.error('[armAllAlarmZones] Error:', error);
      return {
        aiData: {
          error: error instanceof Error ? error.message : 'Failed to prepare bulk arm operation',
          totalCount: 0
        }
      };
    }
  }

  async function disarmAllAlarmZones(orgDb: any, args: any): Promise<FunctionExecutionResult> {
    const { zoneFilter } = args;
    
    try {
      // Get all alarm zones
      const alarmZones = await orgDb.alarmZones.findAll();
      
      // Apply filters
      let filteredZones = alarmZones;
      
      if (zoneFilter?.locations?.length) {
        const locationSet = new Set(zoneFilter.locations);
        filteredZones = filteredZones.filter((z: any) => z.locationId && locationSet.has(z.locationId));
      }
      
      if (zoneFilter?.excludeNames?.length) {
        const excludeSet = new Set(zoneFilter.excludeNames.map((n: string) => n.toLowerCase()));
        filteredZones = filteredZones.filter((z: any) => !z.name || !excludeSet.has(z.name.toLowerCase()));
      }
      
      const actions: ChatAction[] = [];
      
      filteredZones.forEach((zone: any) => {
        const currentState = zone.armedState || ArmedState.DISARMED;
        
        // Only add DISARM action if zone is not already disarmed
        if (currentState !== ArmedState.DISARMED) {
          actions.push({
            id: `alarm-zone-${zone.id}-disarm`,
            type: 'alarm-zone',
            label: `Disarm ${zone.name}`,
            icon: 'ShieldOff',
            metadata: {
              alarmZoneId: zone.id,
              alarmZoneName: zone.name,
              targetState: ArmedState.DISARMED,
              currentState: currentState
            } as AlarmZoneActionMetadata
          });
        }
      });
      
      return {
        aiData: {
          totalCount: filteredZones.length,
          summary: `Found ${filteredZones.length} alarm zones available for disarming`,
          alarmZones: filteredZones.map((z: any) => ({
            id: z.id,
            name: z.name,
            armedState: z.armedState || ArmedState.DISARMED,
            locationId: z.locationId
          }))
        },
        uiData: {
          actions
        }
      };
    } catch (error) {
      console.error('[disarmAllAlarmZones] Error:', error);
      return {
        aiData: {
          error: error instanceof Error ? error.message : 'Failed to prepare bulk disarm operation',
          totalCount: 0
        }
      };
    }
  }

  async function turnOnAllDevices(orgDb: any, args: any): Promise<FunctionExecutionResult> {
    return createBulkOperation(orgDb, args, {
      entityType: 'devices',
      actionType: 'turn_on',
      actionState: ActionableState.SET_ON
    });
  }

  async function turnOffAllDevices(orgDb: any, args: any): Promise<FunctionExecutionResult> {
    return createBulkOperation(orgDb, args, {
      entityType: 'devices',
      actionType: 'turn_off',
      actionState: ActionableState.SET_OFF
    });
  }

  // Individual action functions for specific alarm zones/devices

  async function armAlarmZone(orgDb: any, args: any): Promise<FunctionExecutionResult> {
    const { zoneName } = args;
    
    try {
      // Get all alarm zones
      const alarmZones = await orgDb.alarmZones.findAll();
      
      // Find the specific zone by name (case-insensitive)
      const targetZone = alarmZones.find((zone: any) => 
        zone.name && zone.name.toLowerCase() === zoneName.toLowerCase()
      );
      
      if (!targetZone) {
        return {
          aiData: {
            error: `Alarm zone '${zoneName}' not found`,
            zoneName,
            totalCount: 0
          }
        };
      }
      
      const currentState = targetZone.armedState || ArmedState.DISARMED;
      const actions: ChatAction[] = [];
      
      // Only add ARM action if zone is not already armed
      const isArmed = currentState === ArmedState.ARMED || 
                     currentState === ArmedState.TRIGGERED;
      
      if (!isArmed) {
        actions.push({
          id: `alarm-zone-${targetZone.id}-arm`,
          type: 'alarm-zone',
          label: `Arm ${targetZone.name}`,
          icon: 'ShieldCheck',
          metadata: {
            alarmZoneId: targetZone.id,
            alarmZoneName: targetZone.name,
            targetState: ArmedState.ARMED,
            currentState: currentState
          } as AlarmZoneActionMetadata
        });
      }
      
      return {
        aiData: {
          zoneName: targetZone.name,
          currentState,
          totalCount: 1,
          canPerformAction: !isArmed,
          actionReason: isArmed ? `${targetZone.name} is already armed or triggered` : undefined,
          alarmZones: [{
            id: targetZone.id,
            name: targetZone.name,
            armedState: currentState,
            locationId: targetZone.locationId
          }]
        },
        uiData: {
          actions: actions.length > 0 ? actions : undefined
        }
      };
    } catch (error) {
      console.error('[armAlarmZone] Error:', error);
      return {
        aiData: {
          error: error instanceof Error ? error.message : 'Failed to arm alarm zone',
          zoneName,
          totalCount: 0
        }
      };
    }
  }

  async function disarmAlarmZone(orgDb: any, args: any): Promise<FunctionExecutionResult> {
    const { zoneName } = args;
    
    try {
      // Get all alarm zones
      const alarmZones = await orgDb.alarmZones.findAll();
      
      // Find the specific zone by name (case-insensitive)
      const targetZone = alarmZones.find((zone: any) => 
        zone.name && zone.name.toLowerCase() === zoneName.toLowerCase()
      );
      
      if (!targetZone) {
        return {
          aiData: {
            error: `Alarm zone '${zoneName}' not found`,
            zoneName,
            totalCount: 0
          }
        };
      }
      
      const currentState = targetZone.armedState || ArmedState.DISARMED;
      const actions: ChatAction[] = [];
      
      // Only add DISARM action if zone is not already disarmed
      if (currentState !== ArmedState.DISARMED) {
        actions.push({
          id: `alarm-zone-${targetZone.id}-disarm`,
          type: 'alarm-zone',
          label: `Disarm ${targetZone.name}`,
          icon: 'ShieldOff',
          metadata: {
            alarmZoneId: targetZone.id,
            alarmZoneName: targetZone.name,
            targetState: ArmedState.DISARMED,
            currentState: currentState
          } as AlarmZoneActionMetadata
        });
      }
      
      return {
        aiData: {
          zoneName: targetZone.name,
          currentState,
          totalCount: 1,
          canPerformAction: currentState !== ArmedState.DISARMED,
          actionReason: currentState === ArmedState.DISARMED ? `${targetZone.name} is already disarmed` : undefined,
          alarmZones: [{
            id: targetZone.id,
            name: targetZone.name,
            armedState: currentState,
            locationId: targetZone.locationId
          }]
        },
        uiData: {
          actions: actions.length > 0 ? actions : undefined
        }
      };
    } catch (error) {
      console.error('[disarmAlarmZone] Error:', error);
      return {
        aiData: {
          error: error instanceof Error ? error.message : 'Failed to disarm alarm zone',
          zoneName,
          totalCount: 0
        }
      };
    }
  }

async function turnOnDevice(orgDb: any, args: any): Promise<FunctionExecutionResult> {
  const { deviceName } = args;
  
  try {
    // Get all devices
    const devices = await orgDb.devices.findAll();
    
    // Find the specific device by name (case-insensitive)
    const targetDevice = devices.find((device: any) => 
      device.name && device.name.toLowerCase() === deviceName.toLowerCase()
    );
    
    if (!targetDevice) {
      return {
        aiData: {
          error: `Device '${deviceName}' not found`,
          deviceName,
          totalCount: 0
        }
      };
    }
    
    // Check if device is controllable
    if (!targetDevice.id || !targetDevice.name || !targetDevice.connector?.category) {
      return {
        aiData: {
          error: `Device '${deviceName}' is missing required data and cannot be controlled`,
          deviceName,
          totalCount: 0
        }
      };
    }

    const supportedHandler = actionHandlers.find(handler => 
      handler.category === targetDevice.connector.category
    );
    
    if (!supportedHandler) {
      return {
        aiData: {
          error: `Device '${deviceName}' is not controllable (no handler for ${targetDevice.connector.category})`,
          deviceName,
          totalCount: 0
        }
      };
    }
    
    const deviceContext = {
      id: targetDevice.id,
      deviceId: targetDevice.deviceId,
      type: targetDevice.type,
      connectorId: targetDevice.connectorId,
      rawDeviceData: targetDevice.rawDeviceData
    };
    
    const canTurnOn = supportedHandler.canHandle(deviceContext, ActionableState.SET_ON);
    
    if (!canTurnOn) {
      return {
        aiData: {
          error: `Device '${deviceName}' does not support turn on operation`,
          deviceName,
          totalCount: 0
        }
      };
    }
    
    const currentState = targetDevice.displayState as DisplayState | undefined;
    const actions: ChatAction[] = [];
    
    // Only add turn on action if device is not already on
    if (currentState !== ON) {
      actions.push({
        id: `device-${targetDevice.id}-on`,
        type: 'device',
        label: `Turn On ${targetDevice.name}`,
        icon: 'Power',
        metadata: {
          internalDeviceId: targetDevice.id,
          deviceName: targetDevice.name,
          action: ActionableState.SET_ON,
          currentState: currentState,
          connectorCategory: targetDevice.connector.category,
          deviceType: targetDevice.type
        } as DeviceActionMetadata
      });
    }
    
    return {
      aiData: {
        deviceName: targetDevice.name,
        currentState: currentState || 'unknown',
        totalCount: 1,
        canPerformAction: currentState !== ON,
        actionReason: currentState === ON ? `${targetDevice.name} is already on` : undefined,
        devices: [{
          id: targetDevice.id,
          name: targetDevice.name,
          type: targetDevice.type,
          status: targetDevice.status || 'unknown',
          displayState: currentState,
          connectorCategory: targetDevice.connector.category,
          space: targetDevice.spaceId,
          location: targetDevice.locationId
        }]
      },
      uiData: {
        actions: actions.length > 0 ? actions : undefined
      }
    };
  } catch (error) {
    console.error('[turnOnDevice] Error:', error);
    return {
      aiData: {
        error: error instanceof Error ? error.message : 'Failed to turn on device',
        deviceName,
        totalCount: 0
      }
    };
  }
}

async function turnOffDevice(orgDb: any, args: any): Promise<FunctionExecutionResult> {
  const { deviceName } = args;
  
  try {
    // Get all devices
    const devices = await orgDb.devices.findAll();
    
    // Find the specific device by name (case-insensitive)
    const targetDevice = devices.find((device: any) => 
      device.name && device.name.toLowerCase() === deviceName.toLowerCase()
    );
    
    if (!targetDevice) {
      return {
        aiData: {
          error: `Device '${deviceName}' not found`,
          deviceName,
          totalCount: 0
        }
      };
    }
    
    // Check if device is controllable
    if (!targetDevice.id || !targetDevice.name || !targetDevice.connector?.category) {
      return {
        aiData: {
          error: `Device '${deviceName}' is missing required data and cannot be controlled`,
          deviceName,
          totalCount: 0
        }
      };
    }

    const supportedHandler = actionHandlers.find(handler => 
      handler.category === targetDevice.connector.category
    );
    
    if (!supportedHandler) {
      return {
        aiData: {
          error: `Device '${deviceName}' is not controllable (no handler for ${targetDevice.connector.category})`,
          deviceName,
          totalCount: 0
        }
      };
    }
    
    const deviceContext = {
      id: targetDevice.id,
      deviceId: targetDevice.deviceId,
      type: targetDevice.type,
      connectorId: targetDevice.connectorId,
      rawDeviceData: targetDevice.rawDeviceData
    };
    
    const canTurnOff = supportedHandler.canHandle(deviceContext, ActionableState.SET_OFF);
    
    if (!canTurnOff) {
      return {
        aiData: {
          error: `Device '${deviceName}' does not support turn off operation`,
          deviceName,
          totalCount: 0
        }
      };
    }
    
    const currentState = targetDevice.displayState as DisplayState | undefined;
    const actions: ChatAction[] = [];
    
    // Only add turn off action if device is not already off
    if (currentState !== OFF) {
      actions.push({
        id: `device-${targetDevice.id}-off`,
        type: 'device',
        label: `Turn Off ${targetDevice.name}`,
        icon: 'PowerOff',
        metadata: {
          internalDeviceId: targetDevice.id,
          deviceName: targetDevice.name,
          action: ActionableState.SET_OFF,
          currentState: currentState,
          connectorCategory: targetDevice.connector.category,
          deviceType: targetDevice.type
        } as DeviceActionMetadata
      });
    }
    
    return {
      aiData: {
        deviceName: targetDevice.name,
        currentState: currentState || 'unknown',
        totalCount: 1,
        canPerformAction: currentState !== OFF,
        actionReason: currentState === OFF ? `${targetDevice.name} is already off` : undefined,
        devices: [{
          id: targetDevice.id,
          name: targetDevice.name,
          type: targetDevice.type,
          status: targetDevice.status || 'unknown',
          displayState: currentState,
          connectorCategory: targetDevice.connector.category,
          space: targetDevice.spaceId,
          location: targetDevice.locationId
        }]
      },
      uiData: {
        actions: actions.length > 0 ? actions : undefined
      }
    };
  } catch (error) {
    console.error('[turnOffDevice] Error:', error);
    return {
      aiData: {
        error: error instanceof Error ? error.message : 'Failed to turn off device',
        deviceName,
        totalCount: 0
      }
    };
  }
}

async function getApiDocumentation(args: any): Promise<FunctionExecutionResult> {
  const { requestType = 'overview' } = args;
  
  try {
    // Get base URL for the current environment
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || '';
    
    let documentation: any = {};
    
    switch (requestType) {
      case 'overview':
        documentation = {
          title: "Fusion API Documentation",
          description: "Comprehensive REST API for managing devices, spaces, alarm zones, events, and automations",
          version: "1.0",
          features: [
            "Device management and control",
            "Space and alarm zone management",
            "Event querying and filtering", 
            "Automation management",
            "User and organization management",
            "Real-time event streaming"
          ]
        };
        break;
        
      case 'endpoints':
        documentation = {
          categories: [
            {
              name: "Devices",
              endpoints: [
                "GET /api/devices - List all devices",
                "GET /api/devices/{id} - Get device details",
                "POST /api/devices/{id}/state - Control device state"
              ]
            },
            {
              name: "Spaces",
              endpoints: [
                "GET /api/spaces - List all spaces",
                "POST /api/spaces - Create new space",
                "GET/PUT/DELETE /api/spaces/{id} - Manage specific space"
              ]
            },
            {
              name: "Alarm Zones", 
              endpoints: [
                "GET /api/alarm-zones - List all alarm zones",
                "POST /api/alarm-zones - Create new zone",
                "PUT /api/alarm-zones/{id}/arm-state - Arm/disarm zone"
              ]
            },
            {
              name: "Events",
              endpoints: [
                "GET /api/events - Query events with filters",
                "GET /api/events/dashboard - Get dashboard events",
                "GET /api/events/stream - Real-time event stream"
              ]
            }
          ]
        };
        break;
        
      case 'authentication':
        documentation = {
          type: "API Key",
          description: "All API requests require authentication using API keys",
          headerName: "x-api-key",
          headerFormat: "YOUR_API_KEY",
          keyManagement: "API keys can be managed in Account Settings → Organization tab"
        };
        break;
        
      case 'examples':
        documentation = {
          listDevices: {
            method: "GET",
            endpoint: "/api/devices",
            description: "Get all devices for your organization"
          },
          listEvents: {
            method: "GET", 
            endpoint: "/api/events?limit=50",
            description: "Get recent events with optional filters"
          },
          armZone: {
            method: "PUT",
            endpoint: "/api/alarm-zones/{id}/arm-state",
            description: "Arm a specific alarm zone"
          }
        };
        break;
    }
    
    documentation = {
      ...documentation,
      apiDocumentationUrl: `${baseUrl}/api/docs/reference`,
      openApiSpecUrl: `${baseUrl}/api/docs/spec`,
      baseApiUrl: `${baseUrl}/api`,
      overview: {
        title: "Fusion API Documentation",
        description: "Comprehensive REST API for managing devices, spaces, alarm zones, events, and automations",
        version: "1.0",
        features: [
          "Device management and control",
          "Space and alarm zone management",
          "Event querying and filtering", 
          "Automation management",
          "User and organization management",
          "Real-time event streaming"
        ]
      },
      authentication: {
        type: "API Key",
        description: "All API requests require authentication using API keys",
        headerName: "x-api-key",
        headerFormat: "YOUR_API_KEY",
        keyManagement: "API keys can be managed in Account Settings → Organization tab"
      },
      examples: {
        listDevices: {
          method: "GET",
          endpoint: "/api/devices",
          description: "Get all devices for your organization"
        },
        listEvents: {
          method: "GET", 
          endpoint: "/api/events?limit=50",
          description: "Get recent events with optional filters"
        },
        armZone: {
          method: "PUT",
          endpoint: "/api/alarm-zones/{id}/arm-state",
          description: "Arm a specific alarm zone"
        }
      },
      gettingStarted: [
        "1. Generate an API key in Account Settings → Organization tab",
        "2. Include the key in x-api-key header: 'YOUR_API_KEY'",
        "3. Make requests to endpoints under /api/",
        "4. View interactive documentation for testing endpoints"
      ]
    };
    
    return {
      aiData: {
        summary: `API documentation for ${requestType} retrieved successfully`,
        ...documentation
      }
    };
  } catch (error) {
    console.error('[getApiDocumentation] Error:', error);
    return {
      aiData: {
        error: error instanceof Error ? error.message : 'Failed to get API documentation'
      }
    };
  }
} 