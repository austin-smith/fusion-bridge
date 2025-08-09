import { EventType, EventSubtype } from '../definitions';
import { createEventClassification, EventClassification } from '../event-hierarchy';

/**
 * Piko inputPortId to standardized event classification mapping
 * First stage mapping - specific input port patterns
 * Each entry is a function that determines classification based on event data
 */
export const PIKO_INPUT_PORT_MAP = {
  'cvedia.rt.loitering': () => createEventClassification(EventType.LOITERING),
  'cvedia.rt.armed_person': () => createEventClassification(EventType.ARMED_PERSON),
  'cvedia.rt.tailgating': () => createEventClassification(EventType.TAILGATING),
  'cvedia.rt.intrusion': (inputPortId?: string, caption?: string) => {
    const intrusionSubtype = getObjectSubtypeFromText(caption);
    return intrusionSubtype 
      ? createEventClassification(EventType.INTRUSION, intrusionSubtype)
      : createEventClassification(EventType.INTRUSION);
  },
  'cvedia.rt.crossing': () => createEventClassification(EventType.LINE_CROSSING),
  'objectremovedetector': () => createEventClassification(EventType.OBJECT_REMOVED),
  'cvedia.rt.object_removed': () => createEventClassification(EventType.OBJECT_REMOVED),
  'udp.videoa.anpr': () => createEventClassification(EventType.LICENSE_PLATE_DETECTED),
  'csg.analytics.object.person': () =>
    createEventClassification(EventType.OBJECT_DETECTED, EventSubtype.PERSON),
  'csg.analytics.event.person': () =>
    createEventClassification(EventType.OBJECT_DETECTED, EventSubtype.PERSON),
} as const;

/**
 * Piko eventType to classification function mapping
 * Each entry is a function that determines classification based on event data
 */
export const PIKO_EVENT_TYPE_MAP = {
  'analyticsSdkObjectDetected': (inputPortId?: string) => {
    const objectSubtype = getObjectSubtypeFromText(inputPortId);
    return objectSubtype 
      ? createEventClassification(EventType.OBJECT_DETECTED, objectSubtype)
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
 * Extract object subtype from text content
 * Supports person, vehicle, and can be extended for other object types
 */
export function getObjectSubtypeFromText(text?: string): EventSubtype | undefined {
  if (!text) return undefined;
  
  const lowerText = text.toLowerCase();
  if (lowerText.includes('person')) return EventSubtype.PERSON;
  if (lowerText.includes('vehicle')) return EventSubtype.VEHICLE;
  
  return undefined;
}

/**
 * Get object subtype from inputPortId for object detection events
 */
export function getObjectSubtype(inputPortId?: string): EventSubtype | undefined {
  return getObjectSubtypeFromText(inputPortId);
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
  pikoEventType?: string,
  caption?: string
): EventClassification<any> {
  const lowerInputPortId = inputPortId?.toLowerCase();
  
  // First check inputPortId (most specific)
  if (lowerInputPortId && PIKO_INPUT_PORT_MAP[lowerInputPortId as keyof typeof PIKO_INPUT_PORT_MAP]) {
    const mapper = PIKO_INPUT_PORT_MAP[lowerInputPortId as keyof typeof PIKO_INPUT_PORT_MAP];
    return mapper(inputPortId, caption);
  }
  
  // Fall back to eventType mapping
  if (pikoEventType && PIKO_EVENT_TYPE_MAP[pikoEventType as keyof typeof PIKO_EVENT_TYPE_MAP]) {
    const mapper = PIKO_EVENT_TYPE_MAP[pikoEventType as keyof typeof PIKO_EVENT_TYPE_MAP];
    return mapper(inputPortId);
  }
  
  // Final fallback
  return PIKO_UNKNOWN_EVENT;
}