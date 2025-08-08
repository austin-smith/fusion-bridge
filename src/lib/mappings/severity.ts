import type { EnrichedEvent } from '@/types/events';
import type { EventGroup } from '@/types/events';
import { 
    EventType, 
    EventSubtype, // Consider subtypes for more granular rules later
    DisplayState,
    // Import specific states/events for rule definitions
    OPEN, UNLOCKED, LEAK_DETECTED, MOTION_DETECTED, VIBRATION_DETECTED, ON, 
    OFF, CLOSED, LOCKED, DRY, NO_MOTION, NO_VIBRATION, ERROR
} from './definitions';

// Define Severity Levels (Simplified)
export enum SeverityLevel {
    CRITICAL = 2, // High
    WARNING = 1,  // Medium
    DEFAULT = 0,  // Low / Normal
}

// Helper function to determine severity based on DisplayState
const getSeverityFromState = (state: DisplayState | undefined): SeverityLevel => {
    if (!state) return SeverityLevel.DEFAULT;
    switch (state) {
        case LEAK_DETECTED:
        case MOTION_DETECTED:
        case VIBRATION_DETECTED:
        case ERROR:
            return SeverityLevel.WARNING;
        case ON:
        case OFF:
        case OPEN:
        case CLOSED:
        case LOCKED:
        case UNLOCKED:
        case DRY:
        case NO_MOTION:
        case NO_VIBRATION:
            return SeverityLevel.DEFAULT;
        default:
            return SeverityLevel.DEFAULT;
    }
};

// Helper function to determine severity based on EventType
const getSeverityFromEventType = (eventType: EventType | string): SeverityLevel => {
    switch (eventType) {
        case EventType.ACCESS_DENIED:
        case EventType.DOOR_FORCED_OPEN:
        case EventType.INTRUSION:
        case EventType.ARMED_PERSON:
            return SeverityLevel.CRITICAL;
        case EventType.DOOR_HELD_OPEN:
        case EventType.LOITERING:
        case EventType.TAILGATING:
            return SeverityLevel.WARNING;
        case EventType.ACCESS_GRANTED: // Previously INFO, now DEFAULT
        case EventType.OBJECT_DETECTED: // Previously INFO, now DEFAULT
        default:
            return SeverityLevel.DEFAULT;
    }
};

/**
 * Determines the severity level of a single enriched event.
 * Prioritizes event type severity over state severity if both apply.
 */
export const getEventSeverity = (event: EnrichedEvent): SeverityLevel => {
    const eventTypeSeverity = getSeverityFromEventType(event.eventType);
    
    // If the event type itself has CRITICAL or WARNING severity, use that.
    if (eventTypeSeverity > SeverityLevel.DEFAULT) { // Simplified check
        return eventTypeSeverity;
    }

    // If it's a state change, use the state's severity (could be WARNING or DEFAULT).
    if (event.eventType === EventType.STATE_CHANGED && event.displayState) {
        return getSeverityFromState(event.displayState);
    }

    // Otherwise, fall back to the event type's severity (which is now only DEFAULT)
    return eventTypeSeverity;
};

/**
 * Determines the highest severity level found within a group of events.
 */
export const getGroupSeverity = (group: EventGroup): SeverityLevel => {
    let highestSeverity = SeverityLevel.DEFAULT;
    for (const event of group.events) {
        const eventSeverity = getEventSeverity(event);
        if (eventSeverity > highestSeverity) {
            highestSeverity = eventSeverity;
        }
    }
    return highestSeverity;
}; 