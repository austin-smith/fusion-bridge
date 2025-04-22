import { DeviceType, DeviceSubtype, TypedDeviceInfo, IntermediateState, SensorAlertState, DisplayState, 
// Import the unified canonical mapping table
CANONICAL_STATE_MAP,
// Import state constants for icon mapping
LOCKED, UNLOCKED, ON, OFF, OPEN, CLOSED, LEAK_DETECTED, DRY, MOTION_DETECTED, NO_MOTION, VIBRATION_DETECTED, NO_VIBRATION
} from '@/types/device-mapping';
import type { LucideIcon } from 'lucide-react';
import {
  Siren,
  Cctv,
  Warehouse,
  Combine,
  Router,
  Cable,
  Lock,
  Unlock, // Added for state
  Power,
  PowerOff, // Added for state
  Radio,
  Droplets,
  ToggleLeft,
  Thermometer,
  HelpCircle,
  DoorOpen, // Added for state
  DoorClosed, // Added for state
  AlertTriangle, // Added for state
  ShieldCheck, // Added for state
  Activity // Added for fallback state
} from 'lucide-react';

// Re-export DeviceType
export { DeviceType } from '@/types/device-mapping';

// --- Icon Mapping ---
export const deviceTypeIcons: Record<DeviceType, LucideIcon> = {
  [DeviceType.Alarm]: Siren,
  [DeviceType.Camera]: Cctv,
  [DeviceType.GarageDoor]: Warehouse,
  [DeviceType.Encoder]: Combine,
  [DeviceType.Hub]: Router,
  [DeviceType.IOModule]: Cable,
  [DeviceType.Lock]: Lock,
  [DeviceType.Outlet]: Power,
  [DeviceType.Sensor]: Radio,
  [DeviceType.Sprinkler]: Droplets,
  [DeviceType.Switch]: ToggleLeft,
  [DeviceType.Thermostat]: Thermometer,
  [DeviceType.Unmapped]: HelpCircle,
};

// Restructured identifier map: Record<ConnectorCategory, Record<Identifier, TypedDeviceInfo>>
export const deviceIdentifierMap: Record<string, Record<string, TypedDeviceInfo>> = {
  yolink: {
    'COSmokeSensor': { type: DeviceType.Sensor, subtype: DeviceSubtype.COSmoke },
    'CSDevice': { type: DeviceType.Unmapped },
    'CellularHub': { type: DeviceType.Hub, subtype: DeviceSubtype.Cellular },
    'Dimmer': { type: DeviceType.Switch, subtype: DeviceSubtype.Dimmer },
    'DoorSensor': { type: DeviceType.Sensor, subtype: DeviceSubtype.Contact },
    'Finger': { type: DeviceType.Unmapped},
    'GarageDoor': { type: DeviceType.GarageDoor },
    'Hub': { type: DeviceType.Hub, subtype: DeviceSubtype.Generic },
    'IPCamera': { type: DeviceType.Camera }, // Note: YoLink specific Camera type?
    'InfraredRemoter': { type: DeviceType.Unmapped },
    'LeakSensor': { type: DeviceType.Sensor, subtype: DeviceSubtype.Leak },
    'Lock': { type: DeviceType.Lock },
    'Manipulator': { type: DeviceType.Unmapped },
    'MotionSensor': { type: DeviceType.Sensor, subtype: DeviceSubtype.Motion },
    'MultiOutlet': { type: DeviceType.Outlet, subtype: DeviceSubtype.Multi },
    'Outlet': { type: DeviceType.Outlet, subtype: DeviceSubtype.Single },
    'PowerFailureAlarm': { type: DeviceType.Sensor, subtype: DeviceSubtype.PowerFailure },
    'Siren': { type: DeviceType.Alarm, subtype: DeviceSubtype.Siren },
    'SmartRemoter': { type: DeviceType.Unmapped },
    'SpeakerHub': { type: DeviceType.Hub, subtype: DeviceSubtype.Speaker },
    'Sprinkler': { type: DeviceType.Sprinkler },
    'Switch': { type: DeviceType.Switch, subtype: DeviceSubtype.Toggle },
    'THSensor': { type: DeviceType.Unmapped },
    'Thermostat': { type: DeviceType.Thermostat },
    'VibrationSensor': { type: DeviceType.Sensor, subtype: DeviceSubtype.Vibration },
    'WaterDepthSensor': { type: DeviceType.Unmapped },
    'WaterMeterController': { type: DeviceType.Unmapped },
  },
  piko: {
    'Camera': { type: DeviceType.Camera },
    'Encoder': { type: DeviceType.Encoder },
    'IOModule': { type: DeviceType.IOModule },
    'HornSpeaker': { type: DeviceType.Alarm, subtype: DeviceSubtype.Siren },
    'MultisensorCamera': { type: DeviceType.Camera },
  },
};

