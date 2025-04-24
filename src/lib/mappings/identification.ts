import { DeviceType, DeviceSubtype, TypedDeviceInfo, ConnectorCategory } from './definitions';

// Map: Connector Category -> Device Identifier -> Standardized Type Info
export const deviceIdentifierMap: Partial<Record<ConnectorCategory, Record<string, TypedDeviceInfo>>> = {
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
  piko: { // Map from Piko's `deviceType` string
    'Camera': { type: DeviceType.Camera },
    'Encoder': { type: DeviceType.Encoder },
    'IOModule': { type: DeviceType.IOModule },
    'HornSpeaker': { type: DeviceType.Alarm, subtype: DeviceSubtype.Siren },
    'MultisensorCamera': { type: DeviceType.Camera },
    // Add more known Piko deviceType strings here as needed
  },
  // Add other connector categories as needed
};

// Define the default "Unmapped" type info explicitly
const unknownDeviceInfo: TypedDeviceInfo = { type: DeviceType.Unmapped };

/**
 * Gets the standardized device type information based on connector category and identifier.
 * @param connectorCategory The category of the connector ('yolink', 'piko', etc.)
 * @param identifier The raw device type identifier. 
 *                   For YoLink, this is like 'COSmokeSensor'.
 *                   For Piko, this should be the `deviceType` string (e.g., 'Camera') obtained 
 *                   by looking up the event's resource GUID in the fetched device map.
 * @returns A TypedDeviceInfo object representing the mapped type and subtype.
 */
export function getDeviceTypeInfo(connectorCategory: ConnectorCategory | string | null | undefined, identifier: string | null | undefined): TypedDeviceInfo {
  if (!identifier || !connectorCategory) {
    return unknownDeviceInfo;
  }

  const categoryKey = connectorCategory.toLowerCase() as ConnectorCategory;
  
  // Fetch the map for the specific connector category
  const categoryMap = deviceIdentifierMap[categoryKey];

  if (!categoryMap) {
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