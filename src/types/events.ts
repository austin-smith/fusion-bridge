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

// Payload for button press events from smart fobs/remotes
// Note: This interface is for documentation and validation. Button events use the generic payload structure.
export interface ButtonEventPayload {
  buttonNumber: number; // 1-8 (user-friendly numbering)
  pressType: 'Press' | 'LongPress';
  keyMask: number; // Original keyMask from YoLink for reference (0-255)
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

// Event structure used on the frontend, enriched with details needed for display
export interface EnrichedEvent {
  id: number; 
  eventUuid: string; 
  timestamp: number; // Epoch ms
  payload?: Record<string, unknown> | null; 
  rawPayload?: Record<string, any> | null; 
  deviceId: string;
  deviceInternalId?: string;
  deviceName?: string;
  connectorName?: string;
  deviceTypeInfo: TypedDeviceInfo;
  connectorCategory: string;
  connectorId: string; 
  eventCategory: string; 
  eventType: string; 
  eventSubtype?: EventSubtype; 
  rawEventType?: string; 
  displayState?: DisplayState | undefined;
  spaceId?: string;
  spaceName?: string;
  locationId?: string;
  locationName?: string;
  thumbnailUrl?: string; // Keep for placeholder use
  videoUrl?: string; // Keep for placeholder use
  // Uncommenting bestShotUrlComponents as it's used in page.tsx
  bestShotUrlComponents?: {
    type: 'cloud' | 'local'; // Need type for API call logic
    pikoSystemId?: string; 
    connectorId: string;
    objectTrackId: string;
    cameraId: string;
  };
}

// --- ADD EventGroup Interface --- 
// Structure for a group of events used in the Card View
export interface EventGroup {
  groupKey: string;
  spaceId?: string;
  spaceName?: string;
  locationId?: string;
  locationName?: string;
  startTime: Date; // Earliest event time in the group
  endTime: Date; // Latest event time in the group
  events: EnrichedEvent[];
}
// --- END EventGroup --- 