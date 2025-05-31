import { NextRequest, NextResponse } from 'next/server';
import { withApiRouteAuth } from '@/lib/auth/withApiRouteAuth';
import { db } from '@/data/db';
import { connectors, devices, events, areaDevices, areas, locations } from '@/data/db/schema';
import { eq, sql, and, desc } from 'drizzle-orm';
import * as eventsRepository from '@/data/repositories/events';
import { getDeviceTypeInfo } from '@/lib/mappings/identification';
import { TypedDeviceInfo, DisplayState, DeviceType, EventCategory, EventSubtype } from '@/lib/mappings/definitions';
import { intermediateStateToDisplayString } from '@/lib/mappings/presentation';
import { PikoConfig } from '@/services/drivers/piko';

// Define the enriched event structure returned by getRecentEvents
interface RepoEnrichedEvent {
  id: number;
  eventUuid: string;
  deviceId: string;
  timestamp: Date;
  standardizedEventCategory: string;
  standardizedEventType: string;
  standardizedEventSubtype: string | null;
  standardizedPayload: unknown; // Keep as unknown for parsing
  rawPayload: unknown;
  rawEventType: string | null; // Added from repo
  connectorId: string;
  deviceName: string | null; // Field from JOIN
  rawDeviceType: string | null; // Field from JOIN
  connectorName: string | null; // Field from JOIN
  connectorCategory: string | null; // Field from JOIN
  connectorConfig: string | null;
  areaId: string | null; // <-- RE-ADDED: From areaDevices table via eventsRepository
  areaName: string | null; // <-- RE-ADDED: From areas table via eventsRepository
  locationId: string | null; // Location ID from locations table via eventsRepository
  locationName: string | null; // Location name from locations table via eventsRepository
}

// --- Modified Pagination Metadata Interface ---
interface ApiPaginationMetadata {
  itemsPerPage: number;
  currentPage: number;
  hasNextPage: boolean; // <-- Use boolean flag instead of totalPages
}
// --- End Modified Pagination Metadata Interface ---

// Interface for the final enriched event data returned by the API
interface ApiEnrichedEvent {
  id: number;
  eventUuid: string;
  deviceId: string;
  deviceName?: string;
  connectorId: string;
  connectorName?: string;
  connectorCategory: string;
  areaId?: string; // <-- RE-ADDED: Optional Area ID
  areaName?: string; // <-- RE-ADDED: Optional Area Name
  locationId?: string; // Optional Location ID
  locationName?: string; // Optional Location Name
  timestamp: number; // Epoch ms
  eventCategory: string;
  eventType: string;
  eventSubtype?: EventSubtype;
  payload: Record<string, any> | null;
  rawPayload: Record<string, any> | null;
  deviceTypeInfo: TypedDeviceInfo;
  displayState?: DisplayState;
  rawEventType?: string; // Add optional rawEventType
  bestShotUrlComponents?: {
    type: 'cloud' | 'local';
    pikoSystemId?: string; // Optional: Only present for cloud
    connectorId: string;
    objectTrackId: string;
    cameraId: string;
  };
}

// Function to get a single event by UUID
async function getSingleEvent(eventUuid: string): Promise<ApiEnrichedEvent | null> {
  try {
    const result = await db
      .select({
        // Event fields
        id: events.id,
        eventUuid: events.eventUuid,
        deviceId: events.deviceId,
        timestamp: events.timestamp,
        standardizedEventCategory: events.standardizedEventCategory,
        standardizedEventType: events.standardizedEventType,
        standardizedEventSubtype: events.standardizedEventSubtype,
        standardizedPayload: events.standardizedPayload,
        rawPayload: events.rawPayload,
        rawEventType: events.rawEventType,
        connectorId: events.connectorId,
        // Joined Device fields
        deviceName: devices.name,
        rawDeviceType: devices.type, 
        // Joined Connector fields
        connectorName: connectors.name,
        connectorCategory: connectors.category,
        connectorConfig: connectors.cfg_enc,
        // Joined Area fields (nullable due to LEFT JOINs)
        areaId: areaDevices.areaId,
        areaName: areas.name,
        // Joined Location fields (nullable due to LEFT JOINs)
        locationId: locations.id,
        locationName: locations.name
      })
      .from(events)
      .leftJoin(devices, and(
          eq(devices.connectorId, events.connectorId),
          eq(devices.deviceId, events.deviceId)
      ))
      .leftJoin(connectors, eq(connectors.id, events.connectorId))
      .leftJoin(areaDevices, eq(areaDevices.deviceId, devices.id))
      .leftJoin(areas, eq(areas.id, areaDevices.areaId))
      .leftJoin(locations, eq(locations.id, areas.locationId))
      .where(eq(events.eventUuid, eventUuid))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    const event = result[0];
    
    // Parse payloads and create enriched event
    let payload: Record<string, any> | null = null;
    let rawPayload: Record<string, any> | null = null;
    let displayState: DisplayState | undefined = undefined;
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
      deviceName: event.deviceName ?? undefined,
      connectorId: event.connectorId,
      connectorName: event.connectorName ?? undefined,
      connectorCategory: connectorCategory,
      timestamp: new Date(event.timestamp).getTime(),
      eventCategory: event.standardizedEventCategory,
      eventType: event.standardizedEventType,
      eventSubtype: event.standardizedEventSubtype as EventSubtype ?? undefined,
      payload: payload,
      deviceTypeInfo: deviceTypeInfo,
      displayState: displayState,
      rawPayload: rawPayload,
      rawEventType: event.rawEventType ?? undefined,
      bestShotUrlComponents: bestShotUrlComponents,
      areaId: event.areaId ?? undefined,
      areaName: event.areaName ?? undefined,
      locationId: event.locationId ?? undefined,
      locationName: event.locationName ?? undefined,
    };
  } catch (error) {
    console.error('Error fetching single event:', error);
    return null;
  }
}

