'use client';

import React, { useMemo } from 'react';
import type { AlarmZone, DeviceWithConnector } from '@/types/index';
import { Badge } from "@/components/ui/badge";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { ConnectorIcon } from "@/components/features/connectors/connector-icon";
import { getDeviceTypeIcon, getDisplayStateIcon, getDisplayStateColorClass } from "@/lib/mappings/presentation";
import { HelpCircle, Info, Cpu, Plus, Shield } from 'lucide-react';
import type { DeviceType } from "@/lib/mappings/definitions";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { DeviceDetailDialogContent } from '@/components/features/devices/device-detail-dialog-content';
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { getDeviceTypeInfo } from "@/lib/mappings/identification";

interface AlarmZoneDevicesSubRowProps {
  zone: AlarmZone;
  allDevices: DeviceWithConnector[];
  onAssignDevices?: (zone: AlarmZone) => void;
}

// Draggable Device Item Component
interface DraggableDeviceItemProps {
    device: DeviceWithConnector;
    sourceZoneId: string;
}

const DraggableDeviceItem: React.FC<DraggableDeviceItemProps> = ({ device, sourceZoneId }) => {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: device.id,
        data: {
            type: 'device',
            sourceZoneId: sourceZoneId,
            deviceDetails: device
        }
    });

    const style = transform ? {
        transform: CSS.Translate.toString(transform),
    } : undefined;

    const typeInfo = device.deviceTypeInfo;
    const IconComponent = typeInfo ? getDeviceTypeIcon(typeInfo.type) : HelpCircle;
    const typeText = typeInfo ? typeInfo.type : "Unknown";
    const subtypeText = typeInfo?.subtype;
    const displayState = device.displayState;
    const StateIconComponent = displayState ? getDisplayStateIcon(displayState) : undefined;
    const stateColorClass = getDisplayStateColorClass(displayState);

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                "relative p-3 border rounded-md bg-background flex flex-col gap-2 h-full justify-between transition-opacity duration-200 ease-in-out group cursor-grab",
                isDragging ? 'opacity-50 z-50 shadow-lg' : 'hover:bg-muted/50'
            )}
            {...listeners} 
            {...attributes} 
        >
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
                           serverId: device.serverId ?? undefined,
                           rawDeviceData: device.rawDeviceData ?? undefined
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

// Main AlarmZoneDevicesSubRow Component
export const AlarmZoneDevicesSubRow: React.FC<AlarmZoneDevicesSubRowProps> = ({ 
  zone, 
  allDevices,
  onAssignDevices,
}) => {
  const assignedDeviceIds = useMemo(() => new Set(zone.deviceIds || []), [zone.deviceIds]);

  const assignedDevicesInZone = useMemo(() => {
    return allDevices.filter(device => assignedDeviceIds.has(device.id));
  }, [allDevices, assignedDeviceIds]);

  const groupedDevices = useMemo(() => {
    const groups: Record<string, DeviceWithConnector[]> = {};
    assignedDevicesInZone.forEach(device => {
        const type = device.deviceTypeInfo?.type ?? "Unknown";
        if (!groups[type]) groups[type] = [];
        groups[type].push(device);
    });
    Object.values(groups).forEach(group => group.sort((a, b) => a.name.localeCompare(b.name)));
    const sortedGroupEntries = Object.entries(groups).sort(([typeA], [typeB]) => typeA.localeCompare(typeB));
    return Object.fromEntries(sortedGroupEntries);
  }, [assignedDevicesInZone]);

  const totalDeviceCount = assignedDevicesInZone.length;

  if (totalDeviceCount === 0) {
    return (
      <div className="bg-muted/25 p-6 flex flex-col items-center justify-center text-center">
        <div className="rounded-full bg-muted p-3 mb-3 inline-flex">
          <Shield className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground max-w-md mb-3">
          No devices assigned to this alarm zone. Assign devices to monitor them for security events.
        </p>
        {onAssignDevices && (
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => onAssignDevices(zone)} 
            className="gap-1"
          >
            <Plus className="h-3.5 w-3.5" /> Assign Devices
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="bg-muted/25 px-4 py-4">
      {Object.entries(groupedDevices).map(([type, devicesInGroup]) => {
          const GroupIcon = type !== "Unknown" ? getDeviceTypeIcon(type as DeviceType) : HelpCircle;
          
          return (
            <React.Fragment key={type}>
              <h5 key={`${type}-header`} className="text-xs font-semibold uppercase text-muted-foreground mb-2 tracking-wide flex items-center gap-2"> 
                 <GroupIcon className="h-3.5 w-3.5" /> 
                 <span className="flex-grow">{type}</span>
                 <Badge variant="secondary" className="px-1.5 py-0.5 text-xs font-medium"> 
                   {devicesInGroup.length}
                 </Badge>
              </h5>
              <Separator key={`${type}-separator`} className="my-2 mb-3" />
              <div 
                key={`${type}-grid`}
                className={cn(
                  "grid gap-2 mb-4",
                  "grid-cols-1 sm:grid-cols-2 md:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] lg:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]"
                )}>
                {devicesInGroup.map(device => (
                  <DraggableDeviceItem 
                    key={device.id} 
                    device={device} 
                    sourceZoneId={zone.id}
                  />
                ))}
              </div>
            </React.Fragment>
          );
        })}
    </div>
  );
}; 