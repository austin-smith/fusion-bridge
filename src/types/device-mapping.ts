export enum DeviceType {
  Alarm = 'Alarm',
  Camera = 'Camera',
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
  Unknown = 'Unknown',
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
  TemperatureHumidity = 'Temperature & Humidity',
  Vibration = 'Vibration',
  WaterDepth = 'Water Depth',
  // Switch
  Dimmer = 'Dimmer',
  Finger = 'Finger',
  Toggle = 'Toggle',
  // Encoder
  Encoder = 'Encoder',
}

// --- Mapped Type Approach ---

// 1. Define the valid relationships between Type and Subtype
type SubtypeMap = {
  [DeviceType.Alarm]: DeviceSubtype.Siren;
  [DeviceType.Camera]: never;
  [DeviceType.GarageDoor]: never;
  [DeviceType.Encoder]: DeviceSubtype.Encoder;
  [DeviceType.Hub]: DeviceSubtype.Cellular | DeviceSubtype.Generic | DeviceSubtype.Speaker;
  [DeviceType.IOModule]: never;
  [DeviceType.Lock]: never;
  [DeviceType.Outlet]: DeviceSubtype.Multi | DeviceSubtype.Single;
  [DeviceType.Sensor]: DeviceSubtype.COSmoke | DeviceSubtype.Contact | DeviceSubtype.Leak | DeviceSubtype.Motion | DeviceSubtype.PowerFailure | DeviceSubtype.TemperatureHumidity | DeviceSubtype.Vibration | DeviceSubtype.WaterDepth;
  [DeviceType.Sprinkler]: never;
  [DeviceType.Switch]: DeviceSubtype.Dimmer | DeviceSubtype.Finger | DeviceSubtype.Toggle;
  [DeviceType.Thermostat]: never;
  [DeviceType.Unknown]: never;
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

// Interface for the return type of the mapping function
// export interface DeviceTypeInfo {
//   type: DeviceType;
//   subtype?: DeviceSubtype;
// } 