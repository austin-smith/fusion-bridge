'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useFusionStore } from '@/stores/store';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Terminal, Loader2, Plus, MoreHorizontal, Building, PanelLeftOpen, PanelLeftClose, Search, Pencil, Trash2 } from 'lucide-react';
import { LocationEditDialog } from '@/components/features/locations/locations/location-edit-dialog';
import { LocationTreeView } from '@/components/features/locations/locations/location-tree-view';
import type { Location } from "@/types/index";
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

export default function LocationsPage() {

  // Set page title
  useEffect(() => {
    document.title = 'Locations // Fusion';
  }, []);

  const { 
    locations, 
    isLoadingLocations, 
    errorLocations, 
    fetchLocations,
    addLocation,
    updateLocation,
    deleteLocation,
    activeOrganizationId,
  } = useFusionStore((state) => ({
    locations: state.locations,
    isLoadingLocations: state.isLoadingLocations,
    errorLocations: state.errorLocations,
    fetchLocations: state.fetchLocations,
    addLocation: state.addLocation,
    updateLocation: state.updateLocation,
    deleteLocation: state.deleteLocation,
    activeOrganizationId: state.activeOrganizationId,
  }));

  const [isLocationDialogOpen, setIsLocationDialogOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [isLocationDeleteDialogOpen, setIsLocationDeleteDialogOpen] = useState(false);
  const [locationToDelete, setLocationToDelete] = useState<Location | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Tree view state with localStorage persistence
  const [showTreeView, setShowTreeView] = useState<boolean | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);

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
  }, [fetchLocations]);

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

  const filteredSortedLocations = useMemo(() => {
    const lowerSearchTerm = searchTerm.toLowerCase();
    const filtered = locations.filter(location => 
      location.name.toLowerCase().includes(lowerSearchTerm)
    );
    return filtered.sort((a, b) => a.name.localeCompare(b.name));
  }, [locations, searchTerm]); 
  
  const isFilteredEmptyState = !isLoadingLocations && 
                               filteredSortedLocations.length === 0 && 
                               (searchTerm !== '');
  const hasOriginalData = locations.length > 0;

  const handleTreeSelectItem = useCallback((item: { type: 'location', location: Location | null }) => {
    setSelectedLocation(item.location);
  }, []);

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
      <div className="flex flex-col h-full"> 
        <div className="p-4 border-b flex-shrink-0">
          <PageHeader 
            title="Locations"
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
              searchTerm={searchTerm}
              selectedLocationId={selectedLocation?.id || null}
              onLocationSelect={(locationId) => {
                const location = locations.find(l => l.id === locationId) || null;
                handleTreeSelectItem({ type: 'location', location });
              }}
            />
          )}

          <ScrollArea className="flex-1"> 
             <div className={cn("p-4 md:p-6", showTreeView ? "md:pr-6" : "md:px-6")}>
               {isLoadingLocations && renderLoading()}
               {errorLocations && renderError(errorLocations, 'Locations')}
               
               {!isLoadingLocations && !errorLocations && (
                   <div className="space-y-6">
                       {filteredSortedLocations.map(location => {
                           return (
                               <Card 
                                 key={location.id} 
                                 id={`location-${location.id}`} 
                                 className="overflow-visible"
                               >
                                   <TooltipProvider delayDuration={100}> 
                                     <CardHeader className="flex flex-row items-center justify-between pb-3">
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
                                     <CardContent className="pt-0">
                                         <p className="text-sm text-muted-foreground">
                                           Manage spaces and alarm zones for this location from their respective pages.
                                         </p>
                                     </CardContent>
                                 </TooltipProvider>
                               </Card>
                           );
                       })}

                       {isFilteredEmptyState && (
                            <Card className="border-dashed">
                                <CardContent className="pt-10 pb-10 px-6 flex flex-col items-center text-center">
                                  <div className="rounded-full p-6 mb-4">
                                    <Building className="h-12 w-12 text-muted-foreground" />
                                  </div>
                                  <CardTitle className="mb-2 ">
                                    {hasOriginalData && searchTerm !== '' 
                                     ? "No locations match your search term. Try adjusting your filter."
                                     : "Locations represent physical buildings or sites."
                                    }
                                  </CardTitle>
                                  <CardDescription className="mb-6 max-w-md">
                                    {hasOriginalData && searchTerm !== ''
                                     ? ""
                                     : "Use them to organize your devices through spaces and manage security through alarm zones."
                                    }
                                  </CardDescription>
                                  {!hasOriginalData && searchTerm === '' && (
                                    <Button onClick={() => handleOpenLocationDialog(null)} className="gap-2">
                                      <Plus className="h-4 w-4" /> Add Your First Location
                                    </Button>
                                  )}
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
                and all of its child locations.
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
      </div>
  );
} 