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
  SmartFob = 'Smart Fob',
  Sprinkler = 'Sprinkler',
  Switch = 'Switch',
  Thermostat = 'Thermostat',
  WaterValveController = 'Water Valve Controller',
  Unmapped = 'Unmapped',
}

// --- DEVICE TYPE GROUPINGS ---
// Define which device types are supported for different use cases

// Device types that are supported for alarm zone assignment
export const SUPPORTED_ALARM_DEVICE_TYPES: DeviceType[] = [
  DeviceType.Camera,
  DeviceType.Door,
  DeviceType.GarageDoor,
  DeviceType.Lock,
  DeviceType.Sensor,
  DeviceType.SmartFob,
] as const;

// Utility function to check if a device type is supported for alarm zones
export const isAlarmDeviceTypeSupported = (deviceType: DeviceType): boolean => {
  return SUPPORTED_ALARM_DEVICE_TYPES.includes(deviceType);
};

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

// --- Armed State Enum ---
export enum ArmedState {
  DISARMED = 'DISARMED',
  ARMED = 'ARMED',
  TRIGGERED = 'TRIGGERED',
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
  [DeviceType.SmartFob]: never;
  [DeviceType.Sprinkler]: never;
  [DeviceType.Switch]: DeviceSubtype.Dimmer | DeviceSubtype.Toggle;
  [DeviceType.Thermostat]: never;
  [DeviceType.WaterValveController]: never;
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

export enum ErrorState {
  Error = 'ERROR',
}

// --- BEGIN Add ActionableState Enum ---
// Represents desired abstract state changes, independent of vendor commands
export enum ActionableState {
  SET_ON = 'SET_ON',
  SET_OFF = 'SET_OFF',
  // Future: SET_LOCKED = 'SET_LOCKED', SET_UNLOCKED = 'SET_UNLOCKED', SET_BRIGHTNESS = 'SET_BRIGHTNESS', etc.
}
// --- END Add ActionableState Enum ---

// --- BEGIN Add DeviceCommand Enum ---
// Represents device function calls/commands, independent of vendor implementations
export enum DeviceCommand {
  PLAY_AUDIO = 'PLAY_AUDIO',
  // Future: TAKE_PHOTO = 'TAKE_PHOTO', PLAY_CHIME = 'PLAY_CHIME', etc.
}
// --- END Add DeviceCommand Enum ---

// Union type for all possible intermediate states
export type IntermediateState = BinaryState | ContactState | SensorAlertState | LockStatus | ErrorState;

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

export const OFFLINE = 'Offline';
export const ONLINE = 'Online';

export const RECORDING = 'Recording';
export const UNAUTHORIZED = 'Unauthorized';

// Error state string
export const ERROR = 'Error';

// --- Device State Types ---
// Define types using the constants instead of re-writing string literals

export type LockState = typeof LOCKED | typeof UNLOCKED;
export type OnOffState = typeof ON | typeof OFF;
export type ContactSensorState = typeof OPEN | typeof CLOSED;
export type LeakSensorState = typeof DRY | typeof LEAK_DETECTED;
export type MotionSensorState = typeof NO_MOTION | typeof MOTION_DETECTED;
export type VibrationSensorState = typeof NO_VIBRATION | typeof VIBRATION_DETECTED;
export type OfflineStateType = typeof OFFLINE;
export type OnlineStateType = typeof ONLINE;
export type RecordingStateType = typeof RECORDING;
export type UnauthorizedStateType = typeof UNAUTHORIZED;
export type ErrorStateType = typeof ERROR;

// Union of all possible display states
// --- BEGIN Update DisplayState Union ---
export type DisplayState = LockState | OnOffState | ContactSensorState | LeakSensorState | MotionSensorState | VibrationSensorState | OfflineStateType | OnlineStateType | RecordingStateType | UnauthorizedStateType | ErrorStateType;
// --- END Update DisplayState Union ---

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
    [ErrorState.Error]: ERROR,
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
    'null': [OPEN, CLOSED, ERROR],
  },
  [DeviceType.Lock]: {
    'null': [LOCKED, UNLOCKED, ERROR],
  },
  [DeviceType.Outlet]: {
    [DeviceSubtype.Multi]: [ON, OFF, ERROR],
    [DeviceSubtype.Single]: [ON, OFF, ERROR],
  },
  [DeviceType.Sensor]: {
    [DeviceSubtype.Contact]: [OPEN, CLOSED, ERROR],
    [DeviceSubtype.Leak]: [DRY, LEAK_DETECTED, ERROR],
    [DeviceSubtype.Motion]: [NO_MOTION, MOTION_DETECTED, ERROR],
    [DeviceSubtype.Vibration]: [NO_VIBRATION, VIBRATION_DETECTED, ERROR],
  },
  [DeviceType.Switch]: {
    [DeviceSubtype.Dimmer]: [ON, OFF, ERROR],
    [DeviceSubtype.Toggle]: [ON, OFF, ERROR],
  },
  [DeviceType.WaterValveController]: {
    'null': [OPEN, CLOSED, ERROR],
  },
  // Add mappings for other devices as needed
};

