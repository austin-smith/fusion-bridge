import { StandardizedEvent } from '@/types/events';
import { GeneaEventWebhookPayload } from '@/types/genea';
import { EventCategory, EventType, EventSubtype } from '@/lib/mappings/definitions';
import { getDeviceTypeInfo } from '@/lib/mappings/identification';
import crypto from 'crypto';

/**
 * Comprehensive mapping of Genea event actions to standardized event types and subtypes
 * Based on the provided mapping table from Genea API documentation
 */
const GENEA_EVENT_MAPPING: Record<string, {
  type: EventType;
  subtype?: EventSubtype;
}> = {
  // Access Denied Events with specific subtypes
  'SEQUR_ACCESS_DENIED_ACCESS_POINT_LOCKED': {
    type: EventType.ACCESS_DENIED,
    subtype: EventSubtype.DOOR_LOCKED
  },
  'SEQUR_ACCESS_DENIED_AFTER_EXPIRATION_DATE': {
    type: EventType.ACCESS_DENIED,
    subtype: EventSubtype.EXPIRED_CREDENTIAL
  },
  'SEQUR_ACCESS_DENIED_ANTI_PASSBACK_VIOLATION': {
    type: EventType.ACCESS_DENIED,
    subtype: EventSubtype.ANTIPASSBACK_VIOLATION
  },
  'SEQUR_ACCESS_DENIED_DURESS_code_DETECTED': {
    type: EventType.ACCESS_DENIED,
    subtype: EventSubtype.DURESS_PIN
  },
  'SEQUR_ACCESS_DENIED_INVALID_PIN': {
    type: EventType.ACCESS_DENIED,
    subtype: EventSubtype.INVALID_CREDENTIAL
  },
  'SEQUR_ACCESS_DENIED_INVALID_TIME': {
    type: EventType.ACCESS_DENIED,
    subtype: EventSubtype.NOT_IN_SCHEDULE
  },
  'SEQUR_ACCESS_DENIED_OCCUPANCY_LIMIT_REACHED': {
    type: EventType.ACCESS_DENIED,
    subtype: EventSubtype.OCCUPANCY_LIMIT
  },
  
  // Access Denied Events without specific subtypes (will use undefined subtype)
  'SEQUR_ACCESS_DENIED_AIRLOCK': {
    type: EventType.ACCESS_DENIED
  },
  'SEQUR_ACCESS_DENIED_AREA_NOT_ENABLED': {
    type: EventType.ACCESS_DENIED
  },
  'SEQUR_ACCESS_DENIED_BEFORE_ACTIVATION_DATE': {
    type: EventType.ACCESS_DENIED
  },
  'SEQUR_ACCESS_DENIED_CARD_NOT_FOUND': {
    type: EventType.ACCESS_DENIED
  },
  'SEQUR_ACCESS_DENIED_COUNT_EXCEEDED': {
    type: EventType.ACCESS_DENIED
  },
  'SEQUR_ACCESS_DENIED_DEACTIVATED_CARD': {
    type: EventType.ACCESS_DENIED
  },
  'SEQUR_ACCESS_DENIED_ELEVATOR_FLOOR': {
    type: EventType.ACCESS_DENIED
  },
  'SEQUR_ACCESS_DENIED_ELEVATOR_FLOOR_UNAUTHORIZED': {
    type: EventType.ACCESS_DENIED
  },
  'SEQUR_ACCESS_DENIED_ELEVATOR_TIMEOUT': {
    type: EventType.ACCESS_DENIED
  },
  'SEQUR_ACCESS_DENIED_ELEVATOR_UNKNOWN_ERROR': {
    type: EventType.ACCESS_DENIED
  },
  'SEQUR_ACCESS_DENIED_HOST_APPROVAL_DENIED': {
    type: EventType.ACCESS_DENIED
  },
  'SEQUR_ACCESS_DENIED_HOST_APPROVAL_TIMEOUT': {
    type: EventType.ACCESS_DENIED
  },
  'SEQUR_ACCESS_DENIED_INCOMPLETE_CARD_PIN_SEQ': {
    type: EventType.ACCESS_DENIED
  },
  'SEQUR_ACCESS_DENIED_INVALID_FACILITY_code': {
    type: EventType.ACCESS_DENIED
  },
  'SEQUR_ACCESS_DENIED_INVALID_FORMAT': {
    type: EventType.ACCESS_DENIED
  },
  'SEQUR_ACCESS_DENIED_INVALID_ISSUE_code': {
    type: EventType.ACCESS_DENIED
  },
  'SEQUR_ACCESS_DENIED_NO_DOOR_ACCESS': {
    type: EventType.ACCESS_DENIED
  },
  'SEQUR_ACCESS_DENIED_NO_ESCORT_CARD': {
    type: EventType.ACCESS_DENIED
  },
  'SEQUR_ACCESS_DENIED_NO_SECOND_CARD': {
    type: EventType.ACCESS_DENIED
  },
  'SEQUR_ACCESS_DENIED_UNAUTHORIZED_ASSETS': {
    type: EventType.ACCESS_DENIED
  },
  'SEQUR_ACCESS_DENIED_USE_LIMIT': {
    type: EventType.ACCESS_DENIED
  },
  
  // Access Granted Events
  'SEQUR_ACCESS_GRANTED': {
    type: EventType.ACCESS_GRANTED,
    subtype: EventSubtype.NORMAL
  },
  'SEQUR_ACCESS_GRANTED_ACCESS_POINT_UNLOCKED': {
    type: EventType.ACCESS_GRANTED,
    subtype: EventSubtype.NORMAL
  }
  
  // Note: Add more event mappings here as discovered from Genea documentation
  // or as new event types are encountered in production
};

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

  // Map Genea event action to standardized event type and subtype
  const eventMapping = GENEA_EVENT_MAPPING[event_action];
  let category: EventCategory;
  let type: EventType;
  let subtype: EventSubtype | undefined;

  if (eventMapping) {
    // All mapped Genea events are ACCESS_CONTROL category
    category = EventCategory.ACCESS_CONTROL;
    type = eventMapping.type;
    subtype = eventMapping.subtype;
    console.log(`[Genea Parser] Mapped event action '${event_action}' to ${type}${subtype ? ` / ${subtype}` : ''}`);
  } else {
    // Handle unmapped events
    console.warn(`[Genea Parser] Unmapped event action: '${event_action}' for event ${eventUuid}`);
    category = EventCategory.UNKNOWN;
    type = EventType.UNKNOWN_EXTERNAL_EVENT;
    subtype = undefined;
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
      eventMessage: event_message,
      ...(door?.name && { doorName: door.name }),
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