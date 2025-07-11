import React, { useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { ChevronDown, ChevronRight, MapPin, MoreHorizontal, Link, Pencil, Trash2, Cctv, Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DeviceType } from "@/lib/mappings/definitions";
import type { Space, DeviceWithConnector } from '@/types/index';
import { SpaceDevicesSubRow } from './SpaceDevicesSubRow';

interface SpaceCardProps {
  space: Space;
  allDevices: DeviceWithConnector[];
  isSelected?: boolean; // Is this space selected in the tree view?
  isOver?: boolean;     // Is a draggable item hovering over this space?
  isDevicesExpanded: boolean;
  onToggleDetails: (spaceId: string) => void;
  onAssignDevice: (space: Space) => void;
  onEditSpace: (space: Space) => void;
  onDeleteSpace: (space: Space) => void;
  onViewCameras: (space: Space) => void; // Callback to open the camera wall
}

export const SpaceCard: React.FC<SpaceCardProps> = ({
  space,
  allDevices,
  isSelected,
  isOver,
  isDevicesExpanded,
  onToggleDetails,
  onAssignDevice,
  onEditSpace,
  onDeleteSpace,
  onViewCameras,
}) => {

  // Find the device assigned to this space (one device per space)
  const spaceDevice = useMemo(() => {
    if (!space.deviceIds || space.deviceIds.length === 0) return null;
    return allDevices.find(device => space.deviceIds!.includes(device.id));
  }, [space.deviceIds, allDevices]);

  // Identify cameras in this space (should be max 1 since one device per space)
  const spaceCameras = useMemo(() => {
    if (!spaceDevice) return [];
    return spaceDevice.deviceTypeInfo?.type === DeviceType.Camera && spaceDevice.connectorCategory === 'piko' 
      ? [spaceDevice] 
      : [];
  }, [spaceDevice]);

  const hasDevice = !!spaceDevice;

  return (
    <Card
      className={cn(
        "transition-all duration-150 ease-in-out",
        isSelected && "ring-2 ring-primary ring-offset-2 ring-offset-background",
        isOver && "bg-primary/10 ring-2 ring-primary ring-opacity-70 scale-[1.01]"
      )}
    >
      <CardHeader
        className={cn(
          "flex flex-row items-center justify-between py-3 px-4",
          "cursor-pointer hover:bg-muted/50 transition-colors rounded-t-lg"
        )}
        onClick={() => onToggleDetails(space.id)}
        title={isDevicesExpanded ? "Collapse details" : "Expand details"}
      >
         <div className="flex items-center gap-2 min-w-0">
           {isDevicesExpanded ? 
               <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" /> : 
               <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
           }
          <Package className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <CardTitle className="text-base font-medium truncate" title={space.name}>{space.name}</CardTitle>
          <Badge variant={hasDevice ? "default" : "outline"} className="font-normal px-1.5 py-0.5 text-xs ml-2 flex-shrink-0">
            {hasDevice ? '1 Device' : 'No Device'}
          </Badge>
         </div>
         
         <div className="relative flex items-center gap-1 flex-shrink-0 -translate-y-0.5">
           {/* Actions Dropdown */} 
            <DropdownMenu>
              <TooltipProvider delayDuration={100}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button 
                        variant="ghost" 
                        className="h-7 w-7 p-0" 
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span className="sr-only">Space Actions</span>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Space Actions</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={(e) => {e.stopPropagation(); onAssignDevice(space);}}>
                  <Link className="h-4 w-4 mr-2" />
                  Assign Device
                </DropdownMenuItem>
                <DropdownMenuItem onClick={(e) => {e.stopPropagation(); onEditSpace(space);}}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit Space
                </DropdownMenuItem>
                {/* Camera Menu Item */}
                {spaceCameras.length > 0 && <DropdownMenuSeparator />}
                {spaceCameras.length > 0 && (
                  <DropdownMenuItem
                    key={`view-cameras-${space.id}`}
                    onClick={(e) => {
                      e.stopPropagation(); 
                      onViewCameras(space);
                    }}
                  >
                    <Cctv className="h-4 w-4 mr-2" />
                    <span>View Camera</span>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive focus:bg-destructive/10"
                  onClick={(e) => {
                      e.stopPropagation();
                      onDeleteSpace(space);
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Space
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
         </div>
      </CardHeader>
      
      {/* Optional description section */}
      {space.description && (
        <div className="px-4 py-2 text-xs border-t bg-muted/10">
          <p className="text-muted-foreground">{space.description}</p>
        </div>
      )}
      
      {isDevicesExpanded && (
          <CardContent className="p-0 rounded-b-lg">
              <SpaceDevicesSubRow
                space={space}
                allDevices={allDevices}
                onAssignDevice={onAssignDevice}
              />
          </CardContent>
      )}
    </Card>
  );
}; 