// --- CONNECTOR CATEGORIES ---
export type ConnectorCategory = 'yolink' | 'piko' | 'netbox' | 'genea';

// --- EVENT CATEGORIES ---
// High-level grouping for events.
export enum EventCategory {
  DEVICE_STATE = 'DEVICE_STATE',               // Changes in device attributes (on/off, lock state, battery)
  ACCESS_CONTROL = 'ACCESS_CONTROL',           // Events related to physical access (grant, deny, door forced/held)
  ANALYTICS = 'ANALYTICS',                   // Events generated by analytics engines (person detected, loitering)
  DIAGNOSTICS = 'DIAGNOSTICS',               // For device check-ins, reports, etc.
  UNKNOWN = 'UNKNOWN',                       // Default for unmappable events
}

// --- EVENT TYPES ---
// Specific event types, grouped visually by their intended Category.
export enum EventType {
  // --- Category: DEVICE_STATE ---
  STATE_CHANGED = 'STATE_CHANGED',             // Generic state change (binary, lock, contact sensor states)
  BATTERY_LEVEL_CHANGED = 'BATTERY_LEVEL_CHANGED',
  BUTTON_PRESSED = 'BUTTON_PRESSED',           // Button pressed on smart fob/remote
  BUTTON_LONG_PRESSED = 'BUTTON_LONG_PRESSED', // Button long pressed on smart fob/remote

  // --- Category: ACCESS_CONTROL ---
  ACCESS_GRANTED = 'ACCESS_GRANTED',
  ACCESS_DENIED = 'ACCESS_DENIED',               // See EventSubtype for specific reasons
  DOOR_HELD_OPEN = 'DOOR_HELD_OPEN',
  DOOR_FORCED_OPEN = 'DOOR_FORCED_OPEN',
  EXIT_REQUEST = 'EXIT_REQUEST',                 // Added (See EventSubtype)

  // --- Category: ANALYTICS ---
  ANALYTICS_EVENT = 'ANALYTICS_EVENT',       // General or unknown analytics event
  OBJECT_DETECTED = 'OBJECT_DETECTED',         // Generic object detection (Use EventSubtype for class)
  OBJECT_REMOVED = 'OBJECT_REMOVED',           // Object removal detection
  MOTION_DETECTED = 'MOTION_DETECTED',         // Camera motion detection (analytics)
  SOUND_DETECTED = 'SOUND_DETECTED',           // Camera sound detection (analytics)
  LOITERING = 'LOITERING',
  LINE_CROSSING = 'LINE_CROSSING',
  ARMED_PERSON = 'ARMED_PERSON',
  TAILGATING = 'TAILGATING',
  INTRUSION = 'INTRUSION',

  // --- Category: DIAGNOSTICS ---
  DEVICE_CHECK_IN = 'DEVICE_CHECK_IN',         // For device reporting/check-in events
  POWER_CHECK_IN = 'POWER_CHECK_IN',           // For device power reporting events

  // --- Category: UNKNOWN ---
  UNKNOWN_EXTERNAL_EVENT = 'UNKNOWN_EXTERNAL_EVENT',
}

