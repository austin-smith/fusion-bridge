'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useFusionStore } from '@/stores/store';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Terminal, Loader2, Plus, Shield, Search } from 'lucide-react';
import { AlarmZoneEditDialog } from '@/components/features/locations-areas/alarm-zones/alarm-zone-edit-dialog';
import { AlarmZoneCard } from '@/components/features/locations-areas/alarm-zones/AlarmZoneCard';
import { AlarmZoneDeviceAssignmentDialog } from '@/components/features/locations-areas/alarm-zones/alarm-zone-device-assignment-dialog';
import { AlarmZoneTriggerRulesDialog } from '@/components/features/locations-areas/alarm-zones/alarm-zone-trigger-rules-dialog';
import { AlarmZoneAuditLogDialog } from '@/components/features/locations-areas/alarm-zones/alarm-zone-audit-log-dialog';
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
import { ArmedState } from "@/lib/mappings/definitions";
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
    allDevices: state.allDevices,
    isLoadingAllDevices: state.isLoadingAllDevices,
    errorAllDevices: state.errorAllDevices,
    fetchAllDevices: state.fetchAllDevices,
    activeOrganizationId: state.activeOrganizationId,
  }));

  const [isZoneDialogOpen, setIsZoneDialogOpen] = useState(false);
  const [editingZone, setEditingZone] = useState<AlarmZone | null>(null);
  const [isZoneDeleteDialogOpen, setIsZoneDeleteDialogOpen] = useState(false);
  const [zoneToDelete, setZoneToDelete] = useState<AlarmZone | null>(null);
  const [isAssignDevicesDialogOpen, setIsAssignDevicesDialogOpen] = useState(false);
  const [zoneToAssignDevices, setZoneToAssignDevices] = useState<AlarmZone | null>(null);
  const [isTriggerRulesDialogOpen, setIsTriggerRulesDialogOpen] = useState(false);
  const [zoneToManageTriggerRules, setZoneToManageTriggerRules] = useState<AlarmZone | null>(null);
  const [isAuditLogDialogOpen, setIsAuditLogDialogOpen] = useState(false);
  const [zoneToViewAuditLog, setZoneToViewAuditLog] = useState<AlarmZone | null>(null);
  const [expandedZoneDevices, setExpandedZoneDevices] = useState<Record<string, boolean>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [locationFilter, setLocationFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    fetchLocations();
    fetchAlarmZones();
    fetchAllDevices();
  }, [fetchLocations, fetchAlarmZones, fetchAllDevices]);

  const handleAssignDevicesDialogChange = (isOpen: boolean) => {
    const zoneIdBeingModified = zoneToAssignDevices?.id;
    setIsAssignDevicesDialogOpen(isOpen);
    if (!isOpen && zoneIdBeingModified) {
      // When the dialog closes, refetch zones
      fetchAlarmZones().then(() => {
        // After fetching, ensure the modified zone remains expanded
        setExpandedZoneDevices(prev => ({
          ...prev,
          [zoneIdBeingModified]: true
        }));
      });
      setZoneToAssignDevices(null);
    } else if (!isOpen) {
      setZoneToAssignDevices(null);
    }
  };

  const handleOpenZoneDialog = (zone: AlarmZone | null) => {
    setEditingZone(zone);
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

  const renderLoading = () => (
    <div className="space-y-6">
      {[...Array(3)].map((_, index) => (
        <Card key={index}>
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

  // Filter locations and zones based on search, location, and status filters
  const filteredSortedLocations = useMemo(() => {
    const lowerSearchTerm = searchTerm.toLowerCase();
    
    // Filter locations
    let filteredLocations = locations;
    if (locationFilter !== 'all') {
      filteredLocations = locations.filter(location => location.id === locationFilter);
    }
    
    // Filter by search term and status
    if (searchTerm || statusFilter !== 'all') {
      filteredLocations = filteredLocations.filter(location => {
        const locationNameMatch = location.name.toLowerCase().includes(lowerSearchTerm);
        const locationZones = zonesByLocation[location.id] || [];
        
        // Filter zones by status and search
        const filteredZones = locationZones.filter(zone => {
          const nameMatch = zone.name.toLowerCase().includes(lowerSearchTerm);
          const statusMatch = statusFilter === 'all' || zone.armedState === statusFilter;
          return nameMatch && statusMatch;
        });
        
        return locationNameMatch || filteredZones.length > 0;
      });
    }
    
    return filteredLocations.sort((a, b) => a.name.localeCompare(b.name));
  }, [locations, searchTerm, locationFilter, statusFilter, zonesByLocation]);

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
          {locations.map(location => (
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
          <SelectItem value={ArmedState.DISARMED}>Disarmed</SelectItem>
          <SelectItem value={ArmedState.ARMED}>Armed</SelectItem>
          <SelectItem value={ArmedState.TRIGGERED}>Triggered</SelectItem>
        </SelectContent>
      </Select>
      {!isFilteredEmptyState && (
        <Button variant="outline" onClick={() => handleOpenZoneDialog(null)} size="sm">
          <Plus className="h-4 w-4" /> Add Zone
        </Button>
      )}
    </>
  );

  return (
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
          {(isLoadingLocations || isLoadingAlarmZones) && renderLoading()}
          {errorLocations && renderError(errorLocations, 'Locations')}
          {errorAlarmZones && renderError(errorAlarmZones, 'Alarm Zones')}
          
          {!isLoadingLocations && !isLoadingAlarmZones && !errorLocations && !errorAlarmZones && (
            <div className="space-y-6">
              {filteredSortedLocations.map(location => {
                const locationZones = zonesByLocation[location.id] || [];
                const filteredZones = searchTerm || statusFilter !== 'all'
                  ? locationZones.filter(zone => {
                      const nameMatch = zone.name.toLowerCase().includes(searchTerm.toLowerCase());
                      const statusMatch = statusFilter === 'all' || zone.armedState === statusFilter;
                      return nameMatch && statusMatch;
                    })
                  : locationZones;
                  
                if (filteredZones.length === 0 && (searchTerm || statusFilter !== 'all')) {
                  return null; // Hide locations with no matching zones when filtering
                }
                
                return (
                  <Card key={location.id} className="overflow-visible">
                    <CardHeader className="flex flex-row items-center justify-between pb-3 bg-muted/25">
                      <div className="flex items-center gap-2 min-w-0">
                        <Shield className="h-5 w-5 flex-shrink-0" />
                        <CardTitle className="truncate" title={location.name}>{location.name}</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-3">
                      {filteredZones.length > 0 ? (
                        filteredZones.map(zone => (
                          <div key={zone.id} className="mb-3 last:mb-0">
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
                            />
                          </div>
                        ))
                      ) : (
                        <div className="px-4 py-6 text-center">
                          <div className="rounded-full bg-muted p-3 mb-2 inline-flex">
                            <Shield className="h-5 w-5 text-muted-foreground" />
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">
                            No alarm zones in this location. 
                          </p>
                          <Button variant="outline" size="sm" onClick={() => handleOpenZoneDialog(null)}>
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
                      <div key={zone.id} className="mb-3 last:mb-0">
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
                        />
                      </div>
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
        onSubmit={handleZoneDialogSubmit}
      />
      
      <AlarmZoneDeviceAssignmentDialog
        isOpen={isAssignDevicesDialogOpen}
        onOpenChange={handleAssignDevicesDialogChange}
        zone={zoneToAssignDevices}
        allDevices={allDevices}
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
  );
} 