'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import type { Area, DeviceWithConnector, ApiResponse } from '@/types/index';
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable } from "@/components/ui/data-table";
import { type ColumnDef, type Row } from "@tanstack/react-table";
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
import { ScrollArea } from "@/components/ui/scroll-area";

// --- Component Props --- 
interface AreaDeviceAssignmentDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  area: Area | null; // The area to assign devices to
  allDevices: DeviceWithConnector[]; // List of all available devices
  allAreas: Area[]; // List of all areas for looking up area names
  // Pass store actions directly for simplicity
  assignDeviceAction: (areaId: string, deviceId: string) => Promise<boolean>;
  removeDeviceAction: (areaId: string, deviceId: string) => Promise<boolean>;
  // NEW: Bulk assignment actions
  bulkAssignDevicesAction: (areaId: string, deviceIds: string[]) => Promise<boolean>;
  bulkRemoveDevicesAction: (areaId: string, deviceIds: string[]) => Promise<boolean>;
}

export const AreaDeviceAssignmentDialog: React.FC<AreaDeviceAssignmentDialogProps> = ({ 
  isOpen, 
  onOpenChange, 
  area, 
  allDevices,
  allAreas,
  assignDeviceAction,
  removeDeviceAction,
  bulkAssignDevicesAction,
  bulkRemoveDevicesAction,
}) => {
  const [isLoadingAssignments, setIsLoadingAssignments] = useState(false);
  const [errorAssignments, setErrorAssignments] = useState<string | null>(null);
  const [initialAssignedIds, setInitialAssignedIds] = useState<Set<string>>(new Set());
  const [changedDeviceIds, setChangedDeviceIds] = useState<Record<string, boolean>>({}); 
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- Filtering State --- 
  const [nameFilter, setNameFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all'); 
  const [connectorFilter, setConnectorFilter] = useState<string>('all');
  const [assignmentFilter, setAssignmentFilter] = useState<string>('all'); // New filter for assignment status

  // Create a lookup map for area names
  const areaNameMap = useMemo(() => {
    const map = new Map<string, string>();
    allAreas.forEach(area => {
      map.set(area.id, area.name);
    });
    return map;
  }, [allAreas]);

  // Create a map of device assignments to all areas (since devices can be in multiple areas)
  const deviceAreaAssignments = useMemo(() => {
    const assignments = new Map<string, string[]>();
    allDevices.forEach(device => {
      // Get all area IDs this device is assigned to
      const assignedAreaIds = allAreas
        .filter(area => area.deviceIds?.includes(device.id))
        .map(area => area.id);
      assignments.set(device.id, assignedAreaIds);
    });
    return assignments;
  }, [allDevices, allAreas]);

  // --- Reusable function to fetch current assignments ---
  const refetchAssignments = useCallback(async () => {
    if (!area) {
        setInitialAssignedIds(new Set());
        setChangedDeviceIds({});
        setErrorAssignments(null);
        return;
    }
    setIsLoadingAssignments(true);
    setErrorAssignments(null);
    setChangedDeviceIds({}); // Reset changes on fetch
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
  }, [area]); // Dependency: area

  // Fetch current assignments when the dialog opens for a specific area
  useEffect(() => {
    if (isOpen && area) {
      refetchAssignments(); // Call the reusable function
    } else {
      // Reset when closing or if area is null
      setInitialAssignedIds(new Set());
      setChangedDeviceIds({}); // Reset to empty object
      setErrorAssignments(null);
    }
  }, [isOpen, area, refetchAssignments]);

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

  // NEW: Handler for clicking anywhere on the row
  const handleRowClick = useCallback((row: Row<DeviceWithConnector>) => {
      const deviceId = row.original.id;
      if (!deviceId) return; // Safety check
      
      const currentCheckedState = getDisplayedCheckedState(deviceId);
      handleCheckboxChange(deviceId, !currentCheckedState); // Toggle the state
  }, [getDisplayedCheckedState, handleCheckboxChange]);

  // NEW: Select All functionality - separate for assigned and available devices
  const getSelectAllState = useCallback((devices: DeviceWithConnector[]) => {
    if (devices.length === 0) return false;
    
    const checkedCount = devices.filter(device => 
      getDisplayedCheckedState(device.id)
    ).length;
    
    if (checkedCount === 0) return false;
    if (checkedCount === devices.length) return true;
    return 'indeterminate';
  }, [getDisplayedCheckedState]);

  const createSelectAllHandler = useCallback((devices: DeviceWithConnector[]) => {
    return (checked: boolean | string) => {
      const shouldCheck = checked === true;
      
      devices.forEach(device => {
        handleCheckboxChange(device.id, shouldCheck);
      });
    };
  }, [handleCheckboxChange]);

  // --- Columns for the Device Assignment Table --- 
  const createColumns = useCallback((devices: DeviceWithConnector[]): ColumnDef<DeviceWithConnector>[] => [
    {
      id: 'select',
      header: ({ table }) => (
        <div className="py-0 align-middle flex items-center h-full">
          <Checkbox
            checked={getSelectAllState(devices)}
            onCheckedChange={createSelectAllHandler(devices)}
            aria-label="Select all visible devices"
            disabled={isLoadingAssignments || devices.length === 0}
          />
        </div>
      ),
      cell: ({ row }) => {
        const deviceId = row.original.id;
        const isChecked = getDisplayedCheckedState(deviceId);

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
      size: 40, // Keep checkbox column small
    },
    {
      accessorKey: 'name',
      header: 'Device Name',
      cell: ({ row }) => {
        const device = row.original;
        const deviceAssignedAreas = deviceAreaAssignments.get(device.id) || [];
        const isUnassigned = deviceAssignedAreas.length === 0;
        
        return (
          <div className="flex items-center gap-2">
            <div className="font-medium">{row.getValue('name')}</div>
            {isUnassigned && (
              <Badge variant="outline" className="text-xs px-1.5 py-0 text-muted-foreground">
                Unassigned
              </Badge>
            )}
          </div>
        );
      },
      size: 250, // Give name a fixed, but larger, size
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
        size: 150, // Reduce size for Type
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
      size: 150, // Reduce size for Connector
    },
    // Add more columns if helpful (e.g., Location - though maybe redundant here)
  ], [isLoadingAssignments, getDisplayedCheckedState, handleCheckboxChange, deviceAreaAssignments, getSelectAllState, createSelectAllHandler]); // Dependencies simplified

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

  // Memoize the filtered devices - Now split into assigned and available
  const [filteredAssignedDevices, filteredAvailableDevices] = useMemo(() => {
    // Start with splitting based on initial state
    const currentAssigned: DeviceWithConnector[] = [];
    const currentAvailable: DeviceWithConnector[] = [];

    allDevices.forEach(device => {
        // Check the *target* state based on changes
        const isTargetAssigned = getDisplayedCheckedState(device.id);
        if (isTargetAssigned) {
          currentAssigned.push(device);
        } else {
          currentAvailable.push(device);
        }
    });

    // Apply filters to both lists
    const filterDevice = (device: DeviceWithConnector): boolean => {
        const nameMatch = device.name.toLowerCase().includes(nameFilter.toLowerCase());
        const typeMatch = typeFilter === 'all' || device.deviceTypeInfo?.type === typeFilter;
        const connectorDisplayName = device.connectorName ?? formatConnectorCategory(device.connectorCategory);
        const connectorMatch = connectorFilter === 'all' || connectorDisplayName === connectorFilter;
        
        // New assignment filter logic
        let assignmentMatch = true;
        if (assignmentFilter === 'unassigned') {
          // Show only devices that are not assigned to any area
          const deviceAssignedAreas = deviceAreaAssignments.get(device.id) || [];
          assignmentMatch = deviceAssignedAreas.length === 0;
        } else if (assignmentFilter === 'assigned-elsewhere') {
          // Show only devices assigned to other areas (not this area and not unassigned)
          const deviceAssignedAreas = deviceAreaAssignments.get(device.id) || [];
          const otherAreaIds = deviceAssignedAreas.filter(areaId => areaId !== area?.id);
          assignmentMatch = otherAreaIds.length > 0;
        }
        // 'all' shows everything, so no additional filtering needed
        
        return nameMatch && typeMatch && connectorMatch && assignmentMatch;
    };

    return [
        currentAssigned.filter(filterDevice),
        currentAvailable.filter(filterDevice)
    ];
  }, [allDevices, nameFilter, typeFilter, connectorFilter, assignmentFilter, getDisplayedCheckedState, area?.id, deviceAreaAssignments]); // Add new dependencies

  // --- Submit Handler ---
  const handleSaveChanges = async () => {
    if (!area) return;
    setIsSubmitting(true);
    
    try {
      const changesToProcess = Object.entries(changedDeviceIds); // Get [deviceId, shouldBeAssigned] pairs
      
      // Separate devices to assign vs remove
      const devicesToAssign: string[] = [];
      const devicesToRemove: string[] = [];
      
      changesToProcess.forEach(([deviceId, shouldBeAssigned]) => {
        const currentlyAssigned = initialAssignedIds.has(deviceId);
        if (shouldBeAssigned && !currentlyAssigned) {
          devicesToAssign.push(deviceId);
        } else if (!shouldBeAssigned && currentlyAssigned) {
          devicesToRemove.push(deviceId);
        }
      });

      // Use bulk operations for better performance
      const promises: Promise<boolean>[] = [];
      
      if (devicesToAssign.length > 0) {
        promises.push(bulkAssignDevicesAction(area.id, devicesToAssign));
      }
      
      if (devicesToRemove.length > 0) {
        promises.push(bulkRemoveDevicesAction(area.id, devicesToRemove));
      }
      
      if (promises.length === 0) {
        // No changes to process
        onOpenChange(false);
        return;
      }

      const results = await Promise.allSettled(promises);
      
      let successCount = 0;
      let errorCount = 0;
      
      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value === true) {
          successCount++;
        } else {
          errorCount++;
          console.error(`Bulk operation ${index} failed:`, result.status === 'rejected' ? result.reason : 'Unknown error');
        }
      });

      if (errorCount > 0) {
        toast.error(`${errorCount} bulk operation(s) failed. Check console.`);
      } 
      if (successCount > 0) {
        const totalDevices = devicesToAssign.length + devicesToRemove.length;
        toast.success(`Successfully updated ${totalDevices} device assignment(s).`);
      }
      
      if (errorCount === 0) {
        onOpenChange(false); // Close dialog only if all operations succeeded
      } else {
        // If some failed, keep dialog open and refetch assignments
        refetchAssignments(); // Call the reusable function
      }

    } catch (error) {
      console.error("Error during bulk assignment saving:", error);
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
            Select the devices that should belong to this security area. Devices can be assigned to multiple areas. Use the &quot;Assignment&quot; filter to view only unassigned devices or devices assigned to other areas.
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
            <ScrollArea className="h-[65vh] pr-4"> {/* Wrap content in ScrollArea */}
                <TooltipProvider>
                    {/* --- Filter Controls --- */} 
                    <div className="flex items-center gap-2 mb-4 px-1 sticky top-0 bg-background py-2 z-10"> 
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
                                {uniqueDeviceTypes
                                    .filter((type): type is string => typeof type === 'string') // Explicitly filter for strings
                                    .map(type => {
                                    // Get icon for device type
                                    const Icon = type === 'all' ? null : getDeviceTypeIcon(type as DeviceType); // Cast string to DeviceType
                                    return (
                                        <SelectItem key={type} value={type} className="text-xs"> {/* type is now guaranteed string */}
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
                                {/* Map over actual connectors, filtering out any missing names */}
                                {uniqueConnectors
                                    .filter(connector => connector.name) // Ensure name exists
                                    .map(connector => (
                                    <SelectItem key={connector.name} value={connector.name} className="text-xs"> {/* Now name is guaranteed to be a string */}
                                        <div className="flex items-center gap-2">
                                            <ConnectorIcon connectorCategory={connector.category} size={16} />
                                            <span>{connector.name}</span>
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={assignmentFilter} onValueChange={setAssignmentFilter}>
                            <SelectTrigger className="w-[180px] h-8 text-xs">
                                <SelectValue placeholder="Filter by Assignment" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all" className="text-xs">
                                    <span>All Devices</span>
                                </SelectItem>
                                <SelectItem value="unassigned" className="text-xs">
                                    <span>Unassigned Only</span>
                                </SelectItem>
                                <SelectItem value="assigned-elsewhere" className="text-xs">
                                    <span>Assigned to Other Areas</span>
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                
                    {/* Assigned Devices Table */}
                    <div className="mb-6">
                        <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                          Assigned Devices ({filteredAssignedDevices.length})
                          {assignmentFilter === 'unassigned' && (
                            <Badge variant="outline" className="text-xs">
                              Showing unassigned only
                            </Badge>
                          )}
                          {assignmentFilter === 'assigned-elsewhere' && (
                            <Badge variant="outline" className="text-xs">
                              Showing other areas only
                            </Badge>
                          )}
                        </h4>
                        <div className="rounded-md border"> 
                            <DataTable 
                                columns={createColumns(filteredAssignedDevices)} 
                                data={filteredAssignedDevices} 
                                onRowClick={handleRowClick} 
                            /> 
                        </div>
                    </div>

                    {/* Available Devices Table */}
                    <div>
                        <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                          Available Devices ({filteredAvailableDevices.length})
                          {assignmentFilter === 'unassigned' && (
                            <Badge variant="outline" className="text-xs">
                              Showing unassigned only
                            </Badge>
                          )}
                          {assignmentFilter === 'assigned-elsewhere' && (
                            <Badge variant="outline" className="text-xs">
                              Showing other areas only
                            </Badge>
                          )}
                        </h4>
                        <div className="rounded-md border"> 
                            <DataTable 
                                columns={createColumns(filteredAvailableDevices)} 
                                data={filteredAvailableDevices} 
                                onRowClick={handleRowClick} 
                            /> 
                        </div>
                    </div>
                </TooltipProvider>
            </ScrollArea>
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
            {isSubmitting ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}; 