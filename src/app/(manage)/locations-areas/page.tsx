'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useFusionStore } from '@/stores/store';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Terminal, Loader2, Plus, MoreHorizontal, ChevronDown, ChevronRight, ArrowUpDown, ArrowDown, ArrowUp, Building, MapPin, Settings, Link, ShieldCheck, ShieldOff, ShieldAlert, Trash2, Shield, Pencil, PanelLeftOpen, PanelLeftClose, Move, Search, Video } from 'lucide-react';
import { LocationEditDialog } from '@/components/features/locations/location-edit-dialog';
import { AreaEditDialog } from '@/components/features/areas/area-edit-dialog';
import { AreaDeviceAssignmentDialog } from '@/components/features/areas/area-device-assignment-dialog';
import { AreaCameraWallDialog } from '@/components/features/areas/AreaCameraWallDialog';
import { AreaCard } from '@/components/features/areas/AreaCard';
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
import { ArmedState, ArmedStateDisplayNames, DeviceType } from "@/lib/mappings/definitions";
import { AreaDevicesSubRow } from '@/components/features/areas/AreaDevicesSubRow';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from '@/lib/utils';
import { type Row } from "@tanstack/react-table";
import { getArmedStateIcon } from '@/lib/mappings/presentation';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
import { PageHeader } from '@/components/layout/page-header';

