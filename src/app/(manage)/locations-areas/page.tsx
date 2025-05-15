'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useFusionStore } from '@/stores/store';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Terminal, Loader2, Plus, MoreHorizontal, ChevronDown, ChevronRight, ArrowUpDown, ArrowDown, ArrowUp, Building, MapPin, Settings, Link, ShieldCheck, ShieldOff, ShieldAlert, Trash2, Shield, Pencil, PanelLeftOpen, PanelLeftClose, Move, Search, Video } from 'lucide-react';
import { LocationEditDialog } from '@/components/features/locations-areas/locations/location-edit-dialog';
import { AreaEditDialog } from '@/components/features/locations-areas/areas/area-edit-dialog';
import { AreaDeviceAssignmentDialog } from '@/components/features/locations-areas/areas/area-device-assignment-dialog';
import { AreaCameraWallDialog } from '@/components/features/locations-areas/areas/area-camera-wall-dialog';
import { AreaCard } from '@/components/features/locations-areas/areas/AreaCard';
import AreaStatusDisplay from '@/components/alarm/AreaStatusDisplay';
import { LocationTreeView } from '@/components/features/locations-areas/locations/location-tree-view';
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
import { AreaDevicesSubRow } from '@/components/features/locations-areas/areas/AreaDevicesSubRow';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { format, parse } from 'date-fns';

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
    armingSchedules,
    isLoadingArmingSchedules,
    fetchArmingSchedules,
    setLocationDefaultSchedule,
    setAreaOverrideSchedule,
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
    armingSchedules: state.armingSchedules,
    isLoadingArmingSchedules: state.isLoadingArmingSchedules,
    fetchArmingSchedules: state.fetchArmingSchedules,
    setLocationDefaultSchedule: state.setLocationDefaultSchedule,
    setAreaOverrideSchedule: state.setAreaOverrideSchedule,
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
    fetchArmingSchedules();
  }, [fetchLocations, fetchAreas, fetchAllDevices, fetchArmingSchedules]);

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

  const handleOpenAssignDevicesDialog = (area: Area | null) => {
    if (!area) return;
    setAreaToAssignDevices(area);
    setIsAssignDevicesDialogOpen(true);
  };

  const toggleAreaDevices = (areaId: string) => {
    setExpandedAreaDevices(prev => ({ ...prev, [areaId]: !prev[areaId] }));
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

  // ---> ADDED: Handler for item selection from LocationTreeView
  const handleTreeSelectItem = useCallback((item: { type: 'location' | 'area', location: Location | null, area: Area | null }) => {
    setSelectedLocation(item.location);
    setSelectedArea(item.area);
    // Scrolling is now handled within LocationTreeView after selection
  }, []);
  // <--- END ADDED

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

  // Add this new handler for area-specific arming
  const handleAreaArmAction = async (area: Area, state: ArmedState) => {
    try {
      const success = await updateAreaArmedState(area.id, state);
      if (success) {
        toast.success(`Area "${area.name}" ${state === ArmedState.DISARMED ? 'disarmed' : `armed (${ArmedStateDisplayNames[state]})`}.`);
      } else {
        toast.error(`Failed to update area "${area.name}".`);
      }
    } catch (error) {
      console.error("Error updating area state:", error);
      toast.error(`An error occurred while updating area state.`);
    }
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

  // --- NEW: Handlers for setting schedules ---
  const handleSetLocationDefaultSchedule = async (locationId: string, newScheduleId: string | null) => {
    // The value from Select will be string or "null_value_placeholder"
    const finalScheduleId = newScheduleId === 'null_value_placeholder' ? null : newScheduleId;
    await setLocationDefaultSchedule(locationId, finalScheduleId);
    // Toast and error handling is in the store action
  };

  const handleSetAreaOverrideSchedule = async (areaId: string, newScheduleId: string | null) => {
    const finalScheduleId = newScheduleId === 'null_value_placeholder' ? null : newScheduleId;
    await setAreaOverrideSchedule(areaId, finalScheduleId);
    // Toast and error handling is in the store action
  };
  // --- END NEW ---

  // Determine effective schedule for display (short form)
  const getScheduleDisplay = (scheduleId: string | null | undefined) => {
    if (!scheduleId) return null;
    const found = armingSchedules.find(s => s.id === scheduleId);
    return found ? found.name : null;
  };

  // Add function to format time in a readable way
  const formatTime = (timeString: string): string => {
    try {
      const date = parse(timeString, 'HH:mm', new Date());
      return format(date, 'h:mma'); // Convert 24-hour format to 12-hour with am/pm, no space
    } catch (error) {
      console.warn(`Invalid time string for formatting: ${timeString}`, error);
      return timeString; // Fallback to original string if parsing fails
    }
  };

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
            <LocationTreeView
              allLocations={locations}
              allAreas={areas}
              searchTerm={searchTerm}
              selectedLocationId={selectedLocation?.id || null}
              selectedAreaId={selectedArea?.id || null}
              onSelectItem={handleTreeSelectItem}
              onAddLocationClick={() => handleOpenLocationDialog(null)}
              hasOriginalData={hasOriginalData}
              // No explicit className needed here, default styling applies
            />
          )}

          <ScrollArea className="flex-1"> 
             <div className={cn("p-4 md:p-6", showTreeView ? "md:pr-6" : "md:px-6")}> {/* Add padding */} 
               {(isLoadingLocations || isLoadingAreas || isLoadingArmingSchedules) && renderLoading()} {/* Adjusted loading check */}
               {errorLocations && renderError(errorLocations, 'Locations')}
               {errorAreas && renderError(errorAreas, 'Areas')}
               
               {!isLoadingLocations && !isLoadingAreas && !isLoadingArmingSchedules && !errorLocations && !errorAreas && (
                   <div className="space-y-6">
                       {filteredSortedLocations.map(location => {
                           const locationAreas = areasByLocation[location.id] || [];
                           // ---> MODIFIED: Check if location (or its areas) should be visible based on tree selection or search
                           // If a location is selected in the tree, show it.
                           // If an area is selected, show its parent location.
                           // If no tree selection, show all filtered locations (current behavior).
                           const isLocationSelectedInTree = selectedLocation?.id === location.id && !selectedArea;
                           const isAreaUnderThisLocationSelectedInTree = selectedArea?.locationId === location.id;
                           
                           // When search is active, the tree's filtering (passed via filteredSortedLocations) handles visibility.
                           // When search is inactive and tree is visible:
                           //  - If a location is selected, only show that location.
                           //  - If an area is selected, only show its parent location.
                           //  - If nothing is selected in tree (and tree is shown), show all. This case needs care if we want to "focus" based on tree.
                           // For now, rely on filteredSortedLocations which is based on search.
                           // The tree selection primarily drives scrolling and highlighting, not filtering of the main content for now.

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
                                                   Arm Away
                                                 </DropdownMenuItem>
                                                 <DropdownMenuItem onClick={() => handleLocationArmAction(location.id, ArmedState.ARMED_STAY)}>
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
                                     <CardContent className="pt-4 pb-4 bg-muted/25 rounded-b-lg space-y-4"> {/* Added pb-4 and space-y-4 */}
                                         {/* --- Location Default Schedule Select --- */}
                                         <div className="border border-dashed rounded-md p-2.5 bg-transparent">
                                           <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                             <div className="space-y-0.5">
                                               <h4 className="text-sm font-medium text-muted-foreground">Default Arming Schedule</h4>
                                               <p className="text-xs text-muted-foreground/70">
                                                 Applied to all areas in this location unless overridden
                                               </p>
                                             </div>
                                             <Select 
                                               value={location.activeArmingScheduleId || 'null_value_placeholder'}
                                               onValueChange={(value) => handleSetLocationDefaultSchedule(location.id, value)}
                                             >
                                               <SelectTrigger className="w-full sm:w-[240px] h-8 border-dashed">
                                                 <SelectValue placeholder="Select default schedule...">
                                                   {location.activeArmingScheduleId ? 
                                                     armingSchedules.find(s => s.id === location.activeArmingScheduleId)?.name : 
                                                     "None"}
                                                 </SelectValue>
                                               </SelectTrigger>
                                               <SelectContent>
                                                 <SelectItem value="null_value_placeholder">
                                                   <div className="flex flex-col w-full">
                                                     <span>None</span>
                                                     <span className="text-muted-foreground text-xs">
                                                       Location will not be automatically armed or disarmed
                                                     </span>
                                                   </div>
                                                 </SelectItem>
                                                 {armingSchedules.map(schedule => (
                                                   <SelectItem key={schedule.id} value={schedule.id}>
                                                     <div className="flex flex-col w-full">
                                                       <span>{schedule.name}</span>
                                                       <span className="text-muted-foreground text-xs">
                                                         {formatTime(schedule.armTimeLocal)} - {formatTime(schedule.disarmTimeLocal)}
                                                       </span>
                                                     </div>
                                                   </SelectItem>
                                                 ))}
                                               </SelectContent>
                                             </Select>
                                           </div>
                                         </div>
                                         {/* --- End Location Default Schedule Select --- */}

                                         {locationAreas.length > 0 ? (
                                             locationAreas.map(area => {
                                               // Modify the effectiveSchedule determination to not include "(Default)" in the string
                                               const effectiveSchedule = area.overrideArmingScheduleId 
                                                 ? getScheduleDisplay(area.overrideArmingScheduleId)
                                                 : location.activeArmingScheduleId 
                                                   ? getScheduleDisplay(location.activeArmingScheduleId)
                                                   : 'None';

                                               // Add a flag to indicate if it's using the default schedule
                                               const isUsingLocationDefault = !area.overrideArmingScheduleId && !!location.activeArmingScheduleId;

                                               return (
                                                 <div key={`area-display-wrapper-${area.id}`} className="mb-3">
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
                                                       onViewCameras={handleOpenCameraWallDialog}
                                                       onArmAction={handleAreaArmAction}
                                                       scheduleInfo={{
                                                         effective: effectiveSchedule,
                                                         locationDefault: getScheduleDisplay(location.activeArmingScheduleId),
                                                         onChange: (value: string) => handleSetAreaOverrideSchedule(area.id, value),
                                                         value: area.overrideArmingScheduleId || 'null_value_placeholder',
                                                         schedules: armingSchedules,
                                                         isUsingLocationDefault: isUsingLocationDefault
                                                       }}
                                                     />
                                                   </AreaCardWrapper>
                                                 </div>
                                               );
                                             })
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
                                   {areasByLocation['unassigned'].map(area => {
                                       // Get effective schedule display info for unassigned area
                                       const effectiveSchedule = area.overrideArmingScheduleId 
                                         ? armingSchedules.find(s => s.id === area.overrideArmingScheduleId)?.name || 'Unknown'
                                         : 'None';
                                       
                                       // For unassigned areas, there is no location default
                                       const hasLocationDefault = false;

                                       return (
                                         <div key={`unassigned-area-display-wrapper-${area.id}`} className="mb-3">
                                           <AreaCardWrapper key={area.id} area={area}>
                                             <AreaCard 
                                               area={area}
                                               allDevices={allDevices}
                                               isSelected={selectedArea?.id === area.id}
                                               isDevicesExpanded={expandedAreaDevices[area.id] ?? false}
                                               locationArmLoading={false} 
                                               onToggleDetails={toggleAreaDevices}
                                               onAssignDevices={handleOpenAssignDevicesDialog}
                                               onEditArea={handleOpenAreaDialog}
                                               onDeleteArea={handleOpenAreaDeleteDialog}
                                               onViewCameras={handleOpenCameraWallDialog}
                                               onArmAction={handleAreaArmAction}
                                               scheduleInfo={{
                                                 effective: effectiveSchedule,
                                                 locationDefault: null, // No location default for unassigned areas
                                                 onChange: (value: string) => handleSetAreaOverrideSchedule(area.id, value),
                                                 value: area.overrideArmingScheduleId || 'null_value_placeholder',
                                                 schedules: armingSchedules,
                                                 isUnassigned: true,
                                                 isUsingLocationDefault: false // Unassigned areas can't use location defaults
                                               }}
                                             />
                                           </AreaCardWrapper>
                                         </div>
                                       );
                                   })}
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
                                     : "Locations represent physical buildings or sites." // Simplified from original combined message
                                    }
                                  </CardTitle>
                                  <CardDescription className="mb-6 max-w-md">
                                    {hasOriginalData && searchTerm !== ''
                                     ? "" // No extra description needed if search term yields no results
                                     : "Use them to organize your devices and control security by zone." // Simplified
                                    }
                                  </CardDescription>
                                  {/* Logic for button when NO data and NO search term */}
                                  {!hasOriginalData && searchTerm === '' && (
                                    <Button onClick={() => handleOpenLocationDialog(null)} className="gap-2">
                                      <Plus className="h-4 w-4" /> Add Your First Location
                                    </Button>
                                  )}
                                  {/* Logic for button when there IS data but search yields nothing */}
                                  {hasOriginalData && searchTerm !== '' && isFilteredEmptyState && (
                                    <Button variant="outline" onClick={() => setSearchTerm('')} className="gap-2">
                                      Clear Search
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
          armingSchedules={armingSchedules}
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