import { ActionableState, DeviceType } from '@/lib/mappings/definitions';
import { getDeviceTypeInfo } from '@/lib/mappings/identification';

/**
 * Central, client-safe capability registry.
 * Defines which abstract state actions are exposed for a given connector category and standardized DeviceType.
 *
 * This drives UI availability only; execution is still validated server-side by handlers.
 */
export const SUPPORTED_DEVICE_ACTIONS: Record<string, Partial<Record<DeviceType, readonly ActionableState[]>>> = {
  yolink: {
    [DeviceType.Switch]: [ActionableState.SET_ON, ActionableState.SET_OFF],
    [DeviceType.Outlet]: [ActionableState.SET_ON, ActionableState.SET_OFF],
  },
  genea: {
    [DeviceType.Door]: [
      ActionableState.SET_LOCKED,
      ActionableState.SET_UNLOCKED,
      ActionableState.QUICK_GRANT,
    ],
  },
};

/**
 * Looks up the list of supported state actions for a connector/device combination.
 * Returns an empty list if the connector or device type has no declared actions.
 */
export function getSupportedStateActions(
  connectorCategory: string | undefined | null,
  deviceType: DeviceType
): readonly ActionableState[] {
  if (!connectorCategory) return [] as const;
  const byDeviceType = SUPPORTED_DEVICE_ACTIONS[connectorCategory];
  if (!byDeviceType) return [] as const;
  return (byDeviceType[deviceType] ?? []) as readonly ActionableState[];
}

/**
 * Returns true if a specific action is listed as supported for the connector/device combination.
 */
export function isActionSupported(
  connectorCategory: string | undefined | null,
  deviceType: DeviceType,
  action: ActionableState
): boolean {
  return getSupportedStateActions(connectorCategory, deviceType).includes(action);
}

/**
 * Convenience: returns true only if both SET_ON and SET_OFF are supported.
 * Used to gate the Set Device State UI to devices that truly support on/off.
 */
export function isOnOffCapable(
  connectorCategory: string | undefined | null,
  deviceType: DeviceType
): boolean {
  const actions = getSupportedStateActions(connectorCategory, deviceType);
  return actions.includes(ActionableState.SET_ON) && actions.includes(ActionableState.SET_OFF);
}

/**
 * Returns strictly the on/off actions when both are supported; otherwise returns an empty array.
 */
export function getOnOffActions(
  connectorCategory: string | undefined | null,
  deviceType: DeviceType
): ActionableState[] {
  return isOnOffCapable(connectorCategory, deviceType)
    ? [ActionableState.SET_ON, ActionableState.SET_OFF]
    : [];
}

/**
 * Returns true if any lock/unlock/quick-grant action is supported for the connector/device combination.
 */
export function isAccessControlCapable(
  connectorCategory: string | undefined | null,
  deviceType: DeviceType
): boolean {
  const actions = getSupportedStateActions(connectorCategory, deviceType);
  return actions.some(a =>
    a === ActionableState.SET_LOCKED ||
    a === ActionableState.SET_UNLOCKED ||
    a === ActionableState.QUICK_GRANT
  );
}

/**
 * Lightweight device option shape accepted by UI helpers.
 * Only minimal fields required to derive standardized DeviceType.
 */
export type DeviceOptionLike = {
  connectorCategory?: string | null;
  displayType?: string;
  rawType?: string;
  standardDeviceType?: DeviceType;
};

/**
 * Derives the standardized DeviceType from a UI device option by consulting the shared identification map.
 * If no mapping is found for any of the provided identifiers, returns DeviceType.Unmapped.
 * No connector- or label-specific heuristics are applied here.
 */
export function inferStandardDeviceTypeFromOption(option: DeviceOptionLike): DeviceType {
  const connectorCategory = option.connectorCategory ?? null;
  const identifierCandidates = [option.rawType, option.displayType].filter(Boolean) as string[];

  // Prefer explicitly provided standardized type when present
  if (option.standardDeviceType && option.standardDeviceType !== DeviceType.Unmapped) {
    return option.standardDeviceType;
  }

  if (connectorCategory && identifierCandidates.length > 0) {
    for (const id of identifierCandidates) {
      const info = getDeviceTypeInfo(connectorCategory, id);
      if (info?.type && info.type !== DeviceType.Unmapped) {
        return info.type;
      }
    }
  }

  return DeviceType.Unmapped;
}

/**
 * UI helper: true if the option resolves to a device type that supports explicit on/off in SUPPORTED_DEVICE_ACTIONS.
 */
export function isOnOffCapableOption(option: DeviceOptionLike): boolean {
  const connectorCategory = option.connectorCategory ?? null;
  const inferredType = inferStandardDeviceTypeFromOption(option);
  return isOnOffCapable(connectorCategory, inferredType);
}

/**
 * UI helper: true if the option resolves to a device type that supports at least one access-control action
 * (lock, unlock, quick grant) in SUPPORTED_DEVICE_ACTIONS.
 */
export function isAccessControlCapableOption(option: DeviceOptionLike): boolean {
  const connectorCategory = option.connectorCategory ?? null;
  const inferredType = inferStandardDeviceTypeFromOption(option);
  return isAccessControlCapable(connectorCategory, inferredType);
}

/**
 * UI helper: returns [SET_ON, SET_OFF] when the option resolves to an on/off-capable device; otherwise [].
 */
export function getOnOffActionsForOption(option: DeviceOptionLike): ActionableState[] {
  const connectorCategory = option.connectorCategory ?? null;
  const inferredType = inferStandardDeviceTypeFromOption(option);
  return getOnOffActions(connectorCategory, inferredType);
}

/**
 * Central registry of which connector categories support device renaming.
 */
export const RENAMEABLE_CONNECTOR_CATEGORIES = ['piko', 'genea'] as const;

/**
 * Returns true if the connector category supports device renaming.
 */
export function isRenameSupported(connectorCategory: string | undefined | null): boolean {
  if (!connectorCategory) return false;
  return RENAMEABLE_CONNECTOR_CATEGORIES.includes(connectorCategory as any);
}

/**
 * UI helper: returns true if the device option resolves to a renameable device.
 */
export function isRenameableOption(option: DeviceOptionLike): boolean {
  return isRenameSupported(option.connectorCategory);
}


