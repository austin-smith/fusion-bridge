/**
 * Simple functions for OpenAI to call
 * Each function does ONE thing well
 */

import { createOrgScopedDb } from '@/lib/db/org-scoped-db';
import { ArmedState, ActionableState, DisplayState, ON, OFF } from '@/lib/mappings/definitions';
import { actionHandlers } from '@/lib/device-actions';
import type { ChatAction, DeviceActionMetadata, AreaActionMetadata } from '@/types/ai/chat-actions';
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
    name: "list_devices",
    description: "List and search ALL devices. Use this when users want to see, list, or check status of devices. Shows all matching devices regardless of controllability.",
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
    description: "Find ONLY devices that can be controlled (turned on/off). Use this when users want to control devices, NOT when they just want to see or list devices. This filters out devices cannot be controlled. For listing ALL devices, use list_devices instead.",
    parameters: {
      type: "object",
      properties: {
        searchTerm: { 
          type: "string", 
          description: "Search term to find controllable devices. Searches device names, types, and categories automatically. Examples: 'lights', 'office lights', 'switches', 'outlets'" 
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
    name: "list_areas",
    description: "List and search areas with their current armed state and status",
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
  },
  // Dedicated bulk operation functions for consistent bulk actions
  {
    name: "arm_all_areas",
    description: "Arm all areas in the organization. Use this when user says 'arm all areas', 'arm everything', 'set all areas to armed', etc. Always returns bulk arm action regardless of current state.",
    parameters: {
      type: "object",
      properties: {
        areaFilter: {
          type: "object",
          properties: {
            locations: { type: "array", items: { type: "string" }, description: "Optional: filter to specific locations" },
            excludeNames: { type: "array", items: { type: "string" }, description: "Optional: exclude specific area names" }
          }
        }
      }
    }
  },
  {
    name: "disarm_all_areas",
    description: "Disarm all areas in the organization. Use this when user says 'disarm all areas', 'disarm everything', 'set all areas to disarmed', etc. Always returns bulk disarm action regardless of current state.",
    parameters: {
      type: "object",
      properties: {
        areaFilter: {
          type: "object",
          properties: {
            locations: { type: "array", items: { type: "string" }, description: "Optional: filter to specific locations" },
            excludeNames: { type: "array", items: { type: "string" }, description: "Optional: exclude specific area names" }
          }
        }
      }
    }
  },
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
  // Individual action functions for specific areas/devices
  {
    name: "arm_area",
    description: "Arm a specific area by its exact name. ONLY use this when you know the precise area name. For multiple areas or unclear references, use arm_all_areas or list_areas first.",
    parameters: {
      type: "object",
      properties: {
        areaName: { type: "string", description: "Exact name of the specific area to arm" }
      },
      required: ["areaName"]
    }
  },
  {
    name: "disarm_area", 
    description: "Disarm a specific area by its exact name. ONLY use this when you know the precise area name. For multiple areas or unclear references, use disarm_all_areas or list_areas first.",
    parameters: {
      type: "object",
      properties: {
        areaName: { type: "string", description: "Exact name of the specific area to disarm" }
      },
      required: ["areaName"]
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
    
    case 'list_areas':
      return listAreas(orgDb, args);
      
    case 'get_system_overview':
      return getSystemOverview(orgDb);
      
    // Dedicated bulk operation functions
    case 'arm_all_areas':
      return armAllAreas(orgDb, args);
      
    case 'disarm_all_areas':
      return disarmAllAreas(orgDb, args);
      
    case 'turn_on_all_devices':
      return turnOnAllDevices(orgDb, args);
      
    case 'turn_off_all_devices':
      return turnOffAllDevices(orgDb, args);
      
    // Individual action functions
    case 'arm_area':
      return armArea(orgDb, args);
      
    case 'disarm_area':
      return disarmArea(orgDb, args);
      
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

// Count events using direct database query (proper database counting)
async function countEvents(args: any, organizationId: string): Promise<FunctionExecutionResult> {
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
    
    // Return separated AI and UI data
    return {
      aiData: {
      count: eventCount,
        timeRange: timeStart && timeEnd ? { start: timeStart, end: timeEnd } : undefined,
      filters: {
        deviceNames,
        eventTypes
      }
      }
      // No UI actions for count operations
    };
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

// Count devices using the same counting logic as the API (consistent approach)
async function countDevices(args: any, organizationId: string): Promise<FunctionExecutionResult> {
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
    
    // Return separated AI and UI data
    return {
      aiData: {
      count: deviceCount,
      filters: {
        connectorCategories,
        deviceTypes,
        statuses
      }
      }
      // No UI actions for count operations
    };
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
        case 'area':
          key = event.areaName || 'Unknown Area';
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
      area: e.areaName,
      location: e.locationName
    }))
    }
  };
}

