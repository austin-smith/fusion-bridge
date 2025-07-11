'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent } from "@/components/ui/card";
import { ConnectorIcon } from "@/components/features/connectors/connector-icon";
import { getDeviceTypeIcon, getDisplayStateIcon, getDisplayStateColorClass } from "@/lib/mappings/presentation";
import { getDeviceTypeInfo } from "@/lib/mappings/identification";
import { Search, Loader2, Shield, Check, X, Link, Filter, HelpCircle } from 'lucide-react';
import { cn } from "@/lib/utils";
import { toast } from 'sonner';
import type { AlarmZone, DeviceWithConnector } from '@/types/index';
import { DeviceType } from '@/lib/mappings/definitions';
import { useFusionStore } from '@/stores/store';

interface AlarmZoneDeviceAssignmentDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  zone: AlarmZone | null;
  allDevices: DeviceWithConnector[];
}

export const AlarmZoneDeviceAssignmentDialog: React.FC<AlarmZoneDeviceAssignmentDialogProps> = ({
  isOpen,
  onOpenChange,
  zone,
  allDevices
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [connectorFilter, setConnectorFilter] = useState<string>('all');
  const [assignmentFilter, setAssignmentFilter] = useState<string>('all');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<Set<string>>(new Set());

  // Get store actions
  const { assignDeviceToAlarmZone, removeDeviceFromAlarmZone } = useFusionStore();

  // Reset state when dialog opens/closes or zone changes
  useEffect(() => {
    if (isOpen && zone) {
      setSelectedDeviceIds(new Set(zone.deviceIds || []));
      setSearchTerm('');
      setTypeFilter('all');
      setConnectorFilter('all');
      setAssignmentFilter('all');
    } else {
      setSelectedDeviceIds(new Set());
    }
  }, [isOpen, zone]);

  // Get unique device types and connectors for filtering
  const uniqueDeviceTypes = useMemo(() => {
    const types = new Set(
      allDevices
        .map(device => device.deviceTypeInfo?.type)
        .filter((type): type is DeviceType => Boolean(type))
        .map(type => String(type))
    );
    return Array.from(types).sort();
  }, [allDevices]);

  const uniqueConnectors = useMemo(() => {
    const connectors = new Set(allDevices.map(device => device.connectorCategory));
    return Array.from(connectors).sort();
  }, [allDevices]);

  // Filter devices based on search and filters
  const filteredDevices = useMemo(() => {
    const lowerSearchTerm = searchTerm.toLowerCase();
    
    return allDevices.filter(device => {
      // Search filter
      const nameMatch = device.name.toLowerCase().includes(lowerSearchTerm);
      const typeMatch = device.deviceTypeInfo?.type?.toLowerCase().includes(lowerSearchTerm);
      const connectorMatch = device.connectorCategory?.toLowerCase().includes(lowerSearchTerm);
      const searchMatch = nameMatch || typeMatch || connectorMatch;
      
      // Type filter
      const typeFilterMatch = typeFilter === 'all' || String(device.deviceTypeInfo?.type) === typeFilter;
      
      // Connector filter
      const connectorFilterMatch = connectorFilter === 'all' || device.connectorCategory === connectorFilter;
      
      // Assignment filter
      const isCurrentlyAssigned = zone?.deviceIds?.includes(device.id) || false;
      let assignmentFilterMatch = true;
      if (assignmentFilter === 'assigned') {
        assignmentFilterMatch = isCurrentlyAssigned;
      } else if (assignmentFilter === 'unassigned') {
        assignmentFilterMatch = !isCurrentlyAssigned;
      }
      
      return searchMatch && typeFilterMatch && connectorFilterMatch && assignmentFilterMatch;
    });
  }, [allDevices, searchTerm, typeFilter, connectorFilter, assignmentFilter, zone?.deviceIds]);

  // Group devices by type for better organization
  const devicesByType = useMemo(() => {
    const grouped: Record<string, DeviceWithConnector[]> = {};
    filteredDevices.forEach(device => {
      const type = device.deviceTypeInfo?.type || 'Unknown';
      if (!grouped[type]) {
        grouped[type] = [];
      }
      grouped[type].push(device);
    });
    
    // Sort groups and devices within groups
    Object.values(grouped).forEach(group => 
      group.sort((a, b) => a.name.localeCompare(b.name))
    );
    
    return grouped;
  }, [filteredDevices]);

  const handleDeviceToggle = (deviceId: string, isChecked: boolean) => {
    setSelectedDeviceIds(prev => {
      const newSet = new Set(prev);
      if (isChecked) {
        newSet.add(deviceId);
      } else {
        newSet.delete(deviceId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    const currentlyVisibleDeviceIds = filteredDevices.map(device => device.id);
    setSelectedDeviceIds(new Set([...selectedDeviceIds, ...currentlyVisibleDeviceIds]));
  };

  const handleDeselectAll = () => {
    const currentlyVisibleDeviceIds = new Set(filteredDevices.map(device => device.id));
    setSelectedDeviceIds(prev => new Set([...prev].filter(id => !currentlyVisibleDeviceIds.has(id))));
  };

  const handleSubmit = async () => {
    if (!zone) return;

    setIsSubmitting(true);
    try {
      const currentDeviceIds = new Set(zone.deviceIds || []);
      const newDeviceIds = selectedDeviceIds;

      // Devices to add (in new selection but not in current)
      const devicesToAdd = [...newDeviceIds].filter(id => !currentDeviceIds.has(id));
      
      // Devices to remove (in current but not in new selection)
      const devicesToRemove = [...currentDeviceIds].filter(id => !newDeviceIds.has(id));

      let addSuccessCount = 0;
      let removeSuccessCount = 0;

      // Add devices
      for (const deviceId of devicesToAdd) {
        const success = await assignDeviceToAlarmZone(zone.id, deviceId);
        if (success) addSuccessCount++;
      }

      // Remove devices
      for (const deviceId of devicesToRemove) {
        const success = await removeDeviceFromAlarmZone(zone.id, deviceId);
        if (success) removeSuccessCount++;
      }

      // Show success message
      if (addSuccessCount > 0 || removeSuccessCount > 0) {
        const messages = [];
        if (addSuccessCount > 0) {
          messages.push(`${addSuccessCount} device${addSuccessCount === 1 ? '' : 's'} added`);
        }
        if (removeSuccessCount > 0) {
          messages.push(`${removeSuccessCount} device${removeSuccessCount === 1 ? '' : 's'} removed`);
        }
        toast.success(`Zone updated: ${messages.join(', ')}`);
      }

      // Check for failures
      const totalAttempts = devicesToAdd.length + devicesToRemove.length;
      const totalSuccess = addSuccessCount + removeSuccessCount;
      
      if (totalAttempts > 0 && totalSuccess < totalAttempts) {
        toast.error(`Some operations failed. ${totalSuccess}/${totalAttempts} completed successfully.`);
      }

      onOpenChange(false);
    } catch (error) {
      console.error('Error updating device assignments:', error);
      toast.error('Failed to update device assignments');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!zone) {
    return null;
  }

  const hasChanges = !areSetEqual(selectedDeviceIds, new Set(zone.deviceIds || []));
  const totalDevices = filteredDevices.length;
  const selectedCount = selectedDeviceIds.size;
  const visibleSelectedCount = filteredDevices.filter(device => selectedDeviceIds.has(device.id)).length;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Assign Devices to &quot;{zone.name}&quot;
          </DialogTitle>
          <DialogDescription>
            Select devices to monitor in this alarm zone. Devices can be assigned to multiple zones.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 flex-1 min-h-0">
          {/* Search and Filters */}
          <div className="flex flex-col gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search devices..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <div className="flex gap-2 flex-wrap">
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {uniqueDeviceTypes.map(type => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Select value={connectorFilter} onValueChange={setConnectorFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Connector" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Connectors</SelectItem>
                  {uniqueConnectors.map(connector => (
                    <SelectItem key={connector} value={connector}>{connector}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Select value={assignmentFilter} onValueChange={setAssignmentFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Assignment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Devices</SelectItem>
                  <SelectItem value="assigned">Assigned</SelectItem>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Selection Summary */}
          <div className="flex items-center justify-between p-3 bg-muted/25 rounded-lg">
            <div className="flex items-center gap-2">
              <Badge variant="outline">
                {selectedCount} selected
              </Badge>
              <span className="text-sm text-muted-foreground">
                {totalDevices} device{totalDevices === 1 ? '' : 's'} shown
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSelectAll}
                disabled={visibleSelectedCount === totalDevices}
              >
                Select All
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDeselectAll}
                disabled={visibleSelectedCount === 0}
              >
                Deselect All
              </Button>
            </div>
          </div>

          {/* Device List */}
          <ScrollArea className="flex-1 border rounded-lg">
            <div className="p-3">
              {Object.keys(devicesByType).length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <Filter className="h-8 w-8 mx-auto mb-2" />
                  <p>No devices match your search criteria</p>
                </div>
              ) : (
                                 Object.entries(devicesByType).map(([type, devices]) => {
                   const TypeIcon = type !== "Unknown" ? getDeviceTypeIcon(type as DeviceType) : HelpCircle;
                  
                  return (
                    <div key={type} className="mb-6 last:mb-0">
                      <div className="flex items-center gap-2 mb-3">
                        <TypeIcon className="h-4 w-4" />
                        <h4 className="font-semibold text-sm">{type}</h4>
                        <Badge variant="secondary" className="text-xs">
                          {devices.length}
                        </Badge>
                      </div>
                      
                      <div className="space-y-2">
                        {devices.map(device => {
                          const isSelected = selectedDeviceIds.has(device.id);
                          const typeInfo = device.deviceTypeInfo;
                          const StateIcon = device.displayState ? getDisplayStateIcon(device.displayState) : null;
                          const stateColorClass = getDisplayStateColorClass(device.displayState);
                          
                          return (
                            <Card key={device.id} className={cn(
                              "cursor-pointer transition-colors",
                              isSelected && "ring-2 ring-primary"
                            )}>
                              <CardContent className="p-3">
                                <div 
                                  className="flex items-center gap-3"
                                  onClick={() => handleDeviceToggle(device.id, !isSelected)}
                                >
                                  <Checkbox 
                                    checked={isSelected}
                                    onChange={() => {}} // Controlled by parent click
                                  />
                                  
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="font-medium truncate">{device.name}</span>
                                      <Badge variant="outline" className="text-xs">
                                        <ConnectorIcon 
                                          connectorCategory={device.connectorCategory} 
                                          size={12} 
                                          className="mr-1" 
                                        />
                                        {typeInfo?.type || 'Unknown'}
                                        {typeInfo?.subtype && `/${typeInfo.subtype}`}
                                      </Badge>
                                    </div>
                                    
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                      <span>{device.connectorCategory}</span>
                                      {StateIcon && (
                                        <>
                                          <span>•</span>
                                          <StateIcon className={cn("h-3 w-3", stateColorClass)} />
                                          <span className={stateColorClass}>
                                            {device.displayState}
                                          </span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                  
                                  {isSelected && (
                                    <Check className="h-4 w-4 text-primary" />
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !hasChanges}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Updating...
              </>
            ) : (
              <>
                <Link className="h-4 w-4 mr-2" />
                Update Assignments
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// Utility function to compare sets
function areSetEqual<T>(set1: Set<T>, set2: Set<T>): boolean {
  if (set1.size !== set2.size) return false;
  for (const item of set1) {
    if (!set2.has(item)) return false;
  }
  return true;
} 