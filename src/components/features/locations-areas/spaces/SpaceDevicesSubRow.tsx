'use client';

import React, { useMemo } from 'react';
import type { Space, DeviceWithConnector } from '@/types/index';
import { Badge } from "@/components/ui/badge";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { ConnectorIcon } from "@/components/features/connectors/connector-icon";
import { getDeviceTypeIcon, getDisplayStateIcon, getDisplayStateColorClass } from "@/lib/mappings/presentation";
import { HelpCircle, Info, Cpu, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { DeviceDetailDialogContent } from '@/components/features/devices/device-detail-dialog-content';
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { getDeviceTypeInfo } from "@/lib/mappings/identification";

interface SpaceDevicesSubRowProps {
  space: Space;
  allDevices: DeviceWithConnector[];
  onAssignDevice?: (space: Space) => void;
}

// Simple Device Item Component (no drag/drop)
interface DeviceItemProps {
  device: DeviceWithConnector;
}

const DeviceItem: React.FC<DeviceItemProps> = ({ device }) => {
  const typeInfo = device.deviceTypeInfo;
  const IconComponent = typeInfo ? getDeviceTypeIcon(typeInfo.type) : HelpCircle;
  const typeText = typeInfo ? typeInfo.type : "Unknown";
  const subtypeText = typeInfo?.subtype;
  const displayState = device.displayState;
  const StateIconComponent = displayState ? getDisplayStateIcon(displayState) : undefined;
  const stateColorClass = getDisplayStateColorClass(displayState);

  return (
    <div className="relative p-3 border rounded-md bg-background flex flex-col gap-2 h-full justify-between transition-colors duration-200 ease-in-out hover:bg-muted/50">
      <div className="flex items-center justify-between gap-1 min-w-0">
        <span className="font-medium text-sm truncate flex-grow" title={device.name}>
          {device.name}
        </span>
        <Dialog>
          <DialogTrigger asChild>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-6 w-6 flex-shrink-0 -mr-1 text-muted-foreground hover:text-foreground"
              title={`Details for ${device.name}`}
            >
              <Info className="h-3.5 w-3.5" />
              <span className="sr-only">View Details for {device.name}</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px]">
            <DeviceDetailDialogContent device={{
              ...device,
              internalId: device.id,
              deviceTypeInfo: device.deviceTypeInfo ?? getDeviceTypeInfo('unknown', 'unknown'),
              connectorName: device.connectorName ?? device.connectorCategory, 
              url: device.url ?? undefined,
              model: device.model ?? undefined,
              vendor: device.vendor ?? undefined,
              serverName: device.serverName ?? undefined,
              serverId: device.serverId ?? undefined
            }} />
          </DialogContent>
        </Dialog>
      </div>
      <Separator className="my-0.5" />
      <div className="flex items-center justify-between min-w-0 text-xs">
        <TooltipProvider delayDuration={100}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="secondary" className="inline-flex items-center gap-1 pl-1 pr-1.5 py-0.5 font-normal min-w-0">
                <ConnectorIcon connectorCategory={device.connectorCategory} size={13} className="flex-shrink-0" />
                <span className="text-xs truncate">
                  {typeText}
                  {subtypeText && (
                    <span className="text-muted-foreground ml-0.5">/{subtypeText}</span>
                  )}
                </span>
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p>Connector: {device.connectorName ?? device.connectorCategory}</p>
              <p>Type: {typeText}{subtypeText ? ` / ${subtypeText}` : ''}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <div className="flex items-center gap-1.5 min-w-0">
          {StateIconComponent ? (
            <StateIconComponent className={cn("h-3.5 w-3.5 flex-shrink-0", stateColorClass)} />
          ) : (
            <div className="h-3.5 w-3.5 flex-shrink-0" />
          )}
          <span className={cn("truncate", stateColorClass)}> 
            {displayState ?? 'State Unknown'}
          </span>
        </div>
      </div>
    </div>
  );
};

// Main SpaceDevicesSubRow Component
export const SpaceDevicesSubRow: React.FC<SpaceDevicesSubRowProps> = ({ 
  space, 
  allDevices,
  onAssignDevice
}) => {
  const assignedDeviceIds = useMemo(() => new Set(space.deviceIds || []), [space.deviceIds]);

  const assignedDevice = useMemo(() => {
    return allDevices.find(device => assignedDeviceIds.has(device.id));
  }, [allDevices, assignedDeviceIds]);

  if (!assignedDevice) {
    return (
      <div className="bg-muted/25 p-6 flex flex-col items-center justify-center text-center">
        <div className="rounded-full bg-muted p-3 mb-3 inline-flex">
          <Cpu className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground max-w-md mb-3">
          No device assigned to this space. Assign a device to define this physical location.
        </p>
        {onAssignDevice && (
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => onAssignDevice(space)} 
            className="gap-1"
          >
            <Plus className="h-3.5 w-3.5" /> Assign Device
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="bg-muted/25 px-4 py-4">
      <h5 className="text-xs font-semibold uppercase text-muted-foreground mb-2 tracking-wide flex items-center gap-2">
        <Cpu className="h-3.5 w-3.5" />
        <span className="flex-grow">Assigned Device</span>
      </h5>
      <Separator className="my-2 mb-3" />
      <div className="max-w-sm">
        <DeviceItem device={assignedDevice} />
      </div>
    </div>
  );
}; 