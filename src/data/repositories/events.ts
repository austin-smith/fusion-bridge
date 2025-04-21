import { db } from '@/data/db';
import { events } from '@/data/db/schema';
import { desc, asc, count, eq, sql } from 'drizzle-orm';

// Maximum number of events to keep
const MAX_EVENTS = 1000;

/**
* Store an event in the database and trigger integrations
*/
export async function storeEvent(eventData: {
  deviceId: string;
  eventType: string;
  timestamp: Date;
  payload: string; // Complete event payload as JSON string
}) {
  try {
    // Store event
    const insertedEvent = await db.insert(events).values({
      deviceId: eventData.deviceId,
      eventType: eventData.eventType,
      timestamp: eventData.timestamp,
      payload: eventData.payload, // Store the raw payload string directly
    }).returning();

    // Clean up old events
    await cleanupOldEvents();
  } catch (err) {
    console.error('Failed to store event:', err);
    throw err;
  }
}


/**
* Get recent events from the database
*/
export async function getRecentEvents(limit = 100) {
  try {
    const recentEvents = await db.select().from(events).orderBy(desc(events.timestamp)).limit(limit);

    return recentEvents.map(event => {
      // Payload is now stored as JSONB, should already be an object/null
      let payload: Record<string, any> | null = null;
      if (typeof event.payload === 'string') {
        // If it's still a string (e.g., old data or error during storage), try parsing
        try { payload = JSON.parse(event.payload); } catch { /* ignore parse error */ }
      } else if (typeof event.payload === 'object' && event.payload !== null) {
        payload = event.payload as Record<string, any>;
      }
      
      // Fallback to an empty object if payload is null/invalid
      const safePayload = payload || {};

      return {
        event: event.eventType,
        time: event.timestamp.getTime(),
        msgid: `event-${event.id}`, 
        // Use safePayload, which is guaranteed to be an object
        data: safePayload.data || {}, 
        payload: safePayload, 
        deviceId: event.deviceId,
      };
    });
  } catch (err) {
    console.error('Failed to get recent events:', err);
    return [];
  }
}

/**
* Get the total number of events
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
*/
export async function cleanupOldEvents() {
  try {
    // Count total number of events
    const eventCount = await getEventCount();

    if (eventCount > MAX_EVENTS) {
      // Calculate how many events to delete
      const eventsToDeleteCount = eventCount - MAX_EVENTS;
      
      // Find the ID of the Nth oldest event (where N = eventsToDeleteCount + 1)
      // This approach is generally safer with potential duplicate timestamps
      const thresholdEvent = await db.select({ id: events.id })
        .from(events)
        .orderBy(asc(events.timestamp), asc(events.id)) // Secondary sort by ID for stability
        .limit(1)
        .offset(eventsToDeleteCount);

      if (thresholdEvent.length > 0) {
        const thresholdId = thresholdEvent[0].id;

        // Get the timestamp of the threshold event
        const thresholdEventDetails = await db.select({ timestamp: events.timestamp })
          .from(events)
          .where(eq(events.id, thresholdId))
          .limit(1);

        if (thresholdEventDetails.length > 0) {
          const thresholdTimestamp = thresholdEventDetails[0].timestamp;

          // Delete events that are older than the threshold timestamp,
          // OR have the same timestamp but a smaller or equal ID
          const deletedResult = await db.delete(events)
            .where(sql`${events.timestamp} < ${thresholdTimestamp} OR (${events.timestamp} = ${thresholdTimestamp} AND ${events.id} <= ${thresholdId})`);

          // Drizzle's .run() might be needed for row counts in some drivers, adapt if necessary
          // For now, assume the delete executed. Log based on the count we intended to delete.
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