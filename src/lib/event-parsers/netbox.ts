import { StandardizedEvent } from '@/types/events';
import { NetBoxEventWebhookPayload } from '@/types/netbox';
import { EventCategory, EventType, EventSubtype } from '@/lib/mappings/definitions';
import { getDeviceTypeInfo } from '@/lib/mappings/identification';
import crypto from 'crypto'; // Use Node.js crypto for UUID

/**
 * Parses a raw NetBox "Event" type webhook payload into a StandardizedEvent.
 * 
 * @param payload The raw NetBox event payload.
 * @param connectorId The ID of the connector that received this event.
 * @returns A StandardizedEvent object or null if the event cannot be parsed or is irrelevant.
 */
export function parseNetboxEvent(
  payload: NetBoxEventWebhookPayload,
  connectorId: string
): StandardizedEvent | null {
  // Destructure all potential fields, including optional ones
  const {
    Descname,
    Timestamp, // Primary timestamp
    Cdt,       // Seems redundant, but capture if needed
    Activityid,
    Nodeunique,
    Nodename,
    Personid,
    Personname,
    Partname,
    Portalkey,
    Portalname,
    Rdrname,
    Readerkey,
    Reader2key,
    Acname,
    Acnum,
    Nodeaddress,
    Ndt,       // Also seems redundant
    RawXmlBase64 
  } = payload;

  let category: EventCategory;
  let type: EventType;
  let subtype: EventSubtype | undefined;

  // Map Descname to standardized category, type, and subtype
  switch (Descname) {
    case 'Access Denied Because Radio Busy':
      category = EventCategory.ACCESS_CONTROL;
      type = EventType.ACCESS_DENIED;
      subtype = EventSubtype.NORMAL; // Use NORMAL when no specific subtype applies
      break;
    case 'Access Granted':
      category = EventCategory.ACCESS_CONTROL;
      type = EventType.ACCESS_GRANTED;
      subtype = EventSubtype.NORMAL;
      break;
    case 'Invalid Access':
      category = EventCategory.ACCESS_CONTROL;
      type = EventType.ACCESS_DENIED;
      subtype = EventSubtype.INVALID_CREDENTIAL;
      break;
    case 'Interior Push Button':
      category = EventCategory.ACCESS_CONTROL;
      type = EventType.EXIT_REQUEST;
      subtype = EventSubtype.PRESSED;
      break;
    case 'Unlock': // Treat both Unlock and Momentary Unlock as Remote Override
    case 'Momentary Unlock':
      category = EventCategory.ACCESS_CONTROL;
      type = EventType.ACCESS_GRANTED;
      subtype = EventSubtype.REMOTE_OVERRIDE;
      break;
    case 'Elevator Access Denied':
      category = EventCategory.ACCESS_CONTROL;
      type = EventType.ACCESS_DENIED;
      subtype = EventSubtype.NORMAL; // No specific subtype given
      break;
    case 'Elevator Access Granted':
      category = EventCategory.ACCESS_CONTROL;
      type = EventType.ACCESS_GRANTED;
      subtype = EventSubtype.NORMAL;
      break;
    default:
      // Log unmapped events but don't stop processing
      console.warn(`[Netbox Parser] Unmapped Descname: '${Descname}'`);
      category = EventCategory.UNKNOWN;
      type = EventType.UNKNOWN_EXTERNAL_EVENT;
      subtype = undefined;
      // Optionally, you could choose to return null here if unmapped events aren't useful
      // return null; 
  }

  // Determine the deviceId, preferring Nodeunique
  const deviceId = Nodeunique ?? Nodename;
  if (!deviceId) {
    console.warn('[Netbox Parser] No Nodeunique or Nodename found in payload. Cannot determine deviceId.', payload);
    return null; // Cannot proceed without a device identifier
  }

  // Parse the timestamp
  let eventTimestamp: Date;
  try {
    // NetBox timestamp seems to be ISO 8601 format already
    eventTimestamp = new Date(Timestamp);
    if (isNaN(eventTimestamp.getTime())) {
      throw new Error('Invalid date format');
    }
  } catch (error) {
    console.error('[Netbox Parser] Failed to parse timestamp:', Timestamp, error);
    eventTimestamp = new Date(); // Fallback to current time
  }

  // Get device info (assuming all these events are from readers mapped as doors)
  // const deviceInfo = getDeviceTypeInfo('netbox', 'NetBoxReader'); // REMOVED - Cannot determine from event payload alone

  // Construct the standardized event payload
  const standardizedPayload: Record<string, any> = {
    descname: Descname, // Include the original description name
    activityId: Activityid,
    ...(Personid && { personId: Personid }),
    ...(Personname && { personName: Personname }),
    ...(Partname && { partitionName: Partname }),
    ...(Portalkey && { portalKey: Portalkey }),
    ...(Portalname && { portalName: Portalname }),
    ...(Rdrname && { readerName: Rdrname }),
    ...(Readerkey && { readerKey: Readerkey }),
    ...(Reader2key && { reader2Key: Reader2key }),
    ...(Acname && { accessRuleName: Acname }),
    ...(Acnum && { accessRuleNum: Acnum }),
    ...(Nodename && { nodeName: Nodename }),
    ...(Nodeunique && { nodeUniqueId: Nodeunique }),
    ...(Nodeaddress && { nodeAddress: Nodeaddress }),
    // Include other timestamps if potentially different/useful
    ...(Cdt && Timestamp !== Cdt && { creationTimestamp: Cdt }),
    ...(Ndt && Timestamp !== Ndt && { nodeTimestamp: Ndt }),
    // rawXmlBase64: RawXmlBase64, // Optional: uncomment if needed for debugging/processing
  };

  // Construct the full StandardizedEvent
  const standardizedEvent: StandardizedEvent = {
    eventId: crypto.randomUUID(),
    connectorId,
    deviceId,
    timestamp: eventTimestamp,
    category,
    type,
    ...(subtype && { subtype }), // Conditionally add subtype
    // deviceInfo, // REMOVED - Will be added later if needed
    payload: standardizedPayload,
    originalEvent: payload, // Store the raw payload
  };

  console.log(`[Netbox Parser] Created StandardizedEvent: ${standardizedEvent.eventId} for Descname: '${Descname}'`);
  return standardizedEvent;
} 