export default function LocationsAreasPage() {

  // Set page title
  useEffect(() => {
    document.title = 'Locations & Areas // Fusion';
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
    batchUpdateAreasArmedState,
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
    batchUpdateAreasArmedState: state.batchUpdateAreasArmedState,
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
  const [isCameraWallDialogOpen, setIsCameraWallDialogOpen] = useState(false);
  const [selectedAreaForCameraWall, setSelectedAreaForCameraWall] = useState<Area | null>(null);
  const [expandedAreaDevices, setExpandedAreaDevices] = useState<Record<string, boolean>>({});
  
  // ---> ADDED: State for search term
  const [searchTerm, setSearchTerm] = useState('');
  // <--- END ADDED

  // Loading state for location-level arm actions
  const [locationArmLoading, setLocationArmLoading] = useState<Record<string, boolean>>({});

  // Tree view state with localStorage persistence
  const [showTreeView, setShowTreeView] = useState<boolean | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [selectedArea, setSelectedArea] = useState<Area | null>(null);
  const [expandedLocations, setExpandedLocations] = useState<Record<string, boolean>>({});

  // dnd-kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
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
          data: { type: 'area' } 
      });
      const isSelected = selectedArea?.id === area.id; // Keep isSelected logic here for use below

      return (
          <div
              ref={setNodeRef}
              id={`area-${area.id}`}
              className="mb-3"
          >
              {React.cloneElement(children as React.ReactElement, { isSelected, isOver })}
          </div>
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
                
                // Find the area card element using the ID from AreaCardWrapper
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

  // Define page actions
  const pageActions = (
    <>
      <div className="relative flex-shrink-0"> {/* Keep search relative */}
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search locations..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full rounded-lg bg-background pl-8 md:w-50 lg:w-60 h-9"
        />
      </div>
      {!isFilteredEmptyState && (
        <Button variant="outline" onClick={() => handleOpenLocationDialog(null)} size="sm"> {/* Size sm for consistency */}
          <Plus className="h-4 w-4" /> Add Location
        </Button>
      )}
    </>
  );

  // Don't render anything until the tree view state is loaded from localStorage
  if (showTreeView === null) {
    return (
       <div className="flex items-center justify-center h-screen">
           <Loader2 className="h-8 w-8 animate-spin text-primary" />
       </div>
    ); // Or a better loading skeleton
  }

  // Handler for location-level arm/disarm actions
  const handleLocationArmAction = async (locationId: string, state: ArmedState) => {
    setLocationArmLoading(prev => ({ ...prev, [locationId]: true }));
    
    // Placeholder for calling the store action (to be implemented)
    // console.log(`TODO: Call store action batchUpdateAreasArmedState(${locationId}, ${state})`);
    const success = await batchUpdateAreasArmedState(locationId, state); // Call the actual store action
    
    if (success) {
      // Format state name for toast message
      let stateFormatted = "Unknown State";
      if (state === ArmedState.ARMED_AWAY) stateFormatted = "Armed Away";
      else if (state === ArmedState.ARMED_STAY) stateFormatted = "Armed Stay";
      else if (state === ArmedState.DISARMED) stateFormatted = "Disarmed";
      
      toast.success(`All areas in location set to ${stateFormatted}.`);
      // No fetchAreas needed if store updates state correctly
    } else {
      toast.error(`Failed to update areas in location.`);
    }
    
    setLocationArmLoading(prev => ({ ...prev, [locationId]: false }));
  };

  // --- ADDED: Handlers for Camera Wall Dialog ---
  const handleOpenCameraWallDialog = (area: Area | null) => {
    if (!area) return;
    setSelectedAreaForCameraWall(area);
    setIsCameraWallDialogOpen(true);
  };

  const handleCameraWallDialogChange = (isOpen: boolean) => {
    setIsCameraWallDialogOpen(isOpen);
    if (!isOpen) {
      setSelectedAreaForCameraWall(null); 
    }
  };
  // --- END ADDED ---

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="flex flex-col h-full"> 
        <div className="p-4 border-b flex-shrink-0"> {/* Add padding and border */} 
          <PageHeader 
            title="Locations & Areas"
            icon={(
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
                <Building className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
            actions={pageActions}
          />
        </div>

        <div className="flex flex-grow overflow-hidden"> 
          {showTreeView && (
            <div className="w-64 pr-2 pl-4 border-r flex-shrink-0 flex flex-col"> {/* Add border and flex-col */} 
              <div className="mb-4 pb-3 border-b pt-4"> {/* Adjust padding */}
                <h3 className="font-medium text-sm mb-3">Locations Hierarchy</h3>
                {hasOriginalData && (
                  <Button variant="secondary" size="sm" className="w-full" onClick={() => handleOpenLocationDialog(null)}>
                    <Plus className="h-3.5 w-3.5" /> Add Location
                  </Button>
                )}
              </div>
              <ScrollArea className="flex-grow"> 
                {filteredSortedLocations.map(location => renderTreeItem(location))}
                {renderUnassignedAreas()}
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

          <ScrollArea className="flex-1"> 
             <div className={cn("p-4 md:p-6", showTreeView ? "md:pr-6" : "md:px-6")}> {/* Add padding */} 
               {(isLoadingLocations || isLoadingAreas) && renderLoading()}
               {errorLocations && renderError(errorLocations, 'Locations')}
               {errorAreas && renderError(errorAreas, 'Areas')}
               
               {!isLoadingLocations && !isLoadingAreas && !errorLocations && !errorAreas && (
                   <div className="space-y-6">
                       {filteredSortedLocations.map(location => {
                           const locationAreas = areasByLocation[location.id] || []; // Use ORIGINAL areas
                           return (
                               <Card 
                                 key={location.id} 
                                 id={`location-${location.id}`} 
                                 className="overflow-visible"
                               >
                                   <TooltipProvider delayDuration={100}> 
                                     <CardHeader className="flex flex-row items-center justify-between pb-3 bg-muted/25">
                                         <div className="flex items-center gap-2 min-w-0">
                                           <Building className="h-5 w-5 flex-shrink-0" />
                                           <CardTitle className="truncate" title={location.name}>{location.name}</CardTitle>
                                         </div>
                                         {/* Action Buttons */} 
                                         <div className="flex items-center gap-1 flex-shrink-0">
                                             {/* NEW: Arm All Dropdown */} 
                                             <DropdownMenu>
                                               <Tooltip>
                                                 <TooltipTrigger asChild>
                                                   <DropdownMenuTrigger asChild>
                                                     <Button 
                                                       variant="ghost" 
                                                       size="icon" 
                                                       className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-100 dark:text-green-500 dark:hover:text-green-500 dark:hover:bg-green-900/50 disabled:opacity-50 disabled:pointer-events-none"
                                                       disabled={locationArmLoading[location.id] || locationAreas.length === 0}
                                                     >
                                                        {locationArmLoading[location.id] ? 
                                                         <Loader2 className="h-4 w-4 animate-spin" /> :
                                                         <ShieldCheck className="h-4 w-4" /> 
                                                       }
                                                       <span className="sr-only">Arm All Areas Options</span>
                                                     </Button>
                                                   </DropdownMenuTrigger>
                                                 </TooltipTrigger>
                                                 <TooltipContent>
                                                   <p>Arm All</p>
                                                 </TooltipContent>
                                               </Tooltip>
                                               <DropdownMenuContent align="end">
                                                 <DropdownMenuItem onClick={() => handleLocationArmAction(location.id, ArmedState.ARMED_AWAY)}>
                                                   {/* <ShieldCheck className="h-4 w-4 mr-2" /> // Icon provided by shadcn class */} 
                                                   Arm Away
                                                 </DropdownMenuItem>
                                                 <DropdownMenuItem onClick={() => handleLocationArmAction(location.id, ArmedState.ARMED_STAY)}>
                                                   {/* <ShieldCheck className="h-4 w-4 mr-2" /> // Icon provided by shadcn class */}
                                                   Arm Stay
                                                 </DropdownMenuItem>
                                               </DropdownMenuContent>
                                             </DropdownMenu>
                                             {/* End: Arm All Dropdown */} 
                                             
                                             {/* Disarm All Button */} 
                                             <Tooltip>
                                               <TooltipTrigger asChild>
                                                 <Button 
                                                   variant="ghost" 
                                                   size="icon" 
                                                   className="h-7 w-7 disabled:opacity-50 disabled:pointer-events-none" 
                                                   onClick={() => handleLocationArmAction(location.id, ArmedState.DISARMED)}
                                                   disabled={locationArmLoading[location.id] || locationAreas.length === 0}
                                                 >
                                                   {locationArmLoading[location.id] ? 
                                                     <Loader2 className="h-4 w-4 animate-spin" /> :
                                                     <ShieldOff className="h-4 w-4" /> 
                                                   }
                                                   <span className="sr-only">Disarm All Areas</span>
                                                 </Button>
                                               </TooltipTrigger>
                                               <TooltipContent>
                                                 <p>Disarm All</p>
                                               </TooltipContent>
                                             </Tooltip>
                                             
                                             <Separator orientation="vertical" className="h-5 mx-1" /> 
                                             
                                             {/* Reintroduce Dropdown for Location Actions */} 
                                             <DropdownMenu>
                                                 <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-7 w-7">
                                                       <span className="sr-only">Location Actions</span>
                                                       <MoreHorizontal className="h-4 w-4" />
                                                    </Button>
                                                 </DropdownMenuTrigger>
                                                 <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onClick={() => handleOpenAreaDialog(null, location.id)}>
                                                       <Plus className="h-4 w-4 mr-2" /> 
                                                       Add Area
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => handleOpenLocationDialog(location)}>
                                                       <Pencil className="h-4 w-4 mr-2" /> 
                                                       Edit Location
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
                                         </div>
                                     </CardHeader>
                                     <CardContent className="pt-0 bg-muted/25 rounded-b-lg"> 
                                         {locationAreas.length > 0 ? (
                                             locationAreas.map(area => (
                                                 <AreaCardWrapper key={area.id} area={area}>
                                                     <AreaCard 
                                                         area={area}
                                                         allDevices={allDevices}
                                                         isSelected={selectedArea?.id === area.id}
                                                         isDevicesExpanded={expandedAreaDevices[area.id] ?? false}
                                                         locationArmLoading={locationArmLoading[location.id]}
                                                         onToggleDetails={toggleAreaDevices}
                                                         onAssignDevices={handleOpenAssignDevicesDialog}
                                                         onEditArea={handleOpenAreaDialog}
                                                         onDeleteArea={handleOpenAreaDeleteDialog}
                                                         onArmAction={handleArmAction}
                                                         onViewCameras={handleOpenCameraWallDialog}
                                                         // isOver is managed by AreaCardWrapper and passed down
                                                     />
                                                 </AreaCardWrapper>
                                             ))
                                         ) : (
                                             <div className="px-4 py-6 text-center">
                                                 <div className="rounded-full bg-muted p-3 mb-2 inline-flex">
                                                   <MapPin className="h-5 w-5 text-muted-foreground" />
                                                 </div>
                                                 <p className="text-sm text-muted-foreground mb-2">
                                                     No areas assigned to this location. 
                                                 </p>
                                                 <Button variant="outline" size="sm" onClick={() => handleOpenAreaDialog(null, location.id)}>
                                                   <Plus className="h-3.5 w-3.5" /> Add Area
                                                 </Button>
                                             </div>
                                         )}
                                     </CardContent>
                                 </TooltipProvider>
                               </Card>
                           );
                       })}

                       {searchTerm === '' && areasByLocation['unassigned'] && areasByLocation['unassigned'].length > 0 && (
                           <Card>
                               <CardHeader>
                                   <CardTitle>Unassigned Areas</CardTitle>
                                   <CardDescription>These areas are not linked to any specific location.</CardDescription>
                               </CardHeader>
                               <CardContent>
                                   {areasByLocation['unassigned'].map(area => (
                                       <AreaCardWrapper key={area.id} area={area}>
                                           <AreaCard 
                                               area={area}
                                               allDevices={allDevices}
                                               isSelected={selectedArea?.id === area.id}
                                               isDevicesExpanded={expandedAreaDevices[area.id] ?? false}
                                               locationArmLoading={false} // Unassigned areas don't belong to a location
                                               onToggleDetails={toggleAreaDevices}
                                               onAssignDevices={handleOpenAssignDevicesDialog}
                                               onEditArea={handleOpenAreaDialog}
                                               onDeleteArea={handleOpenAreaDeleteDialog}
                                               onArmAction={handleArmAction}
                                               onViewCameras={handleOpenCameraWallDialog}
                                               // isOver is managed by AreaCardWrapper and passed down
                                           />
                                       </AreaCardWrapper>
                                   ))}
                               </CardContent>
                           </Card>
                       )}

                       {isFilteredEmptyState && (
                            <Card className="border-dashed">
                                <CardContent className="pt-10 pb-10 px-6 flex flex-col items-center text-center">
                                  <div className="rounded-full p-6 mb-4">
                                    <Building className="h-12 w-12 text-muted-foreground" />
                                  </div>
                                  <CardTitle className="mb-2 ">
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
                                     : // Locations represent physical buildings or sites...
                                       <>
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
          </ScrollArea>
        </div>

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

        {/* --- ADDED: Camera Wall Dialog --- */} 
        {/* Render dialog only when an area is selected */} 
        {selectedAreaForCameraWall && ( 
          <AreaCameraWallDialog
            isOpen={isCameraWallDialogOpen}
            onOpenChange={handleCameraWallDialogChange}
            areaName={selectedAreaForCameraWall.name}
            // Pass only the relevant camera devices for the selected area
            cameraDevices={allDevices.filter(device => 
              selectedAreaForCameraWall.deviceIds?.includes(device.id) && 
              device.deviceTypeInfo?.type === DeviceType.Camera
            )}
          />
        )} 
        {/* --- END ADDED --- */} 
      </div>
    </DndContext>
  );
} 