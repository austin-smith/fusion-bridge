import { EventType, EventSubtype } from '../definitions';
import { createEventClassification, EventClassification } from '../event-hierarchy';

/**
 * Piko inputPortId to standardized event classification mapping
 * First stage mapping - specific input port patterns
 */
export const PIKO_INPUT_PORT_MAP = {
  'cvedia.rt.loitering': createEventClassification(EventType.LOITERING),
  'cvedia.rt.armed_person': createEventClassification(EventType.ARMED_PERSON),
  'cvedia.rt.tailgating': createEventClassification(EventType.TAILGATING),
  'cvedia.rt.intrusion': createEventClassification(EventType.INTRUSION),
  'cvedia.rt.crossing': createEventClassification(EventType.LINE_CROSSING),
  'objectremovedetector': createEventClassification(EventType.OBJECT_REMOVED),
  'cvedia.rt.object_removed': createEventClassification(EventType.OBJECT_REMOVED),
} as const;

/**
 * Piko eventType to classification function mapping
 * Each entry can be a direct classification or a function that determines classification
 */
export const PIKO_EVENT_TYPE_MAP = {
  'analyticsSdkObjectDetected': (inputPortId?: string) => {
    const objectSubtype = getObjectSubtype(inputPortId);
    return objectSubtype === EventSubtype.PERSON 
      ? createEventClassification(EventType.OBJECT_DETECTED, EventSubtype.PERSON)
      : objectSubtype === EventSubtype.VEHICLE
      ? createEventClassification(EventType.OBJECT_DETECTED, EventSubtype.VEHICLE)
      : createEventClassification(EventType.OBJECT_DETECTED);
  },
  'analyticsSdkEvent': () => createEventClassification(EventType.ANALYTICS_EVENT),
  'cameraMotionEvent': () => createEventClassification(EventType.MOTION_DETECTED),
} as const;

/**
 * Allowed Piko event types - events not in this list are discarded
 */
export const ALLOWED_PIKO_EVENT_TYPES = [
  'analyticsSdkObjectDetected',
  'analyticsSdkEvent', 
  'cameraMotionEvent'
] as const;

/**
 * Get object subtype from inputPortId for object detection events
 */
export function getObjectSubtype(inputPortId?: string): EventSubtype | undefined {
  if (!inputPortId) return undefined;
  
  const lowerPortId = inputPortId.toLowerCase();
  if (lowerPortId.includes('person')) return EventSubtype.PERSON;
  if (lowerPortId.includes('vehicle')) return EventSubtype.VEHICLE;
  
  return undefined;
}

/**
 * Fallback classification for unmapped Piko events
 */
export const PIKO_UNKNOWN_EVENT = createEventClassification(
  EventType.ANALYTICS_EVENT
);

/**
 * Centralized Piko event classification logic
 * All mapping decisions happen here, parser just calls this function
 */
export function classifyPikoEvent(
  inputPortId?: string,
  pikoEventType?: string
): EventClassification<any> {
  const lowerInputPortId = inputPortId?.toLowerCase();
  
  // First check inputPortId (most specific)
  if (lowerInputPortId && PIKO_INPUT_PORT_MAP[lowerInputPortId as keyof typeof PIKO_INPUT_PORT_MAP]) {
    return PIKO_INPUT_PORT_MAP[lowerInputPortId as keyof typeof PIKO_INPUT_PORT_MAP];
  }
  
  // Fall back to eventType mapping
  if (pikoEventType && PIKO_EVENT_TYPE_MAP[pikoEventType as keyof typeof PIKO_EVENT_TYPE_MAP]) {
    const mapper = PIKO_EVENT_TYPE_MAP[pikoEventType as keyof typeof PIKO_EVENT_TYPE_MAP];
    return mapper(inputPortId);
  }
  
  // Final fallback
  return PIKO_UNKNOWN_EVENT;
}