// GET handler to fetch events
export const GET = withApiRouteAuth(async (request, authContext) => {
  try {
    const searchParams = request.nextUrl.searchParams;
    const eventUuid = searchParams.get('eventUuid');
    
    // If eventUuid is provided, fetch single event
    if (eventUuid) {
      const event = await getSingleEvent(eventUuid);
      if (!event) {
        return NextResponse.json(
          { success: false, error: 'Event not found' },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true, data: event });
    }

    // Otherwise, fetch list of events with pagination and filters
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = (page - 1) * limit;

    // --- ADDED: Read and prepare filters from query parameters ---
    const eventCategoriesRaw = searchParams.get('eventCategories');
    const connectorCategory = searchParams.get('connectorCategory') || undefined; // Use undefined if not present or empty
    const locationId = searchParams.get('locationId') || undefined; // Use undefined if not present or empty

    let eventCategories: string[] | undefined = undefined;
    if (eventCategoriesRaw) {
      eventCategories = eventCategoriesRaw.split(',').map(cat => cat.trim()).filter(cat => cat.length > 0);
      if (eventCategories.length === 0) {
        eventCategories = undefined; // Treat empty array after split/filter as no filter
      }
    }

    const filters = {
      eventCategories: eventCategories,
      connectorCategory: connectorCategory,
      locationId: locationId
    };
    // --- END ADDED ---

    // MODIFIED: Pass filters to the repository function
    const recentEnrichedEvents: RepoEnrichedEvent[] = await eventsRepository.getRecentEvents(limit, offset, filters);

    // Determine if there is a next page
    const hasNextPage = recentEnrichedEvents.length > limit;

    // Slice the array to return only the requested number of items
    const eventsForCurrentPage = recentEnrichedEvents.slice(0, limit);

    // Map the repository results for the current page to the API response structure
    const apiEvents = eventsForCurrentPage.map((event: RepoEnrichedEvent): ApiEnrichedEvent => {
      let payload: Record<string, any> | null = null;
      let rawPayload: Record<string, any> | null = null;
      let displayState: DisplayState | undefined = undefined;
      let bestShotUrlComponents: ApiEnrichedEvent['bestShotUrlComponents'] | undefined = undefined;
      const connectorCategory = event.connectorCategory ?? 'unknown'; // Default if null from JOIN

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
      
      // MODIFIED: Handle both Cloud and Local Piko for bestShotUrlComponents
      if (
        connectorCategory === 'piko' &&
        event.standardizedEventCategory === EventCategory.ANALYTICS && // Check category
        payload?.objectTrackId && 
        typeof payload.objectTrackId === 'string' &&
        event.deviceId // Ensure we have the camera/device ID
      ) {
        if (event.connectorConfig) {
            try {
                const config = JSON.parse(event.connectorConfig) as PikoConfig;
                
                if (config.type === 'cloud' && config.selectedSystem) {
                    bestShotUrlComponents = {
                        type: 'cloud',
                        pikoSystemId: config.selectedSystem, // Include for cloud
                        objectTrackId: payload.objectTrackId,
                        cameraId: event.deviceId, // The event's deviceId is the camera GUID
                        connectorId: event.connectorId // Pass our internal connector ID
                    };
                } else if (config.type === 'local') {
                    bestShotUrlComponents = {
                        type: 'local',
                        // pikoSystemId is omitted for local
                        objectTrackId: payload.objectTrackId,
                        cameraId: event.deviceId,
                        connectorId: event.connectorId
                    };
                } else {
                  console.warn(`Piko event ${event.eventUuid} has invalid or incomplete config type/details in connector ${event.connectorId}. Cannot create bestShotUrlComponents.`);
                }
            } catch (e) {
                console.warn(`Failed to parse Piko config for connector ${event.connectorId} on event ${event.eventUuid}:`, e);
            }
        } else {
            console.warn(`Missing connector config for Piko event ${event.eventUuid} from connector ${event.connectorId}. Cannot create bestShotUrlComponents.`);
        }
      }

      // Assemble the final API event object
      const finalEventObject: ApiEnrichedEvent = {
        id: event.id,
        eventUuid: event.eventUuid,
        deviceId: event.deviceId,
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
        areaId: event.areaId ?? undefined, // <-- RE-ADDED: Map from repo event
        areaName: event.areaName ?? undefined, // <-- RE-ADDED: Map from repo event
        locationId: event.locationId ?? undefined, // Map from repo event
        locationName: event.locationName ?? undefined, // Map from repo event
      };

      return finalEventObject;
    });

    // --- Modified Pagination Metadata --- 
    const paginationMetadata: ApiPaginationMetadata = {
      itemsPerPage: limit,
      currentPage: page,
      hasNextPage: hasNextPage, // <-- Use the calculated flag
    };
    // --- End Modified Pagination Metadata ---

    // ADDED: Log to check returned data length
    console.log(`[API] page: ${page}, limit: ${limit}, eventsForCurrentPage.length: ${eventsForCurrentPage.length}, hasNextPage: ${hasNextPage}`);

    return NextResponse.json({ 
      success: true, 
      data: apiEvents, // CORRECTED: Should be apiEvents (mapped data)
      pagination: paginationMetadata // <-- Include modified pagination metadata
    });

  } catch (error) {
    console.error('Error fetching events:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch events' },
      { status: 500 }
    );
  }
}); 