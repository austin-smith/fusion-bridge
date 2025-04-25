import { TypedDeviceInfo, IntermediateState, DisplayState, EventType as StandardEventTypeEnum, EventCategory as StandardEventCategoryEnum } from '@/lib/mappings/definitions';
import { PikoJsonRpcEventParams } from '@/services/drivers/piko'; // Import Piko type

/**
 * High-level categories for standardized events RECEIVED FROM EXTERNAL SYSTEMS.
 */
export { StandardEventCategoryEnum as EventCategory }; // Re-export enum

/**
 * Specific types of events RECEIVED FROM EXTERNAL SYSTEMS, grouped semantically.
 */
export { StandardEventTypeEnum as EventType }; // Re-export enum


// Payload for typical state changes (Locks, Switches, Sensors)
export interface StateChangedPayload {
  newState: IntermediateState;
  previousState?: IntermediateState;
  displayState: DisplayState; // Derived for convenience, could be generated later
  rawStateValue?: string | number | boolean;
  rawEventPayload: Record<string, any>; // The original raw event
}

// Payload for device/component status changes reported by the external system
export interface DeviceStatusPayload {
  statusType: 'ONLINE' | 'OFFLINE' | 'UNAUTHORIZED'; // Specific known status types
  message?: string;
  rawStatusValue?: string | number | boolean;
}

// --- NEW Payload for Unknown Events ---
export interface UnknownEventPayload {
  originalEventType?: string; // e.g., "Device.Report" from YoLink, or the main 'event' field
  message: string; // e.g., "Unknown YoLink event structure"
  rawEventPayload: Record<string, any>; // The original raw event
}

// Payload for Piko analytics events
export interface AnalyticsEventPayload {
  caption?: string; // From PikoEventParams
  description?: string; // From PikoEventParams
  rawTimestampUsec?: string; // Original timestamp if needed
  analyticsEngineId?: string;
  eventResourceId?: string;
  objectTrackId?: string;
  // Include the full raw Piko params for detailed access
  rawPikoEventParams: PikoJsonRpcEventParams;
}

// Union type for all possible standardized payloads from external systems
// Uses conditional types based on EventType enum
export type StandardizedEventPayload<T extends StandardEventTypeEnum = StandardEventTypeEnum> =
  T extends StandardEventTypeEnum.STATE_CHANGED ? StateChangedPayload :
  T extends StandardEventTypeEnum.DEVICE_ONLINE | StandardEventTypeEnum.DEVICE_OFFLINE ? DeviceStatusPayload : // TODO: Define specific ONLINE/OFFLINE payloads if needed
  T extends StandardEventTypeEnum.ANALYTICS_EVENT | StandardEventTypeEnum.PERSON_DETECTED | StandardEventTypeEnum.LOITERING | StandardEventTypeEnum.LINE_CROSSING ? AnalyticsEventPayload :
  T extends StandardEventTypeEnum.UNKNOWN_EXTERNAL_EVENT ? UnknownEventPayload :
  Record<string, any>; // Fallback


/**
 * The core standardized event structure used throughout the system for EXTERNAL events.
 */
export interface StandardizedEvent<T extends StandardEventTypeEnum = StandardEventTypeEnum> {
  eventId: string; // Unique identifier for this processed event instance
  timestamp: Date; // Original event timestamp
  connectorId: string; // ID of the connector instance
  deviceId: string; // The connector-specific ID of the device/component associated with the event
  deviceInfo: TypedDeviceInfo; // Standardized device type information
  eventCategory?: StandardEventCategoryEnum; // Made optional
  eventType: T;
  payload: StandardizedEventPayload<T>;
  rawEventType?: string; // Connector-specific raw event type string
  rawEventPayload?: Record<string, any>; // Original, unparsed event payload (optional here as it's required in UnknownEventPayload & AnalyticsEventPayload)
} 