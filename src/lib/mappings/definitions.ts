export enum DeviceType {
  Alarm = 'Alarm',
  Camera = 'Camera',
  Door = 'Door',
  GarageDoor = 'Garage Door',
  Encoder = 'Encoder',
  Hub = 'Hub',
  IOModule = 'I/O Module',
  Lock = 'Lock',
  Outlet = 'Outlet',
  Sensor = 'Sensor',
  Sprinkler = 'Sprinkler',
  Switch = 'Switch',
  Thermostat = 'Thermostat',
  Unmapped = 'Unmapped',
}

export enum DeviceSubtype {
  // Alarm
  Siren = 'Siren',
  // Hub
  Cellular = 'Cellular',
  Generic = 'Generic',
  Speaker = 'Speaker',
  // Outlet
  Multi = 'Multi',
  Single = 'Single',
  // Sensor
  COSmoke = 'CO & Smoke',
  Contact = 'Contact',
  Leak = 'Leak',
  Motion = 'Motion',
  PowerFailure = 'Power Failure',
  Vibration = 'Vibration',
  // Switch
  Dimmer = 'Dimmer',
  Toggle = 'Toggle',
}

// --- Mapped Type Approach ---

// 1. Define the valid relationships between Type and Subtype
type SubtypeMap = {
  [DeviceType.Alarm]: DeviceSubtype.Siren;
  [DeviceType.Camera]: never;
  [DeviceType.Door]: never;
  [DeviceType.GarageDoor]: never;
  [DeviceType.Encoder]: never;
  [DeviceType.Hub]: DeviceSubtype.Cellular | DeviceSubtype.Generic | DeviceSubtype.Speaker;
  [DeviceType.IOModule]: never;
  [DeviceType.Lock]: never;
  [DeviceType.Outlet]: DeviceSubtype.Multi | DeviceSubtype.Single;
  [DeviceType.Sensor]: DeviceSubtype.COSmoke | DeviceSubtype.Contact | DeviceSubtype.Leak | DeviceSubtype.Motion | DeviceSubtype.PowerFailure | DeviceSubtype.Vibration;
  [DeviceType.Sprinkler]: never;
  [DeviceType.Switch]: DeviceSubtype.Dimmer | DeviceSubtype.Toggle;
  [DeviceType.Thermostat]: never;
  [DeviceType.Unmapped]: never;
};

// 2. Define the base generic structure
type BaseTypedDeviceInfo<T extends DeviceType> = {
  type: T;
  subtype?: SubtypeMap[T]; // Subtype is constrained by the map lookup for type T
};

// 3. Create the final union type programmatically using Mapped Types
export type TypedDeviceInfo = {
  [T in DeviceType]: BaseTypedDeviceInfo<T> // For each DeviceType T, create the specific object structure
}[DeviceType]; // Index into the mapped type with all DeviceType keys to get the union

// --- Intermediate State Enums ---
// Used as a standardized, abstract representation of device states,
// independent of connector-specific values or final display strings.

export enum BinaryState {
  On = 'ON',
  Off = 'OFF',
}

export enum ContactState {
  Open = 'OPEN',
  Closed = 'CLOSED',
}

// General Normal/Alert for sensors like Leak, Motion, Vibration
export enum SensorAlertState {
  Normal = 'NORMAL',
  Alert = 'ALERT',
}

export enum LockStatus {
  Locked = 'LOCKED',
  Unlocked = 'UNLOCKED',
}

// Union type for all possible intermediate states
export type IntermediateState = BinaryState | ContactState | SensorAlertState | LockStatus;

// --- STATE DISPLAY CONSTANTS ---
// Define each display string EXACTLY ONCE as a constant

// Lock state strings
export const LOCKED = 'Locked';
export const UNLOCKED = 'Unlocked';

// On/Off state strings
export const ON = 'On';
export const OFF = 'Off';

// Contact sensor state strings
export const OPEN = 'Open';
export const CLOSED = 'Closed';

// Leak sensor state strings
export const DRY = 'Dry';
export const LEAK_DETECTED = 'Leak Detected';

// Motion sensor state strings
export const NO_MOTION = 'No Motion';
export const MOTION_DETECTED = 'Motion Detected';

// Vibration sensor state strings
export const NO_VIBRATION = 'No Vibration';
export const VIBRATION_DETECTED = 'Vibration Detected';

// --- Device State Types ---
// Define types using the constants instead of re-writing string literals

