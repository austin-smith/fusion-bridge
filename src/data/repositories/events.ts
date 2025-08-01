import { db } from '@/data/db';
import { events, devices, connectors, spaceDevices, spaces, locations } from '@/data/db/schema';
import { desc, count, eq, sql, and, or, inArray, type SQL, isNull } from 'drizzle-orm';
import type { StandardizedEvent } from '@/types/events';
import { EventCategory, EventType, EventSubtype, DeviceType, DeviceSubtype } from '@/lib/mappings/definitions';
import { getDeviceTypeInfo } from '@/lib/mappings/identification';

interface RecentEventsFilters {
  eventCategories?: string[];
  connectorCategory?: string;
  locationId?: string;
}

// Interface for the filter parameters of findEventsInWindow
export interface FindEventsFilter {
    deviceId?: string; // The external device ID from the event
    standardizedEventTypes?: string[]; 
    standardizedEventSubtypes?: string[];
    standardizedDeviceTypes?: string[]; 
    startTime: Date;
    endTime: Date;
    specificDeviceIds?: string[];
}

/**
 * Finds events matching the specified criteria within a given time window.
 * Optionally filters by specific device external IDs.
 *
 * @param filter The filter criteria including time window, event type, device types, specific device IDs, etc.
 * @returns Promise<StandardizedEvent[]> - An array of matching events (or empty array).
 */
