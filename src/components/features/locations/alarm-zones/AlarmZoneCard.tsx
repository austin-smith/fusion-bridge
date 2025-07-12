import React, { useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { ChevronDown, ChevronRight, Shield, MoreHorizontal, Link, Pencil, Trash2, ShieldCheck, ShieldOff, Settings, Loader2, FileText, Cctv } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ArmedState, ArmedStateDisplayNames, DeviceType } from "@/lib/mappings/definitions";
import type { AlarmZone, DeviceWithConnector } from '@/types/index';
import { AlarmZoneDevicesSubRow } from './AlarmZoneDevicesSubRow';
import { getArmedStateIcon } from '@/lib/mappings/presentation';

interface AlarmZoneCardProps {
  zone: AlarmZone;
  allDevices: DeviceWithConnector[];
  isSelected?: boolean; // Is this zone selected in the tree view?
  isOver?: boolean;     // Is a draggable item hovering over this zone?
  isDevicesExpanded: boolean;
  locationArmLoading?: boolean; // Is the parent location performing an arm action?
  onToggleDetails: (zoneId: string) => void;
  onAssignDevices: (zone: AlarmZone) => void;
  onEditZone: (zone: AlarmZone) => void;
  onDeleteZone: (zone: AlarmZone) => void;
  onArmAction?: (zone: AlarmZone, state: ArmedState) => void;
  onManageTriggerRules: (zone: AlarmZone) => void; // Callback to manage trigger rules
  onViewAuditLog: (zone: AlarmZone) => void; // Callback to view audit log
  onViewCameras: (zone: AlarmZone) => void; // Callback to open the camera wall
}