// List devices
async function listDevices(orgDb: any, args: any): Promise<FunctionExecutionResult> {
  const { deviceFilter, includeMetrics } = args;
  
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
        
        // Strategy 3: Word-based match (all search words found in device name, with pluralization)
        const searchWords = searchName.split(/\s+/);
        const deviceWords = deviceName.split(/\s+/);
        
        if (searchWords.length === 1) {
          // Single word search - check if it matches any device word (with pluralization)
          const searchWordSingular = pluralize.singular(searchName);
          return deviceWords.some((deviceWord: string) => {
            const deviceWordSingular = pluralize.singular(deviceWord);
            return deviceWord === searchName ||
                   deviceWord === searchWordSingular ||
                   deviceWordSingular === searchName ||
                   deviceWordSingular === searchWordSingular;
          });
        } else {
          // Multi-word search - check if all search words are found in device (with pluralization)
          return searchWords.every((searchWord: string) => {
            const searchWordSingular = pluralize.singular(searchWord);
            return deviceWords.some((deviceWord: string) => {
              const deviceWordSingular = pluralize.singular(deviceWord);
              return deviceWord === searchWord ||
                     deviceWord === searchWordSingular ||
                     deviceWordSingular === searchWord ||
                     deviceWordSingular === searchWordSingular;
            });
          });
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
  
  if (deviceFilter?.statuses?.length) {
    const statusSet = new Set(deviceFilter.statuses);
    filteredDevices = filteredDevices.filter((d: any) => 
      d.status && statusSet.has(d.status)
    );
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
      area: d.areaId,
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
  const { searchTerm, actionIntent = "list_all" } = args;
  
  console.log('[findControllableDevices] Called with args:', JSON.stringify(args, null, 2));
  
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
      
      if (matches.length > 0) {
        console.log(`[findControllableDevices] Found ${matches.length} exact name matches`);
        filteredDevices = matches;
      } else {
        // Strategy 2: Smart word matching (pluralization-aware, but conservative)
        matches = devices.filter((d: any) => {
          if (!d.name) return false;
          
          const deviceWords = d.name.toLowerCase().split(/\s+/);
          const searchWords = lowerCaseSearchTerm.split(/\s+/);
          
          // For single search word, match any device word (with pluralization)
          if (searchWords.length === 1) {
            const searchWord = searchWords[0];
            const searchWordSingular = pluralize.singular(searchWord);
            
            const wordMatch = deviceWords.some((deviceWord: string) => {
              const deviceWordSingular = pluralize.singular(deviceWord);
              return deviceWord === searchWord ||
                     deviceWord === searchWordSingular ||
                     deviceWordSingular === searchWord ||
                     deviceWordSingular === searchWordSingular;
            });
            
            if (wordMatch) {
              console.log(`[findControllableDevices] Device "${d.name}" matches single word "${searchWord}"`);
            }
            return wordMatch;
          }
          
          // For multi-word searches, be more conservative:
          // Check if the search phrase appears as a meaningful unit
          const deviceName = d.name.toLowerCase();
          
          // Try direct substring match first
          if (deviceName.includes(lowerCaseSearchTerm) || deviceName.includes(singularSearchTerm)) {
            console.log(`[findControllableDevices] Device "${d.name}" matches multi-word phrase as substring`);
            return true;
          }
          
          // Only if no substring match, try individual word matching
          // But require that the LAST word (usually the device type) matches
          const lastSearchWord = searchWords[searchWords.length - 1];
          const lastSearchWordSingular = pluralize.singular(lastSearchWord);
          
          const lastWordMatches = deviceWords.some((deviceWord: string) => {
            const deviceWordSingular = pluralize.singular(deviceWord);
            return deviceWord === lastSearchWord ||
                   deviceWord === lastSearchWordSingular ||
                   deviceWordSingular === lastSearchWord ||
                   deviceWordSingular === lastSearchWordSingular;
          });
          
          if (lastWordMatches) {
            // Also check that other search words are present
            const otherSearchWords = searchWords.slice(0, -1);
            const otherWordsMatch = otherSearchWords.every((searchWord: string) => {
              const searchWordSingular = pluralize.singular(searchWord);
              return deviceWords.some((deviceWord: string) => {
                const deviceWordSingular = pluralize.singular(deviceWord);
                return deviceWord === searchWord ||
                       deviceWord === searchWordSingular ||
                       deviceWordSingular === searchWord ||
                       deviceWordSingular === searchWordSingular;
              });
            });
            
            if (otherWordsMatch) {
              console.log(`[findControllableDevices] Device "${d.name}" matches multi-word with type matching`);
              return true;
            }
          }
          
          return false;
        });
        
        if (matches.length > 0) {
          console.log(`[findControllableDevices] Found ${matches.length} smart word matches`);
          filteredDevices = matches;
        } else {
          // Strategy 3: Partial name match (substring) - both forms
          matches = devices.filter((d: any) => 
            d.name && (
              d.name.toLowerCase().includes(lowerCaseSearchTerm) ||
              d.name.toLowerCase().includes(singularSearchTerm)
            )
          );
          
          if (matches.length > 0) {
            console.log(`[findControllableDevices] Found ${matches.length} partial name matches`);
            filteredDevices = matches;
          } else {
            // Strategy 4: Device type matching
            matches = devices.filter((d: any) => 
              d.type && (
                d.type.toLowerCase() === lowerCaseSearchTerm ||
                d.type.toLowerCase() === singularSearchTerm ||
                d.type.toLowerCase().includes(lowerCaseSearchTerm) ||
                d.type.toLowerCase().includes(singularSearchTerm) ||
                pluralize.singular(d.type.toLowerCase()) === singularSearchTerm
              )
            );
            
            if (matches.length > 0) {
              console.log(`[findControllableDevices] Found ${matches.length} device type matches`);
              filteredDevices = matches;
            } else {
              // Strategy 5: Connector category matching
              matches = devices.filter((d: any) => 
                d.connector?.category && (
                  d.connector.category.toLowerCase() === lowerCaseSearchTerm ||
                  d.connector.category.toLowerCase().includes(lowerCaseSearchTerm) ||
                  d.connector.category.toLowerCase().includes(singularSearchTerm)
                )
              );
              
              if (matches.length > 0) {
                console.log(`[findControllableDevices] Found ${matches.length} connector category matches`);
                filteredDevices = matches;
              } else {
                console.log(`[findControllableDevices] No matches found for any search strategy`);
                filteredDevices = []; // No matches found
              }
            }
          }
        }
      }
      
      console.log(`[findControllableDevices] Final filtered result: ${filteredDevices.length} devices`);
  }
  
  // Filter to ONLY controllable devices
  const controllableDevices: any[] = [];
  const actions: ChatAction[] = [];
  
  console.log(`[findControllableDevices] Checking controllability for ${filteredDevices.length} filtered devices`);
  
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
      area: d.areaId,
      location: d.locationId,
      displayState: d.displayState
    })),
    },
    uiData: {
    actions: actions.length > 0 ? actions : undefined
    }
  };
}

