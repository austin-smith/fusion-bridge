import { StandardizedEvent } from '@/types/events';
import { GeneaEventWebhookPayload } from '@/types/genea';
import { EventCategory, EventType, EventSubtype } from '@/lib/mappings/definitions';
import { getDeviceTypeInfo } from '@/lib/mappings/identification';
import { GENEA_EVENT_MAP, GENEA_UNKNOWN_EVENT, GENEA_COMPLEX_EVENT_ACTIONS, handleComplexGeneaEvent } from '@/lib/mappings/event-maps/genea';
import crypto from 'crypto';



/**
 * Parses a Genea webhook event payload into a StandardizedEvent.
 * 
 * @param payload The Genea event webhook payload
 * @param connectorId The ID of the Genea connector that received this event
 * @returns A Promise resolving to an array of StandardizedEvent objects
 */
export async function parseGeneaEvent(
  payload: GeneaEventWebhookPayload,
  connectorId: string
): Promise<StandardizedEvent[]> {
  
  // Extract key fields from payload
  const {
    uuid: eventUuid,
    event_time,
    event_type,
    event_action,
    event_message,
    event_note,
    actor,
    location,
    door,
    controller,
    card,
    metadata,
    created_at
  } = payload;

  // Determine device ID - use door UUID as the primary device identifier
  const deviceId = door?.uuid;
  if (!deviceId) {
    console.warn(`[Genea Parser] Event ${eventUuid} missing door.uuid. Cannot determine deviceId.`, payload);
    return []; // Cannot proceed without a device identifier
  }

  // Parse the event timestamp - prefer event_time over created_at
  let eventTimestamp: Date;
  try {
    eventTimestamp = new Date(event_time);
    if (isNaN(eventTimestamp.getTime())) {
      throw new Error('Invalid event_time format');
    }
  } catch (error) {
    console.warn(`[Genea Parser] Failed to parse event_time: ${event_time}, trying created_at: ${created_at}`, error);
    try {
      eventTimestamp = new Date(created_at);
      if (isNaN(eventTimestamp.getTime())) {
        throw new Error('Invalid created_at format');
      }
    } catch (fallbackError) {
      console.error(`[Genea Parser] Failed to parse both timestamps for event ${eventUuid}:`, fallbackError);
      eventTimestamp = new Date(); // Fallback to current time
    }
  }

  // Map Genea event action to standardized event classification
  const eventClassification = GENEA_EVENT_MAP[event_action as keyof typeof GENEA_EVENT_MAP];
  let category: EventCategory;
  let type: EventType;
  let subtype: EventSubtype | undefined;

  if (eventClassification) {
    category = eventClassification.category;
    type = eventClassification.type;
    subtype = eventClassification.subtype;
    console.log(`[Genea Parser] Mapped event action '${event_action}' to ${type}${subtype ? ` / ${subtype}` : ''}`);
  } else if (GENEA_COMPLEX_EVENT_ACTIONS.includes(event_action as any)) {
    // Handle complex events that require payload analysis
    const complexClassification = handleComplexGeneaEvent(payload);
    category = complexClassification.category;
    type = complexClassification.type;
    subtype = complexClassification.subtype;
    console.log(`[Genea Parser] Complex event mapped to ${type} for event ${eventUuid}`);
  } else {
    // Handle unmapped events
    console.warn(`[Genea Parser] Unmapped event action: '${event_action}' for event ${eventUuid}`);
    category = GENEA_UNKNOWN_EVENT.category;
    type = GENEA_UNKNOWN_EVENT.type;
    subtype = GENEA_UNKNOWN_EVENT.subtype;
  }

  // Get device type info (all Genea devices are doors)
  const deviceInfo = getDeviceTypeInfo('genea', 'Door');

  // Construct the StandardizedEvent
  const standardizedEvent: StandardizedEvent = {
    eventId: crypto.randomUUID(),
    connectorId,
    deviceId,
    timestamp: eventTimestamp,
    category,
    type,
    ...(subtype && { subtype }),
    deviceInfo,
    payload: {
      eventType: event_type,
      eventAction: event_action,
      eventMessage: event_message,
      ...(payload.additional_info?.description && { description: payload.additional_info.description }),
      ...(door?.name && { doorName: door.name }),
      ...(location?.[0]?.name && { locationName: location[0].name }),
      ...(actor?.type && { actorType: actor.type }),
      ...(actor?.user_name && { userName: actor.user_name }),
      ...(actor?.user_email && { userEmail: actor.user_email }),
      ...(card?.type && { accessMethod: card.type }),
      ...(card?.card_number && { cardNumber: card.card_number }),
    },
    originalEvent: payload,
  };

  console.log(`[Genea Parser] Created StandardizedEvent: ${standardizedEvent.eventId} for action: '${event_action}' on door: '${door?.name}' (${deviceId})`);
  
  return [standardizedEvent];
} 