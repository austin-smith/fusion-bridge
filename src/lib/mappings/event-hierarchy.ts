import { 
  EventCategory, 
  EventType, 
  EventSubtype
} from './definitions';

/**
 * Central Event Hierarchy Definition
 * 
 * This file establishes the single source of truth for the complete event hierarchy:
 * - EventCategory → EventType mappings
 * - EventType → EventSubtype mappings
 * - Type-safe event classification utilities
 * 
 * The TypeScript type system enforces these relationships at compile time, 
 * preventing invalid combinations at any level of the hierarchy.
 */

/**
 * Complete Event Hierarchy Definition
 * Single source of truth showing the full Category → Type → Subtype structure
 */
export const EVENT_HIERARCHY = {
  [EventCategory.DEVICE_STATE]: {
    [EventType.STATE_CHANGED]: [],
    [EventType.BATTERY_LEVEL_CHANGED]: [],
    [EventType.BUTTON_PRESSED]: [],
    [EventType.BUTTON_LONG_PRESSED]: [],
  },

  [EventCategory.ACCESS_CONTROL]: {
    [EventType.ACCESS_GRANTED]: [
      EventSubtype.NORMAL,
      EventSubtype.REMOTE_OVERRIDE,
      EventSubtype.PASSBACK_RETURN,
    ],
    [EventType.ACCESS_DENIED]: [
      EventSubtype.ANTIPASSBACK_VIOLATION,
      EventSubtype.DOOR_LOCKED,
      EventSubtype.DURESS_PIN,
      EventSubtype.EXPIRED_CREDENTIAL,
      EventSubtype.INVALID_CREDENTIAL,
      EventSubtype.NOT_IN_SCHEDULE,
      EventSubtype.OCCUPANCY_LIMIT,
      EventSubtype.PIN_REQUIRED,
      EventSubtype.NORMAL,  // Generic access denied
    ],
    [EventType.DOOR_HELD_OPEN]: [],
    [EventType.DOOR_FORCED_OPEN]: [],
    [EventType.DOOR_SECURED]: [
      EventSubtype.FORCED_OPEN_RESOLVED,
      EventSubtype.HELD_OPEN_RESOLVED,
    ],
    [EventType.EXIT_REQUEST]: [
      EventSubtype.PRESSED,
      EventSubtype.HELD,
      EventSubtype.MOTION,
    ],
  },

  [EventCategory.ANALYTICS]: {
    [EventType.ANALYTICS_EVENT]: [],
    [EventType.OBJECT_DETECTED]: [
      EventSubtype.PERSON,
      EventSubtype.VEHICLE,
    ],
    [EventType.OBJECT_REMOVED]: [],
    [EventType.MOTION_DETECTED]: [],
    [EventType.SOUND_DETECTED]: [],
    [EventType.LICENSE_PLATE_DETECTED]: [],
    [EventType.LOITERING]: [],
    [EventType.LINE_CROSSING]: [],
    [EventType.ARMED_PERSON]: [],
    [EventType.TAILGATING]: [],
    [EventType.INTRUSION]: [
      EventSubtype.PERSON,
      EventSubtype.VEHICLE,
    ],
  },

  [EventCategory.DIAGNOSTICS]: {
    [EventType.DEVICE_CHECK_IN]: [],
    [EventType.POWER_CHECK_IN]: [],
  },

  [EventCategory.UNKNOWN]: {
    [EventType.UNKNOWN_EXTERNAL_EVENT]: [],
  },
} as const;

// Derived types from the central EVENT_HIERARCHY (no redundancy!)

/**
 * Extract all valid EventTypes for a given EventCategory from EVENT_HIERARCHY
 */
export type EventCategoryTypeMap = {
  [C in EventCategory]: keyof (typeof EVENT_HIERARCHY)[C]
};

/**
 * Type-safe event classification
 */
export interface EventClassification<T extends EventType> {
  readonly category: EventCategory;
  readonly type: T;
  readonly subtype?: EventSubtype;
}

/**
 * Helper function to create type-safe event classifications.
 * 
 * @param type The EventType
 * @param subtype Optional EventSubtype
 * @returns A type-safe EventClassification
 */
export function createEventClassification<T extends EventType>(
  type: T,
  subtype?: EventSubtype
): EventClassification<T> {
  // Derive category directly from EVENT_HIERARCHY
  let category: EventCategory | undefined;
  
  for (const [categoryKey, types] of Object.entries(EVENT_HIERARCHY)) {
    if (type in types) {
      category = categoryKey as EventCategory;
      break;
    }
  }
  
  if (!category) {
    throw new Error(`EventType '${type}' not found in EVENT_HIERARCHY`);
  }
  
  return {
    category,
    type,
    subtype
  } as const;
}



/**
 * Helper function to group all event types by their category
 */
export function getEventsByCategory(): Record<EventCategory, EventType[]> {
  const grouped: Record<EventCategory, EventType[]> = {
    [EventCategory.DEVICE_STATE]: [],
    [EventCategory.ACCESS_CONTROL]: [],
    [EventCategory.ANALYTICS]: [],
    [EventCategory.DIAGNOSTICS]: [],
    [EventCategory.UNKNOWN]: [],
  };
  
  Object.entries(EVENT_HIERARCHY).forEach(([category, types]) => {
    Object.keys(types as object).forEach(eventType => {
      grouped[category as EventCategory].push(eventType as EventType);
    });
  });
  
  return grouped;
}

/**
 * Utility type to extract all valid event types for a given EventCategory
 */
export type ValidEventTypesFor<C extends EventCategory> = EventCategoryTypeMap[C];