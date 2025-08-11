'use client';

import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Search, Plus, Cpu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { getDeviceTypeIcon, getDisplayStateIcon, getDisplayStateColorClass } from '@/lib/mappings/presentation';
import { cn, formatConnectorCategory } from '@/lib/utils';
import type { DeviceWithConnector, Space } from '@/types/index';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { ConnectorIcon } from '@/components/features/connectors/connector-icon';
import type { DeviceType } from '@/lib/mappings/definitions';

/**
 * Calculate drag image offset to center the preview under the cursor
 * Returns half the element's dimensions for proper centering
 */
function calculateDragOffset(element: HTMLElement): { x: number; y: number } {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.width / 2,
    y: rect.height / 2
  };
}

export interface DevicePaletteProps {
  devices: DeviceWithConnector[];
  spaces: Space[];
  locationId: string;
  searchTerm?: string;
  onSearchChange?: (term: string) => void;
  onAssignDevices?: () => void;
  className?: string;
  placedDeviceIds?: Set<string>; // IDs of devices already placed on floor plan
  onClose?: () => void; // Request to hide/collapse the palette
  onFilteredCountChange?: (count: number) => void; // Report current filtered count to parent
}

interface GroupedDevices {
  spaceId: string | null;
  spaceName: string;
  devices: DeviceWithConnector[];
}

interface DraggableDeviceItemProps {
  device: DeviceWithConnector;
  isCompact?: boolean;
  inList?: boolean; // When true, remove per-item borders and rely on parent divider styles
}

