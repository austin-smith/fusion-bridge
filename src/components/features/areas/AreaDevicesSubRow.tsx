'use client';

import React, { useMemo } from 'react';
import { Row } from '@tanstack/react-table';
import type { Area, DeviceWithConnector } from '@/types/index';
import { Badge } from "@/components/ui/badge";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { ConnectorIcon } from "@/components/features/connectors/connector-icon";
import { getDeviceTypeIcon } from "@/lib/mappings/presentation";
import { HelpCircle, Info } from 'lucide-react';
import type { DeviceType } from "@/lib/mappings/definitions";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { DeviceDetailDialogContent } from '@/components/features/devices/device-detail-dialog-content';
import { Separator } from "@/components/ui/separator";

interface AreaDevicesSubRowProps {
  row: Row<Area>;
  allDevices: DeviceWithConnector[];
}

export const AreaDevicesSubRow: React.FC<AreaDevicesSubRowProps> = ({ row, allDevices }) => {
  const area = row.original;
  const assignedDeviceIds = new Set(area.deviceIds || []);

  // Group devices by type, then sort devices within each group by name
  const groupedDevices = useMemo(() => {
    const assignedDevices = allDevices.filter(device => assignedDeviceIds.has(device.id));

    const groups: Record<string, DeviceWithConnector[]> = {};

    assignedDevices.forEach(device => {
        const type = device.deviceTypeInfo?.type ?? "Unknown"; // Group unknown types together
        if (!groups[type]) {
            groups[type] = [];
        }
        groups[type].push(device);
    });

    // Sort devices within each group by name
    Object.values(groups).forEach(group => {
        group.sort((a, b) => a.name.localeCompare(b.name));
    });

    // Sort the groups themselves by type name (e.g., alphabetically)
    const sortedGroupEntries = Object.entries(groups).sort(([typeA], [typeB]) => typeA.localeCompare(typeB));
    
    return Object.fromEntries(sortedGroupEntries); // Return sorted groups as an object

  }, [allDevices, area.deviceIds]);

  const totalDeviceCount = useMemo(() => Object.values(groupedDevices).reduce((sum, group) => sum + group.length, 0), [groupedDevices]);

  if (totalDeviceCount === 0) {
    return <div className="p-4 text-sm text-muted-foreground">No devices assigned to this area.</div>;
  }

  return (
    <div className="bg-muted/25 px-4 py-4">
      {Object.entries(groupedDevices).map(([type, devicesInGroup]) => {
          // Get the icon for the group type
          const GroupIcon = type !== "Unknown" ? getDeviceTypeIcon(type as DeviceType) : HelpCircle;
          return (
            <div key={type} className="mb-4 last:mb-0">
              <h5 className="text-xs font-semibold uppercase text-muted-foreground mb-2 tracking-wide flex items-center gap-2"> 
                <GroupIcon className="h-3.5 w-3.5" /> 
                <span className="flex-grow">{type}</span>
                <Badge variant="secondary" className="px-1.5 py-0.5 text-xs font-medium"> 
                  {devicesInGroup.length}
                </Badge>
              </h5>
              <Separator className="my-2" />
              <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2">
                {devicesInGroup.map(device => {
                  const typeInfo = device.deviceTypeInfo;
                  const IconComponent = typeInfo ? getDeviceTypeIcon(typeInfo.type) : HelpCircle;
                  const typeText = typeInfo ? typeInfo.type : "Unknown";
                  const subtypeText = typeInfo?.subtype;
                  
                  return (
                    <TooltipProvider key={device.id} delayDuration={100}>
                      <Dialog>
                        <Tooltip>
                          <TooltipTrigger asChild>
                              <div className="p-2.5 border rounded-md bg-muted text-xs flex flex-col gap-1.5 h-full justify-between hover:bg-muted/50 transition-all duration-200 ease-in-out">
                                  <div className="flex items-center justify-between gap-2 min-w-0"> 
                                      <span className="font-medium truncate flex-grow" title={device.name}>{device.name}</span> 
                                      <DialogTrigger asChild>
                                          <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0">
                                              <Info className="h-3.5 w-3.5" />
                                              <span className="sr-only">View Details</span>
                                          </Button>
                                      </DialogTrigger>
                                  </div>
                                  <div className="flex items-center gap-1 pt-1"> 
                                    <ConnectorIcon connectorCategory={device.connectorCategory} size={14} className="flex-shrink-0" />
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
                          </TooltipTrigger>
                          <TooltipContent>
                              <p>Type: {typeText}{subtypeText ? ` / ${subtypeText}` : ''}</p>
                              <p>Connector: {device.connectorName ?? device.connectorCategory}</p>
                              <p>ID: <span className="font-mono text-xs">{device.deviceId}</span></p>
                              <p className="text-muted-foreground text-center pt-1">Click info icon for details</p>
                          </TooltipContent>
                        </Tooltip>
                        <DialogContent className="sm:max-w-[600px] md:max-w-[750px] lg:max-w-[900px]"> 
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
                    </TooltipProvider>
                  );
                })}
              </div>
            </div>
          );
        })}
    </div>
  );
}; 