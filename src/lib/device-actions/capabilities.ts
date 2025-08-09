import { ActionableState, DeviceType } from '@/lib/mappings/definitions';

// Centralized, client-safe capability map: which state actions are allowed per connector & device type
export const SUPPORTED_DEVICE_ACTIONS: Record<string, Partial<Record<DeviceType, readonly ActionableState[]>>> = {
  yolink: {
    [DeviceType.Switch]: [ActionableState.SET_ON, ActionableState.SET_OFF],
    [DeviceType.Outlet]: [ActionableState.SET_ON, ActionableState.SET_OFF],
  },
  genea: {
    [DeviceType.Door]: [ActionableState.SET_LOCKED, ActionableState.SET_UNLOCKED],
  },
};

export function getSupportedStateActions(
  connectorCategory: string | undefined | null,
  deviceType: DeviceType
): readonly ActionableState[] {
  if (!connectorCategory) return [] as const;
  const byDeviceType = SUPPORTED_DEVICE_ACTIONS[connectorCategory];
  if (!byDeviceType) return [] as const;
  return (byDeviceType[deviceType] ?? []) as readonly ActionableState[];
}

export function isActionSupported(
  connectorCategory: string | undefined | null,
  deviceType: DeviceType,
  action: ActionableState
): boolean {
  return getSupportedStateActions(connectorCategory, deviceType).includes(action);
}


