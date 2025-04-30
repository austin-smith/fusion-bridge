'use client';

import React, { useMemo } from 'react';
import { Row } from '@tanstack/react-table';
import type { Area, DeviceWithConnector } from '@/types/index';
import { Badge } from "@/components/ui/badge";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { ConnectorIcon } from "@/components/features/connectors/connector-icon";
import { getDeviceTypeIcon } from "@/lib/mappings/presentation";
import { HelpCircle, Info, Cpu, Plus, GripVertical } from 'lucide-react';
import type { DeviceType } from "@/lib/mappings/definitions";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { DeviceDetailDialogContent } from '@/components/features/devices/device-detail-dialog-content';
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

interface AreaDevicesSubRowProps {
  row: Row<Area>;
  allDevices: DeviceWithConnector[];
  onAssignDevices?: (area: Area) => void;
  areaId: string;
}

// --- Draggable Device Item Component ---
interface DraggableDeviceItemProps {
    device: DeviceWithConnector;
    sourceAreaId: string;
}

const DraggableDeviceItem: React.FC<DraggableDeviceItemProps> = ({ device, sourceAreaId }) => {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: device.id,
        data: {
            type: 'device',
            sourceAreaId: sourceAreaId,
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

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                "relative p-2.5 border rounded-md bg-background text-xs flex flex-col gap-1.5 h-full justify-between transition-opacity duration-200 ease-in-out group cursor-grab",
                isDragging ? 'opacity-50 z-50 shadow-lg' : 'hover:bg-muted/50'
            )}
            {...listeners} 
            {...attributes} 
            title={`Drag ${device.name}`}
        >
            <div className="flex flex-col gap-1.5 flex-grow">
                <div 
                    className="flex items-center justify-between gap-1 min-w-0" 
                >
                    <span className="font-medium truncate flex-grow pl-1" title={device.name}>{device.name}</span>
                    <Dialog>
                        <DialogTrigger asChild>
                            <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-6 w-6 flex-shrink-0 -mr-1"
                            >
                                <Info className="h-3.5 w-3.5" />
                                <span className="sr-only">View Details for {device.name}</span>
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[600px]">
                            <DeviceDetailDialogContent device={{
                               ...device,
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
                <div className="flex items-center gap-1 pt-1 pl-1">
                    <TooltipProvider delayDuration={100}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                               <ConnectorIcon connectorCategory={device.connectorCategory} size={14} className="flex-shrink-0" />
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>Connector: {device.connectorName ?? device.connectorCategory}</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                    <Badge variant="secondary" className="inline-flex items-center gap-1 pl-1 pr-1.5 py-0.5 font-normal">
                        <IconComponent className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs truncate">
                            {typeText}
                            {subtypeText && (
                                <span className="text-muted-foreground ml-0.5">/{subtypeText}</span>
                            )}
                        </span>
                    </Badge>
                </div>
            </div>
        </div>
    );
};

// --- Main AreaDevicesSubRow Component ---
export const AreaDevicesSubRow: React.FC<AreaDevicesSubRowProps> = ({ 
  row, 
  allDevices,
  onAssignDevices,
  areaId
}) => {
  const area = row.original;
  console.log(`[AreaDevicesSubRow] Rendering for Area: ${area.name} (${area.id})`, { deviceIds: area.deviceIds });

  const assignedDeviceIds = useMemo(() => new Set(area.deviceIds || []), [area.deviceIds]);

  const assignedDevicesInArea = useMemo(() => {
    return allDevices.filter(device => assignedDeviceIds.has(device.id));
  }, [allDevices, assignedDeviceIds]);

  const groupedDevices = useMemo(() => {
    console.log(`[AreaDevicesSubRow] Recalculating groupedDevices for Area: ${area.name}`);
    const groups: Record<string, DeviceWithConnector[]> = {};
    assignedDevicesInArea.forEach(device => {
        const type = device.deviceTypeInfo?.type ?? "Unknown";
        if (!groups[type]) groups[type] = [];
        groups[type].push(device);
    });
    Object.values(groups).forEach(group => group.sort((a, b) => a.name.localeCompare(b.name)));
    const sortedGroupEntries = Object.entries(groups).sort(([typeA], [typeB]) => typeA.localeCompare(typeB));
    return Object.fromEntries(sortedGroupEntries);
  }, [assignedDevicesInArea, area.name]);

  const totalDeviceCount = assignedDevicesInArea.length;

  if (totalDeviceCount === 0) {
    return (
      <div className="bg-muted/25 p-6 flex flex-col items-center justify-center text-center">
        <div className="rounded-full bg-muted p-3 mb-3 inline-flex">
          <Cpu className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground max-w-md mb-3">
          No devices assigned to this area. Assign devices to monitor and control them as part of this area.
        </p>
        {onAssignDevices && (
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => onAssignDevices(area)} 
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
                    sourceAreaId={areaId}
                  />
                ))}
              </div>
            </React.Fragment>
          );
        })}
    </div>
  );
}; 