export const AlarmZoneCard: React.FC<AlarmZoneCardProps> = ({
  zone,
  allDevices,
  isSelected,
  isOver,
  isDevicesExpanded,
  locationArmLoading = false,
  onToggleDetails,
  onAssignDevices,
  onEditZone,
  onDeleteZone,
  onArmAction,
  onManageTriggerRules,
  onViewAuditLog,
  onViewCameras,
}) => {

  // Find devices assigned to this zone
  const zoneDevices = useMemo(() => {
    const deviceIdsSet = new Set(zone.deviceIds || []);
    return allDevices.filter(device => deviceIdsSet.has(device.id));
  }, [zone.deviceIds, allDevices]);

  // Identify cameras in this zone
  const zoneCameras = useMemo(() => {
    return zoneDevices.filter(device => 
      device.deviceTypeInfo?.type === DeviceType.Camera && device.connectorCategory === 'piko'
    );
  }, [zoneDevices]);

  const state = zone.armedState;
  const deviceCount = zone.deviceIds?.length ?? 0;

  let badgeVariant: "default" | "secondary" | "destructive" | "outline" = "secondary";
  if (state === ArmedState.ARMED) {
    badgeVariant = "default";
  } else if (state === ArmedState.TRIGGERED) {
    badgeVariant = "destructive";
  }

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
        onClick={() => onToggleDetails(zone.id)}
        title={isDevicesExpanded ? "Collapse details" : "Expand details"}
      >
         <div className="flex items-center gap-2 min-w-0">
           {isDevicesExpanded ? 
               <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" /> : 
               <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
           }
          <Shield className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <CardTitle className="text-base font-medium truncate" title={zone.name}>{zone.name}</CardTitle>
          <Badge variant="outline" className="font-normal px-1.5 py-0.5 text-xs ml-2 flex-shrink-0">
            {deviceCount} {deviceCount === 1 ? 'Device' : 'Devices'}
          </Badge>
         </div>
         
         <div className="relative flex items-center gap-1 flex-shrink-0 -translate-y-0.5">
           {/* Armed State Dropdown Button */} 
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
                     disabled={locationArmLoading} 
                   >
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
                     key={`arm-${zone.id}`}
                     onClick={(e) => { e.stopPropagation(); onArmAction(zone, ArmedState.ARMED); }}
                     disabled={state === ArmedState.ARMED || locationArmLoading}
                   >
                     <ShieldCheck className="h-4 w-4 mr-2" />
                     Arm Zone
                   </DropdownMenuItem>
                   <DropdownMenuSeparator />
                   <DropdownMenuItem 
                     key={`disarm-${zone.id}`}
                     onClick={(e) => { e.stopPropagation(); onArmAction(zone, ArmedState.DISARMED); }}
                     disabled={state === ArmedState.DISARMED || locationArmLoading}
                   >
                     <ShieldOff className="h-4 w-4 mr-2" />
                     Disarm Zone
                   </DropdownMenuItem>
                   {state === ArmedState.TRIGGERED && (
                     <>
                       <DropdownMenuSeparator />
                       <DropdownMenuItem 
                         key={`acknowledge-${zone.id}`}
                         onClick={(e) => { e.stopPropagation(); onArmAction(zone, ArmedState.DISARMED); }}
                       >
                         <ShieldOff className="h-4 w-4 mr-2" />
                         Acknowledge & Disarm
                       </DropdownMenuItem>
                     </>
                   )}
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
                        <span className="sr-only">Zone Actions</span>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Zone Actions</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={(e) => {e.stopPropagation(); onAssignDevices(zone);}}>
                  <Link className="h-4 w-4 mr-2" />
                  Assign Devices
                </DropdownMenuItem>
                <DropdownMenuItem onClick={(e) => {e.stopPropagation(); onEditZone(zone);}}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit Zone
                </DropdownMenuItem>
                {/* Camera Menu Item */}
                {zoneCameras.length > 0 && <DropdownMenuSeparator />}
                {zoneCameras.length > 0 && (
                  <DropdownMenuItem
                    key={`view-cameras-${zone.id}`}
                    onClick={(e) => {
                      e.stopPropagation(); 
                      onViewCameras(zone);
                    }}
                  >
                    <Cctv className="h-4 w-4 mr-2" />
                    <span className="flex-1">Camera Wall</span>
                    <Badge variant="secondary" className="h-5 px-1.5 text-xs ml-2">
                      {zoneCameras.length}
                    </Badge>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={(e) => {e.stopPropagation(); onManageTriggerRules(zone);}}>
                  <Settings className="h-4 w-4 mr-2" />
                  Trigger Rules
                </DropdownMenuItem>
                <DropdownMenuItem onClick={(e) => {e.stopPropagation(); onViewAuditLog(zone);}}>
                  <FileText className="h-4 w-4 mr-2" />
                  Audit Log
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive focus:bg-destructive/10"
                  onClick={(e) => {
                      e.stopPropagation();
                      onDeleteZone(zone);
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Zone
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
         </div>
      </CardHeader>
      
      {/* Trigger Behavior Info */}
      <div className="px-4 py-2 text-xs border-t bg-muted/10 flex items-center justify-between">
        <div className="flex items-center">
          <Settings className="h-3 w-3 mr-1" />
          <span className="font-medium">Trigger Behavior:</span>
          <span className="ml-1 text-muted-foreground capitalize">{zone.triggerBehavior}</span>
          {zone.triggerBehavior === 'custom' && (
            <Badge variant="outline" className="ml-1.5 h-5 px-1.5 text-xs font-normal">
              Custom Rules
            </Badge>
          )}
        </div>
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-6 px-2 text-xs"
          onClick={(e) => {e.stopPropagation(); onManageTriggerRules(zone);}}
        >
          Configure
        </Button>
      </div>
      
      {/* Optional description section */}
      {zone.description && (
        <div className="px-4 py-2 text-xs border-t bg-muted/10">
          <p className="text-muted-foreground">{zone.description}</p>
        </div>
      )}
      
      {isDevicesExpanded && (
          <CardContent className="p-0 rounded-b-lg">
              <AlarmZoneDevicesSubRow
                zone={zone}
                allDevices={allDevices}
                onAssignDevices={onAssignDevices}
              />
          </CardContent>
      )}
    </Card>
  );
}; 