// List areas
async function listAreas(orgDb: any, args: any): Promise<FunctionExecutionResult> {
  const { areaFilter } = args;
  
  // Get all areas
  const areas = await orgDb.areas.findAll();
  
  // Apply filters
  let filteredAreas = areas;
  
  if (areaFilter?.names?.length) {
    const searchNames = areaFilter.names.map((n: string) => n.toLowerCase());
    filteredAreas = filteredAreas.filter((area: any) => {
      if (!area.name) return false;
      
      const areaName = area.name.toLowerCase();
      
      // Check if any of the search names match this area
      return searchNames.some((searchName: string) => {
        // Strategy 1: Exact match
        if (areaName === searchName) {
          return true;
        }
        
        // Strategy 2: Partial match (search term is contained in area name)
        if (areaName.includes(searchName)) {
          return true;
        }
        
        // Strategy 3: Word-based match (all search words found in area name)
        const searchWords = searchName.split(/\s+/);
        const areaWords = areaName.split(/\s+/);
        
                 if (searchWords.length === 1) {
           // Single word search - check if it matches any area word
           return areaWords.some((areaWord: string) => areaWord === searchName);
         } else {
           // Multi-word search - check if all search words are found in area
           return searchWords.every((searchWord: string) => 
             areaWords.some((areaWord: string) => areaWord === searchWord)
           );
         }
      });
    });
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
        console.warn('[listAreas] Skipping area with missing required data:', area?.id);
        return;
      }

      const currentState = area.armedState || ArmedState.DISARMED;
      
      // Only add actions that would change the current state
      const isArmed = currentState === ArmedState.ARMED_AWAY || 
                     currentState === ArmedState.ARMED_STAY || 
                     currentState === ArmedState.TRIGGERED;
      
      // Only add ARM action if area is not already armed (and not triggered)
      if (!isArmed) {
        actions.push({
          id: `area-${area.id}-arm`,
          type: 'area',
          label: `Arm ${area.name}`,
          icon: 'ShieldCheck',
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
          icon: 'ShieldOff',
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
    console.error('[listAreas] Error generating area actions:', error);
    // Continue execution - don't let action generation errors break the whole response
  }
  
  // Return area status with actions
  return {
    aiData: {
    totalCount: filteredAreas.length,
    areas: filteredAreas.map((a: any) => ({
      id: a.id,
      name: a.name,
      armedState: a.armedState || ArmedState.DISARMED,
      location: a.locationId
      }))
    },
    uiData: {
    actions: actions.length > 0 ? actions : undefined
    }
  };
}

// Get system overview
async function getSystemOverview(orgDb: any): Promise<FunctionExecutionResult> {
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
    aiData: {
    deviceCount: devices.length,
    areaCount: areas.length,
    locationCount: locations.length,
      armedStates: Array.from(armedStateCounts.entries()).map(([state, count]) => ({ state, count }))
    },
    uiData: {
    actions: actions.length > 0 ? actions : undefined
    }
  };
}

// Dedicated bulk operation functions for consistent bulk actions

// Generic bulk operation helper to reduce code duplication
interface BulkOperationConfig {
  entityType: 'areas' | 'devices';
  actionType: 'arm' | 'disarm' | 'turn_on' | 'turn_off';
  actionLabel: string;
  icon: string;
  targetState?: ArmedState | ActionableState;
  requiresControllabilityCheck?: boolean;
}

async function createBulkOperation(
  orgDb: any, 
  args: any, 
  config: BulkOperationConfig
): Promise<FunctionExecutionResult> {
  const { areaFilter, deviceFilter } = args;
  const filter = config.entityType === 'areas' ? (areaFilter || {}) : (deviceFilter || {});
  
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
    
    if (config.entityType === 'devices' && config.requiresControllabilityCheck) {
      entities.forEach((device: any) => {
        if (!device?.id || !device?.name || !device?.connector?.category) {
          return;
        }

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
          
          const canPerformAction = supportedHandler.canHandle(deviceContext, config.targetState as ActionableState);
          
          if (canPerformAction) {
            validEntities.push(device);
            
            actions.push({
              id: `device-${device.id}-${config.actionType}`,
              type: 'device' as const,
              label: `${config.actionLabel} ${device.name}`,
              icon: config.icon,
              metadata: {
                internalDeviceId: device.id,
                deviceName: device.name,
                action: config.targetState as ActionableState,
                currentState: device.displayState,
                connectorCategory: device.connector.category,
                deviceType: device.type
              } as DeviceActionMetadata
            });
          }
        }
      });
    } else {
      // For areas or non-controllability-checked entities
      validEntities.push(...entities);
      
      entities.forEach((entity: any) => {
        if (config.entityType === 'areas') {
          actions.push({
            id: `area-${entity.id}-${config.actionType}`,
            type: 'area' as const,
            label: `${config.actionLabel} ${entity.name}`,
            icon: config.icon,
            metadata: {
              areaId: entity.id,
              areaName: entity.name,
              targetState: config.targetState as ArmedState,
              currentState: entity.armedState || ArmedState.DISARMED
            } as AreaActionMetadata
          });
        }
      });
    }
    
    // Build response data
    const entityData = validEntities.map((e: any) => {
      if (config.entityType === 'areas') {
        return {
          id: e.id,
          name: e.name,
          armedState: e.armedState || ArmedState.DISARMED,
          location: e.locationId
        };
      } else {
        return {
          id: e.id,
          name: e.name,
          type: e.type,
          connectorCategory: e.connector?.category,
          status: e.status || 'unknown',
          area: e.areaId,
          location: e.locationId,
          displayState: e.displayState
        };
      }
    });
    
    return {
      aiData: {
        totalCount: validEntities.length,
        summary: `Found ${validEntities.length} ${config.entityType} available for ${config.actionType.replace('_', ' ')}`,
        [config.entityType]: entityData
      },
      uiData: {
        actions: actions
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
async function armAllAreas(orgDb: any, args: any): Promise<FunctionExecutionResult> {
  return createBulkOperation(orgDb, args, {
    entityType: 'areas',
    actionType: 'arm',
    actionLabel: 'Arm',
    icon: 'ShieldCheck',
    targetState: ArmedState.ARMED_AWAY
  });
}

async function disarmAllAreas(orgDb: any, args: any): Promise<FunctionExecutionResult> {
  return createBulkOperation(orgDb, args, {
    entityType: 'areas',
    actionType: 'disarm',
    actionLabel: 'Disarm',
    icon: 'ShieldOff',
    targetState: ArmedState.DISARMED
  });
}

async function turnOnAllDevices(orgDb: any, args: any): Promise<FunctionExecutionResult> {
  return createBulkOperation(orgDb, args, {
    entityType: 'devices',
    actionType: 'turn_on',
    actionLabel: 'Turn On',
    icon: 'Power',
    targetState: ActionableState.SET_ON,
    requiresControllabilityCheck: true
  });
}

async function turnOffAllDevices(orgDb: any, args: any): Promise<FunctionExecutionResult> {
  return createBulkOperation(orgDb, args, {
    entityType: 'devices',
    actionType: 'turn_off',
    actionLabel: 'Turn Off',
    icon: 'PowerOff',
    targetState: ActionableState.SET_OFF,
    requiresControllabilityCheck: true
  });
}

// Individual action functions for specific areas/devices

async function armArea(orgDb: any, args: any): Promise<FunctionExecutionResult> {
  const { areaName } = args;
  
  try {
    // Get all areas
    const areas = await orgDb.areas.findAll();
    
    // Find the specific area by name (case-insensitive)
    const targetArea = areas.find((area: any) => 
      area.name && area.name.toLowerCase() === areaName.toLowerCase()
    );
    
    if (!targetArea) {
      return {
        aiData: {
          error: `Area '${areaName}' not found`,
          areaName,
          totalCount: 0
        }
      };
    }
    
    const currentState = targetArea.armedState || ArmedState.DISARMED;
    const actions: ChatAction[] = [];
    
    // Only add ARM action if area is not already armed
    const isArmed = currentState === ArmedState.ARMED_AWAY || 
                   currentState === ArmedState.ARMED_STAY || 
                   currentState === ArmedState.TRIGGERED;
    
    if (!isArmed) {
      actions.push({
        id: `area-${targetArea.id}-arm`,
        type: 'area',
        label: `Arm ${targetArea.name}`,
        icon: 'ShieldCheck',
        metadata: {
          areaId: targetArea.id,
          areaName: targetArea.name,
          targetState: ArmedState.ARMED_AWAY,
          currentState: currentState
        } as AreaActionMetadata
      });
    }
    
    return {
      aiData: {
        areaName: targetArea.name,
        currentState,
        totalCount: 1,
        canPerformAction: !isArmed,
        actionReason: isArmed ? `${targetArea.name} is already armed (${currentState})` : undefined,
        areas: [{
          id: targetArea.id,
          name: targetArea.name,
          armedState: currentState,
          location: targetArea.locationId
        }]
      },
      uiData: {
        actions: actions.length > 0 ? actions : undefined
      }
    };
  } catch (error) {
    console.error('[armArea] Error:', error);
    return {
      aiData: {
        error: error instanceof Error ? error.message : 'Failed to arm area',
        areaName,
        totalCount: 0
      }
    };
  }
}

async function disarmArea(orgDb: any, args: any): Promise<FunctionExecutionResult> {
  const { areaName } = args;
  
  console.log(`[disarmArea] Called with areaName: "${areaName}"`);
  
  try {
    // Get all areas
    const areas = await orgDb.areas.findAll();
    console.log(`[disarmArea] Found ${areas.length} total areas:`, areas.map((a: any) => `"${a.name}" (${a.armedState})`));
    
    // Find the specific area by name (case-insensitive)
    const targetArea = areas.find((area: any) => 
      area.name && area.name.toLowerCase() === areaName.toLowerCase()
    );
    
    console.log(`[disarmArea] Target area lookup result:`, targetArea ? `Found "${targetArea.name}" with state: ${targetArea.armedState}` : 'NOT FOUND');
    
    if (!targetArea) {
      return {
        aiData: {
          error: `Area '${areaName}' not found`,
          areaName,
          totalCount: 0
        }
      };
    }
    
    const currentState = targetArea.armedState || ArmedState.DISARMED;
    const actions: ChatAction[] = [];
    
    console.log(`[disarmArea] Current state: "${currentState}", DISARMED constant: "${ArmedState.DISARMED}"`);
    console.log(`[disarmArea] Should create action: ${currentState !== ArmedState.DISARMED}`);
    
    // Only add DISARM action if area is not already disarmed
    if (currentState !== ArmedState.DISARMED) {
      const action: ChatAction = {
        id: `area-${targetArea.id}-disarm`,
        type: 'area',
        label: `Disarm ${targetArea.name}`,
        icon: 'ShieldOff',
        metadata: {
          areaId: targetArea.id,
          areaName: targetArea.name,
          targetState: ArmedState.DISARMED,
          currentState: currentState
        } as AreaActionMetadata
      };
      actions.push(action);
      console.log(`[disarmArea] Created action:`, action);
    } else {
      console.log(`[disarmArea] No action created - area already disarmed`);
    }
    
    const result = {
      aiData: {
        areaName: targetArea.name,
        currentState,
        totalCount: 1,
        canPerformAction: currentState !== ArmedState.DISARMED,
        actionReason: currentState === ArmedState.DISARMED ? `${targetArea.name} is already disarmed` : undefined,
        areas: [{
          id: targetArea.id,
          name: targetArea.name,
          armedState: currentState,
          location: targetArea.locationId
        }]
      },
      uiData: {
        actions: actions.length > 0 ? actions : undefined
      }
    };
    
    console.log(`[disarmArea] Final result:`, JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    console.error('[disarmArea] Error:', error);
    return {
      aiData: {
        error: error instanceof Error ? error.message : 'Failed to disarm area',
        areaName,
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
        currentState,
        totalCount: 1,
        canPerformAction: currentState !== ON,
        actionReason: currentState === ON ? `${targetDevice.name} is already on` : undefined,
        devices: [{
          id: targetDevice.id,
          name: targetDevice.name,
          type: targetDevice.type,
          connectorCategory: targetDevice.connector.category,
          status: targetDevice.status || 'unknown',
          area: targetDevice.areaId,
          location: targetDevice.locationId,
          displayState: currentState
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
        currentState,
        totalCount: 1,
        canPerformAction: currentState !== OFF,
        actionReason: currentState === OFF ? `${targetDevice.name} is already off` : undefined,
        devices: [{
          id: targetDevice.id,
          name: targetDevice.name,
          type: targetDevice.type,
          connectorCategory: targetDevice.connector.category,
          status: targetDevice.status || 'unknown',
          area: targetDevice.areaId,
          location: targetDevice.locationId,
          displayState: currentState
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

// Get API documentation information
async function getApiDocumentation(args: any): Promise<FunctionExecutionResult> {
  const { requestType = "overview" } = args;
  
  try {
    let documentation: any = {};
    
    // Try to fetch the OpenAPI spec for detailed endpoint information
    if (requestType === "endpoints") {
      try {
        const response = await fetch('/api/docs/spec');
        if (response.ok) {
          const spec = await response.json();
          
          // Extract endpoint information from OpenAPI spec
          const endpoints = Object.entries(spec.paths || {}).map(([path, methods]: [string, any]) => {
            const endpointMethods = Object.keys(methods).filter(method => 
              ['get', 'post', 'put', 'delete', 'patch'].includes(method.toLowerCase())
            );
            
            return {
              path,
              methods: endpointMethods,
              summary: methods[endpointMethods[0]]?.summary || 'No description available'
            };
          });
          
          documentation.endpoints = endpoints;
          documentation.totalEndpoints = endpoints.length;
        }
      } catch (error) {
        console.warn('Could not fetch OpenAPI spec:', error);
      }
    }
    
    // Base documentation information
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    
    documentation = {
      ...documentation,
      apiDocumentationUrl: `${baseUrl}/api/docs/reference`,
      openApiSpecUrl: `${baseUrl}/api/docs/spec`,
      baseApiUrl: `${baseUrl}/api`,
      overview: {
        title: "Fusion API Documentation",
        description: "Comprehensive REST API for managing security devices, areas, events, and automations",
        version: "1.0",
        features: [
          "Device management and control",
          "Area arming/disarming",
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
        armArea: {
          method: "PUT",
          endpoint: "/api/areas/{id}/arm",
          description: "Arm a specific area"
        }
      },
      gettingStarted: [
        "1. Generate an API key in Account Settings → Organization tab",
        "2. Include the key in x-api-key header: 'YOUR_API_KEY'",
        "3. Make requests to endpoints under /api/",
        "4. View interactive documentation for testing endpoints"
      ]
    };
    
    // Create chat actions for easy access to documentation
    const actions: ChatAction[] = [
      {
        id: 'open-api-docs',
        type: 'device', // Using 'device' type as it's the most generic for external actions
        label: 'Open API Documentation',
        icon: 'BookOpen',
        metadata: {
          internalDeviceId: 'api-docs',
          deviceName: 'API Documentation',
          action: 'open_external_link',
          externalUrl: `${baseUrl}/api/docs/reference`,
          connectorCategory: 'system',
          deviceType: 'documentation'
        } as DeviceActionMetadata
      }
    ];

    // Add API key management action if user is asking about authentication
    if (requestType === 'authentication' || requestType === 'overview') {
      actions.push({
        id: 'manage-api-keys',
        type: 'device',
        label: 'Manage API Keys',
        icon: 'Key',
        metadata: {
          internalDeviceId: 'api-keys',
          deviceName: 'API Key Management',
          action: 'navigate_to_account_settings',
          accountSettingsTab: 'organization',
          connectorCategory: 'system',
          deviceType: 'settings'
        } as DeviceActionMetadata
      });
    }

    return {
      aiData: {
        summary: `API documentation information (${requestType})`,
        ...documentation
      },
      uiData: {
        actions
      }
    };
  } catch (error) {
    console.error('[getApiDocumentation] Error:', error);
    return {
      aiData: {
        error: error instanceof Error ? error.message : 'Failed to get API documentation',
        summary: `Failed to retrieve API documentation (${requestType})`
      }
    };
  }
} 