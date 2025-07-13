import { 
  EventType, 
  EventSubtype,
  MOTION_DETECTED,
  OPEN,
  LEAK_DETECTED,
  VIBRATION_DETECTED
} from '@/lib/mappings/definitions';

/**
 * Simple event types that always trigger alarms (no state checking needed)
 */
export const SIMPLE_ALARM_EVENT_TYPES: EventType[] = [
  EventType.DOOR_FORCED_OPEN,
  EventType.ARMED_PERSON,
  EventType.MOTION_DETECTED,
];

/**
 * Display states that trigger alarms for STATE_CHANGED events
 */
export const ALARM_DISPLAY_STATES = [
  MOTION_DETECTED,
  OPEN,
  VIBRATION_DETECTED,
];

/**
 * Check if event should trigger alarm for standard zones
 */
export function shouldTriggerAlarm(
  eventType: EventType,
  eventSubtype?: string | null,
  displayState?: string | null
): boolean {
  // Simple event types that always trigger
  if (SIMPLE_ALARM_EVENT_TYPES.includes(eventType)) {
    return true;
  }
  
  // STATE_CHANGED events - check the display state
  if (eventType === EventType.STATE_CHANGED && displayState) {
    return ALARM_DISPLAY_STATES.includes(displayState);
  }
  
  return false;
} 