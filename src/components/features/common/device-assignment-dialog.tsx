'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import type { DeviceWithConnector, ApiResponse } from '@/types/index';
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
interface DeviceAssignmentDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  containerName: string; // Name of the space/zone being assigned to
  containerType: 'space' | 'alarm-zone'; // Type determines behavior
  allDevices: DeviceWithConnector[];
  // For fetching current assignments
  fetchCurrentAssignments: () => Promise<string[]>; // Returns array of assigned device IDs
  // For saving changes - these handle the specific logic for spaces vs zones
  assignDeviceAction: (deviceId: string) => Promise<boolean>;
  removeDeviceAction: (deviceId: string) => Promise<boolean>;
  // Bulk operations
  bulkAssignDevicesAction?: (deviceIds: string[]) => Promise<boolean>;
  bulkRemoveDevicesAction?: (deviceIds: string[]) => Promise<boolean>;
}

export const DeviceAssignmentDialog: React.FC<DeviceAssignmentDialogProps> = ({ 
  isOpen, 
  onOpenChange, 
  containerName,
  containerType,
  allDevices,
  fetchCurrentAssignments,
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
  const [assignmentFilter, setAssignmentFilter] = useState<string>('unassigned');

  // --- Reusable function to fetch current assignments ---
  const refetchAssignments = useCallback(async () => {
    setIsLoadingAssignments(true);
    setErrorAssignments(null);
    setChangedDeviceIds({});
    try {
      const deviceIds = await fetchCurrentAssignments();
      setInitialAssignedIds(new Set(deviceIds));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error("Error fetching assignments:", message);
      setErrorAssignments(message);
      setInitialAssignedIds(new Set());
    } finally {
      setIsLoadingAssignments(false);
    }
  }, [fetchCurrentAssignments]);

  // Fetch current assignments when the dialog opens
  useEffect(() => {
    if (isOpen) {
      refetchAssignments();
    } else {
      // Reset when closing
      setInitialAssignedIds(new Set());
      setChangedDeviceIds({});
      setErrorAssignments(null);
    }
  }, [isOpen, refetchAssignments]);

  // Determine the current displayed checked state for a device
  const getDisplayedCheckedState = useCallback((deviceId: string): boolean => {
    const initial = initialAssignedIds.has(deviceId);
    if (Object.prototype.hasOwnProperty.call(changedDeviceIds, deviceId)) {
      return changedDeviceIds[deviceId];
    }
    return initial;
  }, [initialAssignedIds, changedDeviceIds]);

  // Handle checkbox change
  const handleCheckboxChange = useCallback((deviceId: string, checked: boolean | string) => {
    const targetState = !!checked;

    // Both spaces and alarm zones use the same multi-select behavior
    // The constraint (one device per space/zone) is enforced on the backend
    const initial = initialAssignedIds.has(deviceId);
    setChangedDeviceIds(prevChanges => {
      const newChanges = { ...prevChanges };
      if (targetState === initial) {
        delete newChanges[deviceId];
      } else {
        newChanges[deviceId] = targetState;
      }
      return newChanges;
    });
  }, [initialAssignedIds]);

  // Handler for clicking anywhere on the row
  const handleRowClick = useCallback((row: Row<DeviceWithConnector>) => {
      const deviceId = row.original.id;
      if (!deviceId) return;
      
      const currentCheckedState = getDisplayedCheckedState(deviceId);
      handleCheckboxChange(deviceId, !currentCheckedState);
  }, [getDisplayedCheckedState, handleCheckboxChange]);

  // Select All functionality 
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
      
      // Both spaces and alarm zones use normal multi-select behavior
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

        return (
          <div className="py-0 align-middle flex items-center h-full">
            <Checkbox
              key={deviceId}
              checked={isChecked}
              onCheckedChange={(checkedState: boolean | string) => handleCheckboxChange(deviceId, checkedState)}
              aria-label="Select device"
              disabled={isLoadingAssignments}
            />
          </div>
        );
      },
      size: 40,
    },
    {
      accessorKey: 'name',
      header: 'Device Name',
      cell: ({ row }) => {
        return (
          <div className="flex items-center gap-2">
            <div className="font-medium">{row.getValue('name')}</div>
          </div>
        );
      },
      size: 250,
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
        size: 150,
    },
    {
      accessorKey: 'connectorCategory',
      header: 'Connector',
      cell: ({ row }) => { 
        const category = row.original.connectorCategory;
        const name = row.original.connectorName ?? formatConnectorCategory(category);
        return (
          <Badge variant="secondary" className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 font-normal">
            <ConnectorIcon connectorCategory={category} size={12} />
            <span className="text-xs">{name}</span>
          </Badge>
        );
      },
      size: 150,
    },
  ], [isLoadingAssignments, getDisplayedCheckedState, handleCheckboxChange, getSelectAllState, createSelectAllHandler]);

  // --- Filtering Logic & Data --- 

  // Get unique values for dropdown filters
  const uniqueDeviceTypes = useMemo(() => {
    const types = new Set(allDevices.map(d => d.deviceTypeInfo?.type).filter(Boolean)); 
    return ['all', ...Array.from(types).sort()];
  }, [allDevices]);

  const uniqueConnectors = useMemo(() => {
    const connectorMap = new Map<string, { name: string, category: string }>();
    allDevices.forEach(d => {
      const name = d.connectorName ?? formatConnectorCategory(d.connectorCategory);
      if (name && !connectorMap.has(name)) { 
        connectorMap.set(name, { name: name, category: d.connectorCategory });
      }
    });
    const sortedConnectors = Array.from(connectorMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    return sortedConnectors;
  }, [allDevices]);

  // Memoize the filtered devices - Split into assigned and available
  const [filteredAssignedDevices, filteredAvailableDevices] = useMemo(() => {
    const currentAssigned: DeviceWithConnector[] = [];
    const currentAvailable: DeviceWithConnector[] = [];

    allDevices.forEach(device => {
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
        
        // Assignment filter logic (simplified)
        let assignmentMatch = true;
        if (assignmentFilter === 'unassigned') {
          // Show only unassigned devices (this is a simplified check)
          assignmentMatch = !initialAssignedIds.has(device.id);
        }
        
        return nameMatch && typeMatch && connectorMatch && assignmentMatch;
    };

    return [
        currentAssigned.filter(filterDevice),
        currentAvailable.filter(filterDevice)
    ];
  }, [allDevices, nameFilter, typeFilter, connectorFilter, assignmentFilter, getDisplayedCheckedState, initialAssignedIds]);

  // --- Submit Handler ---
  const handleSaveChanges = async () => {
    setIsSubmitting(true);
    
    try {
      const changesToProcess = Object.entries(changedDeviceIds);
      
      // Both spaces and alarm zones use bulk operations
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

      const promises: Promise<boolean>[] = [];
      
      if (devicesToAssign.length > 0 && bulkAssignDevicesAction) {
        promises.push(bulkAssignDevicesAction(devicesToAssign));
      }
      
      if (devicesToRemove.length > 0 && bulkRemoveDevicesAction) {
        promises.push(bulkRemoveDevicesAction(devicesToRemove));
      }
      
      if (promises.length > 0) {
        await Promise.all(promises);
        const totalDevices = devicesToAssign.length + devicesToRemove.length;
        const containerText = containerType === 'space' ? 'space' : 'alarm zone';
        toast.success(`Successfully updated ${totalDevices} device assignment(s) for this ${containerText}.`);
      }
      
      onOpenChange(false);
    } catch (error) {
      console.error("Error during assignment saving:", error);
      toast.error("An unexpected error occurred while saving changes.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasChanges = Object.keys(changedDeviceIds).length > 0;
  const containerTypeText = containerType === 'space' ? 'Space' : 'Alarm Zone';
  const multiSelectText = containerType === 'space' 
    ? 'Select the devices to assign to this space. Each device can only be assigned to one space.'
    : 'Select the devices to assign to this alarm zone. Each device can only be assigned to one alarm zone.';

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Assign Devices to {containerTypeText}: {containerName}</DialogTitle>
          <DialogDescription>
            {multiSelectText}
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
            <ScrollArea className="h-[65vh] pr-4">
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
                                    .filter((type): type is string => typeof type === 'string')
                                    .map(type => {
                                    const Icon = type === 'all' ? null : getDeviceTypeIcon(type as DeviceType);
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
                                <SelectItem value="all" className="text-xs">
                                    <div className="flex items-center gap-2">
                                        <span>All Connectors</span>
                                    </div>
                                </SelectItem>
                                {uniqueConnectors
                                    .filter(connector => connector.name)
                                    .map(connector => (
                                    <SelectItem key={connector.name} value={connector.name} className="text-xs">
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
                                    <span>Unassigned</span>
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                
                    {/* Assigned Devices Table */}
                    <div className="mb-6">
                        <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                          Assigned Devices ({filteredAssignedDevices.length})
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
            disabled={isSubmitting || isLoadingAssignments || !hasChanges}
          >
            {isSubmitting ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}; 