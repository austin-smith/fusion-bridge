'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, MoreHorizontal } from 'lucide-react';
import { useFusionStore } from '@/stores/store';
import { ActionableState, DeviceType, type DisplayState } from '@/lib/mappings/definitions';
import { cn } from '@/lib/utils';
import { deriveQuickActions } from '@/lib/device-actions/selection';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface QuickDeviceActionsProps {
  internalDeviceId: string;
  connectorCategory: string | undefined | null;
  deviceType: DeviceType;
  displayState?: DisplayState;
  className?: string;
  size?: 'sm' | 'md';
  showSecondary?: boolean;
  secondaryVariant?: 'buttons' | 'menu';
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
  showSecondary = false,
  secondaryVariant = 'buttons',
}: QuickDeviceActionsProps) {
  const { executeDeviceAction, deviceActionLoading } = useFusionStore((state) => ({
    executeDeviceAction: state.executeDeviceAction,
    deviceActionLoading: state.deviceActionLoading,
  }));

  const isLoading = deviceActionLoading.get(internalDeviceId) ?? false;
  const buttonSize = size === 'sm' ? 'sm' : undefined;

  const { primary, secondary } = deriveQuickActions({
    connectorCategory,
    deviceType,
    displayState,
  });
  if (!primary) return null;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Button
        variant="outline"
        size={buttonSize}
        className="h-7 px-2 text-xs"
        aria-label={primary.label}
        onClick={() => executeDeviceAction(internalDeviceId, primary.action)}
        disabled={isLoading}
      >
        {isLoading ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <>
            <primary.icon className="h-3 w-3" />
            {primary.label}
          </>
        )}
      </Button>
      {showSecondary && secondary.length > 0 && (
        secondaryVariant === 'buttons' ? (
          <div className="flex items-center gap-2">
            {secondary.map((s) => (
              <Button
                key={s.action}
                variant="outline"
                size={buttonSize}
                className="h-7 px-2 text-xs"
                aria-label={s.label}
                onClick={() => executeDeviceAction(internalDeviceId, s.action)}
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <>
                    <s.icon className="h-3 w-3" />
                    {s.label}
                  </>
                )}
              </Button>
            ))}
          </div>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size={buttonSize}
                className="h-7 px-1 text-xs"
                aria-label="More actions"
                disabled={isLoading}
              >
                <MoreHorizontal className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {secondary.map((s) => (
                <DropdownMenuItem
                  key={s.action}
                  onClick={() => executeDeviceAction(internalDeviceId, s.action)}
                  disabled={isLoading}
                >
                  <s.icon className="h-3 w-3" />
                  <span className="text-xs">{s.label}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      )}
    </div>
  );
}

export default QuickDeviceActions;