export type LockState = typeof LOCKED | typeof UNLOCKED;
export type OnOffState = typeof ON | typeof OFF;
export type ContactSensorState = typeof OPEN | typeof CLOSED;
export type LeakSensorState = typeof DRY | typeof LEAK_DETECTED;
export type MotionSensorState = typeof NO_MOTION | typeof MOTION_DETECTED;
export type VibrationSensorState = typeof NO_VIBRATION | typeof VIBRATION_DETECTED;

// Union of all possible display states
export type DisplayState = LockState | OnOffState | ContactSensorState | LeakSensorState | MotionSensorState | VibrationSensorState;

// --- CANONICAL STATE MAPPINGS ---
// The single source of truth for enum-to-display-string mappings

// Replace the two separate maps with a single unified map
export const CANONICAL_STATE_MAP = {
  // Simple direct mappings (no context needed)
  simple: {
    [BinaryState.On]: ON,
    [BinaryState.Off]: OFF,
    [LockStatus.Locked]: LOCKED,
    [LockStatus.Unlocked]: UNLOCKED,
    [ContactState.Open]: OPEN,
    [ContactState.Closed]: CLOSED,
  },
  
  // Context-dependent mappings (require device subtype)
  sensor: {
    [DeviceSubtype.Leak]: {
      [SensorAlertState.Normal]: DRY,
      [SensorAlertState.Alert]: LEAK_DETECTED,
    },
    [DeviceSubtype.Motion]: {
      [SensorAlertState.Normal]: NO_MOTION,
      [SensorAlertState.Alert]: MOTION_DETECTED,
    },
    [DeviceSubtype.Vibration]: {
      [SensorAlertState.Normal]: NO_VIBRATION,
      [SensorAlertState.Alert]: VIBRATION_DETECTED,
    },
  }
} as const;

// Map defining the valid display states for each device type/subtype combination
export type ValidDisplayStatesMap = {
  [T in DeviceType]?: {
    // Use string index signature for subtypes + 'null' key
    [subtypeKey: string]: DisplayState[] | undefined;
    'null'?: DisplayState[] | undefined; // Explicitly handle subtype-less
  };
};

export const validDisplayStatesMap: ValidDisplayStatesMap = {
  [DeviceType.Door]: {
    'null': [OPEN, CLOSED],
  },
  [DeviceType.Lock]: {
    'null': [LOCKED, UNLOCKED],
  },
  [DeviceType.Outlet]: {
    [DeviceSubtype.Multi]: [ON, OFF],
    [DeviceSubtype.Single]: [ON, OFF],
  },
  [DeviceType.Sensor]: {
    [DeviceSubtype.Contact]: [OPEN, CLOSED],
    [DeviceSubtype.Leak]: [DRY, LEAK_DETECTED],
    [DeviceSubtype.Motion]: [NO_MOTION, MOTION_DETECTED],
    [DeviceSubtype.Vibration]: [NO_VIBRATION, VIBRATION_DETECTED],
  },
  [DeviceType.Switch]: {
    [DeviceSubtype.Dimmer]: [ON, OFF],
    [DeviceSubtype.Toggle]: [ON, OFF],
  },
  // Add mappings for other devices as needed
};

// --- CONNECTOR CATEGORIES ---
export type ConnectorCategory = 'yolink' | 'piko' | 'netbox';

// --- Intermediate State Enums ---
// Used as a standardized, abstract representation of device states,
// independent of connector-specific values or final display strings.

export enum EventCategory {
  DEVICE_STATE = 'DEVICE_STATE',
  DEVICE_CONNECTIVITY = 'DEVICE_CONNECTIVITY',
  ANALYTICS = 'ANALYTICS',
  UNKNOWN = 'UNKNOWN',
}

export enum EventType {
  // Device State Changes
  STATE_CHANGED = 'STATE_CHANGED',
  BATTERY_LEVEL_CHANGED = 'BATTERY_LEVEL_CHANGED',
  DOOR_HELD_OPEN = 'DOOR_HELD_OPEN',
  DOOR_FORCED_OPEN = 'DOOR_FORCED_OPEN',
  ACCESS_GRANTED = 'ACCESS_GRANTED',
  ACCESS_DENIED = 'ACCESS_DENIED',
  
  // Connectivity Status
  DEVICE_ONLINE = 'DEVICE_ONLINE',
  DEVICE_OFFLINE = 'DEVICE_OFFLINE',
  
