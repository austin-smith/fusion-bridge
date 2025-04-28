import { TypedDeviceInfo, IntermediateState, DisplayState, EventType, EventCategory, EventSubtype, ConnectorCategory } from '@/lib/mappings/definitions';

// Payload for typical state changes (Locks, Switches, Sensors)
export interface StateChangedPayload {
  intermediateState: IntermediateState;
  displayState?: DisplayState; // Optional: Parsers *should* add this, but allows flexibility
  // Add other common state fields if needed, e.g., numericValue
}

// Payload for device/component status changes reported by the external system
export interface DeviceStatusPayload {
  statusType: 'ONLINE' | 'OFFLINE' | 'UNAUTHORIZED'; // Specific known status types
  message?: string;
  rawStatusValue?: string | number | boolean;
}

// Payload for Unknown Events
export interface UnknownEventPayload {
  originalEventType?: string; // e.g., "Device.Report" from YoLink, or the main 'event' field
  message: string; // e.g., "Unknown YoLink event structure"
  rawEventPayload?: Record<string, any>; // <--- Make optional - The original raw event
}

// Core standardized event structure used throughout the system for EXTERNAL events.
export interface StandardizedEvent {
  eventId: string; // Unique ID for this specific event instance
  connectorId: string;
  deviceId: string;
  timestamp: Date; // Use Date object for consistency
  category: EventCategory; // Use the base enum
  type: EventType;       // Use the base enum
  subtype?: EventSubtype; // Use the base enum (optional)
  deviceInfo?: TypedDeviceInfo; // Optional: Info about the device involved
  payload: Record<string, any>; // Generic payload. Specific data goes here.
  originalEvent: any; // The raw event from the source connector
}