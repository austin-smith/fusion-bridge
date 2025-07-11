'use client';

import React, { useEffect, useState, useMemo } from 'react';
import type { Space, DeviceWithConnector } from '@/types/index';
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
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

// Component Props
interface SpaceDeviceAssignmentDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  space: Space | null; // The space to assign a device to
  allDevices: DeviceWithConnector[]; // List of all available devices
  allSpaces: Space[]; // List of all spaces for looking up existing assignments
  // Pass store actions directly
  assignDeviceAction: (spaceId: string, deviceId: string) => Promise<boolean>;
  removeDeviceAction: (spaceId: string, deviceId: string) => Promise<boolean>;
}

export const SpaceDeviceAssignmentDialog: React.FC<SpaceDeviceAssignmentDialogProps> = ({ 
  isOpen, 
  onOpenChange, 
  space, 
  allDevices,
  allSpaces,
  assignDeviceAction,
  removeDeviceAction,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('none');
  
  // Filtering State
  const [nameFilter, setNameFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all'); 
  const [connectorFilter, setConnectorFilter] = useState<string>('all');
  const [assignmentFilter, setAssignmentFilter] = useState<string>('unassigned'); // Default to unassigned

  // Create a map of device assignments to spaces (one device per space)
  const deviceSpaceAssignments = useMemo(() => {
    const assignments = new Map<string, string | null>();
    allDevices.forEach(device => {
      // Find which space this device is assigned to (if any)
      const assignedSpace = allSpaces.find(s => s.deviceIds?.includes(device.id));
      assignments.set(device.id, assignedSpace?.id || null);
    });
    return assignments;
  }, [allDevices, allSpaces]);

  // Initialize selected device when dialog opens
  useEffect(() => {
    if (isOpen && space) {
      // Find the currently assigned device for this space
      const assignedDeviceId = space.deviceIds && space.deviceIds.length > 0 ? space.deviceIds[0] : null;
      setSelectedDeviceId(assignedDeviceId || 'none');
    } else {
      setSelectedDeviceId('none');
    }
  }, [isOpen, space]);

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

  // Filter devices based on filters
  const filteredDevices = useMemo(() => {
    return allDevices.filter(device => {
      const nameMatch = device.name.toLowerCase().includes(nameFilter.toLowerCase());
      const typeMatch = typeFilter === 'all' || device.deviceTypeInfo?.type === typeFilter;
      const connectorDisplayName = device.connectorName ?? formatConnectorCategory(device.connectorCategory);
      const connectorMatch = connectorFilter === 'all' || connectorDisplayName === connectorFilter;
      
      // Assignment filter logic
      let assignmentMatch = true;
      if (assignmentFilter === 'unassigned') {
        // Show only devices that are not assigned to any space
        const assignedSpaceId = deviceSpaceAssignments.get(device.id);
        assignmentMatch = !assignedSpaceId;
      } else if (assignmentFilter === 'assigned-elsewhere') {
        // Show only devices assigned to other spaces (not this space and not unassigned)
        const assignedSpaceId = deviceSpaceAssignments.get(device.id);
        assignmentMatch = assignedSpaceId && assignedSpaceId !== space?.id;
      }
      // 'all' shows everything
      
      return nameMatch && typeMatch && connectorMatch && assignmentMatch;
    });
  }, [allDevices, nameFilter, typeFilter, connectorFilter, assignmentFilter, deviceSpaceAssignments, space?.id]);

  // Device Item Component
  const DeviceItem: React.FC<{ device: DeviceWithConnector }> = ({ device }) => {
    const typeInfo = device.deviceTypeInfo;
    const IconComponent = typeInfo ? getDeviceTypeIcon(typeInfo.type) : HelpCircle;
    const typeText = typeInfo ? typeInfo.type : "Unknown";
    const subtypeText = typeInfo?.subtype;
    const connectorDisplayName = device.connectorName ?? formatConnectorCategory(device.connectorCategory);
    const assignedSpaceId = deviceSpaceAssignments.get(device.id);
    const isAssignedElsewhere = assignedSpaceId !== null && space?.id !== undefined && assignedSpaceId !== space.id;

    return (
      <div className="flex items-center space-x-3">
        <RadioGroupItem value={device.id} id={device.id} />
        <Label htmlFor={device.id} className="flex-1 cursor-pointer">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">{device.name}</div>
              <div className="flex items-center gap-2 mt-1">
                <TooltipProvider delayDuration={100}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="secondary" className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 font-normal text-xs">
                        <IconComponent className="h-3 w-3 text-muted-foreground" />
                        <span>
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
                <Badge variant="secondary" className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 font-normal text-xs">
                  <ConnectorIcon connectorCategory={device.connectorCategory} size={12} />
                  <span>{connectorDisplayName}</span>
                </Badge>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isAssignedElsewhere && (
                <Badge variant="outline" className="text-xs px-1.5 py-0 text-muted-foreground">
                  Assigned elsewhere
                </Badge>
              )}
            </div>
          </div>
        </Label>
      </div>
    );
  };

  // Submit Handler
  const handleSaveChanges = async () => {
    if (!space) return;
    setIsSubmitting(true);
    
    try {
      const currentDeviceId = space.deviceIds && space.deviceIds.length > 0 ? space.deviceIds[0] : null;
      
      // If removing assignment
      if (selectedDeviceId === 'none') {
        if (currentDeviceId) {
          const success = await removeDeviceAction(space.id, currentDeviceId);
          if (success) {
            toast.success('Device removed from space.');
            onOpenChange(false);
          } else {
            toast.error('Failed to remove device from space.');
          }
        } else {
          // No change needed
          onOpenChange(false);
        }
      } else {
        // If assigning a device
        if (selectedDeviceId !== currentDeviceId) {
          // First remove current device if any
          if (currentDeviceId) {
            await removeDeviceAction(space.id, currentDeviceId);
          }
          
          // Then assign new device
          const success = await assignDeviceAction(space.id, selectedDeviceId);
          if (success) {
            toast.success('Device assigned to space.');
            onOpenChange(false);
          } else {
            toast.error('Failed to assign device to space.');
          }
        } else {
          // No change needed
          onOpenChange(false);
        }
      }
    } catch (error) {
      console.error("Error during device assignment:", error);
      toast.error("An unexpected error occurred while saving changes.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Assign Device to Space: {space?.name}</DialogTitle>
          <DialogDescription>
            Select one device to assign to this space. Each space can only have one device, and each device can only be in one space.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Filter Controls */}
          <div className="flex items-center gap-2 pb-2 border-b">
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
                <SelectItem value="all" className="text-xs">All Connectors</SelectItem>
                {uniqueConnectors.map(connector => (
                  <SelectItem key={connector.name} value={connector.name} className="text-xs">
                    <div className="flex items-center gap-2">
                      <ConnectorIcon connectorCategory={connector.category} size={12} />
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
                <SelectItem value="all" className="text-xs">All Devices</SelectItem>
                <SelectItem value="unassigned" className="text-xs">Unassigned Only</SelectItem>
                <SelectItem value="assigned-elsewhere" className="text-xs">Assigned Elsewhere</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Device Selection */}
          <ScrollArea className="h-[400px] pr-4">
            <RadioGroup value={selectedDeviceId} onValueChange={setSelectedDeviceId}>
              <div className="flex items-center space-x-3 pb-2">
                <RadioGroupItem value="none" id="none" />
                <Label htmlFor="none" className="cursor-pointer font-medium">
                  No Device (Remove current assignment)
                </Label>
              </div>
              <div className="space-y-3">
                {filteredDevices.map(device => (
                  <DeviceItem key={device.id} device={device} />
                ))}
              </div>
              {filteredDevices.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No devices match the current filters.
                </div>
              )}
            </RadioGroup>
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSaveChanges} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}; 