// Define the default "Unmapped" type info explicitly
const unknownDeviceInfo: TypedDeviceInfo = { type: DeviceType.Unmapped };

/**
 * Gets the standardized device type information based on connector category and identifier.
 * @param connectorCategory The category of the connector ('yolink', 'piko', etc.)
 * @param identifier The raw device type identifier (e.g., 'COSmokeSensor', 'Camera')
 * @returns A TypedDeviceInfo object representing the mapped type and subtype.
 */
export function getDeviceTypeInfo(connectorCategory: string | null | undefined, identifier: string | null | undefined): TypedDeviceInfo {
  if (!identifier || !connectorCategory) {
    // Optional: Add warning if needed, but might be noisy.
    // console.warn(`Missing identifier or category. Identifier: ${identifier}, Category: ${connectorCategory}. Defaulting to Unknown.`);
    return unknownDeviceInfo;
  }

  const categoryKey = connectorCategory.toLowerCase(); // Normalize category key
  const categoryMap = deviceIdentifierMap[categoryKey];

  if (!categoryMap) {
    // console.warn(`No mappings found for category: ${connectorCategory}. Defaulting to Unknown.`);
    return unknownDeviceInfo;
  }

  const mapping = categoryMap[identifier];

  if (mapping) {
    return mapping; // Return the pre-defined object which conforms to TypedDeviceInfo
  }

  // If no specific mapping is found within the category, return the default Unknown object
  console.warn(`No type mapping found for identifier: ${identifier} (Category: ${connectorCategory}). Defaulting to Unknown.`);
  return unknownDeviceInfo;
}

// --- Helper function to get icon component ---
export function getDeviceTypeIcon(deviceType: DeviceType): LucideIcon {
    return deviceTypeIcons[deviceType] || HelpCircle; // Fallback to Unknown icon
}

// --- Display State to Icon Mapping ---

const displayStateIconMap: Partial<Record<DisplayState, LucideIcon>> = {
  [LOCKED]: Lock,
  [UNLOCKED]: Unlock,
  [ON]: Power,
  [OFF]: PowerOff,
  [OPEN]: DoorOpen,
  [CLOSED]: DoorClosed,
  [LEAK_DETECTED]: AlertTriangle,
  [DRY]: ShieldCheck,
  [MOTION_DETECTED]: AlertTriangle,
  [NO_MOTION]: ShieldCheck,
  [VIBRATION_DETECTED]: AlertTriangle,
  [NO_VIBRATION]: ShieldCheck,
  // Add more specific states as needed
};

/**
 * Gets a Lucide icon component based on the display state string.
 * @param state The DisplayState string (e.g., LOCKED, ON, OPEN).
 * @returns A LucideIcon component.
 */
export function getDisplayStateIcon(state: DisplayState | undefined): LucideIcon {
  if (!state) {
    return HelpCircle; // Icon for undefined/null state
  }
  return displayStateIconMap[state] || Activity; // Return mapped icon or Activity as fallback
}

// --- State Presentation (Intermediate State -> Display String) ---

/**
 * Converts an intermediate state enum into its final display string.
 * Uses ONLY the canonical mapping tables defined in types/device-mapping.ts.
 * For sensor alert states, requires deviceInfo to pick the correct subtype-specific string.
 */
export function intermediateStateToDisplayString(
  state: IntermediateState | null | undefined,
  deviceInfo?: TypedDeviceInfo
): DisplayState | undefined {
  if (!state) {
    return undefined;
  }

  // 1. Check simple one-to-one mappings first (no device context needed)
  if (state in CANONICAL_STATE_MAP.simple) {
    return CANONICAL_STATE_MAP.simple[state as keyof typeof CANONICAL_STATE_MAP.simple];
  }

  // 2. Handle device-specific mappings
  if (deviceInfo?.type === DeviceType.Sensor && deviceInfo.subtype) {
    // For sensors, we need to check if we have mappings for this subtype
    const subtypeKey = deviceInfo.subtype as keyof typeof CANONICAL_STATE_MAP.sensor;
    
    if (subtypeKey in CANONICAL_STATE_MAP.sensor && 
        state in CANONICAL_STATE_MAP.sensor[subtypeKey]) {
      return CANONICAL_STATE_MAP.sensor[subtypeKey][state as SensorAlertState];
    }
  }
  
  // No mapping found
  return undefined;
}

export type { TypedDeviceInfo }; // Export the type 