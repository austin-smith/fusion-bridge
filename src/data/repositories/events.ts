import { db } from '@/data/db';
import { events, devices, nodes } from '@/data/db/schema';
import { desc, asc, count, eq, sql, and } from 'drizzle-orm';
import type { StandardizedEvent } from '@/types/events'; // Import the StandardizedEvent type

// Maximum number of events to keep
const MAX_EVENTS = 1000;

/**
 * Stores a StandardizedEvent in the database.
 * Replaces the old storeEvent function.
 */
export async function storeStandardizedEvent(stdEvent: StandardizedEvent<any>) {
  try {
    // Extract raw event type if possible (e.g., from YoLink's 'event' field)
    const rawEventType = typeof stdEvent.rawEventPayload === 'object' && stdEvent.rawEventPayload !== null && 'event' in stdEvent.rawEventPayload ? 
                         stdEvent.rawEventPayload.event as string : 
                         null; // Set to null if not found or payload is not an object

    await db.insert(events).values({
      eventUuid: stdEvent.eventId,
      timestamp: stdEvent.timestamp,
      connectorId: stdEvent.connectorId,
      deviceId: stdEvent.deviceId,
      standardizedEventCategory: stdEvent.eventCategory,
      standardizedEventType: stdEvent.eventType,
      standardizedPayload: JSON.stringify(stdEvent.payload), // Store the structured payload as JSON
      rawEventType: rawEventType,
      rawPayload: JSON.stringify(stdEvent.rawEventPayload ?? {}), // Store the original raw payload as JSON
    });

    // Clean up old events (keeping this logic)
    await cleanupOldEvents();
  } catch (err) {
    console.error('Failed to store standardized event:', err, { eventUuid: stdEvent.eventId });
    throw err; // Re-throw error so callers can be aware
  }
}

/**
 * Gets recent events from the database, enriched with device and node info.
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
        standardizedPayload: events.standardizedPayload,
        rawPayload: events.rawPayload,
        connectorId: events.connectorId,
        // Joined Device fields (nullable due to LEFT JOIN)
        deviceName: devices.name,
        rawDeviceType: devices.type, // The crucial raw identifier
        // Joined Node fields (nullable due to LEFT JOIN)
        connectorName: nodes.name,
        connectorCategory: nodes.category
      })
      .from(events)
      // Left Join with devices ON matching connectorId AND deviceId
      .leftJoin(devices, and(
          eq(devices.connectorId, events.connectorId),
          eq(devices.deviceId, events.deviceId) 
      ))
      // Left Join with nodes ON matching connectorId
      .leftJoin(nodes, eq(nodes.id, events.connectorId))
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