export async function findEventsInWindow(filter: FindEventsFilter): Promise<StandardizedEvent[]> {
    try {
        // --- Convert to SECONDS for comparison with DB --- 
        const startTimeSeconds = Math.floor(filter.startTime.getTime() / 1000);
        const endTimeSeconds = Math.ceil(filter.endTime.getTime() / 1000);

        const baseConditions: SQL[] = [
            // --- Compare using SECONDS --- 
            // --- Direct numeric comparison using seconds --- 
            sql`${events.timestamp} >= ${startTimeSeconds}`,
            sql`${events.timestamp} <= ${endTimeSeconds}`,
        ];
        
        // --- Filter by specificDeviceIds if provided ---
        if (filter.specificDeviceIds && filter.specificDeviceIds.length > 0) {
            baseConditions.push(inArray(events.deviceId, filter.specificDeviceIds));
        }

        // --- Simplified event type filters (apply only if specificDeviceIds wasn't used or for further filtering) ---
        // Note: The primary filtering logic now relies on the caller evaluating the eventFilter rule
        // These filters are kept for potential direct use or optimization if needed.
        if (filter.standardizedEventTypes && filter.standardizedEventTypes.length > 0) {
            baseConditions.push(inArray(events.standardizedEventType, filter.standardizedEventTypes));
        }
        if (filter.standardizedEventSubtypes && filter.standardizedEventSubtypes.length > 0) {
            baseConditions.push(inArray(events.standardizedEventSubtype, filter.standardizedEventSubtypes));
        }

        // We select all necessary fields to reconstruct StandardizedEvent objects
        const selectFields = {
            eventUuid: events.eventUuid,
            connectorId: events.connectorId,
            deviceId: events.deviceId,
            timestamp: events.timestamp,
            standardizedEventCategory: events.standardizedEventCategory,
            standardizedEventType: events.standardizedEventType,
            standardizedEventSubtype: events.standardizedEventSubtype,
            standardizedPayload: events.standardizedPayload,
            rawPayload: events.rawPayload,
            // Include fields needed for deviceInfo reconstruction if joining
            connectorCategory: connectors.category,
            rawDeviceType: devices.type, // Raw type from devices table
        };

        // --- Let TS infer dbResults type --- 
        let dbResults: any[] = []; // Initialize to empty array

        const deviceTypesToFilter = filter.standardizedDeviceTypes?.filter(t => t); 
        const hasDeviceTypeFilter = deviceTypesToFilter && deviceTypesToFilter.length > 0;

        if (hasDeviceTypeFilter) {
            // --- (Parsing logic for type/subtype filters remains similar) --- 
            const typeFilters = deviceTypesToFilter.map(fullType => {
                const parts = fullType.split('.');
                return { type: parts[0], subtype: parts[1] || null };
            });
            const types = [...new Set(typeFilters.map(f => f.type))];
            const subtypes = [...new Set(typeFilters.filter(f => f.subtype !== null).map(f => f.subtype as string))];
            const hasSubtypeFilter = subtypes.length > 0;
            const hasTypeOnlyFilter = typeFilters.some(f => f.subtype === null);

            const deviceFilterConditions: SQL[] = [];
            if (types.length > 0) {
                deviceFilterConditions.push(inArray(devices.standardizedDeviceType, types as DeviceType[]));
                let subtypeCondition: SQL | undefined = undefined;
                 if (hasSubtypeFilter && hasTypeOnlyFilter) {
                    subtypeCondition = or(inArray(devices.standardizedDeviceSubtype, subtypes as DeviceSubtype[]), isNull(devices.standardizedDeviceSubtype));
                } else if (hasSubtypeFilter) {
                    subtypeCondition = inArray(devices.standardizedDeviceSubtype, subtypes as DeviceSubtype[]);
                } else if (hasTypeOnlyFilter) {
                    subtypeCondition = isNull(devices.standardizedDeviceSubtype);
                }
                if (subtypeCondition) {
                    deviceFilterConditions.push(subtypeCondition);
                }
            }
            
            const joinConditions = [
                ...baseConditions,
                ...deviceFilterConditions
            ];

            // Query WITH JOIN to filter by device properties
            dbResults = await db
                .select(selectFields) // selectFields includes connectorCategory
                .from(events)
                .innerJoin(devices, and(
                    eq(events.connectorId, devices.connectorId),
                    eq(events.deviceId, devices.deviceId)
                ))
                .innerJoin(connectors, eq(events.connectorId, connectors.id))
                .where(and(...joinConditions))
                .orderBy(desc(events.timestamp)); // Order by timestamp might be useful

        } else {
            // Query WITHOUT JOIN if no standardizedDeviceType filter needed
            // Restore join with connectors and original selectFields
            dbResults = await db 
                .select({
                    eventUuid: events.eventUuid,
                    connectorId: events.connectorId,
                    deviceId: events.deviceId,
                    timestamp: events.timestamp,
                    standardizedEventCategory: events.standardizedEventCategory,
                    standardizedEventType: events.standardizedEventType,
                    standardizedEventSubtype: events.standardizedEventSubtype,
                    standardizedPayload: events.standardizedPayload,
                    rawPayload: events.rawPayload,
                    // Include fields needed for deviceInfo reconstruction
                    connectorCategory: connectors.category,
                    // We don't have rawDeviceType without joining 'devices', handle this in mapping
                })
                .from(events)
                .innerJoin(connectors, eq(events.connectorId, connectors.id)) // Restore join
                .where(and(...baseConditions))
                .orderBy(desc(events.timestamp)); 
        }

        // --- Map DB results back to StandardizedEvent[] --- 
        // Adjust mapping based on whether connectorCategory/rawDeviceType are present
        const finalEvents: StandardizedEvent[] = dbResults.map(row => {
             const payload = typeof row.standardizedPayload === 'string' 
                             ? JSON.parse(row.standardizedPayload) 
                             : row.standardizedPayload;
            const originalEvent = typeof row.rawPayload === 'string' 
                                  ? JSON.parse(row.rawPayload) 
                                  : row.rawPayload;
            // rawDeviceType won't be present without the devices join
            // We might need a fallback or adjust selectFields if deviceInfo is crucial here
            const deviceInfo = ('connectorCategory' in row)
                                ? getDeviceTypeInfo(row.connectorCategory as string, undefined /* No rawDeviceType available here */)
                                : undefined; 
            
             return {
                eventId: row.eventUuid,
                connectorId: row.connectorId,
                deviceId: row.deviceId,
                timestamp: new Date(row.timestamp),
                category: row.standardizedEventCategory as EventCategory,
                type: row.standardizedEventType as EventType,
                subtype: row.standardizedEventSubtype as EventSubtype | undefined,
                payload: payload,
                originalEvent: originalEvent,
                deviceInfo: deviceInfo,
            };
        });

        return finalEvents;

    } catch (err) {
        console.error(`[findEventsInWindow] Error during query execution. Filter:`, JSON.stringify(filter));
        console.error(`[findEventsInWindow] Caught error object:`, err);
        return []; // Return empty array on error
    }
}

/**
 * Stores a StandardizedEvent in the database.
 * Replaces the old storeEvent function.
 */
