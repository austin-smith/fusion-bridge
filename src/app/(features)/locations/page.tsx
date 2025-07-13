'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useFusionStore } from '@/stores/store';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Terminal, Loader2, Plus, MoreHorizontal, Building, PanelLeftOpen, PanelLeftClose, Search, Pencil, Trash2, Box } from 'lucide-react';
import { LocationEditDialog } from '@/components/features/locations/locations/location-edit-dialog';
import { SpaceEditDialog } from '@/components/features/locations/spaces/space-edit-dialog';
import { SpaceDeviceAssignmentDialog } from '@/components/features/locations/spaces/space-device-assignment-dialog';
import { CameraWallDialog } from '@/components/features/common/camera-wall-dialog';
import { SpaceCard } from '@/components/features/locations/spaces/SpaceCard';
import { LocationTreeView } from '@/components/features/locations/locations/location-tree-view';
import type { Location, Space, DeviceWithConnector } from "@/types/index";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
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
} from "@/components/ui/alert-dialog";
import { toast } from 'sonner';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { cn } from '@/lib/utils';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/layout/page-header';
import { DeviceType } from "@/lib/mappings/definitions";
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

export default function LocationsPage() {
  // Set page title
  useEffect(() => {
    document.title = 'Locations & Spaces // Fusion';
  }, []);

  const { 
    locations, 
    isLoadingLocations, 
    errorLocations, 
    fetchLocations,
    addLocation,
    updateLocation,
    deleteLocation,
    spaces,
    isLoadingSpaces,
    errorSpaces,
    fetchSpaces,
    addSpace,
    updateSpace,
    deleteSpace,
    assignDeviceToSpace,
    removeDeviceFromSpace,
    allDevices,
    isLoadingAllDevices,
    errorAllDevices,
    fetchAllDevices,
    activeOrganizationId,
  } = useFusionStore((state) => ({
    locations: state.locations,
    isLoadingLocations: state.isLoadingLocations,
    errorLocations: state.errorLocations,
    fetchLocations: state.fetchLocations,
    addLocation: state.addLocation,
    updateLocation: state.updateLocation,
    deleteLocation: state.deleteLocation,
    spaces: state.spaces,
    isLoadingSpaces: state.isLoadingSpaces,
    errorSpaces: state.errorSpaces,
    fetchSpaces: state.fetchSpaces,
    addSpace: state.addSpace,
    updateSpace: state.updateSpace,
    deleteSpace: state.deleteSpace,
    assignDeviceToSpace: state.assignDeviceToSpace,
    removeDeviceFromSpace: state.removeDeviceFromSpace,
    allDevices: state.allDevices,
    isLoadingAllDevices: state.isLoadingAllDevices,
    errorAllDevices: state.errorAllDevices,
    fetchAllDevices: state.fetchAllDevices,
    activeOrganizationId: state.activeOrganizationId,
  }));

  // Dialog states
  const [isLocationDialogOpen, setIsLocationDialogOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [isLocationDeleteDialogOpen, setIsLocationDeleteDialogOpen] = useState(false);
  const [locationToDelete, setLocationToDelete] = useState<Location | null>(null);
  const [isSpaceDialogOpen, setIsSpaceDialogOpen] = useState(false);
  const [editingSpace, setEditingSpace] = useState<Space | null>(null);
  const [isSpaceDeleteDialogOpen, setIsSpaceDeleteDialogOpen] = useState(false);
  const [spaceToDelete, setSpaceToDelete] = useState<Space | null>(null);
  const [isAssignDeviceDialogOpen, setIsAssignDeviceDialogOpen] = useState(false);
  const [spaceToAssignDevice, setSpaceToAssignDevice] = useState<Space | null>(null);
  const [isCameraWallDialogOpen, setIsCameraWallDialogOpen] = useState(false);
  const [selectedSpaceForCameraWall, setSelectedSpaceForCameraWall] = useState<Space | null>(null);
  const [expandedSpaceDevices, setExpandedSpaceDevices] = useState<Record<string, boolean>>({});
  const [searchTerm, setSearchTerm] = useState('');

  // Tree view state with localStorage persistence
  const [showTreeView, setShowTreeView] = useState<boolean | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [selectedSpace, setSelectedSpace] = useState<Space | null>(null);

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
    const storedState = localStorage.getItem('locationTreeViewVisible');
    setShowTreeView(storedState ? JSON.parse(storedState) : false);
  }, []);

  // Effect to update localStorage when showTreeView changes
  useEffect(() => {
    if (showTreeView !== null) {
      localStorage.setItem('locationTreeViewVisible', JSON.stringify(showTreeView));
    }
  }, [showTreeView]);

  useEffect(() => {
    fetchLocations();
    fetchSpaces();
    fetchAllDevices();
  }, [fetchLocations, fetchSpaces, fetchAllDevices]);

  // Location handlers
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
    if (success) await fetchLocations();
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

  // Space handlers
  const handleOpenSpaceDialog = (space: Space | null, defaultLocationId?: string) => {
    setEditingSpace(space ? 
        { ...space } : 
        { 
            id: '', 
            name: '', 
            locationId: defaultLocationId ?? '',
            deviceIds: [],
            createdAt: new Date(),
            updatedAt: new Date()
        });
    setIsSpaceDialogOpen(true);
  };

  const handleSpaceDialogSubmit = async (formData: { name: string; locationId: string; description?: string }, spaceId?: string): Promise<boolean> => {
    let success = false;
    try {
      if (spaceId && spaceId !== '') {
        const result = await updateSpace(spaceId, formData);
        if (!result) throw new Error("Update failed in store");
        toast.success("Space updated successfully!");
        success = true;
      } else {
        const result = await addSpace(formData);
        if (!result) throw new Error("Add failed in store");
        toast.success("Space created successfully!");
        success = true;
      }
    } catch (error) {
       toast.error(error instanceof Error ? error.message : "An unknown error occurred while saving the space.");
       success = false;
    }
    if (success) await fetchSpaces();
    return success;
  };

  const handleOpenSpaceDeleteDialog = (space: Space | null) => {
    if (!space) return;
    setSpaceToDelete(space);
    setIsSpaceDeleteDialogOpen(true);
  };

  const confirmDeleteSpace = async () => {
    if (!spaceToDelete) return;
    const success = await deleteSpace(spaceToDelete.id);
    if (success) {
        toast.success(`Space "${spaceToDelete.name}" deleted.`);
    } else {
        toast.error(`Failed to delete space "${spaceToDelete.name}".`);
    }
    setSpaceToDelete(null);
    setIsSpaceDeleteDialogOpen(false);
  };

  const handleOpenAssignDeviceDialog = (space: Space | null) => {
    if (!space) return;
    setSpaceToAssignDevice(space);
    setIsAssignDeviceDialogOpen(true);
  };

  const handleAssignDeviceDialogChange = (isOpen: boolean) => {
    const spaceIdBeingModified = spaceToAssignDevice?.id;
    setIsAssignDeviceDialogOpen(isOpen);
    if (!isOpen && spaceIdBeingModified) {
      // After dialog closes, ensure the modified space remains expanded
      setExpandedSpaceDevices(prev => ({
        ...prev,
        [spaceIdBeingModified]: true
      }));
      setSpaceToAssignDevice(null);
    } else if (!isOpen) {
      setSpaceToAssignDevice(null);
    }
  };

  const toggleSpaceDevices = (spaceId: string) => {
    setExpandedSpaceDevices(prev => ({ ...prev, [spaceId]: !prev[spaceId] }));
  };

  const handleViewCameras = (space: Space) => {
    setSelectedSpaceForCameraWall(space);
    setIsCameraWallDialogOpen(true);
  };

  const handleCameraWallDialogChange = (isOpen: boolean) => {
    setIsCameraWallDialogOpen(isOpen);
    if (!isOpen) {
      setSelectedSpaceForCameraWall(null);
    }
  };

  // Tree view handlers
  const handleTreeSelectItem = useCallback((item: { type: 'location' | 'space', location: Location | null, space: Space | null }) => {
    setSelectedLocation(item.location);
    setSelectedSpace(item.space);
  }, []);

  // Drag and Drop handlers
  const SpaceCardWrapper = ({ space, children }: { space: Space; children: React.ReactNode }) => {
    const { setNodeRef, isOver } = useDroppable({
        id: space.id,
        data: { type: 'space' } 
    });
    const isSelected = selectedSpace?.id === space.id;

    return (
        <div
            ref={setNodeRef}
            id={`space-${space.id}`}
            className="mb-3"
        >
            {React.cloneElement(children as React.ReactElement, { isSelected, isOver })}
        </div>
    );
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id && active.data.current?.type === 'device' && over.data.current?.type === 'space') {
        const deviceId = active.id as string;
        const targetSpaceId = over.id as string;
        const sourceSpaceId = active.data.current?.sourceSpaceId as string | undefined;

        // Find details for potential toast messages
        const device = allDevices.find(d => d.id === deviceId);
        const targetSpace = spaces.find(s => s.id === targetSpaceId);

        if (!deviceId || !targetSpaceId || !targetSpace) {
            console.error("DragEnd: Missing device ID, target space ID, or target space not found.", { deviceId, targetSpaceId, sourceSpaceId });
            toast.error("Failed to move device: Invalid data.");
            return;
        }
        
        if (sourceSpaceId === targetSpaceId) {
            console.log("DragEnd: Source and target space are the same. No action taken.");
            return;
        }

        try {
          // For spaces, we assign the device to the new space (which automatically removes it from the old one)
          const success = await assignDeviceToSpace(targetSpaceId, deviceId);
          
          if (success) {
             toast.success(`Moved ${device?.name ?? 'device'} to ${targetSpace.name}.`);
             console.log(`Device ${deviceId} moved to space ${targetSpaceId}.`);
          } else {
            toast.error(`Failed to move ${device?.name ?? 'device'} to ${targetSpace.name}.`);
            console.warn(`Failed to move device ${deviceId} to space ${targetSpaceId}.`);
          }
        } catch (error) { 
          console.error("Error moving device:", error);
          toast.error(`An error occurred while moving ${device?.name ?? 'device'}.`);
        }
    } else {
        console.log("DragEnd: Invalid drop target or condition not met", { active, over });
    }
  };

  // Skeleton Component for Combined Page
  const CombinedPageSkeleton = ({ locationCount = 3, spacesPerLocation = 2 }: { locationCount?: number; spacesPerLocation?: number }) => {
    return (
      <div className="space-y-6">
        {[...Array(locationCount)].map((_, locationIndex) => (
          <Card key={locationIndex} className="overflow-visible">
            <CardHeader className="flex flex-row items-center justify-between pb-3 bg-muted/25">
              <div className="flex items-center gap-2 min-w-0">
                <Skeleton className="h-5 w-5 rounded" />
                <Skeleton className="h-6 w-32 rounded" />
              </div>
              <Skeleton className="h-7 w-7 rounded" />
            </CardHeader>
            <CardContent className="pt-3 space-y-3">
              {[...Array(spacesPerLocation)].map((_, spaceIndex) => (
                <Card key={spaceIndex} className="border border-border/50">
                  <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
                    <div className="flex items-center gap-2 min-w-0">
                      <Skeleton className="h-4 w-4 rounded" />
                      <Skeleton className="h-4 w-4 rounded" />
                      <Skeleton className="h-5 w-28 rounded" />
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Skeleton className="h-7 w-7 rounded-md" />
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  const renderLoading = () => <CombinedPageSkeleton />;

  const renderError = (error: string | null, type: string) => (
     <Alert variant="destructive" className="mb-4">
        <Terminal className="h-4 w-4" />
        <AlertTitle>Error Fetching {type}</AlertTitle>
        <AlertDescription>
          {error || "An unknown error occurred."}
        </AlertDescription>
      </Alert>
  );

  // Group spaces by location
  const spacesByLocation = useMemo(() => {
    const grouped: Record<string, Space[]> = {};
    spaces.forEach(space => {
        const locId = space.locationId ?? 'unassigned';
        if (!grouped[locId]) {
            grouped[locId] = [];
        }
        grouped[locId].push(space);
    });
    // Sort groups internally
    Object.values(grouped).forEach(spaceGroup => {
        spaceGroup.sort((a, b) => a.name.localeCompare(b.name));
    });
    return grouped;
  }, [spaces]);

  // Filter locations and spaces based on search
  const filteredSortedLocations = useMemo(() => {
    const lowerSearchTerm = searchTerm.toLowerCase();
    
    if (!searchTerm) {
      return [...locations].sort((a, b) => a.name.localeCompare(b.name));
    }
    
    // Filter locations by name OR if they contain spaces that match the search
    const filtered = locations.filter(location => 
      location.name.toLowerCase().includes(lowerSearchTerm) ||
      (spacesByLocation[location.id] || []).some(space => 
        space.name.toLowerCase().includes(lowerSearchTerm)
      )
    );
    
    return filtered.sort((a, b) => a.name.localeCompare(b.name));
  }, [locations, searchTerm, spacesByLocation]);

  const isFilteredEmptyState = !isLoadingLocations && !isLoadingSpaces && 
                               filteredSortedLocations.length === 0 && 
                               (searchTerm !== '' || (!spacesByLocation['unassigned'] || spacesByLocation['unassigned'].length === 0));
  const hasOriginalData = locations.length > 0 || spaces.length > 0;

  // Define page actions
  const pageActions = (
    <>
      <div className="relative flex-shrink-0">
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
        <Button variant="outline" onClick={() => handleOpenLocationDialog(null)} size="sm">
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
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="flex flex-col h-full"> 
        <div className="p-4 border-b flex-shrink-0">
          <PageHeader 
            title="Locations & Spaces"
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
              locations={locations}
              spaces={spaces}
              searchTerm={searchTerm}
              selectedLocationId={selectedLocation?.id || null}
              selectedSpaceId={selectedSpace?.id || null}
              onLocationSelect={(locationId) => {
                const location = locations.find(l => l.id === locationId) || null;
                handleTreeSelectItem({ type: 'location', location, space: null });
              }}
              onSpaceSelect={(spaceId) => {
                const space = spaces.find(s => s.id === spaceId) || null;
                const location = space ? locations.find(l => l.id === space.locationId) || null : null;
                handleTreeSelectItem({ type: 'space', location, space });
              }}
            />
          )}

          <ScrollArea className="flex-1"> 
             <div className={cn("p-4 md:p-6", showTreeView ? "md:pr-6" : "md:px-6")}>
               {(isLoadingLocations || isLoadingSpaces) && renderLoading()}
               {errorLocations && renderError(errorLocations, 'Locations')}
               {errorSpaces && renderError(errorSpaces, 'Spaces')}
               
               {!isLoadingLocations && !isLoadingSpaces && !errorLocations && !errorSpaces && (
                   <div className="space-y-6">
                       {filteredSortedLocations.map(location => {
                           const locationSpaces = spacesByLocation[location.id] || [];
                           const filteredSpaces = searchTerm 
                             ? locationSpaces.filter(space => space.name.toLowerCase().includes(searchTerm.toLowerCase()))
                             : locationSpaces;
                             
                           if (filteredSpaces.length === 0 && searchTerm && !location.name.toLowerCase().includes(searchTerm.toLowerCase())) {
                             return null; // Hide locations with no matching spaces when searching (unless location name matches)
                           }

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
                                         <div className="flex items-center gap-1 flex-shrink-0">
                                             <DropdownMenu>
                                                 <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-7 w-7">
                                                       <span className="sr-only">Location Actions</span>
                                                       <MoreHorizontal className="h-4 w-4" />
                                                    </Button>
                                                 </DropdownMenuTrigger>
                                                 <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onClick={() => handleOpenSpaceDialog(null, location.id)}>
                                                       <Plus className="h-4 w-4 mr-2" /> 
                                                       Add Space
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
                                     <CardContent className="pt-3">
                                         {filteredSpaces.length > 0 ? (
                                             filteredSpaces.map(space => (
                                               <div key={`space-display-wrapper-${space.id}`} className="mb-3">
                                                 <SpaceCardWrapper key={space.id} space={space}>
                                                   <SpaceCard 
                                                     space={space}
                                                     allDevices={allDevices}
                                                     isDevicesExpanded={expandedSpaceDevices[space.id] ?? false}
                                                     onToggleDetails={toggleSpaceDevices}
                                                     onAssignDevice={handleOpenAssignDeviceDialog}
                                                     onEditSpace={handleOpenSpaceDialog}
                                                     onDeleteSpace={handleOpenSpaceDeleteDialog}
                                                     onViewCameras={handleViewCameras}
                                                   />
                                                 </SpaceCardWrapper>
                                               </div>
                                             ))
                                         ) : (
                                             <div className="px-4 py-6 text-center">
                                                 <div className="rounded-full bg-muted p-3 mb-2 inline-flex">
                                                   <Box className="h-5 w-5 text-muted-foreground" />
                                                 </div>
                                                 <p className="text-sm text-muted-foreground mb-2">
                                                     No spaces in this location. 
                                                 </p>
                                                 <Button variant="outline" size="sm" onClick={() => handleOpenSpaceDialog(null, location.id)}>
                                                   <Plus className="h-3.5 w-3.5" /> Add Space
                                                 </Button>
                                             </div>
                                         )}
                                     </CardContent>
                                 </TooltipProvider>
                               </Card>
                           );
                       })}

                       {searchTerm === '' && spacesByLocation['unassigned'] && spacesByLocation['unassigned'].length > 0 && (
                           <Card>
                               <CardHeader>
                                   <CardTitle>Unassigned Spaces</CardTitle>
                                   <CardDescription>These spaces are not linked to any specific location.</CardDescription>
                               </CardHeader>
                               <CardContent>
                                   {spacesByLocation['unassigned'].map(space => (
                                     <div key={`unassigned-space-display-wrapper-${space.id}`} className="mb-3">
                                       <SpaceCardWrapper key={space.id} space={space}>
                                         <SpaceCard 
                                           space={space}
                                           allDevices={allDevices}
                                           isDevicesExpanded={expandedSpaceDevices[space.id] ?? false}
                                           onToggleDetails={toggleSpaceDevices}
                                           onAssignDevice={handleOpenAssignDeviceDialog}
                                           onEditSpace={handleOpenSpaceDialog}
                                           onDeleteSpace={handleOpenSpaceDeleteDialog}
                                           onViewCameras={handleViewCameras}
                                         />
                                       </SpaceCardWrapper>
                                     </div>
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
                                  <CardTitle className="mb-2">
                                    {hasOriginalData && searchTerm !== ''
                                     ? "No locations or spaces match your search."
                                     : "Locations represent physical buildings or sites."
                                    }
                                  </CardTitle>
                                  <CardDescription className="mb-6 max-w-md">
                                    {hasOriginalData && searchTerm !== ''
                                     ? "Try adjusting your search term."
                                     : "Create locations and organize devices into spaces within them."
                                    }
                                  </CardDescription>
                                  {(!hasOriginalData || searchTerm === '') && (
                                    <Button onClick={() => handleOpenLocationDialog(null)}>
                                      <Plus className="h-4 w-4 mr-2" />
                                      Create Your First Location
                                    </Button>
                                  )}
                                  {hasOriginalData && searchTerm !== '' && (
                                    <Button variant="outline" onClick={() => setSearchTerm('')}>
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

        {/* Dialogs */}
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
                and all of its child locations and associated spaces.
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
  
        <SpaceEditDialog
          isOpen={isSpaceDialogOpen}
          onOpenChange={setIsSpaceDialogOpen}
          spaceToEdit={editingSpace}
          allLocations={locations}
          allSpaces={spaces}
          onSubmit={handleSpaceDialogSubmit}
        />
  
        <AlertDialog open={isSpaceDeleteDialogOpen} onOpenChange={setIsSpaceDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the space 
                <strong className="px-1">{spaceToDelete?.name}</strong> 
                and remove its device associations.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setSpaceToDelete(null)}>Cancel</AlertDialogCancel>
              <AlertDialogAction 
                onClick={confirmDeleteSpace} 
                className={cn(buttonVariants({ variant: "destructive" }))}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
  
        <SpaceDeviceAssignmentDialog
          isOpen={isAssignDeviceDialogOpen}
          onOpenChange={handleAssignDeviceDialogChange}
          space={spaceToAssignDevice}
          allDevices={allDevices}
          allSpaces={spaces}
          assignDeviceAction={assignDeviceToSpace}
          removeDeviceAction={removeDeviceFromSpace}
        />

        {/* Camera Wall Dialog */}
        {selectedSpaceForCameraWall && (
          <CameraWallDialog
            isOpen={isCameraWallDialogOpen}
            onOpenChange={handleCameraWallDialogChange}
            title={`Camera Wall: ${selectedSpaceForCameraWall.name}`}
            cameraDevices={allDevices.filter(device => 
              selectedSpaceForCameraWall.deviceIds?.includes(device.id) && 
              device.deviceTypeInfo?.type === DeviceType.Camera
            )}
          />
        )}
      </div>
    </DndContext>
  );
} 