import { db } from '@/data/db';
import { events, devices, connectors } from '@/data/db/schema';
import { desc, asc, count, eq, sql, and, gte, lte, or, inArray, type SQL, isNull } from 'drizzle-orm';
import type { StandardizedEvent } from '@/types/events';
import { EventCategory } from '@/lib/mappings/definitions';

// Maximum number of events to keep
// TODO: Consider basing cleanup on time window instead of fixed count if rules need longer history
const MAX_EVENTS = 1000;

// Interface for the filter parameters of findEventsInWindow
export interface FindEventsFilter {
    deviceId?: string; // The external device ID from the event
    standardizedEventTypes?: string[]; 
    standardizedEventSubtypes?: string[];
    // Expects standardized types, e.g., "Sensor.Contact", "Sensor", "Door"
    standardizedDeviceTypes?: string[]; 
    startTime: Date;
    endTime: Date;
}

/**
 * Checks if any events matching the specified criteria exist within a given time window.
 * Filters using standardized device type/subtype columns from the devices table.
 *
 * @param filter The filter criteria including time window, event type, device types, etc.
 * @returns Promise<boolean> - True if at least one matching event exists, false otherwise.
 */
export async function findEventsInWindow(filter: FindEventsFilter): Promise<boolean> {
    try {
        const baseConditions: SQL[] = [
            gte(events.timestamp, filter.startTime),
            lte(events.timestamp, filter.endTime),
        ];
        if (filter.deviceId) baseConditions.push(eq(events.deviceId, filter.deviceId));
        if (filter.standardizedEventTypes && filter.standardizedEventTypes.length > 0) {
            baseConditions.push(inArray(events.standardizedEventType, filter.standardizedEventTypes));
        }
        if (filter.standardizedEventSubtypes && filter.standardizedEventSubtypes.length > 0) {
            baseConditions.push(inArray(events.standardizedEventSubtype, filter.standardizedEventSubtypes));
        }

        let result: { eventId: number }[] = [];

        const deviceTypesToFilter = filter.standardizedDeviceTypes?.filter(t => t); 
        const hasDeviceTypeFilter = deviceTypesToFilter && deviceTypesToFilter.length > 0;

        if (hasDeviceTypeFilter) {
            // Parse the filter strings into type and subtype pairs
            const typeFilters = deviceTypesToFilter.map(fullType => {
                const parts = fullType.split('.');
                return { type: parts[0], subtype: parts[1] || null };
            });

            // Extract unique types and non-null subtypes
            const types = [...new Set(typeFilters.map(f => f.type))];
            const subtypes = [...new Set(typeFilters.filter(f => f.subtype !== null).map(f => f.subtype as string))];
            const hasSubtypeFilter = subtypes.length > 0;
            const hasTypeOnlyFilter = typeFilters.some(f => f.subtype === null);

            // Build conditions based on standardized type/subtype from the devices table
            const deviceFilterConditions: SQL[] = [];
            if (types.length > 0) {
                deviceFilterConditions.push(inArray(devices.standardizedDeviceType, types));

                let subtypeCondition: SQL | undefined = undefined;
                if (hasSubtypeFilter && hasTypeOnlyFilter) {
                    subtypeCondition = or(
                        inArray(devices.standardizedDeviceSubtype, subtypes),
                        isNull(devices.standardizedDeviceSubtype) 
                    );
                } else if (hasSubtypeFilter) {
                    subtypeCondition = inArray(devices.standardizedDeviceSubtype, subtypes);
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
            result = await db
                .select({ eventId: events.id })
                .from(events)
                .innerJoin(devices, and( // Join needed to access device standardized types
                    eq(events.connectorId, devices.connectorId),
                    eq(events.deviceId, devices.deviceId)
                ))
                .where(and(...joinConditions))
                .limit(1);

        } else {
            // Query WITHOUT JOIN if no device type filter needed
            result = await db
                .select({ eventId: events.id })
                .from(events)
                .where(and(...baseConditions))
                .limit(1);
        }

        return result.length > 0;

    } catch (err) {
        console.error('Failed to find events in window:', err, { filter });
        return false;
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

    // Clean up old events (keeping this logic)
    await cleanupOldEvents();
  } catch (err) {
    console.error('Failed to store standardized event:', err, { eventUuid: stdEvent.eventId });
    throw err; // Re-throw error so callers can be aware
  }
}

/**
 * Gets recent events from the database, enriched with device and connector info.
 */
export async function getRecentEvents(limit = 100) {
  try {
    // Remove warning, as we are updating it now
    // console.warn('[getRecentEvents] Function needs review/update for new events schema columns.');
    
    // Select required fields from events and joined tables
    const recentEnrichedEvents = await db
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
        // Joined Device fields (nullable due to LEFT JOIN)
        deviceName: devices.name,
        rawDeviceType: devices.type, // The crucial raw identifier
        // Joined Connector fields (use connectors table)
        connectorName: connectors.name,
        connectorCategory: connectors.category,
        connectorConfig: connectors.cfg_enc
      })
      .from(events)
      // Left Join with devices ON matching connectorId AND deviceId
      .leftJoin(devices, and(
          eq(devices.connectorId, events.connectorId),
          eq(devices.deviceId, events.deviceId) 
      ))
      // Left Join with connectors (use connectors table)
      .leftJoin(connectors, eq(connectors.id, events.connectorId))
      .orderBy(desc(events.timestamp))
      .limit(limit);

    // Return the enriched rows directly
    // The structure should align better with what the API route needs.
    return recentEnrichedEvents;
    
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
* Clean up old events to prevent database growth
* (This function should still work correctly as it relies on timestamp/id)
*/
export async function cleanupOldEvents() {
  try {
    // Count total number of events
    const eventCount = await getEventCount();

    if (eventCount > MAX_EVENTS) {
      // Calculate how many events to delete
      const eventsToDeleteCount = eventCount - MAX_EVENTS;
      
      // Find the ID of the Nth oldest event (where N = eventsToDeleteCount)
      // Using offset directly is simpler if supported and performs okay
      const thresholdEvents = await db.select({ id: events.id })
        .from(events)
        .orderBy(asc(events.timestamp), asc(events.id)) // Secondary sort by ID for stability
        .limit(1)
        .offset(eventsToDeleteCount); // Offset by the number to delete

      if (thresholdEvents.length > 0) {
        const thresholdId = thresholdEvents[0].id;

        // Get the timestamp of the threshold event
        const thresholdEventDetails = await db.select({ timestamp: events.timestamp })
          .from(events)
          .where(eq(events.id, thresholdId))
          .limit(1);

        if (thresholdEventDetails.length > 0) {
          const thresholdTimestamp = thresholdEventDetails[0].timestamp;

          // Delete events that are older than the threshold timestamp,
          // OR have the same timestamp but an ID less than or equal to the threshold ID
          await db.delete(events)
            .where(sql`${events.timestamp} < ${thresholdTimestamp} OR (${events.timestamp} = ${thresholdTimestamp} AND ${events.id} <= ${thresholdId})`);

          console.log(`Cleaned up ${eventsToDeleteCount} old events (target count).`); 
        }
      }
    }
  } catch (err) {
    console.error('Failed to clean up old events:', err);
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