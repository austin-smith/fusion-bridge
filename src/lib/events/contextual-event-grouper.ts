import type { EnrichedEvent, EventGroup } from '@/types/events';
import { DEFAULT_MAX_TIME_WITHIN_GROUP_MS, SAME_DEVICE_MAX_TIME_MS } from '@/lib/mappings/definitions';

/**
 * Clusters events based on temporal and spatial proximity.
 * Groups events that occur close in time and in the same space, 
 * with a tighter window for events on the exact same device.
 *
 * @param events - An array of EnrichedEvent objects, ideally pre-sorted newest to oldest.
 * @returns An array of EventGroup objects.
 */
export function clusterEventsByProximity(events: EnrichedEvent[]): EventGroup[] {
  if (!events || events.length === 0) {
    return [];
  }

  const finalGroups: EventGroup[] = [];
  const processedEventUuids = new Set<string>();

  // Ensure events are sorted, newest to oldest, for consistent processing logic.
  // If events are already sorted this way, this step can be skipped or adapted.
  const sortedEvents = [...events].sort((a, b) => b.timestamp - a.timestamp);

  for (const event of sortedEvents) {
    if (processedEventUuids.has(event.eventUuid)) {
      continue;
    }

    const currentGroupEvents: EnrichedEvent[] = [event];
    processedEventUuids.add(event.eventUuid);
    // Establish the group's required space context immediately
    const groupRequiredSpaceId: string | undefined | null = event.spaceId; // Can be undefined/null
    let latestEventInGroupTimestamp = event.timestamp;
    let earliestEventInGroupTimestamp = event.timestamp;

    let newEventsAddedInPass = true;
    while (newEventsAddedInPass) {
      newEventsAddedInPass = false;
      for (const candidateEvent of sortedEvents) {
        if (processedEventUuids.has(candidateEvent.eventUuid)) {
          continue;
        }

        const timeDiffToLatestInGroup = Math.abs(candidateEvent.timestamp - latestEventInGroupTimestamp);
        let timeWindowMs = DEFAULT_MAX_TIME_WITHIN_GROUP_MS;
        let satisfiesSpaceRule = false;
        let satisfiesTimeRule = false;

        // --- Determine if the spaces match based on the group's requirement --- 
        if (groupRequiredSpaceId === undefined || groupRequiredSpaceId === null) {
          // Group requires events to be space-less
          satisfiesSpaceRule = (candidateEvent.spaceId === undefined || candidateEvent.spaceId === null);
        } else {
          // Group requires events to match a specific space
          satisfiesSpaceRule = (candidateEvent.spaceId === groupRequiredSpaceId);
        }

        // If spaces don't match, cannot add, skip further checks
        if (!satisfiesSpaceRule) {
          continue;
        }

        // --- Check Time Window (potentially tighter for same device) --- 
        const isSameDeviceAsOneInGroup = currentGroupEvents.some(e => e.deviceId === candidateEvent.deviceId);
        if (isSameDeviceAsOneInGroup) {
          // Use tighter window if it's the same device (but space rule must still be satisfied)
          timeWindowMs = SAME_DEVICE_MAX_TIME_MS;
        }
        
        satisfiesTimeRule = (timeDiffToLatestInGroup <= timeWindowMs);

        // --- Add event only if BOTH Space and Time rules are satisfied --- 
        if (satisfiesTimeRule) { // Space rule was already checked and passed
          currentGroupEvents.push(candidateEvent);
          processedEventUuids.add(candidateEvent.eventUuid);
          newEventsAddedInPass = true;
          // Update time boundaries
          if (candidateEvent.timestamp > latestEventInGroupTimestamp) {
            latestEventInGroupTimestamp = candidateEvent.timestamp;
          }
          if (candidateEvent.timestamp < earliestEventInGroupTimestamp) {
            earliestEventInGroupTimestamp = candidateEvent.timestamp;
          }
          // No need to update group space, as it's fixed from the start event
        }
      }
    }

    // Finalize the current group (space logic simplified)
    if (currentGroupEvents.length > 0) {
      currentGroupEvents.sort((a, b) => a.timestamp - b.timestamp);
      
      // The group's space ID/Name is determined solely by the initial event
      const groupSpaceId = groupRequiredSpaceId; 
      const groupSpaceName = event.spaceName; // Use the first event's spaceName if available

      finalGroups.push({
        groupKey: `group-${currentGroupEvents[0].eventUuid}`,
        startTime: new Date(earliestEventInGroupTimestamp),
        endTime: new Date(latestEventInGroupTimestamp),
        events: currentGroupEvents,
        spaceId: groupSpaceId ?? undefined,
        spaceName: groupSpaceName ?? (groupSpaceId ? `Space ${groupSpaceId.substring(0,6)}...` : 'Unassigned Space'),
      });
    }
  }

  // Sort final groups by end time (newest first)
  return finalGroups.sort((a, b) => b.endTime.getTime() - a.endTime.getTime());
} 