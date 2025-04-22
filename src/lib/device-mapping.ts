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
  [DeviceType.Sensor]: Radar,
  [DeviceType.Sprinkler]: Droplets,
  [DeviceType.Switch]: ToggleLeft,
  [DeviceType.Thermostat]: Thermometer,
  [DeviceType.Unknown]: HelpCircle,
};

// Restructured identifier map: Record<ConnectorCategory, Record<Identifier, TypedDeviceInfo>>
export const deviceIdentifierMap: Record<string, Record<string, TypedDeviceInfo>> = {
  yolink: {
    'COSmokeSensor': { type: DeviceType.Sensor, subtype: DeviceSubtype.COSmoke },
    'CSDevice': { type: DeviceType.Unknown },
    'CellularHub': { type: DeviceType.Hub, subtype: DeviceSubtype.Cellular },
    'Dimmer': { type: DeviceType.Switch, subtype: DeviceSubtype.Dimmer },
    'DoorSensor': { type: DeviceType.Sensor, subtype: DeviceSubtype.Contact },
    'Finger': { type: DeviceType.Switch, subtype: DeviceSubtype.Finger },
    'GarageDoor': { type: DeviceType.GarageDoor },
    'Hub': { type: DeviceType.Hub, subtype: DeviceSubtype.Generic },
    'IPCamera': { type: DeviceType.Camera }, // Note: YoLink specific Camera type?
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
  },
  piko: {
    'Camera': { type: DeviceType.Camera },
    'Encoder': { type: DeviceType.Encoder, subtype: DeviceSubtype.Encoder },
    'IOModule': { type: DeviceType.IOModule },
    'HornSpeaker': { type: DeviceType.Alarm, subtype: DeviceSubtype.Siren },
    'MultisensorCamera': { type: DeviceType.Camera },
  },
};

// Define the default "Unknown" type info explicitly
const unknownDeviceInfo: TypedDeviceInfo = { type: DeviceType.Unknown };

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