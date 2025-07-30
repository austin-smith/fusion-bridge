import { EventType, EventSubtype } from '../definitions';
import { createEventClassification } from '../event-hierarchy';

/**
 * Genea event action to standardized event classification mapping
 * Based on Genea API documentation for access control events
 */
export const GENEA_EVENT_MAP = {
  // Access Denied Events with specific subtypes
  'SEQUR_ACCESS_DENIED_ACCESS_POINT_LOCKED': createEventClassification(
    EventType.ACCESS_DENIED,
    EventSubtype.DOOR_LOCKED
  ),
  'SEQUR_ACCESS_DENIED_AFTER_EXPIRATION_DATE': createEventClassification(
    EventType.ACCESS_DENIED,
    EventSubtype.EXPIRED_CREDENTIAL
  ),
  'SEQUR_ACCESS_DENIED_ANTI_PASSBACK_VIOLATION': createEventClassification(
    EventType.ACCESS_DENIED,
    EventSubtype.ANTIPASSBACK_VIOLATION
  ),
  'SEQUR_ACCESS_DENIED_DURESS_code_DETECTED': createEventClassification(
    EventType.ACCESS_DENIED,
    EventSubtype.DURESS_PIN
  ),
  'SEQUR_ACCESS_DENIED_INVALID_PIN': createEventClassification(
    EventType.ACCESS_DENIED,
    EventSubtype.INVALID_CREDENTIAL
  ),
  'SEQUR_ACCESS_DENIED_INVALID_TIME': createEventClassification(
    EventType.ACCESS_DENIED,
    EventSubtype.NOT_IN_SCHEDULE
  ),
  'SEQUR_ACCESS_DENIED_OCCUPANCY_LIMIT_REACHED': createEventClassification(
    EventType.ACCESS_DENIED,
    EventSubtype.OCCUPANCY_LIMIT
  ),
  
  // Access Denied Events without specific subtypes
  'SEQUR_ACCESS_DENIED_AIRLOCK': createEventClassification(
    EventType.ACCESS_DENIED
  ),
  'SEQUR_ACCESS_DENIED_AREA_NOT_ENABLED': createEventClassification(
    EventType.ACCESS_DENIED
  ),
  'SEQUR_ACCESS_DENIED_BEFORE_ACTIVATION_DATE': createEventClassification(
    EventType.ACCESS_DENIED
  ),
  'SEQUR_ACCESS_DENIED_CARD_NOT_FOUND': createEventClassification(
    EventType.ACCESS_DENIED
  ),
  'SEQUR_ACCESS_DENIED_COUNT_EXCEEDED': createEventClassification(
    EventType.ACCESS_DENIED
  ),
  'SEQUR_ACCESS_DENIED_DEACTIVATED_CARD': createEventClassification(
    EventType.ACCESS_DENIED
  ),
  'SEQUR_ACCESS_DENIED_ELEVATOR_FLOOR': createEventClassification(
    EventType.ACCESS_DENIED
  ),
  'SEQUR_ACCESS_DENIED_ELEVATOR_FLOOR_UNAUTHORIZED': createEventClassification(
    EventType.ACCESS_DENIED
  ),
  'SEQUR_ACCESS_DENIED_ELEVATOR_TIMEOUT': createEventClassification(
    EventType.ACCESS_DENIED
  ),
  'SEQUR_ACCESS_DENIED_ELEVATOR_UNKNOWN_ERROR': createEventClassification(
    EventType.ACCESS_DENIED
  ),
  'SEQUR_ACCESS_DENIED_HOST_APPROVAL_DENIED': createEventClassification(
    EventType.ACCESS_DENIED
  ),
  'SEQUR_ACCESS_DENIED_HOST_APPROVAL_TIMEOUT': createEventClassification(
    EventType.ACCESS_DENIED
  ),
  'SEQUR_ACCESS_DENIED_INCOMPLETE_CARD_PIN_SEQ': createEventClassification(
    EventType.ACCESS_DENIED
  ),
  'SEQUR_ACCESS_DENIED_INVALID_FACILITY_code': createEventClassification(
    EventType.ACCESS_DENIED
  ),
  'SEQUR_ACCESS_DENIED_INVALID_FORMAT': createEventClassification(
    EventType.ACCESS_DENIED
  ),
  'SEQUR_ACCESS_DENIED_INVALID_ISSUE_code': createEventClassification(
    EventType.ACCESS_DENIED
  ),
  'SEQUR_ACCESS_DENIED_NO_DOOR_ACCESS': createEventClassification(
    EventType.ACCESS_DENIED
  ),
  'SEQUR_ACCESS_DENIED_NO_ESCORT_CARD': createEventClassification(
    EventType.ACCESS_DENIED
  ),
  'SEQUR_ACCESS_DENIED_NO_SECOND_CARD': createEventClassification(
    EventType.ACCESS_DENIED
  ),
  'SEQUR_ACCESS_DENIED_UNAUTHORIZED_ASSETS': createEventClassification(
    EventType.ACCESS_DENIED
  ),
  'SEQUR_ACCESS_DENIED_USE_LIMIT': createEventClassification(
    EventType.ACCESS_DENIED
  ),
  
  // Access Granted Events
  'SEQUR_ACCESS_GRANTED': createEventClassification(
    EventType.ACCESS_GRANTED,
    EventSubtype.NORMAL
  ),
  'SEQUR_ACCESS_GRANTED_ACCESS_POINT_UNLOCKED': createEventClassification(
    EventType.ACCESS_GRANTED,
    EventSubtype.NORMAL
  ),
} as const;

/**
 * Fallback classification for unmapped Genea events
 */
export const GENEA_UNKNOWN_EVENT = createEventClassification(
  EventType.UNKNOWN_EXTERNAL_EVENT
);