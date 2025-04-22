import {
  DeviceType,
  DeviceSubtype,
  TypedDeviceInfo,
  // Import the intermediate state enums
  BinaryState,
  ContactState,
  SensorAlertState,
  LockStatus,
  IntermediateState,
} from '@/types/device-mapping';

// Type for the YoLink-specific state mapping structure
// Key: Standard DeviceType
// Key: Standard DeviceSubtype (or 'null' for subtype-less)
// Key: Raw state string from YoLink
// Value: Intermediate State Enum value
type YoLinkStateMap = Partial<Record<
  DeviceType,
  {
    [subtypeKey: string]: Record<string, IntermediateState>; // Value is now IntermediateState
  }
>>;

// --- Common YoLink State Mappings (to Intermediate Enums) ---
// Defined consistently, regardless of current reuse count within this file.

const yoLinkLockStates: Record<string, LockStatus> = {
  'locked': LockStatus.Locked,
  'unlocked': LockStatus.Unlocked,
};

const yoLinkBinaryStates: Record<string, BinaryState> = {
  'open': BinaryState.On,
  'closed': BinaryState.Off,
};

const yoLinkContactStates: Record<string, ContactState> = {
  'open': ContactState.Open,
  'closed': ContactState.Closed,
};

const yoLinkAlertStates: Record<string, SensorAlertState> = {
  'normal': SensorAlertState.Normal,
  'alert': SensorAlertState.Alert,
};

// Constant holding the state mappings specifically for YoLink, *consistently* using the definitions above
const yoLinkStateMap: YoLinkStateMap = {
  [DeviceType.Lock]: {
    'null': yoLinkLockStates, // Use Lock constant
  },
  [DeviceType.Outlet]: {
    [DeviceSubtype.Multi]: yoLinkBinaryStates,
    [DeviceSubtype.Single]: yoLinkBinaryStates,
  },
  [DeviceType.Sensor]: {
    [DeviceSubtype.Contact]: yoLinkContactStates, // Use Contact constant
    [DeviceSubtype.Leak]: yoLinkAlertStates,
    [DeviceSubtype.Motion]: yoLinkAlertStates,
    [DeviceSubtype.Vibration]: yoLinkAlertStates,
  },
  [DeviceType.Switch]: {
    [DeviceSubtype.Dimmer]: yoLinkBinaryStates,
    [DeviceSubtype.Toggle]: yoLinkBinaryStates,
  },
};

/**
 * Translates a raw state string from a YoLink device payload into the standardized intermediate state enum.
 * @param deviceInfo A TypedDeviceInfo object containing the standardized type and subtype.
 * @param payloadData The data portion of the YoLink event payload (event.payload.data).
 * @returns The intermediate state enum value or undefined if no mapping exists or state is missing.
 */
export function translateYoLinkState(
  deviceInfo: TypedDeviceInfo,
  payloadData: Record<string, any> | null | undefined // Changed from rawState
): IntermediateState | undefined {
  // --- START DEBUG LOGGING ---
  console.log(`[translateYoLinkState] Input - DeviceInfo: ${JSON.stringify(deviceInfo)}, PayloadData: ${JSON.stringify(payloadData)}`);
  // --- END DEBUG LOGGING ---

  // Extract the raw state string from the payload data
  const rawState = payloadData?.state as string | undefined;

  // Basic validation on extracted state
  if (rawState === undefined || rawState === null) {
    // --- START DEBUG LOGGING ---
    console.log(`[translateYoLinkState] Exit - RawState extracted from payload is null/undefined/missing.`);
    // --- END DEBUG LOGGING ---
    return undefined;
  }
  // --- START DEBUG LOGGING ---
  console.log(`[translateYoLinkState] Extracted RawState (type ${typeof rawState}): ${JSON.stringify(rawState)}`);
  // --- END DEBUG LOGGING ---

  const typeMap = yoLinkStateMap[deviceInfo.type];
  // --- START DEBUG LOGGING ---
  console.log(`[translateYoLinkState] Looked up typeMap for type "${deviceInfo.type}": ${typeMap ? 'Found' : 'NOT Found'}`);
  // --- END DEBUG LOGGING ---
  if (!typeMap) {
    return undefined;
  }

  const subtypeKey = deviceInfo.subtype ?? 'null';
  // --- START DEBUG LOGGING ---
  console.log(`[translateYoLinkState] Determined subtypeKey: "${subtypeKey}"`);
  // --- END DEBUG LOGGING ---

  const stateMap = typeMap[subtypeKey];
  // --- START DEBUG LOGGING ---
  console.log(`[translateYoLinkState] Looked up stateMap for subtypeKey "${subtypeKey}": ${stateMap ? 'Found' : 'NOT Found'}`);
  // --- END DEBUG LOGGING ---
  if (!stateMap) {
    return undefined;
  }

  // Ensure state is a string before lowercasing
  const stateAsString = String(rawState);
  const lowerCaseState = stateAsString.toLowerCase();
  const intermediateState = stateMap[lowerCaseState];
  // --- START DEBUG LOGGING ---
  console.log(`[translateYoLinkState] Looked up intermediateState for lowerCaseState "${lowerCaseState}": ${intermediateState ? 'Found (' + intermediateState + ')' : 'NOT Found'}`);
  // --- END DEBUG LOGGING ---

  return intermediateState;
} 