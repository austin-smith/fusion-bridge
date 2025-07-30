import { EventType, EventSubtype } from '../definitions';
import { createEventClassification } from '../event-hierarchy';

/**
 * NetBox Descname to standardized event classification mapping
 * Replaces the switch statement in the NetBox parser for cleaner, maintainable code
 */
export const NETBOX_EVENT_MAP = {
  'Access Denied Because Radio Busy': createEventClassification(
    EventType.ACCESS_DENIED, 
    EventSubtype.NORMAL
  ),
  'Access Granted': createEventClassification(
    EventType.ACCESS_GRANTED, 
    EventSubtype.NORMAL
  ),
  'Invalid Access': createEventClassification(
    EventType.ACCESS_DENIED, 
    EventSubtype.INVALID_CREDENTIAL
  ),
  'Interior Push Button': createEventClassification(
    EventType.EXIT_REQUEST, 
    EventSubtype.PRESSED
  ),
  'Unlock': createEventClassification(
    EventType.ACCESS_GRANTED, 
    EventSubtype.REMOTE_OVERRIDE
  ),
  'Momentary Unlock': createEventClassification(
    EventType.ACCESS_GRANTED, 
    EventSubtype.REMOTE_OVERRIDE
  ),
  'Elevator Access Denied': createEventClassification(
    EventType.ACCESS_DENIED, 
    EventSubtype.NORMAL
  ),
  'Elevator Access Granted': createEventClassification(
    EventType.ACCESS_GRANTED, 
    EventSubtype.NORMAL
  ),
} as const;

/**
 * Fallback classification for unmapped NetBox events
 */
export const NETBOX_UNKNOWN_EVENT = createEventClassification(
  EventType.UNKNOWN_EXTERNAL_EVENT
);