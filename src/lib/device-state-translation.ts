/**
 * Device state translation utilities.
 * Handles translation from raw connector-specific states to standardized display states.
 */
import { DeviceType, DeviceSubtype, TypedDeviceInfo, IntermediateState, DisplayState } from '@/types/device-mapping';
import { getDeviceTypeInfo } from '@/lib/device-mapping';
import { intermediateStateToDisplayString, TypedDeviceInfo as IDeviceInfo } from '@/lib/device-mapping';
import { translateYoLinkState } from '@/lib/mappings/yolink';

// Add other connector imports as they become available
// import { translatePikoState } from '@/lib/mappings/piko';

// Type for a map of connector categories to their state translator functions
type ConnectorTranslators = {
  [connectorCategory: string]: (deviceInfo: IDeviceInfo, payloadData: Record<string, any> | null | undefined) => IntermediateState | undefined;
};

// Map of connector categories to their respective translation functions
const connectorTranslators: ConnectorTranslators = {
  yolink: translateYoLinkState,
  // Add other connectors as they become available
  // piko: translatePikoState,
};

/**
 * Translates a raw device state into a standardized display string.
 * 
 * @param connectorCategory The connector category (e.g., 'yolink', 'piko')
 * @param deviceIdentifier The device identifier (used ONLY for getDeviceTypeInfo, not passed down)
 * @param payloadData The relevant part of the event payload (e.g., event.payload.data)
 * @returns The standardized display string, or undefined if translation fails
 */
export function translateDeviceState(
  connectorCategory: string | null | undefined,
  deviceIdentifier: string | null | undefined,
  payloadData: Record<string, any> | null | undefined
): DisplayState | undefined {
  // 1. Return undefined for missing inputs (deviceIdentifier is needed for type lookup)
  if (!connectorCategory || !deviceIdentifier) {
    console.warn("[translateDeviceState] Missing connectorCategory or deviceIdentifier.");
    return undefined;
  }

  // 2. Normalize connector category (lowercase)
  const normalizedCategory = connectorCategory.toLowerCase();

  // 3. Get standardized device type information
  const deviceInfo: IDeviceInfo = getDeviceTypeInfo(normalizedCategory, deviceIdentifier);

  // If device is Unmapped, we can often skip translation
  if (deviceInfo.type === DeviceType.Unmapped) {
    // Optionally log: console.log(`[translateDeviceState] Skipping translation for Unmapped device: ${deviceIdentifier}`);
    return undefined;
  }

  // 4. Get the appropriate translator for this connector
  const translator = connectorTranslators[normalizedCategory];
  if (!translator) {
    console.warn(`No state translator available for connector: ${normalizedCategory}`);
    return undefined;
  }

  // 5. Translate raw state to intermediate state using the payload
  const intermediateState = translator(deviceInfo, payloadData);
  if (!intermediateState) {
    // Translator itself should log specifics if needed
    console.warn(`[translateDeviceState] Connector translator failed for ${deviceIdentifier} (${connectorCategory}). Payload: ${JSON.stringify(payloadData)}`);
    return undefined;
  }

  // 6. Convert intermediate state to display string
  const displayState = intermediateStateToDisplayString(intermediateState, deviceInfo);
  if (!displayState) {
    console.warn(`Failed to convert intermediate state to display string for ${deviceIdentifier} (${connectorCategory})`);
    return undefined;
  }

  return displayState;
}

/**
 * Type for a device state event with standardized fields.
 */
export interface DeviceStateEvent {
  deviceId: string;
  connectorCategory: string;
  deviceIdentifier: string;
  rawState: string;
  displayState?: DisplayState;
  timestamp: Date;
}

// NOTE: processDeviceStateEvent is likely no longer needed if translation happens in the API route
// export function processDeviceStateEvent(event: DeviceStateEvent): DeviceStateEvent { ... } 