  // Analytics Events
  ANALYTICS_EVENT = 'ANALYTICS_EVENT', // General or unknown analytics event
  PERSON_DETECTED = 'PERSON_DETECTED',
  LOITERING = 'LOITERING',
  LINE_CROSSING = 'LINE_CROSSING',
  ARMED_PERSON = 'ARMED_PERSON',
  TAILGATING = 'TAILGATING',
  INTRUSION = 'INTRUSION',

  // Catch-all for unhandled external events
  UNKNOWN_EXTERNAL_EVENT = 'UNKNOWN_EXTERNAL_EVENT',

  // Internal/System Events (Placeholder)
  SYSTEM_NOTIFICATION = 'SYSTEM_NOTIFICATION',
}

// --- EVENT TYPE DISPLAY STRINGS ---
export const PERSON_DETECTED_DISPLAY = 'Person Detected';
export const LOITERING_DISPLAY = 'Loitering';
export const LINE_CROSSING_DISPLAY = 'Line Crossing';
export const ARMED_PERSON_DISPLAY = 'Armed Person Detected';
export const TAILGATING_DISPLAY = 'Tailgating Detected';
export const INTRUSION_DISPLAY = 'Intrusion Detected';
export const GENERIC_ANALYTICS_DISPLAY = 'Generic Analytics';
export const STATE_CHANGED_DISPLAY = 'State Changed';
export const DEVICE_ONLINE_DISPLAY = 'Device Online';
export const DEVICE_OFFLINE_DISPLAY = 'Device Offline';
export const DOOR_HELD_OPEN_DISPLAY = 'Door Held Open';
export const DOOR_FORCED_OPEN_DISPLAY = 'Door Forced Open';
export const ACCESS_GRANTED_DISPLAY = 'Access Granted';
export const ACCESS_DENIED_DISPLAY = 'Access Denied';

// --- EVENT TYPE DISPLAY MAP ---
export const EVENT_TYPE_DISPLAY_MAP = {
  [EventType.PERSON_DETECTED]: PERSON_DETECTED_DISPLAY,
  [EventType.LOITERING]: LOITERING_DISPLAY,
  [EventType.LINE_CROSSING]: LINE_CROSSING_DISPLAY,
  [EventType.ARMED_PERSON]: ARMED_PERSON_DISPLAY,
  [EventType.TAILGATING]: TAILGATING_DISPLAY,
  [EventType.INTRUSION]: INTRUSION_DISPLAY,
  [EventType.ANALYTICS_EVENT]: GENERIC_ANALYTICS_DISPLAY,
  [EventType.STATE_CHANGED]: STATE_CHANGED_DISPLAY,
  [EventType.BATTERY_LEVEL_CHANGED]: 'Battery Level Changed',
  [EventType.DOOR_HELD_OPEN]: DOOR_HELD_OPEN_DISPLAY,
  [EventType.DOOR_FORCED_OPEN]: DOOR_FORCED_OPEN_DISPLAY,
  [EventType.ACCESS_GRANTED]: ACCESS_GRANTED_DISPLAY,
  [EventType.ACCESS_DENIED]: ACCESS_DENIED_DISPLAY,
  [EventType.DEVICE_ONLINE]: DEVICE_ONLINE_DISPLAY,
  [EventType.DEVICE_OFFLINE]: DEVICE_OFFLINE_DISPLAY,
  [EventType.UNKNOWN_EXTERNAL_EVENT]: 'Unknown Event',
  [EventType.SYSTEM_NOTIFICATION]: 'System Notification',
} as const;

// --- EVENT CATEGORY DISPLAY STRINGS ---
export const DEVICE_STATE_CATEGORY_DISPLAY = 'Device State';
export const DEVICE_CONNECTIVITY_CATEGORY_DISPLAY = 'Connectivity';
export const ANALYTICS_CATEGORY_DISPLAY = 'Analytics';
export const UNKNOWN_CATEGORY_DISPLAY = 'Unknown';

// --- EVENT CATEGORY DISPLAY MAP ---
export const EVENT_CATEGORY_DISPLAY_MAP = {
  [EventCategory.DEVICE_STATE]: DEVICE_STATE_CATEGORY_DISPLAY,
  [EventCategory.DEVICE_CONNECTIVITY]: DEVICE_CONNECTIVITY_CATEGORY_DISPLAY,
  [EventCategory.ANALYTICS]: ANALYTICS_CATEGORY_DISPLAY,
  [EventCategory.UNKNOWN]: UNKNOWN_CATEGORY_DISPLAY,
} as const;