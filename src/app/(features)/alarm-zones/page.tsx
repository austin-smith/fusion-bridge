'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useFusionStore } from '@/stores/store';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Terminal, Loader2, Plus, Shield, Search, Building } from 'lucide-react';
import { AlarmZoneEditDialog } from '@/components/features/locations/alarm-zones/alarm-zone-edit-dialog';
import { AlarmZoneCard } from '@/components/features/locations/alarm-zones/AlarmZoneCard';
import { AlarmZoneDeviceAssignmentDialog } from '@/components/features/locations/alarm-zones/alarm-zone-device-assignment-dialog';
import { AlarmZoneTriggerRulesDialog } from '@/components/features/locations/alarm-zones/alarm-zone-trigger-rules-dialog';
import { AlarmZoneAuditLogDialog } from '@/components/features/locations/alarm-zones/alarm-zone-audit-log-dialog';
import { CameraWallDialog } from '@/components/features/common/camera-wall-dialog';
import type { AlarmZone, Location, DeviceWithConnector } from "@/types/index";
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
import { ArmedState, DeviceType } from "@/lib/mappings/definitions";
import { getArmedStateIcon } from "@/lib/mappings/presentation";
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
import {
  DndContext,
  DragEndEvent,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useDroppable
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';

export default function AlarmZonesPage() {
  // Set page title
  useEffect(() => {
    document.title = 'Alarm Zones // Fusion';
  }, []);

  const { 
    locations, 
    isLoadingLocations, 
    errorLocations, 
    fetchLocations,
    alarmZones,
    isLoadingAlarmZones,
    errorAlarmZones,
    fetchAlarmZones,
    addAlarmZone,
    updateAlarmZone,
    deleteAlarmZone,
    updateAlarmZoneArmedState,
    assignDeviceToAlarmZone,
    removeDeviceFromAlarmZone,
    bulkAssignDevicesToAlarmZone,
    bulkRemoveDevicesFromAlarmZone,
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
    alarmZones: state.alarmZones,
    isLoadingAlarmZones: state.isLoadingAlarmZones,
    errorAlarmZones: state.errorAlarmZones,
    fetchAlarmZones: state.fetchAlarmZones,
    addAlarmZone: state.addAlarmZone,
    updateAlarmZone: state.updateAlarmZone,
    deleteAlarmZone: state.deleteAlarmZone,
    updateAlarmZoneArmedState: state.updateAlarmZoneArmedState,
    assignDeviceToAlarmZone: state.assignDeviceToAlarmZone,
    removeDeviceFromAlarmZone: state.removeDeviceFromAlarmZone,
    bulkAssignDevicesToAlarmZone: state.bulkAssignDevicesToAlarmZone,
    bulkRemoveDevicesFromAlarmZone: state.bulkRemoveDevicesFromAlarmZone,
    allDevices: state.allDevices,
    isLoadingAllDevices: state.isLoadingAllDevices,
    errorAllDevices: state.errorAllDevices,
    fetchAllDevices: state.fetchAllDevices,
    activeOrganizationId: state.activeOrganizationId,
  }));

  const [isZoneDialogOpen, setIsZoneDialogOpen] = useState(false);
  const [editingZone, setEditingZone] = useState<AlarmZone | null>(null);
  const [defaultLocationId, setDefaultLocationId] = useState<string | undefined>(undefined);
  const [isZoneDeleteDialogOpen, setIsZoneDeleteDialogOpen] = useState(false);
  const [zoneToDelete, setZoneToDelete] = useState<AlarmZone | null>(null);
  const [isAssignDevicesDialogOpen, setIsAssignDevicesDialogOpen] = useState(false);
  const [zoneToAssignDevices, setZoneToAssignDevices] = useState<AlarmZone | null>(null);
  const [isTriggerRulesDialogOpen, setIsTriggerRulesDialogOpen] = useState(false);
  const [zoneToManageTriggerRules, setZoneToManageTriggerRules] = useState<AlarmZone | null>(null);
  const [isAuditLogDialogOpen, setIsAuditLogDialogOpen] = useState(false);
  const [zoneToViewAuditLog, setZoneToViewAuditLog] = useState<AlarmZone | null>(null);
  const [isCameraWallDialogOpen, setIsCameraWallDialogOpen] = useState(false);
  const [selectedZoneForCameraWall, setSelectedZoneForCameraWall] = useState<AlarmZone | null>(null);
  const [expandedZoneDevices, setExpandedZoneDevices] = useState<Record<string, boolean>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [locationFilter, setLocationFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // dnd-kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    fetchLocations();
    fetchAlarmZones();
    fetchAllDevices();
  }, [fetchLocations, fetchAlarmZones, fetchAllDevices]);

  const handleAssignDevicesDialogChange = (isOpen: boolean) => {
    const zoneIdBeingModified = zoneToAssignDevices?.id;
    setIsAssignDevicesDialogOpen(isOpen);
    if (!isOpen && zoneIdBeingModified) {
      // After dialog closes, ensure the modified zone remains expanded
      setExpandedZoneDevices(prev => ({
        ...prev,
        [zoneIdBeingModified]: true
      }));
      setZoneToAssignDevices(null);
    } else if (!isOpen) {
      setZoneToAssignDevices(null);
    }
  };

  const handleOpenZoneDialog = (zone: AlarmZone | null, defaultLocationId?: string) => {
    setEditingZone(zone);
    setDefaultLocationId(defaultLocationId);
    setIsZoneDialogOpen(true);
  };

  const handleZoneDialogSubmit = async (formData: { name: string; locationId: string; description?: string; triggerBehavior: 'standard' | 'custom' }, zoneId?: string): Promise<boolean> => {
    let success = false;
    try {
      if (zoneId) {
        const result = await updateAlarmZone(zoneId, formData);
        if (!result) throw new Error("Update failed in store");
        toast.success("Alarm zone updated successfully!");
        success = true;
      } else {
        const result = await addAlarmZone(formData);
        if (!result) throw new Error("Add failed in store");
        toast.success("Alarm zone created successfully!");
        success = true;
      }
    } catch (error) {
       toast.error(error instanceof Error ? error.message : "An unknown error occurred while saving the alarm zone.");
       success = false;
    }
    if (success) await fetchAlarmZones();
    return success;
  };

  const handleOpenZoneDeleteDialog = (zone: AlarmZone | null) => {
    if (!zone) return;
    setZoneToDelete(zone);
    setIsZoneDeleteDialogOpen(true);
  };

  const confirmDeleteZone = async () => {
    if (!zoneToDelete) return;

    const success = await deleteAlarmZone(zoneToDelete.id);
    if (success) {
        toast.success(`Alarm zone "${zoneToDelete.name}" deleted.`);
    } else {
        toast.error(`Failed to delete alarm zone "${zoneToDelete.name}".`);
    }
    setZoneToDelete(null);
    setIsZoneDeleteDialogOpen(false);
  };

  const handleOpenAssignDevicesDialog = (zone: AlarmZone | null) => {
    if (!zone) return;
    setZoneToAssignDevices(zone);
    setIsAssignDevicesDialogOpen(true);
  };

  const toggleZoneDevices = (zoneId: string) => {
    setExpandedZoneDevices(prev => ({ ...prev, [zoneId]: !prev[zoneId] }));
  };

  const handleArmAction = async (zone: AlarmZone, state: ArmedState) => {
    try {
      const success = await updateAlarmZoneArmedState(zone.id, state);
      if (success) {
        const stateText = state === ArmedState.DISARMED ? 'disarmed' : 
                         state === ArmedState.ARMED ? 'armed' : 'acknowledged';
        toast.success(`Alarm zone "${zone.name}" ${stateText}.`);
      } else {
        toast.error(`Failed to update zone "${zone.name}".`);
      }
    } catch (error) {
      console.error("Error updating zone state:", error);
      toast.error(`An error occurred while updating zone state.`);
    }
  };

  const handleManageTriggerRules = (zone: AlarmZone) => {
    setZoneToManageTriggerRules(zone);
    setIsTriggerRulesDialogOpen(true);
  };

  const handleViewAuditLog = (zone: AlarmZone) => {
    setZoneToViewAuditLog(zone);
    setIsAuditLogDialogOpen(true);
  };

  const handleViewCameras = (zone: AlarmZone) => {
    setSelectedZoneForCameraWall(zone);
    setIsCameraWallDialogOpen(true);
  };

  const handleCameraWallDialogChange = (isOpen: boolean) => {
    setIsCameraWallDialogOpen(isOpen);
    if (!isOpen) {
      setSelectedZoneForCameraWall(null);
    }
  };

  // Droppable wrapper for alarm zone cards
  const AlarmZoneCardWrapper = ({ zone, children }: { zone: AlarmZone; children: React.ReactNode }) => {
    const { setNodeRef, isOver } = useDroppable({
      id: zone.id,
      data: { type: 'alarm-zone' }
    });

    return (
      <div
        ref={setNodeRef}
        id={`alarm-zone-${zone.id}`}
        className="mb-3 last:mb-0"
      >
        {React.cloneElement(children as React.ReactElement, { isOver })}
      </div>
    );
  };

  // Drag and Drop handler
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id && active.data.current?.type === 'device' && over.data.current?.type === 'alarm-zone') {
      const deviceId = active.id as string;
      const targetZoneId = over.id as string;
      const sourceZoneId = active.data.current?.sourceZoneId as string | undefined;

      // Find details for potential toast messages
      const device = allDevices.find(d => d.id === deviceId);
      const targetZone = alarmZones.find(z => z.id === targetZoneId);

      if (!deviceId || !targetZoneId || !targetZone) {
        console.error("DragEnd: Missing device ID, target zone ID, or target zone not found.", { deviceId, targetZoneId, sourceZoneId });
        toast.error("Failed to move device: Invalid data.");
        return;
      }
      
      if (sourceZoneId === targetZoneId) {
        console.log("DragEnd: Source and target zone are the same. No action taken.");
        return;
      }

      try {
        // For alarm zones, we assign the device to the new zone (which automatically removes it from the old one)
        const success = await assignDeviceToAlarmZone(targetZoneId, deviceId);
        
        if (success) {
          toast.success(`Moved ${device?.name ?? 'device'} to ${targetZone.name}.`);
          console.log(`Device ${deviceId} moved to alarm zone ${targetZoneId}.`);
        } else {
          toast.error(`Failed to move ${device?.name ?? 'device'} to ${targetZone.name}.`);
          console.warn(`Failed to move device ${deviceId} to alarm zone ${targetZoneId}.`);
        }
      } catch (error) { 
        console.error("Error moving device:", error);
        toast.error(`An error occurred while moving ${device?.name ?? 'device'}.`);
      }
    } else {
      console.log("DragEnd: Invalid drop target or condition not met", { active, over });
    }
  };

  // Skeleton Component for Alarm Zones Page - Matches Real AlarmZoneCard Structure
  const AlarmZonesPageSkeleton = ({ locationCount = 2, zonesPerLocation = 2 }: { locationCount?: number; zonesPerLocation?: number }) => {
    return (
      <div className="space-y-6">
        {[...Array(locationCount)].map((_, locationIndex) => (
          <Card key={locationIndex} className="overflow-visible">
            {/* Location Header Skeleton */}
            <CardHeader className="flex flex-row items-center justify-between pb-3 bg-muted/25">
              <div className="flex items-center gap-2 min-w-0">
                <Skeleton className="h-5 w-5 rounded" />
                <Skeleton className="h-6 w-32 rounded" />
              </div>
            </CardHeader>
            
            {/* Alarm Zones within Location Skeleton - Collapsed State */}
            <CardContent className="pt-3 space-y-3">
              {[...Array(zonesPerLocation)].map((_, zoneIndex) => (
                <Card key={zoneIndex} className="border border-border/50">
                  {/* Zone Card Header - matches real AlarmZoneCard header */}
                  <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
                    <div className="flex items-center gap-2 min-w-0">
                      <Skeleton className="h-4 w-4 rounded" /> {/* Chevron */}
                      <Skeleton className="h-4 w-4 rounded" /> {/* Shield icon */}
                      <Skeleton className="h-5 w-28 rounded" /> {/* Zone name */}
                      <Skeleton className="h-5 w-16 rounded-full" /> {/* Device count badge */}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Skeleton className="h-7 w-20 rounded-md" /> {/* Armed state dropdown */}
                      <Skeleton className="h-7 w-7 rounded-md" /> {/* Actions dropdown */}
                    </div>
                  </CardHeader>
                  
                  {/* Trigger Behavior Info Section - matches real component */}
                  <div className="px-4 py-2 border-t bg-muted/10 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-3 w-3 rounded" /> {/* Settings icon */}
                      <Skeleton className="h-3 w-24 rounded" /> {/* "Trigger Behavior:" text */}
                      <Skeleton className="h-3 w-16 rounded" /> {/* behavior value */}
                    </div>
                    <Skeleton className="h-6 w-16 rounded-md" /> {/* Configure button */}
                  </div>
                  {/* No expanded content shown - collapsed state */}
                </Card>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  const renderLoading = () => <AlarmZonesPageSkeleton />;

  const renderError = (error: string | null, type: string) => (
     <Alert variant="destructive" className="mb-4">
        <Terminal className="h-4 w-4" />
        <AlertTitle>Error Fetching {type}</AlertTitle>
        <AlertDescription>
          {error || "An unknown error occurred."}
        </AlertDescription>
      </Alert>
  );

  // Group zones by location
  const zonesByLocation = useMemo(() => {
    const grouped: Record<string, AlarmZone[]> = {};
    alarmZones.forEach(zone => {
        const locId = zone.locationId ?? 'unassigned';
        if (!grouped[locId]) {
            grouped[locId] = [];
        }
        grouped[locId].push(zone);
    });
    // Sort groups internally
    Object.values(grouped).forEach(zoneGroup => {
        zoneGroup.sort((a, b) => a.name.localeCompare(b.name));
    });
    return grouped;
  }, [alarmZones]);

  // Filter locations and zones separately for stability (like locations page)
  const filteredSortedLocations = useMemo(() => {
    const lowerSearchTerm = searchTerm.toLowerCase();
    
    // First filter locations
    let filteredLocations = locations;
    if (locationFilter !== 'all') {
      filteredLocations = locations.filter(location => location.id === locationFilter);
    }
    
    if (!searchTerm) {
      return [...filteredLocations].sort((a, b) => a.name.localeCompare(b.name));
    }
    
    // Filter locations by name OR if they contain zones that match the search
    const filtered = filteredLocations.filter(location => 
      location.name.toLowerCase().includes(lowerSearchTerm) ||
      (zonesByLocation[location.id] || []).some(zone => 
        zone.name.toLowerCase().includes(lowerSearchTerm)
      )
    );
    
    return filtered.sort((a, b) => a.name.localeCompare(b.name));
  }, [locations, searchTerm, locationFilter, zonesByLocation]);

  const isFilteredEmptyState = !isLoadingLocations && !isLoadingAlarmZones && 
                               filteredSortedLocations.length === 0 && 
                               (searchTerm !== '' || locationFilter !== 'all' || statusFilter !== 'all' || (!zonesByLocation['unassigned'] || zonesByLocation['unassigned'].length === 0));
  const hasOriginalData = locations.length > 0 || alarmZones.length > 0;

  // Define page actions
  const pageActions = (
    <>
      <div className="relative flex-shrink-0">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search zones..."
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
          {[...locations].sort((a, b) => a.name.localeCompare(b.name)).map(location => (
            <SelectItem key={location.id} value={location.id}>
              {location.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={statusFilter} onValueChange={setStatusFilter}>
        <SelectTrigger className="w-[140px] h-9">
          <SelectValue placeholder="Filter by status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Status</SelectItem>
          <SelectItem value={ArmedState.ARMED}>
            <div className="flex items-center gap-2">
              {React.createElement(getArmedStateIcon(ArmedState.ARMED), { className: "h-4 w-4" })}
              Armed
            </div>
          </SelectItem>
          <SelectItem value={ArmedState.DISARMED}>
            <div className="flex items-center gap-2">
              {React.createElement(getArmedStateIcon(ArmedState.DISARMED), { className: "h-4 w-4" })}
              Disarmed
            </div>
          </SelectItem>
          <SelectItem value={ArmedState.TRIGGERED}>
            <div className="flex items-center gap-2">
              {React.createElement(getArmedStateIcon(ArmedState.TRIGGERED), { className: "h-4 w-4" })}
              Triggered
            </div>
          </SelectItem>
        </SelectContent>
      </Select>

    </>
  );

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="flex flex-col h-full"> 
      <div className="p-4 border-b flex-shrink-0">
        <PageHeader 
          title="Alarm Zones"
          description="Manage security zones for coordinated alarm management"
          icon={<Shield className="h-6 w-6 text-muted-foreground" />}
          actions={pageActions}
        />
      </div>

      <ScrollArea className="flex-1"> 
        <div className="p-4 md:p-6">
          {/* Show skeleton when loading OR in initial empty state */}
          {(isLoadingLocations || isLoadingAlarmZones || 
            (locations.length === 0 && alarmZones.length === 0 && !errorLocations && !errorAlarmZones)) && renderLoading()}
          
          {/* Show errors when not loading */}
          {!(isLoadingLocations || isLoadingAlarmZones || (locations.length === 0 && alarmZones.length === 0 && !errorLocations && !errorAlarmZones)) && (
            <>
              {errorLocations && renderError(errorLocations, 'Locations')}
              {errorAlarmZones && renderError(errorAlarmZones, 'Alarm Zones')}
            </>
          )}
          
          {/* Show content when data is loaded and no errors */}
          {!(isLoadingLocations || isLoadingAlarmZones || (locations.length === 0 && alarmZones.length === 0 && !errorLocations && !errorAlarmZones)) && 
           !errorLocations && !errorAlarmZones && (
            <div className="space-y-6">
              {filteredSortedLocations.map(location => {
                const locationZones = zonesByLocation[location.id] || [];
                const lowerSearchTerm = searchTerm.toLowerCase();
                
                // Filter zones by status and search (like locations page pattern)
                const filteredZones = locationZones.filter(zone => {
                  const nameMatch = zone.name.toLowerCase().includes(lowerSearchTerm);
                  const statusMatch = statusFilter === 'all' || zone.armedState === statusFilter;
                  return nameMatch && statusMatch;
                });
                
                // Hide locations with no matching zones when searching (unless location name matches)
                if (filteredZones.length === 0 && searchTerm && !location.name.toLowerCase().includes(lowerSearchTerm)) {
                  return null;
                }

                return (
                  <Card key={location.id} className="overflow-visible">
                    <CardHeader className="flex flex-row items-center justify-between pb-3 bg-muted/25">
                      <div className="flex items-center gap-2 min-w-0">
                        <Building className="h-5 w-5 flex-shrink-0" />
                        <CardTitle className="truncate" title={location.name}>{location.name}</CardTitle>
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleOpenZoneDialog(null, location.id)}
                        className="h-7 text-xs"
                      >
                        <Plus className="h-3 w-3" /> 
                        Add Zone
                      </Button>
                    </CardHeader>
                    <CardContent className="pt-3">
                      {filteredZones.length > 0 ? (
                        filteredZones.map(zone => (
                          <AlarmZoneCardWrapper key={zone.id} zone={zone}>
                            <AlarmZoneCard 
                              zone={zone}
                              allDevices={allDevices}
                              isDevicesExpanded={expandedZoneDevices[zone.id] ?? false}
                              onToggleDetails={toggleZoneDevices}
                              onAssignDevices={handleOpenAssignDevicesDialog}
                              onEditZone={handleOpenZoneDialog}
                              onDeleteZone={handleOpenZoneDeleteDialog}
                              onArmAction={handleArmAction}
                              onManageTriggerRules={handleManageTriggerRules}
                              onViewAuditLog={handleViewAuditLog}
                              onViewCameras={handleViewCameras}
                            />
                          </AlarmZoneCardWrapper>
                        ))
                      ) : (
                        <div className="px-4 py-6 text-center">
                          <div className="rounded-full bg-muted p-3 mb-2 inline-flex">
                            <Shield className="h-5 w-5 text-muted-foreground" />
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">
                            No alarm zones in this location. 
                          </p>
                          <Button variant="outline" size="sm" onClick={() => handleOpenZoneDialog(null, location.id)}>
                            <Plus className="h-3.5 w-3.5" /> Add Zone
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}

              {searchTerm === '' && locationFilter === 'all' && statusFilter === 'all' && zonesByLocation['unassigned'] && zonesByLocation['unassigned'].length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Unassigned Zones</CardTitle>
                    <CardDescription>These zones are not linked to any specific location.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {zonesByLocation['unassigned'].map(zone => (
                      <AlarmZoneCardWrapper key={zone.id} zone={zone}>
                        <AlarmZoneCard 
                          zone={zone}
                          allDevices={allDevices}
                          isDevicesExpanded={expandedZoneDevices[zone.id] ?? false}
                          onToggleDetails={toggleZoneDevices}
                          onAssignDevices={handleOpenAssignDevicesDialog}
                          onEditZone={handleOpenZoneDialog}
                          onDeleteZone={handleOpenZoneDeleteDialog}
                          onArmAction={handleArmAction}
                          onManageTriggerRules={handleManageTriggerRules}
                          onViewAuditLog={handleViewAuditLog}
                          onViewCameras={handleViewCameras}
                        />
                      </AlarmZoneCardWrapper>
                    ))}
                  </CardContent>
                </Card>
              )}

              {isFilteredEmptyState && (
                <Card className="border-dashed">
                  <CardContent className="pt-10 pb-10 px-6 flex flex-col items-center text-center">
                    <div className="rounded-full p-6 mb-4">
                      <Shield className="h-12 w-12 text-muted-foreground" />
                    </div>
                    <CardTitle className="mb-2">
                      {hasOriginalData && (searchTerm !== '' || locationFilter !== 'all' || statusFilter !== 'all')
                       ? "No alarm zones match your search criteria."
                       : "Alarm zones provide coordinated security management."
                      }
                    </CardTitle>
                    <CardDescription className="mb-6 max-w-md">
                      {hasOriginalData && (searchTerm !== '' || locationFilter !== 'all' || statusFilter !== 'all')
                       ? "Try adjusting your search or filters."
                       : "Create alarm zones to group devices for security monitoring and control."
                      }
                    </CardDescription>
                    {(!hasOriginalData || (searchTerm === '' && locationFilter === 'all' && statusFilter === 'all')) && (
                                              <Button onClick={() => handleOpenZoneDialog(null)}>
                        <Plus className="h-4 w-4 mr-2" />
                        Create Your First Zone
                      </Button>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      </ScrollArea>
      
      <AlarmZoneEditDialog
        isOpen={isZoneDialogOpen}
        onOpenChange={setIsZoneDialogOpen}
        zoneToEdit={editingZone}
        allLocations={locations}
        allAlarmZones={alarmZones}
        defaultLocationId={defaultLocationId}
        onSubmit={handleZoneDialogSubmit}
      />
      
      <AlarmZoneDeviceAssignmentDialog
        isOpen={isAssignDevicesDialogOpen}
        onOpenChange={handleAssignDevicesDialogChange}
        zone={zoneToAssignDevices}
        allDevices={allDevices}
        allZones={alarmZones}
        assignDeviceAction={assignDeviceToAlarmZone}
        removeDeviceAction={removeDeviceFromAlarmZone}
        bulkAssignDevicesAction={bulkAssignDevicesToAlarmZone}
        bulkRemoveDevicesAction={bulkRemoveDevicesFromAlarmZone}
      />
      
      <AlarmZoneTriggerRulesDialog
        isOpen={isTriggerRulesDialogOpen}
        onOpenChange={setIsTriggerRulesDialogOpen}
        zone={zoneToManageTriggerRules}
      />
      
      <AlarmZoneAuditLogDialog
        isOpen={isAuditLogDialogOpen}
        onOpenChange={setIsAuditLogDialogOpen}
        zone={zoneToViewAuditLog}
      />
      
      {/* Camera Wall Dialog */}
      {selectedZoneForCameraWall && (
        <CameraWallDialog
          isOpen={isCameraWallDialogOpen}
          onOpenChange={handleCameraWallDialogChange}
          title={`Camera Wall: ${selectedZoneForCameraWall.name}`}
          cameraDevices={allDevices.filter(device => 
            selectedZoneForCameraWall.deviceIds?.includes(device.id) && 
            device.deviceTypeInfo?.type === DeviceType.Camera
          )}
        />
      )}
      
      <AlertDialog open={isZoneDeleteDialogOpen} onOpenChange={setIsZoneDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the alarm zone 
              <strong className="px-1">{zoneToDelete?.name}</strong> 
              and remove any device assignments and trigger rules.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setZoneToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteZone} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </DndContext>
  );
} 