// --- EVENT SUBTYPES ---
// Provides finer detail for specific EventTypes.
export enum EventSubtype {
  // --- Used with EventType.ACCESS_DENIED ---
  ANTIPASSBACK_VIOLATION = 'ANTIPASSBACK_VIOLATION',
  DOOR_LOCKED = 'DOOR_LOCKED',
  DURESS_PIN = 'DURESS_PIN',
  EXPIRED_CREDENTIAL = 'EXPIRED_CREDENTIAL',
  INVALID_CREDENTIAL = 'INVALID_CREDENTIAL',
  NOT_IN_SCHEDULE = 'NOT_IN_SCHEDULE',
  OCCUPANCY_LIMIT = 'OCCUPANCY_LIMIT',
  PIN_REQUIRED = 'PIN_REQUIRED',

  // --- Used with EventType.ACCESS_GRANTED ---
  NORMAL = 'NORMAL',
  REMOTE_OVERRIDE = 'REMOTE_OVERRIDE',
  PASSBACK_RETURN = 'PASSBACK_RETURN',

  // --- Used with EventType.EXIT_REQUEST --- (Added)
  PRESSED = 'PRESSED',
  HELD = 'HELD',
  MOTION = 'MOTION',

  // --- Used with EventType.OBJECT_DETECTED --- 
  PERSON = 'PERSON',
  VEHICLE = 'VEHICLE',
  
  // Add other subtypes here, grouped by the EventType they primarily relate to
}

// --- Armed State Display Name Mapping ---
export const ArmedStateDisplayNames: Record<ArmedState, string> = {
  [ArmedState.DISARMED]: "Disarmed",
  [ArmedState.ARMED]: "Armed",
  [ArmedState.TRIGGERED]: "Triggered",
};

// --- EVENT SUBTYPE DISPLAY MAP --- 
// Provides user-friendly names for subtypes
export const EVENT_SUBTYPE_DISPLAY_MAP: Record<EventSubtype, string> = {
    // Access Denied Reasons (Sorted Alphabetically by Key)
    [EventSubtype.ANTIPASSBACK_VIOLATION]: 'Anti-Passback Violation',
    [EventSubtype.DOOR_LOCKED]: 'Door Locked',
    [EventSubtype.DURESS_PIN]: 'Duress PIN Entered',
    [EventSubtype.EXPIRED_CREDENTIAL]: 'Expired Credential',
    [EventSubtype.INVALID_CREDENTIAL]: 'Invalid Credential',
    [EventSubtype.NOT_IN_SCHEDULE]: 'Not In Schedule',
    [EventSubtype.OCCUPANCY_LIMIT]: 'Occupancy Limit Reached',
    [EventSubtype.PIN_REQUIRED]: 'PIN Required',
    // Access Granted Reasons
    [EventSubtype.NORMAL]: 'Normal Access',
    [EventSubtype.REMOTE_OVERRIDE]: 'Remote Override',
    [EventSubtype.PASSBACK_RETURN]: 'Anti-Passback Return',
    // Exit Request Types (Added)
    [EventSubtype.PRESSED]: 'REX Pressed',
    [EventSubtype.HELD]: 'REX Held',
    [EventSubtype.MOTION]: 'REX Motion',
    // Object Detection Types
    [EventSubtype.PERSON]: 'Person',
    [EventSubtype.VEHICLE]: 'Vehicle',
    // Add display names for other subtypes as they are added
};

// --- EVENT TYPE DISPLAY STRINGS --- 
// Define display strings once
export const OBJECT_DETECTED_DISPLAY = 'Object Detected';
export const OBJECT_REMOVED_DISPLAY = 'Object Removed';
export const MOTION_DETECTED_DISPLAY = 'Motion Detected';
export const SOUND_DETECTED_DISPLAY = 'Sound Detected';
export const LOITERING_DISPLAY = 'Loitering';
export const LINE_CROSSING_DISPLAY = 'Line Crossing';
export const ARMED_PERSON_DISPLAY = 'Armed Person Detected';
export const TAILGATING_DISPLAY = 'Tailgating Detected';
export const INTRUSION_DISPLAY = 'Intrusion Detected';
export const GENERIC_ANALYTICS_DISPLAY = 'Unmapped';
export const STATE_CHANGED_DISPLAY = 'State Changed';
export const DOOR_HELD_OPEN_DISPLAY = 'Door Held Open';
export const DOOR_FORCED_OPEN_DISPLAY = 'Door Forced Open';
export const ACCESS_GRANTED_DISPLAY = 'Access Granted';
export const ACCESS_DENIED_DISPLAY = 'Access Denied';
export const EXIT_REQUEST_DISPLAY = 'Exit Request'; // Added
export const BUTTON_PRESSED_DISPLAY = 'Button Pressed';
export const BUTTON_LONG_PRESSED_DISPLAY = 'Button Long Pressed';

