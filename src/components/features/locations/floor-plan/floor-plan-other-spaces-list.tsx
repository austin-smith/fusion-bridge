'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Cpu } from 'lucide-react';
import { getDeviceTypeIcon, getDisplayStateIcon, getDisplayStateColorClass } from '@/lib/mappings/presentation';
import { DeviceType, type DisplayState } from '@/lib/mappings/definitions';
import type { DeviceWithConnector } from '@/types';

export interface FloorPlanOtherSpacesListProps {
  devices: DeviceWithConnector[];
  title?: React.ReactNode;
  className?: string;
}

export function FloorPlanOtherSpacesList({ devices, title = 'Other devices in this space', className }: FloorPlanOtherSpacesListProps) {
  if (!devices || devices.length === 0) return null;

  return (
    <div className={cn('mt-2', className)}>
      {title && <div className="text-xs font-medium text-muted-foreground mb-2">{title}</div>}
      <div className="space-y-1.5">
        {devices.map((device) => {
          const TypeIcon = getDeviceTypeIcon(device.deviceTypeInfo?.type ?? DeviceType.Unmapped) || Cpu;
          const displayState = device.displayState as DisplayState | undefined;
          const DisplayIcon = displayState ? getDisplayStateIcon(displayState) : undefined;
          const stateColorClass = getDisplayStateColorClass(displayState);
          const typeText = device.deviceTypeInfo?.type ?? device.type ?? 'Unknown';
          const subtypeText = device.deviceTypeInfo?.subtype;

          return (
            <div key={device.id} className="flex items-center gap-2 p-1.5 rounded border hover:bg-muted/50">
              <TypeIcon className="h-3.5 w-3.5 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium truncate">{device.name}</div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {typeText}
                  {subtypeText ? <span> / {subtypeText}</span> : null}
                </div>
              </div>
              <div className="shrink-0">
                {displayState ? (
                  <Badge variant="outline" className="inline-flex items-center gap-1 px-1.5 py-0.5">
                    {DisplayIcon && <DisplayIcon className={cn('h-3 w-3', stateColorClass)} />}
                    <span className="text-[10px]">{displayState}</span>
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px]">Unknown</Badge>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default FloorPlanOtherSpacesList;