function DraggableDeviceItem({ device, isCompact = false, inList = false }: DraggableDeviceItemProps) {
  const [isDragging, setIsDragging] = useState(false);
  const dragPreviewRef = useRef<HTMLDivElement>(null);

  const typeInfo = device.deviceTypeInfo;
  const IconComponent = typeInfo ? getDeviceTypeIcon(typeInfo.type) : Cpu;
  const typeText = typeInfo ? typeInfo.type : 'Unknown';
  const subtypeText = typeInfo?.subtype;
  const displayState = device.displayState;
  const StateIconComponent = displayState ? getDisplayStateIcon(displayState) : undefined;
  const stateColorClass = getDisplayStateColorClass(displayState);
  const connectorDisplayName = device.connectorName ?? formatConnectorCategory(device.connectorCategory);

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
    
    // Use the hidden React element as drag preview with dynamic offset calculation
    if (dragPreviewRef.current) {
      const offset = calculateDragOffset(dragPreviewRef.current);
      e.dataTransfer.setDragImage(dragPreviewRef.current, offset.x, offset.y);
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
        className="fixed -top-[1000px] -left-[1000px] pointer-events-none z-9999"
        aria-hidden
      >
        <div className="relative w-8 h-8">
          <div className="absolute inset-0 rounded-full bg-background/95 border-2 border-emerald-500 shadow-sm" />
          <div className="absolute inset-0 flex items-center justify-center">
            <IconComponent className="h-6 w-6 text-muted-foreground" />
          </div>
        </div>
      </div>

      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              draggable
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              className={cn(
                "relative flex items-center gap-2 transition-all duration-200 cursor-grab active:cursor-grabbing group",
                inList
                  ? cn(
                      isCompact ? 'px-1.5 py-1.5' : 'px-2 py-2',
                      isDragging ? 'opacity-50 invisible' : 'hover:bg-muted/50'
                    )
                  : cn(
                      "p-2 border rounded-md bg-background",
                      isDragging ? 'opacity-50 scale-95' : 'hover:bg-muted/50 hover:border-primary/20',
                      isCompact ? 'p-1.5' : 'p-2'
                    )
              )}
            >
            {/* Device Icon */}
            <div className="shrink-0">
              <IconComponent className="h-4 w-4 text-muted-foreground" />
            </div>
            
            {/* Device Info */}
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate" title={device.name}>
                {device.name}
              </div>
              {!isCompact && (
                <div className="text-xs text-muted-foreground truncate">
                  <span>
                    {typeText}
                    {subtypeText && <span>/{subtypeText}</span>}
                  </span>
                  <span className="mx-1">•</span>
                  <span title={connectorDisplayName}>{connectorDisplayName}</span>
                </div>
              )}
            </div>
            
            {/* State Indicator */}
            <div className="shrink-0 flex items-center gap-1">
              {StateIconComponent && (
                <StateIconComponent className={cn("h-3 w-3", stateColorClass)} />
              )}
            </div>
            
             {/* Drag Handle Indicator */}
            <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
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
  placedDeviceIds = new Set(),
  onClose,
  onFilteredCountChange
}: DevicePaletteProps) {
  const [expandedGroupKeys, setExpandedGroupKeys] = useState<Set<string>>(new Set());
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [connectorFilter, setConnectorFilter] = useState<string>('all');

  // Whether groups should auto-expand due to active search/filters
  const shouldAutoExpand =
    searchTerm.trim().length > 0 ||
    typeFilter !== 'all' ||
    connectorFilter !== 'all';

  // Devices available for placement within this location (not already placed)
  const availableDevices = useMemo(() => {
    const locationSpaceIds = new Set(
      spaces.filter(space => space.locationId === locationId).map(space => space.id)
    );

    const locationDevices = devices.filter(device => {
      const deviceSpaceIds = device.spaceId ? [device.spaceId] : [];
      return deviceSpaceIds.some(id => locationSpaceIds.has(id));
    });

    return locationDevices.filter(device => !placedDeviceIds.has(device.id));
  }, [devices, spaces, locationId, placedDeviceIds]);

  // Unique filter options from available devices
  const uniqueDeviceTypes = useMemo(() => {
    const types = new Set<string>();
    availableDevices.forEach(d => {
      const t = d.deviceTypeInfo?.type;
      if (t) types.add(t);
    });
    return ['all', ...Array.from(types).sort()];
  }, [availableDevices]);

  const uniqueConnectors = useMemo(() => {
    const connectorMap = new Map<string, { name: string; category: string }>();
    availableDevices.forEach(d => {
      const name = d.connectorName ?? formatConnectorCategory(d.connectorCategory);
      if (name && !connectorMap.has(name)) {
        connectorMap.set(name, { name, category: d.connectorCategory });
      }
    });
    return Array.from(connectorMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [availableDevices]);

  // Group devices by space assignment
  const groupedDevices = useMemo(() => {
    // Apply type and connector filters and then search
    const filteredByTypeAndConnector = availableDevices.filter(device => {
      const typeMatch =
        typeFilter === 'all' || device.deviceTypeInfo?.type === typeFilter;
      const connectorDisplayName = device.connectorName ?? formatConnectorCategory(device.connectorCategory);
      const connectorMatch =
        connectorFilter === 'all' || connectorDisplayName === connectorFilter;
      return typeMatch && connectorMatch;
    });

    const filteredDevices = searchTerm
      ? filteredByTypeAndConnector.filter(device =>
          device.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          device.deviceTypeInfo?.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
          device.deviceTypeInfo?.subtype?.toLowerCase().includes(searchTerm.toLowerCase())
        )
      : filteredByTypeAndConnector;

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
  }, [availableDevices, searchTerm, typeFilter, connectorFilter, spaces]);

  // Compute total count of devices after all filters
  const filteredDeviceCount = useMemo(() => {
    return groupedDevices.reduce((sum, group) => sum + group.devices.length, 0);
  }, [groupedDevices]);

  // Notify parent of filtered count changes
  useEffect(() => {
    if (onFilteredCountChange) {
      onFilteredCountChange(filteredDeviceCount);
    }
  }, [filteredDeviceCount, onFilteredCountChange]);

  const toggleGroupExpansion = (groupKey: string) => {
    setExpandedGroupKeys(previousExpandedKeys => {
      const nextExpandedKeys = new Set(previousExpandedKeys);
      if (nextExpandedKeys.has(groupKey)) {
        nextExpandedKeys.delete(groupKey);
      } else {
        nextExpandedKeys.add(groupKey);
      }
      return nextExpandedKeys;
    });
  };

  return (
    <Card className={cn("h-full flex flex-col", className)}>
      <CardHeader className="pb-3 sticky top-0 z-10 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60 border-b">
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
        <div className="mt-2 flex flex-col gap-2 text-sm">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full h-8">
              <SelectValue placeholder="Filter by Type" />
            </SelectTrigger>
            <SelectContent>
              {uniqueDeviceTypes
                .filter((type): type is string => typeof type === 'string')
                .map((type) => {
                  const Icon = type === 'all' ? null : getDeviceTypeIcon(type as DeviceType);
                  return (
                    <SelectItem key={type} value={type}>
                      <div className="flex items-center gap-2">
                        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
                        <span>{type === 'all' ? 'All Types' : type}</span>
                      </div>
                    </SelectItem>
                  );
                })}
            </SelectContent>
          </Select>
          <Select value={connectorFilter} onValueChange={setConnectorFilter}>
            <SelectTrigger className="w-full h-8">
              <SelectValue placeholder="Filter by Connector" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                <div className="flex items-center gap-2">
                  <span>All Connectors</span>
                </div>
              </SelectItem>
              {uniqueConnectors.map((connector) => (
                <SelectItem key={connector.name} value={connector.name}>
                  <div className="flex items-center gap-2">
                    <ConnectorIcon connectorCategory={connector.category} size={16} />
                    <span>{connector.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent className="flex-1 p-0">
        <ScrollArea className="h-full p-3">
        {groupedDevices.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-6 text-center h-full">
            <div className="rounded-full bg-muted p-3 mb-3">
              <Cpu className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              {searchTerm ? 'No devices match your search.' : 'No devices available for this location.'}
            </p>
            {/* Removed Assign Devices button */}
          </div>
        ) : (
          groupedDevices.map((group) => {
            const groupKey = group.spaceId || 'unassigned';
            const isExpanded = shouldAutoExpand || expandedGroupKeys.has(groupKey);

            return (
                <Collapsible
                key={groupKey}
                  open={isExpanded}
                  onOpenChange={() => {
                    // When auto-expand is active (search or filters), keep open state forced
                    if (shouldAutoExpand) return;
                    toggleGroupExpansion(groupKey);
                  }}
              >
                <CollapsibleTrigger asChild>
                  <div className="w-full sticky top-0 z-1">
                    <Button
                      variant="ghost"
                      className="w-full justify-between h-auto px-2 py-1.5 font-medium border border-transparent hover:border-border rounded-md"
                    >
                      <span className="flex items-center gap-2">
                        {group.spaceName}
                        <Badge variant="outline" className="text-xs">
                          {group.devices.length}
                        </Badge>
                      </span>
                      <div className={cn(
                        "transition-transform duration-200",
                        isExpanded ? "rotate-90" : "rotate-0"
                      )}>
                        <Plus className="h-3 w-3" />
                      </div>
                    </Button>
                  </div>
                </CollapsibleTrigger>
                
                <CollapsibleContent className="pt-1">
                  <div className="divide-y rounded-md border bg-background">
                    {group.devices.map((device) => (
                      <DraggableDeviceItem
                        key={device.id}
                        device={device}
                        isCompact={false}
                        inList
                      />
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })
        )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}