// --- EVENT TYPE DISPLAY MAP --- 
// Grouped visually by Category for clarity
export const EVENT_TYPE_DISPLAY_MAP = {
  // DEVICE_STATE
  [EventType.STATE_CHANGED]: STATE_CHANGED_DISPLAY,
  [EventType.BATTERY_LEVEL_CHANGED]: 'Battery Level Changed',
  [EventType.BUTTON_PRESSED]: BUTTON_PRESSED_DISPLAY,
  [EventType.BUTTON_LONG_PRESSED]: BUTTON_LONG_PRESSED_DISPLAY,
  
  // ACCESS_CONTROL
  [EventType.ACCESS_GRANTED]: ACCESS_GRANTED_DISPLAY,
  [EventType.ACCESS_DENIED]: ACCESS_DENIED_DISPLAY,
  [EventType.DOOR_HELD_OPEN]: DOOR_HELD_OPEN_DISPLAY,
  [EventType.DOOR_FORCED_OPEN]: DOOR_FORCED_OPEN_DISPLAY,
  [EventType.EXIT_REQUEST]: EXIT_REQUEST_DISPLAY,
  
  // ANALYTICS
  [EventType.ANALYTICS_EVENT]: GENERIC_ANALYTICS_DISPLAY,
  [EventType.OBJECT_DETECTED]: OBJECT_DETECTED_DISPLAY,
  [EventType.OBJECT_REMOVED]: OBJECT_REMOVED_DISPLAY,
  [EventType.MOTION_DETECTED]: MOTION_DETECTED_DISPLAY,
  [EventType.SOUND_DETECTED]: SOUND_DETECTED_DISPLAY,
  [EventType.LOITERING]: LOITERING_DISPLAY,
  [EventType.LINE_CROSSING]: LINE_CROSSING_DISPLAY,
  [EventType.ARMED_PERSON]: ARMED_PERSON_DISPLAY,
  [EventType.TAILGATING]: TAILGATING_DISPLAY,
  [EventType.INTRUSION]: INTRUSION_DISPLAY,
  
  // DIAGNOSTICS
  [EventType.DEVICE_CHECK_IN]: 'Device Check-in',
  [EventType.POWER_CHECK_IN]: 'Power Check-in',
  
  // UNKNOWN
  [EventType.UNKNOWN_EXTERNAL_EVENT]: 'Unknown Event',
};

// --- EVENT CATEGORY DISPLAY STRINGS --- 
export const DEVICE_STATE_CATEGORY_DISPLAY = 'Device State';
export const ACCESS_CONTROL_CATEGORY_DISPLAY = 'Access Control'; 
export const ANALYTICS_CATEGORY_DISPLAY = 'Analytics';
export const DIAGNOSTICS_CATEGORY_DISPLAY = 'Diagnostics';
export const UNKNOWN_CATEGORY_DISPLAY = 'Unknown';

// --- EVENT CATEGORY DISPLAY MAP --- 
export const EVENT_CATEGORY_DISPLAY_MAP = {
  [EventCategory.DEVICE_STATE]: DEVICE_STATE_CATEGORY_DISPLAY,
  [EventCategory.ACCESS_CONTROL]: ACCESS_CONTROL_CATEGORY_DISPLAY, 
  [EventCategory.ANALYTICS]: ANALYTICS_CATEGORY_DISPLAY,
  [EventCategory.DIAGNOSTICS]: DIAGNOSTICS_CATEGORY_DISPLAY,
  [EventCategory.UNKNOWN]: UNKNOWN_CATEGORY_DISPLAY,
} as const;

// --- Event Grouping Proximity Thresholds ---
// Maximum time difference to consider an event for the same group if in the same space
export const DEFAULT_MAX_TIME_WITHIN_GROUP_MS = 180 * 1000; // 180 seconds
// Tighter window for events on the exact same device
export const SAME_DEVICE_MAX_TIME_MS = 30 * 1000; // 30 seconds