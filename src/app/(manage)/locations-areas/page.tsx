'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useFusionStore } from '@/stores/store';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Terminal, Loader2, Plus, MoreHorizontal, ChevronDown, ChevronRight, ArrowUpDown, ArrowDown, ArrowUp, Building, MapPin, Settings, Link, ShieldCheck, ShieldOff, ShieldAlert, Trash2, Shield, Pencil, PanelLeftOpen, PanelLeftClose, Move, Search } from 'lucide-react';
import { LocationEditDialog } from '@/components/features/locations/location-edit-dialog';
import { AreaEditDialog } from '@/components/features/areas/area-edit-dialog';
import { AreaDeviceAssignmentDialog } from '@/components/features/areas/area-device-assignment-dialog';
import type { Area, Location, DeviceWithConnector } from "@/types/index";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuGroup,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { toast } from 'sonner';
import { ArmedState, ArmedStateDisplayNames } from "@/lib/mappings/definitions";
import { AreaDevicesSubRow } from '@/components/features/areas/AreaDevicesSubRow';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from '@/lib/utils';
import { type Row } from "@tanstack/react-table";
import { getArmedStateIcon } from '@/lib/mappings/presentation';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
    DndContext,
    DragEndEvent,
    useSensor,
    useSensors,
    PointerSensor,
    KeyboardSensor,
    closestCenter,
    useDroppable
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { produce } from 'immer';
import { Input } from '@/components/ui/input';

