'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Power as PowerIcon, PowerOff as PowerOffIcon, Lock as LockIcon, Unlock as UnlockIcon } from 'lucide-react';
import { useFusionStore } from '@/stores/store';
import { ActionableState, DeviceType, type DisplayState, ON, LOCKED } from '@/lib/mappings/definitions';
import { cn } from '@/lib/utils';

export interface QuickDeviceActionsProps {
  internalDeviceId: string;
  connectorCategory: string | undefined | null;
  deviceType: DeviceType;
  displayState?: DisplayState;
  className?: string;
  size?: 'sm' | 'md';
}

/**
 * Renders explicit quick action buttons for supported connector/device types.
 * - YoLink Switch/Outlet: Turn On, Turn Off
 * - Genea Door: Lock, Unlock
 */
export function QuickDeviceActions({
  internalDeviceId,
  connectorCategory,
  deviceType,
  displayState,
  className,
  size = 'sm',
}: QuickDeviceActionsProps) {
  const { executeDeviceAction, deviceActionLoading } = useFusionStore((state) => ({
    executeDeviceAction: state.executeDeviceAction,
    deviceActionLoading: state.deviceActionLoading,
  }));

  const isLoading = deviceActionLoading.get(internalDeviceId) ?? false;
  const buttonSize = size === 'sm' ? 'sm' : undefined;

  const isYoLinkSwitchOrOutlet =
    connectorCategory === 'yolink' &&
    (deviceType === DeviceType.Switch || deviceType === DeviceType.Outlet);

  const isGeneaDoor = connectorCategory === 'genea' && deviceType === DeviceType.Door;

  if (!isYoLinkSwitchOrOutlet && !isGeneaDoor) {
    return null;
  }

  // Derive label, icon, and target action from current status
  const isOn = displayState === ON;
  const isLocked = displayState === LOCKED;

  let label: string | undefined;
  let ariaLabel: string | undefined;
  let IconComp: React.ComponentType<any> | undefined;
  let nextAction: ActionableState | undefined;

  if (isYoLinkSwitchOrOutlet) {
    if (isOn) {
      label = 'Turn Off';
      ariaLabel = 'Turn Off';
      IconComp = PowerOffIcon;
      nextAction = ActionableState.SET_OFF;
    } else {
      label = 'Turn On';
      ariaLabel = 'Turn On';
      IconComp = PowerIcon;
      nextAction = ActionableState.SET_ON;
    }
  } else if (isGeneaDoor) {
    if (isLocked) {
      label = 'Unlock';
      ariaLabel = 'Unlock';
      IconComp = UnlockIcon;
      nextAction = ActionableState.SET_UNLOCKED;
    } else {
      label = 'Lock';
      ariaLabel = 'Lock';
      IconComp = LockIcon;
      nextAction = ActionableState.SET_LOCKED;
    }
  }

  if (!label || !nextAction || !IconComp) {
    return null;
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Button
        variant="outline"
        size={buttonSize}
        className="h-7 px-2 text-xs"
        aria-label={ariaLabel}
        onClick={() => executeDeviceAction(internalDeviceId, nextAction as ActionableState)}
        disabled={isLoading}
      >
        {isLoading ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <>
            <IconComp className="h-3 w-3" />
            {label}
          </>
        )}
      </Button>
    </div>
  );
}

export default QuickDeviceActions;


