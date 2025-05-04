import React, { useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { ChevronDown, ChevronRight, MapPin, MoreHorizontal, ShieldCheck, ShieldOff, Link, Pencil, Trash2, Loader2, Cctv } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ArmedState, ArmedStateDisplayNames, DeviceType } from "@/lib/mappings/definitions";
import type { Area, DeviceWithConnector } from '@/types/index';
import { AreaDevicesSubRow } from '@/components/features/areas/AreaDevicesSubRow';
import { getArmedStateIcon } from '@/lib/mappings/presentation';
import { Row } from '@tanstack/react-table'; // Import Row type

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
  onArmAction: (area: Area, state: ArmedState) => void;
  onViewCameras: (area: Area) => void; // Callback to open the camera wall
  // We might need setSelectedArea and setSelectedLocation if clicking the header should update the tree view
  // For now, assume toggling details handles selection implicitly or it's handled externally
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
         
         {/* Adding relative and -translate-y-0.5 for manual UPWARD alignment */} 
         <div className="relative flex items-center gap-1 flex-shrink-0 -translate-y-0.5"> {/* Reduced gap to 1 */} 
           {/* Armed State Dropdown Button */} 
           <DropdownMenu>
             <TooltipProvider delayDuration={100}> 
               <DropdownMenuTrigger asChild> 
                 <Button 
                   variant={badgeVariant === 'destructive' ? 'destructive' : 'secondary'}
                   size="sm" 
                   className={cn( 
                     "h-7 px-2 py-0.5 text-xs font-normal border", // Base size/padding/font + ADDED border
                     // Apply green styling for 'armed' state
                     badgeVariant === 'default' &&
                       "bg-green-600/10 text-green-700 hover:bg-green-600/20 dark:bg-green-700/20 dark:text-green-400 dark:hover:bg-green-700/30 border-green-600/30 dark:border-green-700/50", // Add specific border color for armed state
                     // Destructive/Secondary variants will use their default border colors
                   )}
                   // Disable if parent location is processing arm/disarm
                   disabled={locationArmLoading} 
                 >
                    {/* Show loader if location is arming, otherwise show state icon */} 
                    {locationArmLoading ? 
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 
                      React.createElement(getArmedStateIcon(state), { className: "h-3.5 w-3.5" })
                    }
                    <span>{ArmedStateDisplayNames[state] ?? state}</span>
                    <ChevronDown className="h-3 w-3 text-muted-foreground" /> {/* Added dropdown indicator */} 
                 </Button>
               </DropdownMenuTrigger>
               <DropdownMenuContent align="end" className="w-48">
                 <DropdownMenuItem 
                   key={`arm-away-${area.id}`}
                   onClick={(e) => { e.stopPropagation(); onArmAction(area, ArmedState.ARMED_AWAY); }}
                   disabled={state === ArmedState.ARMED_AWAY || locationArmLoading}
                 >
                   <ShieldCheck className="h-4 w-4" />
                   Arm Away
                 </DropdownMenuItem>
                 <DropdownMenuItem 
                   key={`arm-stay-${area.id}`}
                   onClick={(e) => { e.stopPropagation(); onArmAction(area, ArmedState.ARMED_STAY); }}
                   disabled={state === ArmedState.ARMED_STAY || locationArmLoading}
                 >
                   <ShieldCheck className="h-4 w-4" />
                   Arm Stay
                 </DropdownMenuItem>
                 <DropdownMenuSeparator />
                 <DropdownMenuItem 
                   key={`disarm-${area.id}`}
                   onClick={(e) => { e.stopPropagation(); onArmAction(area, ArmedState.DISARMED); }}
                   disabled={state === ArmedState.DISARMED || locationArmLoading}
                 >
                   <ShieldOff className="h-4 w-4" />
                   Disarm
                 </DropdownMenuItem>
               </DropdownMenuContent>
             </TooltipProvider>
           </DropdownMenu>
           {/* End Armed State Dropdown Button */}
           
           {/* Actions Dropdown */} 
            <DropdownMenu>
              {/* Revised nesting: Tooltip trigger -> Dropdown trigger -> Button */}
              <TooltipProvider delayDuration={100}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button 
                        variant="ghost" 
                        className="h-7 w-7 p-0" 
                        onClick={(e) => e.stopPropagation()} // Keep stopPropagation
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
                {/* Conditionally render separator and menu item */} 
                {areaCameras.length > 0 && <DropdownMenuSeparator />} 
                {areaCameras.length > 0 && (
                  <DropdownMenuItem 
                    key={`view-cameras-${area.id}`}
                    onClick={(e) => {
                      // Disabled state should prevent this, but stopPropagation is safe
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
                <DropdownMenuSeparator /> {/* Separator ABOVE Delete Area */} 
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
      {isDevicesExpanded && (
          <CardContent
            className="p-0 rounded-b-lg"
          >
              <AreaDevicesSubRow
                // AreaDevicesSubRow expects a `Row` object, need to adapt
                // We pass the essential data directly or mock the row structure
                row={{ original: area } as Row<Area>} // Mock the row structure
                allDevices={allDevices}
                onAssignDevices={onAssignDevices} // Pass down the handler
                areaId={area.id}
              />
          </CardContent>
      )}
    </Card>
  );
}; 