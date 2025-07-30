import { StandardizedEvent } from '@/types/events';
import { NetBoxEventWebhookPayload } from '@/types/netbox';
import { EventCategory, EventType, EventSubtype } from '@/lib/mappings/definitions';
import { getDeviceTypeInfo } from '@/lib/mappings/identification';
import { NETBOX_EVENT_MAP, NETBOX_UNKNOWN_EVENT } from '@/lib/mappings/event-maps/netbox';
import crypto from 'crypto'; // Use Node.js crypto for UUID
import { processAndPersistEvent } from '@/lib/events/eventProcessor'; // Import the central processor

/**
 * Parses a raw NetBox "Event" type webhook payload into a StandardizedEvent.
 * 
 * @param payload The raw NetBox event payload.
 * @param connectorId The ID of the connector that received this event.
 * @returns A Promise resolving to void, as the event is processed centrally, or null if parsing fails early.
 */
export async function parseNetboxEvent(
  payload: NetBoxEventWebhookPayload,
  connectorId: string
): Promise<StandardizedEvent[]> {
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

  // Map Descname to standardized event classification
  const eventClassification = NETBOX_EVENT_MAP[Descname as keyof typeof NETBOX_EVENT_MAP];
  
  let category: EventCategory;
  let type: EventType;
  let subtype: EventSubtype | undefined;

  if (eventClassification) {
    category = eventClassification.category;
    type = eventClassification.type;
    subtype = eventClassification.subtype;
    console.log(`[Netbox Parser] Mapped Descname '${Descname}' to ${type}${subtype ? ` / ${subtype}` : ''}`);
  } else {
    // Handle unmapped events
    console.warn(`[Netbox Parser] Unmapped Descname: '${Descname}'`);
    category = NETBOX_UNKNOWN_EVENT.category;
    type = NETBOX_UNKNOWN_EVENT.type;
    subtype = NETBOX_UNKNOWN_EVENT.subtype;
  }

  // Determine the deviceId, preferring Nodeunique
  const deviceIdToUse = Nodeunique ?? Nodename;
  if (!deviceIdToUse) {
    console.warn('[Netbox Parser] No Nodeunique or Nodename found in payload. Cannot determine deviceId.', payload);
    return []; // Cannot proceed without a device identifier
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
    deviceId: deviceIdToUse,
    timestamp: eventTimestamp,
    category,
    type,
    ...(subtype && { subtype }), // Conditionally add subtype
    // deviceInfo: undefined, // Explicitly undefined as it's not determined here
    payload: standardizedPayload,
    originalEvent: payload, // Store the raw payload
  };

  console.log(`[Netbox Parser] Created StandardizedEvent: ${standardizedEvent.eventId} for Descname: '${Descname}'`);
  
  return [standardizedEvent];
} 