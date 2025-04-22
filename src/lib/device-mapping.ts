import { DeviceType, DeviceSubtype, TypedDeviceInfo } from '@/types/device-mapping';
import type { LucideIcon } from 'lucide-react';
import {
  Siren,
  Cctv,
  Warehouse,
  Combine,
  Router,
  Cable,
  Lock,
  Power,
  Radar,
  Droplets,
  ToggleLeft,
  Thermometer,
  HelpCircle,
} from 'lucide-react';

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
  [DeviceType.Sensor]: Radar,
  [DeviceType.Sprinkler]: Droplets,
  [DeviceType.Switch]: ToggleLeft,
  [DeviceType.Thermostat]: Thermometer,
  [DeviceType.Unknown]: HelpCircle,
};

// Raw identifier to Type/Subtype mapping, now conforming to TypedDeviceInfo union members
const deviceIdentifierMap: Record<string, TypedDeviceInfo> = {
  // YoLink Identifiers
  'COSmokeSensor': { type: DeviceType.Sensor, subtype: DeviceSubtype.COSmoke },
  'CSDevice': { type: DeviceType.Unknown },
  'CellularHub': { type: DeviceType.Hub, subtype: DeviceSubtype.Cellular },
  'Dimmer': { type: DeviceType.Switch, subtype: DeviceSubtype.Dimmer },
  'DoorSensor': { type: DeviceType.Sensor, subtype: DeviceSubtype.Contact },
  'Finger': { type: DeviceType.Switch, subtype: DeviceSubtype.Finger },
  'GarageDoor': { type: DeviceType.GarageDoor },
  'Hub': { type: DeviceType.Hub, subtype: DeviceSubtype.Generic },
  'IPCamera': { type: DeviceType.Camera },
  'InfraredRemoter': { type: DeviceType.Unknown },
  'LeakSensor': { type: DeviceType.Sensor, subtype: DeviceSubtype.Leak },
  'Lock': { type: DeviceType.Lock },
  'Manipulator': { type: DeviceType.Unknown },
  'MotionSensor': { type: DeviceType.Sensor, subtype: DeviceSubtype.Motion },
  'MultiOutlet': { type: DeviceType.Outlet, subtype: DeviceSubtype.Multi },
  'Outlet': { type: DeviceType.Outlet, subtype: DeviceSubtype.Single },
  'PowerFailureAlarm': { type: DeviceType.Sensor, subtype: DeviceSubtype.PowerFailure },
  'Siren': { type: DeviceType.Alarm, subtype: DeviceSubtype.Siren },
  'SmartRemoter': { type: DeviceType.Unknown },
  'SpeakerHub': { type: DeviceType.Hub, subtype: DeviceSubtype.Speaker },
  'Sprinkler': { type: DeviceType.Sprinkler },
  'Switch': { type: DeviceType.Switch, subtype: DeviceSubtype.Toggle },
  'THSensor': { type: DeviceType.Sensor, subtype: DeviceSubtype.TemperatureHumidity },
  'Thermostat': { type: DeviceType.Thermostat },
  'VibrationSensor': { type: DeviceType.Sensor, subtype: DeviceSubtype.Vibration },
  'WaterDepthSensor': { type: DeviceType.Sensor, subtype: DeviceSubtype.WaterDepth },
  'WaterMeterController': { type: DeviceType.Unknown },

  // Piko Identifiers
  'Camera': { type: DeviceType.Camera },
  'Encoder': { type: DeviceType.Encoder, subtype: DeviceSubtype.Encoder },
  'IOModule': { type: DeviceType.IOModule },
  'HornSpeaker': { type: DeviceType.Alarm, subtype: DeviceSubtype.Siren },
  'MultisensorCamera': { type: DeviceType.Camera },
};

// Define the default "Unknown" type info explicitly
const unknownDeviceInfo: TypedDeviceInfo = { type: DeviceType.Unknown };

/**
 * Gets the standardized device type information based on connector category and identifier.
 * @param connectorCategory The category of the connector ('yolink', 'piko', etc.) - currently unused but kept for potential future differentiation.
 * @param identifier The raw device type identifier (e.g., 'COSmokeSensor', 'Camera')
 * @returns A TypedDeviceInfo object representing the mapped type and subtype.
 */
export function getDeviceTypeInfo(connectorCategory: string, identifier: string | null | undefined): TypedDeviceInfo {
  if (!identifier) {
    return unknownDeviceInfo;
  }

  // Piko identifiers might clash with YoLink if we don't check category first
  // For now, the provided map handles specific Piko types.
  // If a Piko device uses an identifier also used by YoLink, we might need category-specific maps.
  // Example: If Piko had a 'Switch', we'd need to differentiate.

  const mapping = deviceIdentifierMap[identifier];

  if (mapping) {
    return mapping; // Return the pre-defined object which conforms to TypedDeviceInfo
  }

  // If no specific mapping is found, return the default Unknown object
  console.warn(`No type mapping found for identifier: ${identifier} (Category: ${connectorCategory}). Defaulting to Unknown.`);
  return unknownDeviceInfo;
}

// --- Helper function to get icon component ---
export function getDeviceTypeIcon(deviceType: DeviceType): LucideIcon {
    return deviceTypeIcons[deviceType] || HelpCircle; // Fallback to Unknown icon
} 