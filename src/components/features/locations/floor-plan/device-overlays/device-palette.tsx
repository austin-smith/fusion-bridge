'use client';

import React, { useMemo, useState, useRef } from 'react';
import { Search, Plus, Cpu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { getDeviceTypeIcon, getDisplayStateIcon, getDisplayStateColorClass } from '@/lib/mappings/presentation';
import { cn } from '@/lib/utils';
import type { DeviceWithConnector, Space } from '@/types/index';

// Drag image offset constants - centers the drag preview under cursor
const DRAG_IMAGE_OFFSET_X = 60; // Half of drag preview width (w-30 = 120px)
const DRAG_IMAGE_OFFSET_Y = 20; // Half of drag preview height (h-10 = 40px)

export interface DevicePaletteProps {
  devices: DeviceWithConnector[];
  spaces: Space[];
  locationId: string;
  searchTerm?: string;
  onSearchChange?: (term: string) => void;
  onAssignDevices?: () => void;
  className?: string;
  placedDeviceIds?: Set<string>; // IDs of devices already placed on floor plan
}

interface GroupedDevices {
  spaceId: string | null;
  spaceName: string;
  devices: DeviceWithConnector[];
}

interface DraggableDeviceItemProps {
  device: DeviceWithConnector;
  isCompact?: boolean;
}

function DraggableDeviceItem({ device, isCompact = false }: DraggableDeviceItemProps) {
  const [isDragging, setIsDragging] = useState(false);
  const dragPreviewRef = useRef<HTMLDivElement>(null);

  const typeInfo = device.deviceTypeInfo;
  const IconComponent = typeInfo ? getDeviceTypeIcon(typeInfo.type) : Cpu;
  const typeText = typeInfo ? typeInfo.type : 'Unknown';
  const subtypeText = typeInfo?.subtype;
  const displayState = device.displayState;
  const StateIconComponent = displayState ? getDisplayStateIcon(displayState) : undefined;
  const stateColorClass = getDisplayStateColorClass(displayState);

  const handleDragStart = (e: React.DragEvent) => {
    setIsDragging(true);
    
    // Set drag data
    e.dataTransfer.setData('application/json', JSON.stringify({
      type: 'device',
      deviceId: device.id,
      deviceName: device.name,
      deviceType: typeText,
      deviceSubtype: subtypeText,
      icon: typeInfo?.type || 'Unmapped'
    }));
    
    // Set visual feedback
    e.dataTransfer.effectAllowed = 'copy';
    
    // Use the hidden React element as drag preview
    if (dragPreviewRef.current) {
      e.dataTransfer.setDragImage(dragPreviewRef.current, DRAG_IMAGE_OFFSET_X, DRAG_IMAGE_OFFSET_Y);
    }
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  return (
    <>
      {/* Hidden drag preview element */}
      <div
        ref={dragPreviewRef}
        className="fixed -top-[1000px] -left-[1000px] w-30 h-10 bg-background border-2 border-primary rounded-lg flex items-center gap-2 px-3 py-2 shadow-lg text-xs font-medium pointer-events-none z-[9999]"
      >
        <div className="w-4 h-4 bg-primary rounded text-primary-foreground text-[10px] font-bold flex items-center justify-center flex-shrink-0">
          {typeText.charAt(0).toUpperCase()}
        </div>
        <span className="truncate flex-1">
          {device.name}
        </span>
      </div>

      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              draggable
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              className={cn(
                "relative p-2 border rounded-md bg-background flex items-center gap-2 transition-all duration-200 cursor-grab active:cursor-grabbing group",
                isDragging ? 'opacity-50 scale-95' : 'hover:bg-muted/50 hover:border-primary/20',
                isCompact ? 'p-1.5' : 'p-2'
              )}
            >
            {/* Device Icon */}
            <div className="flex-shrink-0">
              <IconComponent className="h-4 w-4 text-muted-foreground" />
            </div>
            
            {/* Device Info */}
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate" title={device.name}>
                {device.name}
              </div>
              {!isCompact && (
                <div className="text-xs text-muted-foreground truncate">
                  {typeText}
                  {subtypeText && <span>/{subtypeText}</span>}
                </div>
              )}
            </div>
            
            {/* State Indicator */}
            <div className="flex-shrink-0 flex items-center gap-1">
              {StateIconComponent && (
                <StateIconComponent className={cn("h-3 w-3", stateColorClass)} />
              )}
            </div>
            
            {/* Drag Handle Indicator */}
            <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="flex flex-col gap-0.5">
                <div className="w-1 h-1 bg-muted-foreground/50 rounded-full"></div>
                <div className="w-1 h-1 bg-muted-foreground/50 rounded-full"></div>
                <div className="w-1 h-1 bg-muted-foreground/50 rounded-full"></div>
              </div>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="right">
          <div className="space-y-1">
            <p className="font-medium">{device.name}</p>
            <p className="text-xs">Type: {typeText}{subtypeText ? ` / ${subtypeText}` : ''}</p>
            <p className="text-xs">State: {displayState || 'Unknown'}</p>
            <p className="text-xs">Connector: {device.connectorName || device.connectorCategory}</p>
            <p className="text-xs text-muted-foreground">Drag to place on floor plan</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
    </>
  );
}

export function DevicePalette({
  devices,
  spaces,
  locationId,
  searchTerm = '',
  onSearchChange,
  onAssignDevices,
  className,
  placedDeviceIds = new Set()
}: DevicePaletteProps) {
  const [collapsedSpaces, setCollapsedSpaces] = useState<Set<string>>(new Set());

  // Group devices by space assignment
  const groupedDevices = useMemo(() => {
    // Filter devices by location (through spaces)
    const locationSpaceIds = new Set(
      spaces.filter(space => space.locationId === locationId).map(space => space.id)
    );

    const locationDevices = devices.filter(device => {
      // Include devices assigned to spaces in this location, or unassigned devices
      const deviceSpaceIds = device.spaceId ? [device.spaceId] : [];
      return deviceSpaceIds.length === 0 || deviceSpaceIds.some(id => locationSpaceIds.has(id));
    });

    // Filter out devices already placed on floor plan
    const availableDevices = locationDevices.filter(device => 
      !placedDeviceIds.has(device.id)
    );

    // Apply search filter
    const filteredDevices = searchTerm
      ? availableDevices.filter(device =>
          device.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          device.deviceTypeInfo?.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
          device.deviceTypeInfo?.subtype?.toLowerCase().includes(searchTerm.toLowerCase())
        )
      : availableDevices;

    // Group by space
    const groups: Record<string, GroupedDevices> = {};

    // Add unassigned devices
    const unassignedDevices = filteredDevices.filter(device => !device.spaceId);
    if (unassignedDevices.length > 0) {
      groups['unassigned'] = {
        spaceId: null,
        spaceName: 'Unassigned Devices',
        devices: unassignedDevices.sort((a, b) => a.name.localeCompare(b.name))
      };
    }

    // Add devices grouped by space
    filteredDevices
      .filter(device => device.spaceId)
      .forEach(device => {
        const spaceId = device.spaceId!;
        const space = spaces.find(s => s.id === spaceId);
        const spaceName = space?.name || 'Unknown Space';

        if (!groups[spaceId]) {
          groups[spaceId] = {
            spaceId,
            spaceName,
            devices: []
          };
        }
        groups[spaceId].devices.push(device);
      });

    // Sort devices within each group
    Object.values(groups).forEach(group => {
      group.devices.sort((a, b) => a.name.localeCompare(b.name));
    });

    // Return groups in order: spaces first (sorted by name), then unassigned
    const sortedGroups = Object.values(groups).sort((a, b) => {
      if (a.spaceId === null) return 1; // Unassigned last
      if (b.spaceId === null) return -1; // Unassigned last
      return a.spaceName.localeCompare(b.spaceName);
    });

    return sortedGroups;
  }, [devices, spaces, locationId, searchTerm, placedDeviceIds]);

  const toggleSpaceCollapse = (groupKey: string) => {
    setCollapsedSpaces(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupKey)) {
        newSet.delete(groupKey);
      } else {
        newSet.add(groupKey);
      }
      return newSet;
    });
  };

  const totalDeviceCount = groupedDevices.reduce((sum, group) => sum + group.devices.length, 0);

  return (
    <Card className={cn("h-full flex flex-col", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Cpu className="h-5 w-5" />
          Device Palette
          <Badge variant="secondary" className="ml-auto">
            {totalDeviceCount}
          </Badge>
        </CardTitle>
        
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search devices..."
            value={searchTerm}
            onChange={(e) => onSearchChange?.(e.target.value)}
            className="pl-8"
          />
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-auto p-3 space-y-3">
        {groupedDevices.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-6 text-center h-full">
            <div className="rounded-full bg-muted p-3 mb-3">
              <Cpu className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              {searchTerm ? 'No devices match your search.' : 'No devices available for this location.'}
            </p>
            {!searchTerm && onAssignDevices && (
              <Button variant="outline" size="sm" onClick={onAssignDevices}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Assign Devices
              </Button>
            )}
          </div>
        ) : (
          groupedDevices.map((group) => {
            const groupKey = group.spaceId || 'unassigned';
            const isCollapsed = collapsedSpaces.has(groupKey);

            return (
              <Collapsible
                key={groupKey}
                open={!isCollapsed}
                onOpenChange={() => toggleSpaceCollapse(groupKey)}
              >
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    className="w-full justify-between h-auto p-2 font-medium"
                  >
                    <span className="flex items-center gap-2">
                      {group.spaceName}
                      <Badge variant="outline" className="text-xs">
                        {group.devices.length}
                      </Badge>
                    </span>
                    <div className={cn(
                      "transition-transform duration-200",
                      isCollapsed ? "rotate-0" : "rotate-90"
                    )}>
                      <Plus className="h-3 w-3" />
                    </div>
                  </Button>
                </CollapsibleTrigger>
                
                <CollapsibleContent className="space-y-1 pt-1">
                  {group.devices.map((device) => (
                    <DraggableDeviceItem
                      key={device.id}
                      device={device}
                      isCompact={false}
                    />
                  ))}
                </CollapsibleContent>
              </Collapsible>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}