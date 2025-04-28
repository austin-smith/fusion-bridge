'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
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
import { Loader2, HelpCircle } from 'lucide-react';
import { ConnectorIcon } from "@/components/features/connectors/connector-icon";
import { formatConnectorCategory } from "@/lib/utils";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { getDeviceTypeIcon } from "@/lib/mappings/presentation";
import type { TypedDeviceInfo } from "@/lib/mappings/definitions";
import { Input } from "@/components/ui/input";
import { 
    Select, 
    SelectContent, 
    SelectItem, 
    SelectTrigger, 
    SelectValue 
} from "@/components/ui/select";
import { DeviceType } from "@/lib/mappings/definitions";
import { cn } from "@/lib/utils";

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
  // Track changes using a Record instead of a Map
  const [changedDeviceIds, setChangedDeviceIds] = useState<Record<string, boolean>>({}); 
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- Filtering State --- 
  const [nameFilter, setNameFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all'); 
  const [connectorFilter, setConnectorFilter] = useState<string>('all');

  // <<< START DEBUG LOGGING >>>
  useEffect(() => {
      console.log('AreaDeviceAssignmentDialog received allDevices prop:', allDevices);
      if(allDevices?.length > 0) {
          console.log('AreaDeviceAssignmentDialog first device in prop:', allDevices[0]);
      }
  }, [allDevices]);
  // <<< END DEBUG LOGGING >>>

  // Fetch current assignments when the dialog opens for a specific area
  useEffect(() => {
    if (isOpen && area) {
      const fetchAssignments = async () => {
        setIsLoadingAssignments(true);
        setErrorAssignments(null);
        setChangedDeviceIds({}); // Reset changes on open
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
      setChangedDeviceIds({}); // Reset to empty object
      setErrorAssignments(null);
    }
  }, [isOpen, area]);

  // Determine the current displayed checked state for a device - MEMOIZED
  const getDisplayedCheckedState = useCallback((deviceId: string): boolean => {
    const initial = initialAssignedIds.has(deviceId);
    // Check if deviceId exists as a key in the changedDeviceIds object
    if (Object.prototype.hasOwnProperty.call(changedDeviceIds, deviceId)) {
      return changedDeviceIds[deviceId]; // Return the override state (true/false)
    }
    return initial; // Otherwise, return the initial state
  }, [initialAssignedIds, changedDeviceIds]); // Dependencies for useCallback

  // Handle checkbox change - MEMOIZED
  const handleCheckboxChange = useCallback((deviceId: string, checked: boolean | string) => {
    const initial = initialAssignedIds.has(deviceId);
    const targetState = !!checked; // Coerce 'indeterminate' or true to boolean true

    setChangedDeviceIds(prevChanges => {
        const newChanges = { ...prevChanges }; // Create a new object copy
        if (targetState === initial) {
            // If toggled back to the initial state, remove from changes object
            delete newChanges[deviceId];
        } else {
            // Otherwise, record the target state in the object
            newChanges[deviceId] = targetState;
        }
        return newChanges; // Return the new state object
    });

  }, [initialAssignedIds]); // Only depends on initialAssignedIds now

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
        
        // <<< START DEBUG LOGGING >>>
        if (deviceId) { // Only log if deviceId is present
            console.log(`Rendering checkbox cell for deviceId: ${deviceId}, row.original:`, row.original);
        }
        // <<< END DEBUG LOGGING >>>

        // Wrap Checkbox to control alignment and padding
        return (
          <div className="py-0 align-middle flex items-center h-full">
            <Checkbox
              key={deviceId} // Explicit key based on deviceId
              checked={isChecked}
              onCheckedChange={(checkedState: boolean | string) => handleCheckboxChange(deviceId, checkedState)}
              aria-label="Select device"
              disabled={isLoadingAssignments} // Disable while loading initial state
            />
          </div>
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
        accessorKey: 'deviceTypeInfo',
        header: 'Type',
        cell: ({ row }) => {
            const typeInfo = row.original.deviceTypeInfo;
            const IconComponent = typeInfo ? getDeviceTypeIcon(typeInfo.type) : HelpCircle;
            const typeText = typeInfo ? typeInfo.type : "Unknown";
            const subtypeText = typeInfo?.subtype;

            return (
                <TooltipProvider delayDuration={100}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="secondary" className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 font-normal">
                        <IconComponent className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs">
                          {typeText}
                          {subtypeText && (
                            <span className="text-muted-foreground ml-1">/ {subtypeText}</span>
                          )}
                        </span>
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Type: {typeText}</p>
                      {subtypeText && <p>Subtype: {subtypeText}</p>}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
            );
        },
    },
    {
      accessorKey: 'connectorCategory',
      header: 'Connector',
      cell: ({ row }) => { 
        const category = row.original.connectorCategory; // Get category
        const name = row.original.connectorName ?? formatConnectorCategory(category); // Get name or fallback
        return (
          // Use Badge component with styles from devices page
          <Badge variant="secondary" className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 font-normal">
            <ConnectorIcon connectorCategory={category} size={12} />
            <span className="text-xs">{name}</span> {/* Display name */} 
          </Badge>
        );
      },
    },
    // Add more columns if helpful (e.g., Location - though maybe redundant here)
  ], [isLoadingAssignments, getDisplayedCheckedState, handleCheckboxChange]); // Dependencies simplified

  // --- Filtering Logic & Data --- 

  // Get unique values for dropdown filters
  const uniqueDeviceTypes = useMemo(() => {
    const types = new Set(allDevices.map(d => d.deviceTypeInfo?.type).filter(Boolean)); 
    return ['all', ...Array.from(types).sort()];
  }, [allDevices]);

  // Update uniqueConnectors - remove 'all' object
  const uniqueConnectors = useMemo(() => {
    const connectorMap = new Map<string, { name: string, category: string }>();
    allDevices.forEach(d => {
      const name = d.connectorName ?? formatConnectorCategory(d.connectorCategory);
      if (name && !connectorMap.has(name)) { 
        connectorMap.set(name, { name: name, category: d.connectorCategory });
      }
    });
    // Sort by name
    const sortedConnectors = Array.from(connectorMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    return sortedConnectors; // Return only actual connectors
  }, [allDevices]);

  // Memoize the filtered devices
  const filteredDevices = useMemo(() => {
    return allDevices.filter(device => {
        // Name filter (case-insensitive)
        const nameMatch = device.name.toLowerCase().includes(nameFilter.toLowerCase());
        
        // Type filter
        const typeMatch = typeFilter === 'all' || device.deviceTypeInfo?.type === typeFilter;
        
        // Connector filter (check name first, then category as fallback)
        const connectorDisplayName = device.connectorName ?? formatConnectorCategory(device.connectorCategory);
        const connectorMatch = connectorFilter === 'all' || connectorDisplayName === connectorFilter;

        return nameMatch && typeMatch && connectorMatch;
    });
  }, [allDevices, nameFilter, typeFilter, connectorFilter]);

  // --- Submit Handler ---
  const handleSaveChanges = async () => {
    if (!area) return;
    setIsSubmitting(true);
    let successCount = 0;
    let errorCount = 0;
    const changesToProcess = Object.entries(changedDeviceIds); // Get [deviceId, shouldBeAssigned] pairs
    const totalChanges = changesToProcess.length;
    const promises: Promise<boolean>[] = [];

    changesToProcess.forEach(([deviceId, shouldBeAssigned]) => {
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
                setChangedDeviceIds({}); // Reset changes after partial success/failure
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
            <TooltipProvider>
                {/* --- Filter Controls --- */} 
                <div className="flex items-center gap-2 mb-4 px-1">
                    <Input 
                        placeholder="Filter by name..."
                        value={nameFilter}
                        onChange={(event) => setNameFilter(event.target.value)}
                        className="max-w-xs h-8 text-xs"
                    />
                    <Select value={typeFilter} onValueChange={setTypeFilter}>
                        <SelectTrigger className="w-[180px] h-8 text-xs">
                            <SelectValue placeholder="Filter by Type" />
                        </SelectTrigger>
                        <SelectContent>
                            {uniqueDeviceTypes.map(type => {
                                // Get icon for device type
                                const Icon = type === 'all' ? null : getDeviceTypeIcon(type as DeviceType); // Cast string to DeviceType
                                return (
                                    <SelectItem key={type} value={type} className="text-xs">
                                        <div className="flex items-center gap-2">
                                            {Icon && <Icon className="h-4 w-4 text-muted-foreground" />} 
                                            <span>{type === 'all' ? 'All Types' : type}</span>
                                        </div>
                                    </SelectItem>
                                );
                            })}
                        </SelectContent>
                    </Select>
                    <Select value={connectorFilter} onValueChange={setConnectorFilter}>
                        <SelectTrigger className="w-[180px] h-8 text-xs">
                            <SelectValue placeholder="Filter by Connector" />
                        </SelectTrigger>
                        <SelectContent>
                            {/* Render 'All Connectors' item separately */}
                            <SelectItem value="all" className="text-xs">
                                <div className="flex items-center gap-2">
                                    {/* No icon needed for All */}
                                    <span>All Connectors</span>
                                </div>
                            </SelectItem>
                            {/* Map over actual connectors */}
                            {uniqueConnectors.map(connector => (
                                <SelectItem key={connector.name} value={connector.name as string} className="text-xs">
                                    <div className="flex items-center gap-2">
                                        <ConnectorIcon connectorCategory={connector.category} size={16} />
                                        <span>{connector.name}</span>
                                    </div>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="max-h-[55vh] overflow-y-auto pr-2"> {/* Adjusted height */} 
                    <DataTable 
                        columns={columns} 
                        data={filteredDevices} 
                        initialSorting={[{ id: 'name', desc: false }]}
                    /> 
                </div>
            </TooltipProvider>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button 
            type="button" 
            onClick={handleSaveChanges} 
            disabled={isSubmitting || isLoadingAssignments || Object.keys(changedDeviceIds).length === 0} // Check if object is empty
          >
            {isSubmitting ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}; 