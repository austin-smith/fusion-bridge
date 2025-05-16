import React, { useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { ChevronDown, ChevronRight, MapPin, MoreHorizontal, ShieldCheck, ShieldOff, Link, Pencil, Trash2, Loader2, Cctv, CalendarClock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ArmedState, ArmedStateDisplayNames, DeviceType } from "@/lib/mappings/definitions";
import type { Area, DeviceWithConnector, ArmingSchedule } from '@/types/index';
import { AreaDevicesSubRow } from '@/components/features/locations-areas/areas/AreaDevicesSubRow';
import { getArmedStateIcon } from '@/lib/mappings/presentation';
import { Row } from '@tanstack/react-table'; // Import Row type
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AreaCardProps {
  area: Area;
  allDevices: DeviceWithConnector[];
  isSelected?: boolean; // Is this area selected in the tree view?
  isOver?: boolean;     // Is a draggable item hovering over this area?
  isDevicesExpanded: boolean;
  locationArmLoading?: boolean; // Is the parent location performing an arm action?
  onToggleDetails: (areaId: string) => void;
  onAssignDevices: (area: Area) => void;
  onEditArea: (area: Area) => void;
  onDeleteArea: (area: Area) => void;
  onArmAction?: (area: Area, state: ArmedState) => void;
  onViewCameras: (area: Area) => void; // Callback to open the camera wall
  
  // Optional status info
  areaStatus?: React.ReactNode; // Not used directly in UI anymore
  scheduleInfo?: {
    effective: string | null;
    locationDefault: string | null;
    onChange: (value: string) => void;
    value: string;
    schedules: ArmingSchedule[]; // Refined to ArmingSchedule type
    isUnassigned?: boolean;
    isUsingLocationDefault?: boolean;
  };
}

export const AreaCard: React.FC<AreaCardProps> = ({
  area,
  allDevices,
  isSelected,
  isOver,
  isDevicesExpanded,
  locationArmLoading = false, // Default to false
  onToggleDetails,
  onAssignDevices,
  onEditArea,
  onDeleteArea,
  onArmAction,
  onViewCameras,
  scheduleInfo,
}) => {

  // --- Identify cameras in this area (Hook called safely at top level) --- 
  const areaCameras = useMemo(() => {
    const deviceIdsSet = new Set(area.deviceIds || []);
    return allDevices.filter(device => 
      deviceIdsSet.has(device.id) && 
      device.deviceTypeInfo?.type === DeviceType.Camera &&
      device.connectorCategory === 'piko' // Only support Piko for now
    );
  }, [area.deviceIds, allDevices]);
  // --- END --- 

  const state = area.armedState;
  const deviceCount = area.deviceIds?.length ?? 0;

  let badgeVariant: "default" | "secondary" | "destructive" | "outline" = "secondary";
  if (state === ArmedState.ARMED_AWAY || state === ArmedState.ARMED_STAY) {
    badgeVariant = "default";
  } else if (state === ArmedState.TRIGGERED) {
    badgeVariant = "destructive";
  }

  return (
    <Card
      className={cn(
        "transition-all duration-150 ease-in-out", // Base transition
        isSelected && "ring-2 ring-primary ring-offset-2 ring-offset-background", // Apply ring directly
        isOver && "bg-primary/10 ring-2 ring-primary ring-opacity-70 scale-[1.01]" // Highlight when dragging over
      )}
    >
      <CardHeader
        className={cn(
          "flex flex-row items-center justify-between py-3 px-4", 
          "cursor-pointer hover:bg-muted/50 transition-colors rounded-t-lg"
        )}
        onClick={() => {
          onToggleDetails(area.id);
          // Potentially call setSelectedArea/Location here if needed
        }}
        title={isDevicesExpanded ? "Collapse details" : "Expand details"}
      >
         <div className="flex items-center gap-2 min-w-0">
           {isDevicesExpanded ? 
               <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" /> : 
               <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
           }
          <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <CardTitle className="text-base font-medium truncate" title={area.name}>{area.name}</CardTitle>
          <Badge variant="outline" className="font-normal px-1.5 py-0.5 text-xs ml-2 flex-shrink-0">
            {deviceCount} {deviceCount === 1 ? 'Device' : 'Devices'}
          </Badge>
         </div>
         
         {/* Adding relative and -translate-y-0.5 for manual alignment */} 
         <div className="relative flex items-center gap-1 flex-shrink-0 -translate-y-0.5">
           {/* Armed State Dropdown Button - RESTORED */} 
           {onArmAction && (
             <DropdownMenu>
               <TooltipProvider delayDuration={100}> 
                 <DropdownMenuTrigger asChild> 
                   <Button 
                     variant={badgeVariant === 'destructive' ? 'destructive' : 'secondary'}
                     size="sm" 
                     className={cn( 
                       "h-7 px-2 py-0.5 text-xs font-normal border", 
                       // Apply green styling for 'armed' state
                       badgeVariant === 'default' &&
                         "bg-green-600/10 text-green-700 hover:bg-green-600/20 dark:bg-green-700/20 dark:text-green-400 dark:hover:bg-green-700/30 border-green-600/30 dark:border-green-700/50",
                     )}
                     // Disable if parent location is processing arm/disarm
                     disabled={locationArmLoading} 
                   >
                      {/* Show loader if location is arming, otherwise show state icon */} 
                      {locationArmLoading ? 
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 
                        React.createElement(getArmedStateIcon(state), { className: "h-3.5 w-3.5" })
                      }
                      <span>{ArmedStateDisplayNames[state as ArmedState] ?? state}</span>
                      <ChevronDown className="h-3 w-3 text-muted-foreground" />
                   </Button>
                 </DropdownMenuTrigger>
                 <DropdownMenuContent align="end" className="w-48">
                   <DropdownMenuItem 
                     key={`arm-away-${area.id}`}
                     onClick={(e) => { e.stopPropagation(); onArmAction(area, ArmedState.ARMED_AWAY); }}
                     disabled={state === ArmedState.ARMED_AWAY || locationArmLoading}
                   >
                     <ShieldCheck className="h-4 w-4 mr-2" />
                     Arm Away
                   </DropdownMenuItem>
                   <DropdownMenuItem 
                     key={`arm-stay-${area.id}`}
                     onClick={(e) => { e.stopPropagation(); onArmAction(area, ArmedState.ARMED_STAY); }}
                     disabled={state === ArmedState.ARMED_STAY || locationArmLoading}
                   >
                     <ShieldCheck className="h-4 w-4 mr-2" />
                     Arm Stay
                   </DropdownMenuItem>
                   <DropdownMenuSeparator />
                   <DropdownMenuItem 
                     key={`disarm-${area.id}`}
                     onClick={(e) => { e.stopPropagation(); onArmAction(area, ArmedState.DISARMED); }}
                     disabled={state === ArmedState.DISARMED || locationArmLoading}
                   >
                     <ShieldOff className="h-4 w-4 mr-2" />
                     Disarm
                   </DropdownMenuItem>
                 </DropdownMenuContent>
               </TooltipProvider>
             </DropdownMenu>
           )}
           
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
                        <span className="sr-only">Area Actions</span>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Area Actions</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={(e) => {e.stopPropagation(); onAssignDevices(area);}}>
                  <Link className="h-4 w-4 mr-2" />
                  Assign Devices
                </DropdownMenuItem>
                <DropdownMenuItem onClick={(e) => {e.stopPropagation(); onEditArea(area);}}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit Area
                </DropdownMenuItem>
                {/* Camera Menu Item */}
                {areaCameras.length > 0 && <DropdownMenuSeparator />}
                {areaCameras.length > 0 && (
                  <DropdownMenuItem
                    key={`view-cameras-${area.id}`}
                    onClick={(e) => {
                      e.stopPropagation(); 
                      onViewCameras(area);
                    }}
                  >
                    <Cctv className="h-4 w-4 mr-2" />
                    <span>Camera Wall</span>
                    <Badge variant="secondary" className="ml-auto h-5 px-1.5 text-xs font-normal">
                      {areaCameras.length}
                    </Badge>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive focus:bg-destructive/10"
                  onClick={(e) => {
                      e.stopPropagation();
                      onDeleteArea(area);
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Area
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
         </div>
      </CardHeader>
      
      {/* Always show schedule in the same style */}
      {scheduleInfo?.effective && (
        <div className="px-4 py-2 text-xs border-t bg-muted/10 flex items-center justify-between">
          <div className="flex items-center">
            <CalendarClock className="h-3 w-3 mr-1" />
            <span className="font-medium">Arming Schedule:</span>
            <span className="ml-1 text-muted-foreground">{scheduleInfo.effective}</span>
            {scheduleInfo.isUsingLocationDefault && (
              <Badge variant="outline" className="ml-1.5 h-5 px-1.5 text-xs font-normal dark:border-gray-800">Default</Badge>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-6 px-2 text-xs"
              >
                Change
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem 
                onClick={() => scheduleInfo.onChange('null_value_placeholder')}
                className={scheduleInfo.value === 'null_value_placeholder' ? 'bg-muted' : ''}
              >
                {scheduleInfo.locationDefault ? (
                  <div className="flex flex-col w-full">
                    <div className="flex items-center">
                      <span className="font-medium">{scheduleInfo.locationDefault}</span>
                      <Badge variant="outline" className="ml-2 h-5 px-1.5 text-xs font-normal dark:border-gray-600">Default</Badge>
                    </div>
                    <span className="text-xs text-muted-foreground mt-0.5">Use location&apos;s default schedule</span>
                  </div>
                ) : (
                  <div className="flex flex-col w-full">
                    <span className="font-medium">No Schedule</span>
                    <span className="text-xs text-muted-foreground mt-0.5">Area will not be automatically armed or disarmed</span>
                  </div>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {scheduleInfo.schedules.map(schedule => (
                <DropdownMenuItem 
                  key={schedule.id} 
                  onClick={() => scheduleInfo.onChange(schedule.id)}
                  className={scheduleInfo.value === schedule.id ? 'bg-muted' : ''}
                >
                  <div className="flex flex-col w-full">
                    <span className="font-medium">{schedule.name}</span>
                    <span className="text-xs text-muted-foreground mt-0.5">
                      {schedule.armTimeLocal} to {schedule.disarmTimeLocal}, {schedule.daysOfWeek.length === 7 ? 'Daily' : 
                       schedule.daysOfWeek.length === 5 && schedule.daysOfWeek.every(d => d >= 1 && d <= 5) ? 'Weekdays' : 
                       schedule.daysOfWeek.length === 2 && schedule.daysOfWeek.every(d => d === 0 || d === 6) ? 'Weekends' : 
                       `${schedule.daysOfWeek.length} days/week`}
                    </span>
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
      
      {isDevicesExpanded && (
          <CardContent className="p-0 rounded-b-lg">
              <AreaDevicesSubRow
                row={{ original: area } as Row<Area>}
                allDevices={allDevices}
                onAssignDevices={onAssignDevices}
                areaId={area.id}
              />
          </CardContent>
      )}
    </Card>
  );
}; 