export async function storeStandardizedEvent(stdEvent: StandardizedEvent) {
  try {
    // Use the rawEventType provided by the parser (if any)
    const rawEventType = (stdEvent as any).rawEventType ?? null;

    await db.insert(events).values({
      eventUuid: stdEvent.eventId,
      timestamp: stdEvent.timestamp,
      connectorId: stdEvent.connectorId,
      deviceId: stdEvent.deviceId,
      standardizedEventCategory: stdEvent.category,
      standardizedEventType: stdEvent.type,
      standardizedEventSubtype: stdEvent.subtype,
      standardizedPayload: JSON.stringify(stdEvent.payload), // Store the structured payload as JSON
      rawEventType: rawEventType,
      rawPayload: JSON.stringify(stdEvent.originalEvent ?? {}), // Store the original raw payload as JSON
    });


  } catch (err) {
    console.error('Failed to store standardized event:', err, { eventUuid: stdEvent.eventId });
    throw err; // Re-throw error so callers can be aware
  }
}

/**
 * Gets recent events from the database, enriched with device, connector, and space info.
 * Now supports filtering by event categories and connector category.
 */
export async function getRecentEvents(limit = 100, offset = 0, filters?: RecentEventsFilters) {
  try {
    // Fetch limit + 1 to check if there are more records for the next page
    const actualLimitToFetch = limit + 1; 

    // --- ADDED: Build dynamic WHERE conditions based on filters ---
    const conditions: SQL[] = [];

    if (filters?.eventCategories && filters.eventCategories.length > 0) {
      conditions.push(inArray(events.standardizedEventCategory, filters.eventCategories as EventCategory[]));
    }

    if (filters?.connectorCategory && filters.connectorCategory.toLowerCase() !== 'all' && filters.connectorCategory !== '') {
      // Assuming 'all' or empty string means no filter for connector category
      conditions.push(eq(connectors.category, filters.connectorCategory));
    }

    if (filters?.locationId && filters.locationId.toLowerCase() !== 'all' && filters.locationId !== '') {
      // Filter by location - events must be from devices in spaces that belong to the specified location
      conditions.push(eq(locations.id, filters.locationId));
    }
    // --- END ADDED ---

    const recentEnrichedEvents = await db
      .select({
        // Event fields
        id: events.id,
        eventUuid: events.eventUuid,
        deviceId: events.deviceId, // Keep selecting the original event deviceId
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
        // Joined Space fields (nullable due to LEFT JOINs)
        spaceId: spaceDevices.spaceId,
        spaceName: spaces.name,
        // Joined Location fields (nullable due to LEFT JOINs)
        locationId: locations.id,
        locationName: locations.name
      })
      .from(events)
      // Join device info (needed to bridge to spaceDevices)
      .innerJoin(devices, eq(devices.deviceId, events.deviceId)) // Match on externalId
      .leftJoin(connectors, eq(connectors.id, devices.connectorId))

      // Join space info via spaceDevices
      .leftJoin(spaceDevices, eq(spaceDevices.deviceId, devices.id)) // Use devices.id (internal UUID)
      .leftJoin(spaces, eq(spaces.id, spaceDevices.spaceId))
      .leftJoin(locations, eq(locations.id, spaces.locationId))
      // --- MODIFIED: Apply dynamic conditions ---
      .where(conditions.length > 0 ? and(...conditions) : undefined) // Pass undefined if no conditions to avoid empty AND()
      .orderBy(desc(events.timestamp))
      .limit(actualLimitToFetch) // <-- Use limit + 1
      .offset(offset);

    return recentEnrichedEvents; // <-- Return potentially limit + 1 records
    
  } catch (err) {
    console.error('Failed to get recent events:', err);
    return [];
  }
}

/**
* Get the total number of events
* (This function should still work correctly)
*/
export async function getEventCount(): Promise<number> {
  try {
    const countResult = await db.select({ value: count() }).from(events);
    return countResult[0]?.value || 0;
  } catch (err) {
    console.error('Failed to count events:', err);
    return 0;
  }
}

/**
* Truncate the events table
* (This function should still work correctly)
*/
export async function truncateEvents() {
  try {
    await db.delete(events);
    console.log('Events table truncated successfully');
    return true;
  } catch (err) {
    console.error('Failed to truncate events table:', err);
    return false;
  }
}