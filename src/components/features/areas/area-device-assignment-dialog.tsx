'use client';

import React, { useEffect, useState, useMemo } from 'react';
import type { Area, DeviceWithConnector, ApiResponse } from '@/types/index';
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable } from "@/components/ui/data-table";
import { type ColumnDef } from "@tanstack/react-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

// --- Component Props --- 
interface AreaDeviceAssignmentDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  area: Area | null; // The area to assign devices to
  allDevices: DeviceWithConnector[]; // List of all available devices
  // Pass store actions directly for simplicity
  assignDeviceAction: (areaId: string, deviceId: string) => Promise<boolean>; 
  removeDeviceAction: (areaId: string, deviceId: string) => Promise<boolean>;
}

export const AreaDeviceAssignmentDialog: React.FC<AreaDeviceAssignmentDialogProps> = ({ 
  isOpen, 
  onOpenChange, 
  area, 
  allDevices,
  assignDeviceAction,
  removeDeviceAction,
}) => {
  const [isLoadingAssignments, setIsLoadingAssignments] = useState(false);
  const [errorAssignments, setErrorAssignments] = useState<string | null>(null);
  const [initialAssignedIds, setInitialAssignedIds] = useState<Set<string>>(new Set());
  // Track changes made *during this dialog session*
  const [changedDeviceIds, setChangedDeviceIds] = useState<Map<string, boolean>>(new Map()); // Map deviceId -> target assignment state (true=assign, false=remove)
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch current assignments when the dialog opens for a specific area
  useEffect(() => {
    if (isOpen && area) {
      const fetchAssignments = async () => {
        setIsLoadingAssignments(true);
        setErrorAssignments(null);
        setChangedDeviceIds(new Map()); // Reset changes on open
        try {
          const response = await fetch(`/api/areas/${area.id}/devices`);
          const data: ApiResponse<string[]> = await response.json();
          if (!response.ok || !data.success) {
            throw new Error(data.error || 'Failed to fetch current assignments');
          }
          setInitialAssignedIds(new Set(data.data || []));
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          console.error("Error fetching area assignments:", message);
          setErrorAssignments(message);
          setInitialAssignedIds(new Set()); // Reset on error
        } finally {
          setIsLoadingAssignments(false);
        }
      };
      fetchAssignments();
    } else {
      // Reset when closing or if area is null
      setInitialAssignedIds(new Set());
      setChangedDeviceIds(new Map());
      setErrorAssignments(null);
    }
  }, [isOpen, area]);

  // Determine the current displayed checked state for a device
  const getDisplayedCheckedState = (deviceId: string): boolean => {
    const initial = initialAssignedIds.has(deviceId);
    if (changedDeviceIds.has(deviceId)) {
      return changedDeviceIds.get(deviceId)!; // Return the override state
    }
    return initial; // Otherwise, return the initial state
  };

  // Handle checkbox change
  const handleCheckboxChange = (deviceId: string, checked: boolean | string) => {
    const initial = initialAssignedIds.has(deviceId);
    const newChanges = new Map(changedDeviceIds);
    const targetState = !!checked; // Coerce 'indeterminate' or true to boolean true

    if (targetState === initial) {
      // If toggled back to the initial state, remove from changes
      newChanges.delete(deviceId);
    } else {
      // Otherwise, record the target state
      newChanges.set(deviceId, targetState);
    }
    setChangedDeviceIds(newChanges);
  };

  // --- Columns for the Device Assignment Table --- 
  const columns = useMemo((): ColumnDef<DeviceWithConnector>[] => [
    {
      id: 'select',
      header: ({ table }) => (
         // Placeholder for header select-all if needed later
         <span className="sr-only">Select</span>
      ),
      cell: ({ row }) => {
        const deviceId = row.original.id;
        const isChecked = getDisplayedCheckedState(deviceId);
        return (
          <Checkbox
            checked={isChecked}
            onCheckedChange={(checkedState: boolean | string) => handleCheckboxChange(deviceId, checkedState)}
            aria-label="Select device"
            disabled={isLoadingAssignments} // Disable while loading initial state
          />
        );
      },
      size: 40, // Small column for checkbox
    },
    {
      accessorKey: 'name',
      header: 'Device Name',
      cell: ({ row }) => <div className="font-medium">{row.getValue('name')}</div>,
    },
    {
      accessorKey: 'connectorCategory',
      header: 'Connector',
      cell: ({ row }) => <div>{row.getValue('connectorCategory')}</div>,
    },
    {
        accessorKey: 'type',
        header: 'Type',
        cell: ({ row }) => <div>{row.getValue('type')}</div>,
    }
    // Add more columns if helpful (e.g., Location - though maybe redundant here)
  ], [isLoadingAssignments, initialAssignedIds, changedDeviceIds, getDisplayedCheckedState, handleCheckboxChange]); // Dependencies needed for cell rendering

  // --- Submit Handler ---
  const handleSaveChanges = async () => {
    if (!area) return;
    setIsSubmitting(true);
    let successCount = 0;
    let errorCount = 0;
    const totalChanges = changedDeviceIds.size;
    const promises: Promise<boolean>[] = [];

    changedDeviceIds.forEach((shouldBeAssigned, deviceId) => {
        const currentlyAssigned = initialAssignedIds.has(deviceId);
        if (shouldBeAssigned && !currentlyAssigned) {
            promises.push(assignDeviceAction(area.id, deviceId));
        } else if (!shouldBeAssigned && currentlyAssigned) {
            promises.push(removeDeviceAction(area.id, deviceId));
        }
    });

    try {
        const results = await Promise.allSettled(promises);
        results.forEach(result => {
            if (result.status === 'fulfilled' && result.value === true) {
                successCount++;
            } else {
                errorCount++;
            }
        });

        if (errorCount > 0) {
            toast.error(`${errorCount} assignment(s) failed. Check console.`);
        } 
        if (successCount > 0) {
            toast.success(`${successCount} assignment(s) updated successfully.`);
        }
        if (errorCount === 0 && successCount === totalChanges) {
             onOpenChange(false); // Close dialog only if all intended changes succeeded
        } else {
            // If some failed, keep dialog open but refetch initial state to show current status
            const fetchAssignments = async () => {
              // Duplicated fetch logic - maybe extract to a function?
              setIsLoadingAssignments(true);
              setErrorAssignments(null);
              try {
                const response = await fetch(`/api/areas/${area.id}/devices`);
                const data: ApiResponse<string[]> = await response.json();
                if (!response.ok || !data.success) throw new Error(data.error || 'Refetch failed');
                setInitialAssignedIds(new Set(data.data || []));
                setChangedDeviceIds(new Map()); // Reset changes after partial success/failure
              } catch (err) { /* handle error */ } 
              finally { setIsLoadingAssignments(false); }
            };
             fetchAssignments();
        }

    } catch (error) {
         // This catch block might not be strictly necessary if using Promise.allSettled
        console.error("Error during assignment saving:", error);
        toast.error("An unexpected error occurred while saving changes.");
    } finally {
        setIsSubmitting(false);
    }

  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl"> {/* Wider dialog */}
        <DialogHeader>
          <DialogTitle>Assign Devices to Area: {area?.name}</DialogTitle>
          <DialogDescription>
            Select the devices that should belong to this security area.
          </DialogDescription>
        </DialogHeader>
        
        {/* Loading/Error for initial assignment fetch */} 
        {isLoadingAssignments && (
            <div className="flex justify-center items-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        )}
        {errorAssignments && (
            <div className="text-destructive p-4">Error loading assignments: {errorAssignments}</div>
        )}

        {/* Only show table when not loading initial assignments */} 
        {!isLoadingAssignments && !errorAssignments && (
            <div className="max-h-[60vh] overflow-y-auto pr-2"> {/* Scrollable table area */} 
                <DataTable columns={columns} data={allDevices} />
            </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button 
            type="button" 
            onClick={handleSaveChanges} 
            disabled={isSubmitting || isLoadingAssignments || changedDeviceIds.size === 0}
          >
            {isSubmitting ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}; 