'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useFusionStore } from '@/stores/store';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Terminal, Loader2, Plus, MoreHorizontal, ChevronDown, ChevronRight, ArrowUpDown, ArrowDown, ArrowUp, Building, MapPin, Settings, Link, ShieldCheck, ShieldOff, ShieldAlert, Trash2, Shield, Pencil } from 'lucide-react';
import { LocationEditDialog } from '@/components/features/locations/location-edit-dialog';
import { AreaEditDialog } from '@/components/features/areas/area-edit-dialog';
import { AreaDeviceAssignmentDialog } from '@/components/features/areas/area-device-assignment-dialog';
import type { Area, Location, DeviceWithConnector } from "@/types/index";
import { Button } from "@/components/ui/button";
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
    allDevices,
    isLoadingAllDevices,
    errorAllDevices,
    fetchAllDevices
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

  useEffect(() => {
    fetchLocations();
    fetchAreas();
    fetchAllDevices();
  }, [fetchLocations, fetchAreas, fetchAllDevices]);

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
       console.error("Error submitting location:", error);
       toast.error(error instanceof Error ? error.message : "An unknown error occurred while saving the location.");
       success = false;
    }
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
       console.error("Error submitting area:", error);
       toast.error(error instanceof Error ? error.message : "An unknown error occurred while saving the area.");
       success = false;
    }
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

  const renderLoading = () => (
    <div className="flex justify-center items-center p-8">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
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

  const areasByLocation = useMemo(() => {
    const grouped: Record<string, Area[]> = {};
    areas.forEach(area => {
        const locId = area.locationId ?? 'unassigned';
        if (!grouped[locId]) {
            grouped[locId] = [];
        }
        grouped[locId].push(area);
    });
    Object.values(grouped).forEach(areaGroup => {
        areaGroup.sort((a, b) => a.name.localeCompare(b.name));
    });
    return grouped;
  }, [areas]);

  const sortedLocations = useMemo(() => {
      return [...locations].sort((a, b) => a.name.localeCompare(b.name));
  }, [locations]);

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

    return (
        <Card key={area.id} className="mb-3">
            <CardHeader 
              className={cn(
                "flex flex-row items-center justify-between py-3 px-4",
                "cursor-pointer hover:bg-muted/50 transition-colors"
              )} 
              onClick={() => toggleAreaDevices(area.id)}
              title={isDevicesExpanded ? "Collapse details" : "Expand details"}
            >
                <div 
                  className="flex items-center gap-2 min-w-0"
                >
                   {isDevicesExpanded ? 
                       <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" /> : 
                       <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                   }
                  <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <CardTitle className="text-base font-medium truncate" title={area.name}>{area.name}</CardTitle>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Badge variant={badgeVariant} className="inline-flex items-center gap-1.5"> 
                    {React.createElement(getArmedStateIcon(state), { className: "h-3.5 w-3.5" })} 
                    <span>{ArmedStateDisplayNames[state] ?? state}</span> 
                  </Badge>
                  <Badge variant="outline" className="font-normal px-1.5 py-0.5 text-xs">
                    {deviceCount} {deviceCount === 1 ? 'Device' : 'Devices'}
                  </Badge>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                        <span className="sr-only">Area Actions</span>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleOpenAreaDialog(area)}>
                        <Pencil className="h-4 w-4" />
                        Edit Details
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleOpenAssignDevicesDialog(area)}>
                        <Link className="h-4 w-4" />
                        Assign Devices
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuGroup>
                        <DropdownMenuSub>
                            <DropdownMenuSubTrigger onClick={(e) => e.stopPropagation()}>
                                <Shield className="h-4 w-4" />
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
                                    <ShieldCheck className="h-4 w-4" />
                                    Arm Away
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleArmAction(area, ArmedState.ARMED_STAY);
                                    }}
                                    disabled={state === ArmedState.ARMED_STAY}
                                >
                                    <ShieldCheck className="h-4 w-4" />
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
                                    <ShieldOff className="h-4 w-4" />
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
                        <Trash2 className="h-4 w-4" />
                        Delete Area
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
            </CardHeader>
            {/* --- DEBUG LOGGING --- */}
            {(() => {
                console.log(`[renderAreaCard] Area: ${area.id}, isDevicesExpanded: ${isDevicesExpanded}, expandedState:`, expandedAreaDevices);
                return null; // Don't render anything visually
            })()}
            {isDevicesExpanded && (
                <CardContent className="p-0">
                    <AreaDevicesSubRow row={{ original: area } as Row<Area>} allDevices={allDevices} />
                </CardContent>
            )}
        </Card>
    );
  };

  return (
    <div className="container mx-auto p-4 md:p-6 lg:p-8">
      <div className="flex justify-between items-center mb-6 gap-4 flex-shrink-0">
          <div className="flex items-center gap-4">
            <Building className="h-6 w-6 text-muted-foreground flex-shrink-0" />
            <div>
              <h1 className="text-2xl font-semibold text-foreground">
                Locations & Areas
              </h1>
              <p className="text-sm text-muted-foreground">
                Organize devices by physical location and logical areas.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => handleOpenLocationDialog(null)}>
                <Plus className="h-4 w-4 mr-2" /> Add Location
            </Button>
          </div>
      </div>

      {(isLoadingLocations || isLoadingAreas) && renderLoading()}
      {errorLocations && renderError(errorLocations, 'Locations')}
      {errorAreas && renderError(errorAreas, 'Areas')}
      
      {!isLoadingLocations && !isLoadingAreas && !errorLocations && !errorAreas && (
          <div className="space-y-6">
              {sortedLocations.map(location => {
                  const locationAreas = areasByLocation[location.id] || [];
                  return (
                      <Card key={location.id}>
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
                                        <Pencil className="h-4 w-4" />
                                        Edit Location
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => handleOpenAreaDialog(null, location.id)}>
                                        <Plus className=" h-4 w-4" />
                                        Add Area
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem
                                          className="text-destructive focus:text-destructive focus:bg-destructive/10"
                                          onClick={() => handleOpenLocationDeleteDialog(location)}
                                      >
                                          <Trash2 className="h-4 w-4" />
                                          Delete Location
                                      </DropdownMenuItem>
                                  </DropdownMenuContent>
                              </DropdownMenu>
                          </CardHeader>
                          <CardContent className="pt-0">
                              {locationAreas.length > 0 ? (
                                  locationAreas.map(area => renderAreaCard(area))
                              ) : (
                                  <p className="text-sm text-muted-foreground px-4 py-2">
                                      No areas assigned to this location. 
                                      <Button variant="link" size="sm" className="p-0 h-auto ml-1" onClick={() => handleOpenAreaDialog(null, location.id)}>Add one?</Button>
                                  </p>
                              )}
                          </CardContent>
                      </Card>
                  );
              })}

              {(areasByLocation['unassigned'] && areasByLocation['unassigned'].length > 0) && (
                  <Card>
                      <CardHeader>
                          <CardTitle>Unassigned Areas</CardTitle>
                          <CardDescription>These areas are not linked to any specific location.</CardDescription>
                      </CardHeader>
                      <CardContent>
                          {areasByLocation['unassigned'].map(area => renderAreaCard(area))}
                      </CardContent>
                  </Card>
              )}

              {sortedLocations.length === 0 && (!areasByLocation['unassigned'] || areasByLocation['unassigned'].length === 0) && (
                   <Card>
                       <CardContent className="p-6 text-center text-muted-foreground">
                           No locations or areas found. Start by adding a location.
                       </CardContent>
                   </Card>
              )}
          </div>
      )}

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
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the location 
              <strong className="px-1">{locationToDelete?.name}</strong> 
              and all of its child locations and associated areas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setLocationToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteLocation}>Continue</AlertDialogAction>
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
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the area 
              <strong className="px-1">{areaToDelete?.name}</strong> 
              and remove its associations with devices.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setAreaToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteArea}>Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AreaDeviceAssignmentDialog
        isOpen={isAssignDevicesDialogOpen}
        onOpenChange={setIsAssignDevicesDialogOpen}
        area={areaToAssignDevices}
        allDevices={allDevices}
        assignDeviceAction={assignDeviceToArea}
        removeDeviceAction={removeDeviceFromArea}
      />

      {isLoadingAllDevices && <div className="text-sm text-muted-foreground mt-4 text-center">Loading device list...</div>}
      {errorAllDevices && renderError(errorAllDevices, 'All Devices')}
    </div>
  );
} 