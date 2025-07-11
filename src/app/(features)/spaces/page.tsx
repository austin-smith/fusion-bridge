'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useFusionStore } from '@/stores/store';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Terminal, Loader2, Plus, MoreHorizontal, Package, Search, Video } from 'lucide-react';
import { SpaceEditDialog } from '@/components/features/locations/spaces/space-edit-dialog';
import { SpaceDeviceAssignmentDialog } from '@/components/features/locations/spaces/space-device-assignment-dialog';
import { SpaceCameraWallDialog } from '@/components/features/locations/spaces/space-camera-wall-dialog';
import { SpaceCard } from '@/components/features/locations/spaces/SpaceCard';
import type { Space, Location, DeviceWithConnector } from "@/types/index";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
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
import { DeviceType } from "@/lib/mappings/definitions";
import { cn } from '@/lib/utils';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/layout/page-header';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function SpacesPage() {
  // Set page title
  useEffect(() => {
    document.title = 'Spaces // Fusion';
  }, []);

  const { 
    locations, 
    isLoadingLocations, 
    errorLocations, 
    fetchLocations,
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
  const [locationFilter, setLocationFilter] = useState<string>('all');

  useEffect(() => {
    fetchLocations();
    fetchSpaces();
    fetchAllDevices();
  }, [fetchLocations, fetchSpaces, fetchAllDevices]);

  const handleAssignDeviceDialogChange = (isOpen: boolean) => {
    const spaceIdBeingModified = spaceToAssignDevice?.id;
    setIsAssignDeviceDialogOpen(isOpen);
    if (!isOpen && spaceIdBeingModified) {
      // When the dialog closes, refetch spaces
      fetchSpaces().then(() => {
        // After fetching, ensure the modified space remains expanded
        setExpandedSpaceDevices(prev => ({
          ...prev,
          [spaceIdBeingModified]: true
        }));
      });
      setSpaceToAssignDevice(null);
    } else if (!isOpen) {
      setSpaceToAssignDevice(null);
    }
  };

  const handleOpenSpaceDialog = (space: Space | null) => {
    setEditingSpace(space);
    setIsSpaceDialogOpen(true);
  };

  const handleSpaceDialogSubmit = async (formData: { name: string; locationId: string; description?: string }, spaceId?: string): Promise<boolean> => {
    let success = false;
    try {
      if (spaceId) {
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

  const renderLoading = () => (
    <div className="space-y-6">
      {[...Array(3)].map((_, index) => (
        <Card key={index}>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div className="flex items-center gap-2 min-w-0">
              <Skeleton className="h-5 w-5 rounded" />
              <Skeleton className="h-5 w-24 rounded" />
            </div>
            <Skeleton className="h-8 w-8 rounded" />
          </CardHeader>
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

  // Filter locations and spaces based on search and location filter
  const filteredSortedLocations = useMemo(() => {
    const lowerSearchTerm = searchTerm.toLowerCase();
    
    // Filter locations
    let filteredLocations = locations;
    if (locationFilter !== 'all') {
      filteredLocations = locations.filter(location => location.id === locationFilter);
    }
    
    // Filter by search term
    if (searchTerm) {
      filteredLocations = filteredLocations.filter(location => 
        location.name.toLowerCase().includes(lowerSearchTerm) ||
        (spacesByLocation[location.id] || []).some(space => 
          space.name.toLowerCase().includes(lowerSearchTerm)
        )
      );
    }
    
    return filteredLocations.sort((a, b) => a.name.localeCompare(b.name));
  }, [locations, searchTerm, locationFilter, spacesByLocation]);

  const isFilteredEmptyState = !isLoadingLocations && !isLoadingSpaces && 
                               filteredSortedLocations.length === 0 && 
                               (searchTerm !== '' || locationFilter !== 'all' || (!spacesByLocation['unassigned'] || spacesByLocation['unassigned'].length === 0));
  const hasOriginalData = locations.length > 0 || spaces.length > 0;

  // Define page actions
  const pageActions = (
    <>
      <div className="relative flex-shrink-0">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search spaces..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full rounded-lg bg-background pl-8 md:w-50 lg:w-60 h-9"
        />
      </div>
      <Select value={locationFilter} onValueChange={setLocationFilter}>
        <SelectTrigger className="w-[180px] h-9">
          <SelectValue placeholder="Filter by location" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Locations</SelectItem>
          {locations.map(location => (
            <SelectItem key={location.id} value={location.id}>
              {location.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!isFilteredEmptyState && (
        <Button variant="outline" onClick={() => handleOpenSpaceDialog(null)} size="sm">
          <Plus className="h-4 w-4" /> Add Space
        </Button>
      )}
    </>
  );

  return (
    <div className="flex flex-col h-full"> 
      <div className="p-4 border-b flex-shrink-0">
        <PageHeader 
          title="Spaces"
          description="Manage physical spaces where devices are located"
          icon={<Package className="h-6 w-6 text-muted-foreground" />}
          actions={pageActions}
        />
      </div>

      <ScrollArea className="flex-1"> 
        <div className="p-4 md:p-6">
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
                  
                if (filteredSpaces.length === 0 && searchTerm) {
                  return null; // Hide locations with no matching spaces when searching
                }
                
                return (
                  <Card key={location.id} className="overflow-visible">
                    <CardHeader className="flex flex-row items-center justify-between pb-3 bg-muted/25">
                      <div className="flex items-center gap-2 min-w-0">
                        <Package className="h-5 w-5 flex-shrink-0" />
                        <CardTitle className="truncate" title={location.name}>{location.name}</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-3">
                      {filteredSpaces.length > 0 ? (
                        filteredSpaces.map(space => (
                          <div key={space.id} className="mb-3 last:mb-0">
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
                          </div>
                        ))
                      ) : (
                        <div className="px-4 py-6 text-center">
                          <div className="rounded-full bg-muted p-3 mb-2 inline-flex">
                            <Package className="h-5 w-5 text-muted-foreground" />
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">
                            No spaces in this location. 
                          </p>
                          <Button variant="outline" size="sm" onClick={() => handleOpenSpaceDialog(null)}>
                            <Plus className="h-3.5 w-3.5" /> Add Space
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}

              {searchTerm === '' && locationFilter === 'all' && spacesByLocation['unassigned'] && spacesByLocation['unassigned'].length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Unassigned Spaces</CardTitle>
                    <CardDescription>These spaces are not linked to any specific location.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {spacesByLocation['unassigned'].map(space => (
                      <div key={space.id} className="mb-3 last:mb-0">
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
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {isFilteredEmptyState && (
                <Card className="border-dashed">
                  <CardContent className="pt-10 pb-10 px-6 flex flex-col items-center text-center">
                    <div className="rounded-full p-6 mb-4">
                      <Package className="h-12 w-12 text-muted-foreground" />
                    </div>
                    <CardTitle className="mb-2">
                      {hasOriginalData && (searchTerm !== '' || locationFilter !== 'all')
                       ? "No spaces match your search criteria."
                       : "Spaces represent physical locations where devices are placed."
                      }
                    </CardTitle>
                    <CardDescription className="mb-6 max-w-md">
                      {hasOriginalData && (searchTerm !== '' || locationFilter !== 'all')
                       ? "Try adjusting your search or location filter."
                       : "Create spaces to organize your devices by their physical location."
                      }
                    </CardDescription>
                    {(!hasOriginalData || (searchTerm === '' && locationFilter === 'all')) && (
                      <Button onClick={() => handleOpenSpaceDialog(null)}>
                        <Plus className="h-4 w-4 mr-2" />
                        Create Your First Space
                      </Button>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      </ScrollArea>
      
      <SpaceEditDialog
        isOpen={isSpaceDialogOpen}
        onOpenChange={setIsSpaceDialogOpen}
        spaceToEdit={editingSpace}
        allLocations={locations}
        onSubmit={handleSpaceDialogSubmit}
      />
      
      <SpaceDeviceAssignmentDialog
        isOpen={isAssignDeviceDialogOpen}
        onOpenChange={handleAssignDeviceDialogChange}
        space={spaceToAssignDevice}
        allDevices={allDevices}
        allSpaces={spaces}
        assignDeviceAction={assignDeviceToSpace}
        removeDeviceAction={removeDeviceFromSpace}
      />
      
      <AlertDialog open={isSpaceDeleteDialogOpen} onOpenChange={setIsSpaceDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the space 
              <strong className="px-1">{spaceToDelete?.name}</strong> 
              and remove any device assignments.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSpaceToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteSpace} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Camera Wall Dialog */}
      {selectedSpaceForCameraWall && (
        <SpaceCameraWallDialog
          isOpen={isCameraWallDialogOpen}
          onOpenChange={handleCameraWallDialogChange}
          spaceName={selectedSpaceForCameraWall.name}
          cameraDevices={allDevices.filter(device => 
            selectedSpaceForCameraWall.deviceIds?.includes(device.id) && 
            device.deviceTypeInfo?.type === DeviceType.Camera
          )}
        />
      )}
    </div>
  );
} 