import {
    DeviceType,
    TypedDeviceInfo,
    IntermediateState,
    SensorAlertState,
    DisplayState,
    CANONICAL_STATE_MAP,
    // Import state constants for icon mapping
    LOCKED, UNLOCKED, ON, OFF, OPEN, CLOSED, LEAK_DETECTED, DRY, MOTION_DETECTED, NO_MOTION, VIBRATION_DETECTED, NO_VIBRATION,
    EventCategory,
    ArmedState
} from './definitions';
import type { LucideIcon } from 'lucide-react';
import {
    // Device type icons
    Siren, Cctv, Warehouse, Combine, Router, Cable, Lock, Power, Radio, Droplets, ToggleLeft, Thermometer, HelpCircle,
    // State-specific icons
    Unlock, PowerOff, DoorOpen, DoorClosed, AlertTriangle, ShieldCheck, Activity,
    // Event category icons
    KeyRound, PersonStanding,
    // ADD: Armed State Icons
    ShieldOff, ShieldAlert
} from 'lucide-react';


// --- Device Type Icon Mapping ---
export const deviceTypeIcons: Record<DeviceType, LucideIcon> = {
    [DeviceType.Alarm]: Siren,
    [DeviceType.Camera]: Cctv,
    [DeviceType.Door]: DoorClosed,
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

// Helper function to get device type icon component
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
};

// Helper function to get display state icon component
export function getDisplayStateIcon(state: DisplayState | undefined): LucideIcon {
    if (!state) {
        return HelpCircle; // Icon for undefined/null state
    }
    return displayStateIconMap[state] || Activity; // Return mapped icon or Activity as fallback
}


// --- NEW: Armed State Icon Mapping ---
const armedStateIconMap: Record<ArmedState, LucideIcon> = {
  [ArmedState.DISARMED]: ShieldOff,
  [ArmedState.ARMED_AWAY]: ShieldCheck,
  [ArmedState.ARMED_STAY]: ShieldCheck,
  [ArmedState.TRIGGERED]: ShieldAlert, // Using ShieldAlert for consistency
};

// Helper function to get armed state icon component
export function getArmedStateIcon(state: ArmedState | undefined): LucideIcon {
    if (!state) {
        return HelpCircle; // Icon for undefined/null state
    }
    return armedStateIconMap[state] || HelpCircle; // Return mapped icon or HelpCircle as fallback
}


// --- Event Category Icon Mapping ---
const eventCategoryIcons: Record<EventCategory, LucideIcon> = {
    [EventCategory.DEVICE_STATE]: Activity,
    [EventCategory.ACCESS_CONTROL]: KeyRound,
    [EventCategory.ANALYTICS]: PersonStanding,
    [EventCategory.UNKNOWN]: HelpCircle,
};

// Helper function to get event category icon component
export function getEventCategoryIcon(category: EventCategory | undefined): LucideIcon {
    if (!category) {
        return HelpCircle; // Default icon for undefined category
    }
    return eventCategoryIcons[category] || HelpCircle; // Fallback to Unknown icon
}


// --- Intermediate State to Display String Conversion ---

/**
 * Converts an intermediate state enum into its final display string.
 * Uses ONLY the canonical mapping tables defined in definitions.ts.
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

    // 2. Handle device-specific mappings (Sensors)
    if (deviceInfo?.type === DeviceType.Sensor && deviceInfo.subtype) {
        // Ensure the sensor subtype exists in the map
        if (deviceInfo.subtype in CANONICAL_STATE_MAP.sensor) {
            const sensorMap = CANONICAL_STATE_MAP.sensor[deviceInfo.subtype as keyof typeof CANONICAL_STATE_MAP.sensor];
            // Ensure the specific state exists for that sensor subtype
            if (state in sensorMap) {
                 return sensorMap[state as SensorAlertState];
            }
        }
    }

    // No mapping found
    console.warn(`[intermediateStateToDisplayString] No display mapping found for state '${state}' with device info:`, deviceInfo);
    return undefined;
} 