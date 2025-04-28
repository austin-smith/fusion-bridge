'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useFusionStore } from '@/stores/store';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Terminal, Loader2, Plus, MoreHorizontal } from 'lucide-react';
import { LocationTree } from '@/components/features/locations/location-tree';
import { LocationEditDialog } from '@/components/features/locations/location-edit-dialog';
import { AreaEditDialog } from '@/components/features/areas/area-edit-dialog';
import { AreaDeviceAssignmentDialog } from '@/components/features/areas/area-device-assignment-dialog';
import { DataTable } from "@/components/ui/data-table";
import { type ColumnDef } from "@tanstack/react-table";
import type { Area, Location, DeviceWithConnector } from "@/types/index";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
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
import { ArmedState } from "@/lib/mappings/definitions";

const getAreaColumns = (
    locations: Location[], 
    onEdit: (area: Area) => void, 
    onDelete: (area: Area) => void,
    onAssignDevices: (area: Area) => void,
    onArmAction: (area: Area, state: ArmedState) => void
): ColumnDef<Area>[] => [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => <div className="font-medium">{row.getValue("name")}</div>,
  },
  {
    accessorKey: "locationId",
    header: "Location",
    cell: ({ row }) => {
      const locationId = row.getValue("locationId") as string | null;
      const location = locations.find(loc => loc.id === locationId);
      return location ? location.name : <span className="text-muted-foreground">-\-</span>;
    },
  },
  {
    accessorKey: "armedState",
    header: "State",
    cell: ({ row }) => {
      const state = row.getValue("armedState") as ArmedState;
      let badgeVariant: "default" | "secondary" | "destructive" | "outline" = "secondary";
      if (state === ArmedState.ARMED_AWAY || state === ArmedState.ARMED_STAY) {
        badgeVariant = "default";
      } else if (state === ArmedState.TRIGGERED) {
        badgeVariant = "destructive";
      }
      return <Badge variant={badgeVariant}>{state}</Badge>;
    },
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const area = row.original;
      const currentState = area.armedState;

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => onEdit(area)}>Edit Details</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAssignDevices(area)}>Assign Devices</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              onClick={() => onArmAction(area, ArmedState.ARMED_AWAY)} 
              disabled={currentState === ArmedState.ARMED_AWAY}
            >
              Arm Away
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => onArmAction(area, ArmedState.ARMED_STAY)} 
              disabled={currentState === ArmedState.ARMED_STAY}
            >
              Arm Stay
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => onArmAction(area, ArmedState.DISARMED)} 
              disabled={currentState === ArmedState.DISARMED}
            >
              Disarm
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              className="text-destructive focus:text-destructive focus:bg-destructive/10" 
              onClick={() => onDelete(area)}
            >
              Delete Area
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];

export default function LocationsAreasPage() {
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

  const handleOpenAreaDialog = (area: Area | null) => {
    setEditingArea(area);
    setIsAreaDialogOpen(true);
  };

  const handleAreaDialogSubmit = async (formData: { name: string; locationId?: string | null }, areaId?: string): Promise<boolean> => {
    let success = false;
    try {
      if (areaId) {
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

  const areaColumns = useMemo(() => getAreaColumns(
    locations, 
    handleOpenAreaDialog,          
    handleOpenAreaDeleteDialog,  
    handleOpenAssignDevicesDialog, 
    handleArmAction                 
  ), [locations, handleOpenAreaDialog, handleOpenAreaDeleteDialog, handleOpenAssignDevicesDialog, handleArmAction]);

  return (
    <div className="container mx-auto p-4 md:p-6 lg:p-8">
      <h1 className="text-2xl font-semibold mb-6">Manage Locations & Areas</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section>
          <h2 className="text-xl font-medium mb-4">Locations</h2>
          {isLoadingLocations && renderLoading()}
          {errorLocations && renderError(errorLocations, 'Locations')}
          {!isLoadingLocations && !errorLocations && (
            <div className="p-4 border rounded-md bg-card text-card-foreground min-h-[200px]">
              <LocationTree 
                locations={locations} 
                onAdd={handleOpenLocationDialog}
                onEdit={handleOpenLocationDialog}
                onDelete={handleOpenLocationDeleteDialog}
              />
            </div>
          )}
        </section>

        <section>
           <div className="flex justify-between items-center mb-4">
             <h2 className="text-xl font-medium">Areas</h2>
             <Button variant="outline" size="sm" onClick={() => handleOpenAreaDialog(null)}>
               <Plus className="mr-2 h-4 w-4" /> Add Area
             </Button>
           </div>
          {isLoadingAreas && renderLoading()}
          {errorAreas && renderError(errorAreas, 'Areas')}
          {!isLoadingAreas && !errorAreas && (
             <div className="border rounded-md">
                <DataTable columns={areaColumns} data={areas} />
             </div>
          )}
          {isLoadingAllDevices && <div className="text-sm text-muted-foreground mt-2">Loading device list...</div>}
          {errorAllDevices && renderError(errorAllDevices, 'All Devices')}
        </section>
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
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the location 
              <strong className="px-1">{locationToDelete?.name}</strong> 
              and all of its child locations.
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
    </div>
  );
} 