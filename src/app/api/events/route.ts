import { NextRequest, NextResponse } from 'next/server';
import { withOrganizationAuth, type OrganizationAuthContext } from '@/lib/auth/withOrganizationAuth';
import { createOrgScopedDb } from '@/lib/db/org-scoped-db';
import { db } from '@/data/db';
import { connectors, devices, events, locations } from '@/data/db/schema';
import { eq, sql, and, desc, count, gte, lte, inArray } from 'drizzle-orm';
import { getDeviceTypeInfo } from '@/lib/mappings/identification';
import { TypedDeviceInfo, DisplayState, DeviceType, EventCategory, EventSubtype } from '@/lib/mappings/definitions';
import { intermediateStateToDisplayString } from '@/lib/mappings/presentation';
import { PikoConfig } from '@/services/drivers/piko';
import type { RouteContext } from '@/lib/auth/withApiRouteAuth';

// Define the enriched event structure returned by organization-scoped queries
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
}

// Modified Pagination Metadata Interface
interface ApiPaginationMetadata {
  itemsPerPage: number;
  currentPage: number;
  hasNextPage: boolean;
}

// Interface for the final enriched event data returned by the API
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
  deviceTypeInfo: TypedDeviceInfo;
  displayState?: DisplayState;
  rawEventType?: string;
  bestShotUrlComponents?: {
    type: 'cloud' | 'local';
    pikoSystemId?: string;
    connectorId: string;
    objectTrackId: string;
    cameraId: string;
  };
}

// Function to count events with filters (organization-scoped, database-level counting)
async function getEventsCount(
  organizationId: string, 
  filters: any, 
  timeStart?: string,
  timeEnd?: string,
  deviceNames?: string[]
): Promise<number> {
  try {
    // Build WHERE conditions
    const conditions = [eq(connectors.organizationId, organizationId)];
    
    // Time range filtering
    if (timeStart && timeEnd) {
      conditions.push(gte(events.timestamp, new Date(timeStart)));
      conditions.push(lte(events.timestamp, new Date(timeEnd)));
    }
    
    // Event category filtering
    if (filters.eventCategories?.length) {
      conditions.push(inArray(events.standardizedEventCategory, filters.eventCategories));
    }
    
    // Connector category filtering
    if (filters.connectorCategory && filters.connectorCategory.toLowerCase() !== 'all') {
      conditions.push(eq(connectors.category, filters.connectorCategory));
    }
    
    // Device name filtering (requires join to devices table)
    let needsDeviceJoin = false;
    if (deviceNames?.length) {
      needsDeviceJoin = true;
    }
    
    // Build the count query
    let query = db
      .select({ count: count() })
      .from(events)
      .innerJoin(connectors, eq(connectors.id, events.connectorId));
    
    // Add device join if needed for device name filtering
    if (needsDeviceJoin) {
      query = query.leftJoin(devices, and(
        eq(devices.connectorId, events.connectorId),
        eq(devices.deviceId, events.deviceId)
      ));
      
      if (deviceNames?.length) {
        conditions.push(inArray(devices.name, deviceNames));
      }
    }
    
    // Location filtering (requires more complex joins, skip for now)
    if (filters.locationId && filters.locationId.toLowerCase() !== 'all') {
      console.warn('Location filtering in count not yet implemented');
    }
    
    const result = await query.where(and(...conditions));
    
    return result[0]?.count || 0;
  } catch (error) {
    console.error('Error counting events:', error);
    return 0;
  }
}

// Function to get a single event by UUID (organization-scoped)
async function getSingleEvent(eventUuid: string, orgDb: any): Promise<ApiEnrichedEvent | null> {
  try {
    const result = await orgDb.events.findById(eventUuid);

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
      deviceInternalId: event.deviceInternalId ?? undefined,
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
      spaceId: event.spaceId ?? undefined,
      spaceName: event.spaceName ?? undefined,
      locationId: event.locationId ?? undefined,
      locationName: event.locationName ?? undefined,
    };
  } catch (error) {
    console.error('Error fetching single event:', error);
    return null;
  }
}

// GET handler to fetch events (organization-scoped)
export const GET = withOrganizationAuth(async (request, authContext: OrganizationAuthContext) => {
  try {
    const orgDb = createOrgScopedDb(authContext.organizationId);
    const searchParams = request.nextUrl.searchParams;
    const eventUuid = searchParams.get('eventUuid');
    
    // If eventUuid is provided, fetch single event
    if (eventUuid) {
      const event = await getSingleEvent(eventUuid, orgDb);
      if (!event) {
        return NextResponse.json(
          { success: false, error: 'Event not found' },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true, data: event });
    }

    // Parse common parameters
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = (page - 1) * limit;
    const countOnly = searchParams.get('count') === 'true';
    
    // Parse time range parameters
    const timeStart = searchParams.get('timeStart');
    const timeEnd = searchParams.get('timeEnd');

    // Read and prepare filters from query parameters
    const eventCategoriesRaw = searchParams.get('eventCategories');
    const connectorCategory = searchParams.get('connectorCategory') || undefined;
    const locationId = searchParams.get('locationId') || undefined;
    const deviceNames = searchParams.get('deviceNames')?.split(',').map(n => n.trim()).filter(n => n.length > 0);

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
      locationId: locationId
    };

    // If count is requested, return count only
    if (countOnly) {
      const eventCount = await getEventsCount(authContext.organizationId, filters, timeStart || undefined, timeEnd || undefined, deviceNames);
      return NextResponse.json({
        success: true,
        count: eventCount
      });
    }

    // Use organization-scoped event query
    const recentEnrichedEvents: OrgEnrichedEvent[] = await orgDb.events.findRecent(limit, offset, filters);

    // Determine if there is a next page
    const hasNextPage = recentEnrichedEvents.length > limit;

    // Slice the array to return only the requested number of items
    const eventsForCurrentPage = recentEnrichedEvents.slice(0, limit);

    // Map the organization-scoped results to the API response structure
    const apiEvents = eventsForCurrentPage.map((event: OrgEnrichedEvent): ApiEnrichedEvent => {
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
      
      // Handle both Cloud and Local Piko for bestShotUrlComponents
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

      return finalEventObject;
    });

    // Modified Pagination Metadata
    const paginationMetadata: ApiPaginationMetadata = {
      itemsPerPage: limit,
      currentPage: page,
      hasNextPage: hasNextPage,
    };

    console.log(`[API] page: ${page}, limit: ${limit}, eventsForCurrentPage.length: ${eventsForCurrentPage.length}, hasNextPage: ${hasNextPage}`);

    return NextResponse.json({ 
      success: true, 
      data: apiEvents,
      pagination: paginationMetadata
    });

  } catch (error) {
    console.error('Error fetching events:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch events' },
      { status: 500 }
    );
  }
}); 