export default function LocationsAreasPage() {

  // Set page title
  useEffect(() => {
    document.title = 'Locations & Areas // Fusion Bridge';
  }, []);

  const { 
    locations, 
    isLoadingLocations, 
    errorLocations, 
    fetchLocations,
    addLocation,
    updateLocation,
    deleteLocation,
    areas,
    isLoadingAreas,
    errorAreas,
    fetchAreas,
    addArea,
    updateArea,
    deleteArea,
    updateAreaArmedState,
    assignDeviceToArea,
    removeDeviceFromArea,
    moveDeviceToArea,
    allDevices,
    isLoadingAllDevices,
    errorAllDevices,
    fetchAllDevices,
  } = useFusionStore((state) => ({
    locations: state.locations,
    isLoadingLocations: state.isLoadingLocations,
    errorLocations: state.errorLocations,
    fetchLocations: state.fetchLocations,
    addLocation: state.addLocation,
    updateLocation: state.updateLocation,
    deleteLocation: state.deleteLocation,
    areas: state.areas,
    isLoadingAreas: state.isLoadingAreas,
    errorAreas: state.errorAreas,
    fetchAreas: state.fetchAreas,
    addArea: state.addArea,
    updateArea: state.updateArea,
    deleteArea: state.deleteArea,
    updateAreaArmedState: state.updateAreaArmedState,
    assignDeviceToArea: state.assignDeviceToArea,
    removeDeviceFromArea: state.removeDeviceFromArea,
    moveDeviceToArea: state.moveDeviceToArea,
    allDevices: state.allDevices,
    isLoadingAllDevices: state.isLoadingAllDevices,
    errorAllDevices: state.errorAllDevices,
    fetchAllDevices: state.fetchAllDevices,
  }));

  const [isLocationDialogOpen, setIsLocationDialogOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [isLocationDeleteDialogOpen, setIsLocationDeleteDialogOpen] = useState(false);
  const [locationToDelete, setLocationToDelete] = useState<Location | null>(null);
  const [isAreaDialogOpen, setIsAreaDialogOpen] = useState(false);
  const [editingArea, setEditingArea] = useState<Area | null>(null);
  const [isAreaDeleteDialogOpen, setIsAreaDeleteDialogOpen] = useState(false);
  const [areaToDelete, setAreaToDelete] = useState<Area | null>(null);
  const [isAssignDevicesDialogOpen, setIsAssignDevicesDialogOpen] = useState(false);
  const [areaToAssignDevices, setAreaToAssignDevices] = useState<Area | null>(null);
  const [expandedAreaDevices, setExpandedAreaDevices] = useState<Record<string, boolean>>({});
  
  // ---> ADDED: State for search term
  const [searchTerm, setSearchTerm] = useState('');
  // <--- END ADDED

  // Tree view state with localStorage persistence
  const [showTreeView, setShowTreeView] = useState<boolean | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [selectedArea, setSelectedArea] = useState<Area | null>(null);
  const [expandedLocations, setExpandedLocations] = useState<Record<string, boolean>>({});

  // dnd-kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Effect to read localStorage and set initial state for tree view
  useEffect(() => {
    const storedState = localStorage.getItem('locationAreaTreeViewVisible');
    setShowTreeView(storedState ? JSON.parse(storedState) : false); // Default to false
  }, []);

  // Effect to update localStorage when showTreeView changes
  useEffect(() => {
    if (showTreeView !== null) { // Only save when state is determined
      localStorage.setItem('locationAreaTreeViewVisible', JSON.stringify(showTreeView));
    }
  }, [showTreeView]);

  useEffect(() => {
    fetchLocations();
    fetchAreas();
    fetchAllDevices();
  }, [fetchLocations, fetchAreas, fetchAllDevices]);

  // Handler for when the assign devices dialog open state changes
  const handleAssignDevicesDialogChange = (isOpen: boolean) => {
    const areaIdBeingModified = areaToAssignDevices?.id; // Store the ID before clearing
    setIsAssignDevicesDialogOpen(isOpen);
    if (!isOpen && areaIdBeingModified) { // Check if an area was being modified
      // When the dialog closes, refetch areas
      fetchAreas().then(() => {
        // After fetching, ensure the modified area remains expanded
        // We check if it exists in the state first to avoid unnecessary toggles
        setExpandedAreaDevices(prev => ({
          ...prev,
          [areaIdBeingModified]: true // Explicitly set to true
        }));
      });
      setAreaToAssignDevices(null); // Clear the context after initiating fetch
    } else if (!isOpen) {
      // Handle case where dialog is closed without an area context (e.g., clicking outside)
      setAreaToAssignDevices(null);
    }
  };

  const handleOpenLocationDialog = (location: Location | null) => {
    setEditingLocation(location);
    setIsLocationDialogOpen(true);
  };

  const handleLocationDialogSubmit = async (formData: { name: string; parentId?: string | null }, locationId?: string): Promise<boolean> => {
    let success = false;
    try {
      if (locationId) {
        const result = await updateLocation(locationId, formData);
        if (!result) throw new Error("Update failed in store");
        toast.success("Location updated successfully!");
        success = true;
      } else {
        const result = await addLocation(formData);
        if (!result) throw new Error("Add failed in store");
        toast.success("Location created successfully!");
        success = true;
      }
    } catch (error) {
       toast.error(error instanceof Error ? error.message : "An unknown error occurred while saving the location.");
       success = false;
    }
    if (success) await fetchLocations(); // Refetch on success
    return success;
  };

  const handleOpenLocationDeleteDialog = (location: Location | null) => {
    if (!location) return;
    setLocationToDelete(location);
    setIsLocationDeleteDialogOpen(true);
  };

  const confirmDeleteLocation = async () => {
    if (!locationToDelete) return;

    const success = await deleteLocation(locationToDelete.id);
    if (success) {
        toast.success(`Location "${locationToDelete.name}" deleted.`);
    } else {
        toast.error(`Failed to delete location "${locationToDelete.name}".`);
    }
    setLocationToDelete(null);
    setIsLocationDeleteDialogOpen(false);
  };

  const handleOpenAreaDialog = (area: Area | null, defaultLocationId?: string) => {
    setEditingArea(area ? 
        { ...area } : 
        { 
            id: '', 
            name: '', 
            locationId: defaultLocationId ?? '',
            armedState: ArmedState.DISARMED, 
            deviceIds: [],
            createdAt: new Date(),
            updatedAt: new Date()
        });
    setIsAreaDialogOpen(true);
  };

  const handleAreaDialogSubmit = async (formData: { name: string; locationId?: string | null }, areaId?: string): Promise<boolean> => {
    let success = false;
    try {
      if (areaId && areaId !== '') {
        const result = await updateArea(areaId, formData);
        if (!result) throw new Error("Update failed in store");
        toast.success("Area updated successfully!");
        success = true;
      } else {
        const result = await addArea(formData);
        if (!result) throw new Error("Add failed in store");
        toast.success("Area created successfully!");
        success = true;
      }
    } catch (error) {
       toast.error(error instanceof Error ? error.message : "An unknown error occurred while saving the area.");
       success = false;
    }
    if (success) await fetchAreas(); // Refetch on success
    return success;
  };

  const handleOpenAreaDeleteDialog = (area: Area | null) => {
    if (!area) return;
    setAreaToDelete(area);
    setIsAreaDeleteDialogOpen(true);
  };

  const confirmDeleteArea = async () => {
    if (!areaToDelete) return;
    const success = await deleteArea(areaToDelete.id);
    if (success) {
        toast.success(`Area "${areaToDelete.name}" deleted.`);
    } else {
        toast.error(`Failed to delete area "${areaToDelete.name}".`);
    }
    setAreaToDelete(null);
    setIsAreaDeleteDialogOpen(false);
  };

  const handleArmAction = async (area: Area, state: ArmedState) => {
    const result = await updateAreaArmedState(area.id, state);
    if (result) {
        const stateFormatted = state.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
        toast.success(`Area "${area.name}" set to ${stateFormatted}.`);
        await fetchAreas(); // Refetch to update state
    } else {
        toast.error(`Failed to update armed state for area "${area.name}".`);
    }
  };

  const handleOpenAssignDevicesDialog = (area: Area | null) => {
    if (!area) return;
    setAreaToAssignDevices(area);
    setIsAssignDevicesDialogOpen(true);
  };

  const toggleAreaDevices = (areaId: string) => {
    setExpandedAreaDevices(prev => ({ ...prev, [areaId]: !prev[areaId] }));
  };

  const toggleLocationExpansion = (locationId: string) => {
    setExpandedLocations(prev => ({ ...prev, [locationId]: !prev[locationId] }));
  };

  // Scroll to location element
  const scrollToLocation = useCallback((locationId: string) => {
    const element = document.getElementById(`location-${locationId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  const renderLoading = () => (
    <div className="space-y-6">
      {[...Array(3)].map((_, locIndex) => (
        <Card key={locIndex}>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div className="flex items-center gap-2 min-w-0">
              <Skeleton className="h-5 w-5 rounded" />
              <Skeleton className="h-5 w-24 rounded" />
            </div>
            <Skeleton className="h-8 w-8 rounded" />
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            {[...Array(2)].map((_, areaIndex) => (
              <Card key={areaIndex} className="mb-3">
                <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
                  <div className="flex items-center gap-2 min-w-0">
                    <Skeleton className="h-4 w-4 rounded" />
                    <Skeleton className="h-4 w-4 rounded" />
                    <Skeleton className="h-4 w-20 rounded" />
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Skeleton className="h-5 w-16 rounded-full" />
                    <Skeleton className="h-5 w-20 rounded-full" />
                    <Skeleton className="h-7 w-7 rounded" />
                  </div>
                </CardHeader>
                {/* No skeleton for CardContent as it's hidden initially */}
              </Card>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );

  const renderError = (error: string | null, type: string) => (
     <Alert variant="destructive" className="mb-4">
        <Terminal className="h-4 w-4" />
        <AlertTitle>Error Fetching {type}</AlertTitle>
        <AlertDescription>
          {error || "An unknown error occurred."}
        </AlertDescription>
      </Alert>
  );

  // --- Original areasByLocation (unfiltered) --- 
  const areasByLocation = useMemo(() => {
    const grouped: Record<string, Area[]> = {};
    areas.forEach(area => {
        const locId = area.locationId ?? 'unassigned';
        if (!grouped[locId]) {
            grouped[locId] = [];
        }
        grouped[locId].push(area);
    });
    // Sort groups internally
    Object.values(grouped).forEach(areaGroup => {
        areaGroup.sort((a, b) => a.name.localeCompare(b.name));
    });
    return grouped;
  }, [areas]);

  // --- UPDATED: Memoized filtered locations (by name only) --- 
  const filteredSortedLocations = useMemo(() => {
    const lowerSearchTerm = searchTerm.toLowerCase();
    // Filter locations only by name
    const filtered = locations.filter(location => 
      location.name.toLowerCase().includes(lowerSearchTerm)
    );
    return filtered.sort((a, b) => a.name.localeCompare(b.name));
  }, [locations, searchTerm]); 
  
  // --- UPDATED: Check if filtered results are empty --- 
  // Empty if filtered locations list is empty AND (search is active OR no unassigned areas exist initially)
  const isFilteredEmptyState = filteredSortedLocations.length === 0 && 
                               (searchTerm !== '' || !areasByLocation['unassigned'] || areasByLocation['unassigned'].length === 0);
  const hasOriginalData = locations.length > 0 || areas.length > 0;

  // --- UPDATED: Reference original area data in tree view rendering --- 
  const renderTreeItem = (location: Location) => {
    const locationAreas = areasByLocation[location.id] || []; // Use ORIGINAL areas
    const isExpanded = expandedLocations[location.id] || false;
    const isSelected = selectedLocation?.id === location.id;

    return (
      <div key={location.id} className="mb-2">
        <div 
          className={cn(
            "flex items-center py-1.5 px-2 rounded-md text-sm cursor-pointer",
            isSelected && !selectedArea ? "bg-accent text-accent-foreground" : "hover:bg-muted/50"
          )}
          onClick={() => {
            setSelectedLocation(location);
            setSelectedArea(null);
            scrollToLocation(location.id);
          }}
        >
          <Button variant="ghost" size="sm" className="h-5 w-5 p-0 mr-1" onClick={(e) => {
            e.stopPropagation();
            toggleLocationExpansion(location.id);
          }}>
            {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </Button>
          <Building className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
          <span className="truncate flex-grow">{location.name}</span>
          <Badge variant="outline" className="ml-1">{locationAreas.length}</Badge>
        </div>
        
        {isExpanded && locationAreas.length > 0 && (
          <div className="pl-6 mt-1 space-y-1">
            {locationAreas.map(area => (
              <div
                key={area.id}
                className={cn(
                  "flex items-center py-1 px-2 rounded-md text-sm cursor-pointer",
                  selectedArea?.id === area.id ? "bg-accent text-accent-foreground" : "hover:bg-muted/50"
                )}
                onClick={() => {
                  setSelectedArea(area);
                  setSelectedLocation(location);
                  
                  // Find the area card element
                  const areaElement = document.getElementById(`area-${area.id}`);
                  if (areaElement) {
                    areaElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }
                }}
              >
                <MapPin className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                <span className="truncate">{area.name}</span>
              </div>
            ))}
          </div>
        )}
        
        {isExpanded && locationAreas.length === 0 && (
          <div className="pl-6 mt-1">
            <p className="text-xs text-muted-foreground py-1 px-2">No areas in this location</p>
          </div>
        )}
      </div>
    );
  };

  const AreaCardWrapper = ({ area, children }: { area: Area; children: React.ReactNode }) => {
      const { setNodeRef, isOver } = useDroppable({
          id: area.id, // Use area ID as the droppable identifier
          data: { type: 'area' } // Optional: Add data to distinguish drop zones
      });
      const isSelected = selectedArea?.id === area.id; // Keep isSelected logic here for use below

      return (
          <div
              ref={setNodeRef}
              id={`area-${area.id}`}
              // Remove conditional classes from here
              className="mb-3" // Keep basic margin
          >
              {React.cloneElement(children as React.ReactElement, { isSelected, isOver })}
          </div>
      );
  };

  const renderAreaCard = (area: Area) => {
    const state = area.armedState;
    let badgeVariant: "default" | "secondary" | "destructive" | "outline" = "secondary";
    if (state === ArmedState.ARMED_AWAY || state === ArmedState.ARMED_STAY) {
      badgeVariant = "default";
    } else if (state === ArmedState.TRIGGERED) {
      badgeVariant = "destructive";
    }
    const deviceCount = area.deviceIds?.length ?? 0;
    const isDevicesExpanded = expandedAreaDevices[area.id] ?? false;

    // Receive isSelected and isOver from the wrapper via cloneElement props
    // Apply conditional classes directly to the Card
    const AreaCard = ({ isSelected, isOver }: { isSelected?: boolean, isOver?: boolean }) => (
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
                toggleAreaDevices(area.id);
                setSelectedArea(area);
                if (area.locationId) {
                  const parentLocation = locations.find(loc => loc.id === area.locationId);
                  if (parentLocation) setSelectedLocation(parentLocation);
                } else {
                  setSelectedLocation(null);
                }
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
               </div>
               
               {/* Adding relative and -translate-y-0.5 for manual UPWARD alignment */}
               <div className="relative flex items-center gap-2 flex-shrink-0 -translate-y-0.5">
                 <Badge variant={badgeVariant} className="inline-flex items-center">
                   {React.createElement(getArmedStateIcon(state), { className: "h-3.5 w-3.5 mr-1" })}
                   <span>{ArmedStateDisplayNames[state] ?? state}</span>
                 </Badge>
                 <Badge variant="outline" className="font-normal px-1.5 py-0.5 text-xs">
                   {deviceCount} {deviceCount === 1 ? 'Device' : 'Devices'}
                 </Badge>
                 <DropdownMenu>
                   <DropdownMenuTrigger asChild>
                     <Button variant="ghost" className="h-5 w-5 p-0">
                       <span className="sr-only">Area Actions</span>
                       <MoreHorizontal className="h-4 w-4" />
                     </Button>
                   </DropdownMenuTrigger>
                   <DropdownMenuContent align="end">
                     <DropdownMenuItem onClick={(e) => {e.stopPropagation(); handleOpenAreaDialog(area);}}>
                       <Pencil className="h-4 w-4 mr-2" />
                       Edit Details
                     </DropdownMenuItem>
                     <DropdownMenuItem onClick={(e) => {e.stopPropagation(); handleOpenAssignDevicesDialog(area);}}>
                       <Link className="h-4 w-4 mr-2" />
                       Assign Devices
                     </DropdownMenuItem>
                     <DropdownMenuSeparator />
                     <DropdownMenuGroup>
                       <DropdownMenuSub>
                           <DropdownMenuSubTrigger>
                               <Shield className="h-4 w-4 mr-2" />
                               Arm / Disarm
                           </DropdownMenuSubTrigger>
                           <DropdownMenuSubContent>
                               <DropdownMenuItem
                                   onClick={(e) => {
                                       e.stopPropagation();
                                       handleArmAction(area, ArmedState.ARMED_AWAY);
                                   }}
                                   disabled={state === ArmedState.ARMED_AWAY}
                               >
                                   <ShieldCheck className="h-4 w-4 mr-2" />
                                   Arm Away
                               </DropdownMenuItem>
                               <DropdownMenuItem
                                   onClick={(e) => {
                                       e.stopPropagation();
                                       handleArmAction(area, ArmedState.ARMED_STAY);
                                   }}
                                   disabled={state === ArmedState.ARMED_STAY}
                               >
                                   <ShieldCheck className="h-4 w-4 mr-2" />
                                   Arm Stay
                               </DropdownMenuItem>
                               <DropdownMenuSeparator />
                               <DropdownMenuItem
                                   onClick={(e) => {
                                       e.stopPropagation();
                                       handleArmAction(area, ArmedState.DISARMED);
                                   }}
                                   disabled={state === ArmedState.DISARMED}
                               >
                                   <ShieldOff className="h-4 w-4 mr-2" />
                                   Disarm
                               </DropdownMenuItem>
                           </DropdownMenuSubContent>
                       </DropdownMenuSub>
                     </DropdownMenuGroup>
                     <DropdownMenuSeparator />
                     <DropdownMenuItem
                       className="text-destructive focus:text-destructive focus:bg-destructive/10"
                       onClick={(e) => {
                           e.stopPropagation();
                           handleOpenAreaDeleteDialog(area);
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
                      row={{ original: area } as Row<Area>}
                      allDevices={allDevices}
                      onAssignDevices={handleOpenAssignDevicesDialog}
                      areaId={area.id}
                    />
                </CardContent>
            )}
        </Card>
    );

    // Pass AreaCard component to the wrapper
    return (
        <AreaCardWrapper key={area.id} area={area}>
            <AreaCard />
        </AreaCardWrapper>
    );
  };

  // --- UPDATED: Render unassigned areas only if search is inactive --- 
  const renderUnassignedAreas = () => {
    const unassignedAreas = areasByLocation['unassigned'] || []; // Use ORIGINAL areas
    // Only show if search is empty and there are unassigned areas
    if (searchTerm !== '' || unassignedAreas.length === 0) return null; 
    
    return (
      <div className="mt-4 pt-3 border-t">
        <div className="text-xs font-semibold uppercase text-muted-foreground mb-2 px-2">
          Unassigned Areas
        </div>
        <div className="space-y-1">
          {unassignedAreas.map(area => (
            <div
              key={area.id}
              className={cn(
                "flex items-center py-1 px-2 rounded-md text-sm cursor-pointer ml-2",
                selectedArea?.id === area.id ? "bg-accent text-accent-foreground" : "hover:bg-muted/50"
              )}
              onClick={() => {
                setSelectedArea(area);
                setSelectedLocation(null);
                
                // Find the area card element
                const areaElement = document.getElementById(`area-${area.id}`);
                if (areaElement) {
                  areaElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
              }}
            >
              <MapPin className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
              <span className="truncate">{area.name}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Drag and Drop handler
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id && active.data.current?.type === 'device' && over.data.current?.type === 'area') {
        const deviceId = active.id as string;
        const targetAreaId = over.id as string;
        const sourceAreaId = active.data.current?.sourceAreaId as string | undefined;

        // Find details for potential toast messages or logging
        const device = allDevices.find(d => d.id === deviceId);
        const targetArea = areas.find(a => a.id === targetAreaId);

        if (!deviceId || !targetAreaId || !targetArea ) {
            console.error("DragEnd: Missing device ID, target area ID, or target area not found.", { deviceId, targetAreaId, sourceAreaId });
            toast.error("Failed to move device: Invalid data.");
            return;
        }
        
        if (sourceAreaId === targetAreaId) {
            console.log("DragEnd: Source and target area are the same. No action taken.");
            return;
        }

        // --- Optimistic Update --- 
        const originalAreas = [...areas]; // Store original state for potential rollback
        // Call the optimistic update action in the store
        useFusionStore.getState().optimisticallyMoveDevice(deviceId, sourceAreaId, targetAreaId); 
        console.log(`[Optimistic] Updated UI for move ${deviceId} from ${sourceAreaId} to ${targetAreaId}`);
        // --- End Optimistic Update ---

        try {
          // Call the main store action to update the backend
          const success = await moveDeviceToArea(deviceId, targetAreaId);
          
          if (success) {
             toast.success(`Moved ${device?.name ?? 'device'} to ${targetArea.name}.`);
             // No fetchAreas() here on success - optimistic update handled UI
             console.log(`[Optimistic] Backend confirmed success for ${deviceId} to ${targetAreaId}.`);
          } else {
            // API call returned success: false - Revert optimistic update by refetching
            toast.error(`Failed to move ${device?.name ?? 'device'} to ${targetArea.name}. Reverting.`);
            console.warn(`[Optimistic Revert] API failed for move ${deviceId} to ${targetAreaId}. Refetching.`);
            await fetchAreas(); // Refetch to revert state
          }
        } catch (error) { 
          // Network error or other exception during API call - Revert optimistic update by refetching
          console.error("[Optimistic Revert] Error moving device:", error);
          toast.error(`An error occurred while moving ${device?.name ?? 'device'}. Reverting.`);
          await fetchAreas(); // Definitely refetch on error to ensure consistency
        }
    } else {
        console.log("DragEnd: Invalid drop target or condition not met", { active, over });
    }
  };

  // Don't render anything until the tree view state is loaded from localStorage
  if (showTreeView === null) {
    return (
       <div className="flex items-center justify-center h-screen">
           <Loader2 className="h-8 w-8 animate-spin text-primary" />
       </div>
    ); // Or a better loading skeleton
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="container px-0 md:px-2">
        {/* Header with breadcrumbs */}
        <div className="bg-background sticky top-0 z-10 mb-6 pb-4 pt-1 border-b">
          <div className="px-4 md:px-6 pt-2">
            <div className="flex justify-between items-center gap-4">
              <div className="flex items-center gap-3">
                <Button 
                  variant="outline" 
                  size="icon" 
                  className={cn("h-9 w-9", showTreeView && "bg-accent hover:bg-accent")}
                  onClick={() => setShowTreeView(!showTreeView)}
                  title={showTreeView ? "Hide location tree" : "Show location tree"}
                >
                  {showTreeView ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
                </Button>
                <div>
                  <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
                    <Building className="h-6 w-6 text-muted-foreground" />
                    Locations & Areas
                  </h1>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* ---> ADDED: Search Input <--- */} 
                <div className="relative">
                   <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                   <Input
                      type="search"
                      placeholder="Search locations..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full rounded-lg bg-background pl-8 md:w-50 lg:w-60 h-9"
                   />
                </div>
                {/* ---> END ADDED <--- */} 
                {!isFilteredEmptyState && (
                  <Button variant="outline" onClick={() => handleOpenLocationDialog(null)}>
                      <Plus className="h-4" /> Add Location
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Main content with optional tree view */}
        <div className="flex">
          {/* Tree view sidebar - conditional rendering */}
          {showTreeView && (
            <div className="w-64 pr-2 pl-4 flex-shrink-0">
              <div className="mb-4 pb-3 border-b">
                <h3 className="font-medium text-sm mb-3">Locations Hierarchy</h3>
                {/* Show Add Location button if there is original data, regardless of filter */} 
                {hasOriginalData && (
                  <Button variant="secondary" size="sm" className="w-full" onClick={() => handleOpenLocationDialog(null)}>
                    <Plus className="h-3.5 w-3.5" /> Add Location
                  </Button>
                )}
              </div>
              <ScrollArea className="h-[calc(100vh-16rem)]">
                {/* Locations with Areas */}
                {filteredSortedLocations.map(location => renderTreeItem(location))}
                
                {/* Unassigned Areas */}
                {renderUnassignedAreas()}
                
                {/* Empty state (simple text) */}
                {isFilteredEmptyState && (
                  <div className="px-2 pt-4 text-center">
                    <p className="text-sm text-muted-foreground mb-1">No locations or areas found.</p>
                    <Button variant="link" size="sm" className="h-auto p-0" onClick={() => handleOpenLocationDialog(null)}>
                      Add your first location
                    </Button>
                  </div>
                )}
              </ScrollArea>
            </div>
          )}

          {/* Main content */}
          <div className={cn("flex-1 px-4", showTreeView ? "md:pr-6" : "md:px-6")}>
            {(isLoadingLocations || isLoadingAreas) && renderLoading()}
            {errorLocations && renderError(errorLocations, 'Locations')}
            {errorAreas && renderError(errorAreas, 'Areas')}
            
            {!isLoadingLocations && !isLoadingAreas && !errorLocations && !errorAreas && (
                <div className="space-y-6">
                    {/* ---> UPDATED: Use filtered locations <--- */}
                    {filteredSortedLocations.map(location => {
                        const locationAreas = areasByLocation[location.id] || []; // Use ORIGINAL areas
                        return (
                            <Card 
                              key={location.id} 
                              id={`location-${location.id}`} 
                            >
                                <CardHeader className="flex flex-row items-center justify-between pb-3">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <Building className="h-5 w-5 flex-shrink-0" />
                                      <CardTitle className="truncate" title={location.name}>{location.name}</CardTitle>
                                    </div>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                                <span className="sr-only">Location Actions</span>
                                                <MoreHorizontal className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onClick={() => handleOpenLocationDialog(location)}>
                                              <Pencil className="h-4 w-4 mr-2" />
                                              Edit Location
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => handleOpenAreaDialog(null, location.id)}>
                                              <Plus className="h-4 w-4 mr-2" />
                                              Add Area
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem
                                                className="text-destructive focus:text-destructive focus:bg-destructive/10"
                                                onClick={() => handleOpenLocationDeleteDialog(location)}
                                            >
                                                <Trash2 className="h-4 w-4 mr-2" />
                                                Delete Location
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </CardHeader>
                                <CardContent className="pt-0 bg-muted/25 rounded-b-lg"> 
                                    {locationAreas.length > 0 ? (
                                        locationAreas.map(area => renderAreaCard(area))
                                    ) : (
                                        <div className="px-4 py-6 text-center">
                                            <div className="rounded-full bg-muted p-3 mb-2 inline-flex">
                                              <MapPin className="h-5 w-5 text-muted-foreground" />
                                            </div>
                                            <p className="text-sm text-muted-foreground mb-2">
                                                No areas assigned to this location. 
                                            </p>
                                            <Button variant="outline" size="sm" onClick={() => handleOpenAreaDialog(null, location.id)}>
                                              <Plus className="h-3.5 w-3.5 mr-1" /> Add Area
                                            </Button>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        );
                    })}

                    {/* ---> UPDATED: Show unassigned only if search is inactive <--- */}
                    {searchTerm === '' && areasByLocation['unassigned'] && areasByLocation['unassigned'].length > 0 && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Unassigned Areas</CardTitle>
                                <CardDescription>These areas are not linked to any specific location.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {areasByLocation['unassigned'].map(area => renderAreaCard(area))} // Use ORIGINAL areas
                            </CardContent>
                        </Card>
                    )}

                    {/* ---> UPDATED: Conditional Empty State <--- */}
                    {isFilteredEmptyState && (
                         <Card className="border-dashed">
                             <CardContent className="pt-10 pb-10 px-6 flex flex-col items-center text-center">
                               <div className="rounded-full bg-muted p-6 mb-4">
                                 <Building className="h-12 w-12 text-muted-foreground" />
                               </div>
                               <CardTitle className="mb-2">
                                 {hasOriginalData && searchTerm !== '' 
                                  ? "No locations match your search term. Try adjusting your filter."
                                  : <>Locations represent physical buildings or sites... {/* rest of original message */}
                                     <br/>Use them to organize your devices and control security by zone.
                                   </>
                                 }
                               </CardTitle>
                               <CardDescription className="mb-6 max-w-md">
                                 {hasOriginalData && searchTerm !== '' 
                                  ? "No locations match your search term. Try adjusting your filter."
                                  : <>Locations represent physical buildings or sites... {/* rest of original message */}
                                     <br/>Use them to organize your devices and control security by zone.
                                   </>
                                 }
                               </CardDescription>
                               {!hasOriginalData && (
                                 <Button onClick={() => handleOpenLocationDialog(null)} className="gap-2">
                                   <Plus className="h-4 w-4" /> Add Your First Location
                                 </Button>
                               )}
                             </CardContent>
                         </Card>
                    )}
                </div>
            )}

            {isLoadingAllDevices && <div className="text-sm text-muted-foreground mt-4 text-center">Loading device list...</div>}
            {errorAllDevices && renderError(errorAllDevices, 'All Devices')}
          </div>
        </div>

        {/* Dialogs remain outside DndContext */}
        <LocationEditDialog
          isOpen={isLocationDialogOpen}
          onOpenChange={setIsLocationDialogOpen}
          locationToEdit={editingLocation}
          allLocations={locations}
          onSubmit={handleLocationDialogSubmit}
        />
        
        <AlertDialog open={isLocationDeleteDialogOpen} onOpenChange={setIsLocationDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the location 
                <strong className="px-1">{locationToDelete?.name}</strong> 
                and all of its child locations and associated areas.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setLocationToDelete(null)}>Cancel</AlertDialogCancel>
              <AlertDialogAction 
                onClick={confirmDeleteLocation} 
                className={cn(buttonVariants({ variant: "destructive" }))}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
  
        <AreaEditDialog
          isOpen={isAreaDialogOpen}
          onOpenChange={setIsAreaDialogOpen}
          areaToEdit={editingArea}
          allLocations={locations}
          onSubmit={handleAreaDialogSubmit}
        />
  
        <AlertDialog open={isAreaDeleteDialogOpen} onOpenChange={setIsAreaDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the area 
                <strong className="px-1">{areaToDelete?.name}</strong> 
                and remove its device associations.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setAreaToDelete(null)}>Cancel</AlertDialogCancel>
              <AlertDialogAction 
                onClick={confirmDeleteArea} 
                className={cn(buttonVariants({ variant: "destructive" }))}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
  
        <AreaDeviceAssignmentDialog
          isOpen={isAssignDevicesDialogOpen}
          onOpenChange={handleAssignDevicesDialogChange}
          area={areaToAssignDevices}
          allDevices={allDevices}
          assignDeviceAction={assignDeviceToArea}
          removeDeviceAction={removeDeviceFromArea}
        />
      </div>
    </DndContext>
  );
} 