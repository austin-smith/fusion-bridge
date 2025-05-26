'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { 
  Trash2, 
  Pencil, 
  AlertTriangle, 
  Layers,
  CheckCircle2,
  XCircle,
  Copy,
  MapPin,
  MoreVertical
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';

// UI Components
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';

// Alert Dialog
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

// Skeleton
import { Skeleton } from "@/components/ui/skeleton";

// Types
import type { AutomationConfig } from '@/lib/automation-schemas';
import {
  getActionIconProps,
  formatActionDetail,
} from '@/lib/automation-types';

// Interface for API response
interface AutomationApiResponse {
  id: string;
  name: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  configJson: AutomationConfig | null;
  locationScopeId?: string | null;
}

// Add types for connectors and devices
interface Connector {
  id: string;
  name: string;
  category: string;
}

interface TargetDevice {
  id: string;
  name: string;
  displayType: string;
  iconName: string;
}

// --- NEW: Add Location and Area types ---
interface Location {
  id: string;
  name: string;
}

interface Area {
  id: string;
  name: string;
}
// --- END NEW ---

// Update the skeleton for a single-column layout
function AutomationCardSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <Card key={index} className="overflow-hidden">
          <div className="pb-2 border-b p-4">
            {/* Grid layout matching the actual card header */}
            <div className="grid grid-cols-[1fr,auto] gap-2 w-full">
              {/* Title area with truncation - MATCHES ACTUAL COMPONENT */}
              <div className="flex items-center space-x-2 overflow-hidden">
                <div className="overflow-hidden">
                  <CardTitle className="truncate block font-semibold">
                    <Skeleton className="h-6 w-1/3" />
                  </CardTitle>
                </div>
              </div>
              
              {/* Controls area */}
              <div className="flex items-center gap-2 shrink-0">
                {/* Status badge skeleton */}
                <div className="h-6 w-16 flex items-center border rounded-md px-1.5">
                  <Skeleton className="h-3 w-3 rounded-full mr-1" />
                  <Skeleton className="h-3.5 w-8" />
                </div>
                
                {/* Action buttons skeleton */}
                <Skeleton className="h-8 w-8 rounded-md" />
                <Skeleton className="h-8 w-8 rounded-md" />
              </div>
            </div>
          </div>
          
          <div className="p-4">
            <div className="mb-3">
              <Skeleton className="h-3 w-16 mb-3" />
              
              <div className="space-y-3">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Skeleton className="h-4 w-4 rounded-full" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                ))}
                
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-4 rounded-full" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
                
                <div className="mt-3 pt-2 border-t border-dashed border-muted">
                  <div className="flex items-center">
                    <Skeleton className="h-3 w-3 rounded-full mr-1.5" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

// Props for AutomationCardView
interface AutomationCardViewProps {
  selectedLocationId?: string | null;
}

// Main AutomationCardView Component
export function AutomationCardView({ selectedLocationId }: AutomationCardViewProps) {
  const [automations, setAutomations] = useState<AutomationApiResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [targetDevices, setTargetDevices] = useState<TargetDevice[]>([]);
  // --- NEW: State for locations and areas ---
  const [locations, setLocations] = useState<Location[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  // --- END NEW ---
  const router = useRouter();

  // Fetch automations function
  const fetchAutomations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/automations');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json() as AutomationApiResponse[];
      // Sort automations by name alphabetically
      const sortedData = data.sort((a, b) => a.name.localeCompare(b.name));
      setAutomations(sortedData);
    } catch (e) {
      console.error('Failed to fetch automations:', e);
      setError('Failed to load automations.');
      toast.error('Failed to load automations.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch connectors and devices
  const fetchConnectorsAndDevices = useCallback(async () => {
    try {
      // Fetch connectors
      const connectorsResponse = await fetch('/api/connectors');
      if (!connectorsResponse.ok) {
        console.warn(`Failed to fetch connectors: ${connectorsResponse.status}`);
        setConnectors([]);
      } else {
        const connectorsData = await connectorsResponse.json();
        // Handle potential API response formats
        const connectorsArray = Array.isArray(connectorsData) 
          ? connectorsData 
          : connectorsData.data && Array.isArray(connectorsData.data) 
            ? connectorsData.data 
            : [];
        setConnectors(connectorsArray);
      }

      // Fetch devices
      const devicesResponse = await fetch('/api/devices');
      if (!devicesResponse.ok) {
        console.warn(`Failed to fetch devices: ${devicesResponse.status}`);
        setTargetDevices([]);
      } else {
        const devicesData = await devicesResponse.json();
        const devicesArray = Array.isArray(devicesData)
          ? devicesData
          : devicesData.data && Array.isArray(devicesData.data)
            ? devicesData.data
            : [];
        setTargetDevices(devicesArray);
      }

      // --- NEW: Fetch locations ---
      const locationsResponse = await fetch('/api/locations');
      if (!locationsResponse.ok) {
        console.warn(`Failed to fetch locations: ${locationsResponse.status}`);
        setLocations([]);
      } else {
        const locationsData = await locationsResponse.json();
        const locationsArray = Array.isArray(locationsData)
          ? locationsData
          : locationsData.data && Array.isArray(locationsData.data)
            ? locationsData.data
            : [];
        setLocations(locationsArray);
      }
      // --- END NEW ---

      // --- NEW: Fetch areas ---
      const areasResponse = await fetch('/api/areas');
      if (!areasResponse.ok) {
        console.warn(`Failed to fetch areas: ${areasResponse.status}`);
        setAreas([]);
      } else {
        const areasData = await areasResponse.json();
        const areasArray = Array.isArray(areasData)
          ? areasData
          : areasData.data && Array.isArray(areasData.data)
            ? areasData.data
            : [];
        setAreas(areasArray);
      }
      // --- END NEW ---

    } catch (e) {
      console.error('Failed to fetch connectors, devices, locations, or areas:', e);
      setConnectors([]);
      setTargetDevices([]);
      // --- NEW: Set empty arrays on error ---
      setLocations([]);
      setAreas([]);
      // --- END NEW ---
    }
  }, []);

  // Fetch on component mount
  useEffect(() => {
    fetchAutomations();
    fetchConnectorsAndDevices();
  }, [fetchAutomations, fetchConnectorsAndDevices]);

  if (loading) {
    return <AutomationCardSkeleton />;
  }

  if (error) {
    return (
      <div className="p-4">
        <Card className="p-6 bg-destructive/10 border-destructive">
          <div className="flex items-center space-x-3">
            <AlertTriangle className="h-6 w-6 text-destructive" />
            <div className="text-destructive font-medium">{error}</div>
          </div>
          <Button 
            variant="outline" 
            className="mt-4" 
            onClick={() => fetchAutomations()}
          >
            Try Again
          </Button>
        </Card>
      </div>
    );
  }

  // Filter automations based on selected location
  const filteredAutomations = selectedLocationId 
    ? automations.filter(automation => automation.locationScopeId === selectedLocationId)
    : automations;

  if (filteredAutomations.length === 0) {
    return (
      <div className="p-4">
        <Card className="p-6 text-center">
          <CardTitle className="mb-2">
            {selectedLocationId ? "No Automations Found for Selected Location" : "No Automations Found"}
          </CardTitle>
          <CardDescription>
            {selectedLocationId 
              ? "No automations are configured for the selected location. Create one to get started."
              : "Create your first automation rule to get started"
            }
          </CardDescription>
          <Button asChild className="mt-4">
            <Link href="/automations/new">
              Create Automation
            </Link>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <ScrollArea className="h-full">
        <div className="space-y-4">
          {filteredAutomations.map((automation) => (
            <AutomationCard 
              key={automation.id} 
              automation={automation} 
              refreshData={fetchAutomations} 
              connectors={connectors}
              targetDevices={targetDevices}
              locations={locations}
              areas={areas}
            />
          ))}
        </div>
      </ScrollArea>
    </TooltipProvider>
  );
}

// Update the card component props
interface AutomationCardProps {
  automation: AutomationApiResponse;
  refreshData: () => void;
  connectors: Connector[];
  targetDevices: TargetDevice[];
  locations: Location[];
  areas: Area[];
}

function AutomationCard({ automation, refreshData, connectors, targetDevices, locations, areas }: AutomationCardProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isCloning, setIsCloning] = useState(false);
  const router = useRouter();

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/automations/${automation.id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        let errorDetails = `API Error: ${response.status}`;
        try { 
          const errorJson = await response.json(); 
          errorDetails = errorJson.message || errorDetails; 
        } catch {} 
        throw new Error(errorDetails);
      }
      toast.success(`Automation "${automation.name}" deleted.`);
      setShowDeleteDialog(false);
      refreshData();
    } catch (error) {
      console.error('Delete failed:', error);
      toast.error(`Failed to delete automation. ${error instanceof Error ? error.message : ''}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleClone = async () => {
    setIsCloning(true);
    try {
      const response = await fetch(`/api/automations/${automation.id}/clone`, {
        method: 'POST',
      });
      if (!response.ok) {
        let errorDetails = `API Error: ${response.status}`;
        try {
          const errorJson = await response.json();
          errorDetails = errorJson.message || errorDetails;
        } catch {}
        throw new Error(errorDetails);
      }
      // Get the newly created automation from the response
      const newAutomation = await response.json(); 
      toast.success(`Automation "${automation.name}" cloned successfully as "${newAutomation.name}".`);
      router.push(`/automations/${newAutomation.id}`); // Navigate to the edit page of the new automation
    } catch (error) {
      console.error('Clone failed:', error);
      toast.error(`Failed to clone automation. ${error instanceof Error ? error.message : ''}`);
    } finally {
      setIsCloning(false);
    }
  };

  // Get action icon component with proper styling
  const getActionIconComponent = (actionType: string) => {
    const { icon: IconComponent, className } = getActionIconProps(actionType);
    return <IconComponent className={className} />;
  };

  // Create sorted arrays like in AutomationForm - with safety checks
  const safeConnectors = Array.isArray(connectors) ? connectors : [];
  const safeTargetDevices = Array.isArray(targetDevices) ? targetDevices : [];
  const safeLocations = Array.isArray(locations) ? locations : [];
  const safeAreas = Array.isArray(areas) ? areas : [];
  
  const pikoConnectors = safeConnectors.filter(c => c?.category === 'piko');
  const sortedPikoConnectors = [...pikoConnectors].sort((a, b) => 
    (a?.name || '').localeCompare(b?.name || ''));
  const sortedTargetDevices = [...safeTargetDevices].sort((a, b) => 
    (a?.name || '').localeCompare(b?.name || ''));

  // Get the actions data safely
  const actions = automation.configJson?.actions || [];
  
  // Limit to first 3 actions for display
  const visibleActions = actions.slice(0, 3);
  const hasMoreActions = actions.length > 3;
  const hiddenActionCount = actions.length - visibleActions.length;

  // --- NEW: Derive currentRuleLocationScope ---
  const currentRuleLocationScope = automation.locationScopeId && safeLocations.length > 0
    ? safeLocations.find(loc => loc.id === automation.locationScopeId)
    : null;
  // --- END NEW ---

  // Get status color class based on enabled state
  const getStatusColorClass = (enabled: boolean): string => {
    return enabled
      ? 'bg-green-500/20 text-green-600 border border-green-500/20'
      : 'bg-slate-300/20 text-slate-500 border border-slate-300/20';
  };
  
  return (
    <>
      <Card className="overflow-hidden hover:shadow-md transition-shadow">
        <CardHeader className="p-4 border-b">
          {/* Using grid for reliable layout with truncation */}
          <div className="grid grid-cols-[1fr,auto] gap-2 w-full">
            {/* Title area with truncation */}
            <div className="flex items-center space-x-2 overflow-hidden">
              <div className="overflow-hidden">
                <CardTitle className="text-lg truncate block font-semibold">
                  {automation.name}
                </CardTitle>
              </div>
              {currentRuleLocationScope && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Scoped to: {currentRuleLocationScope.name}</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
            
            {/* Status badge and action buttons - will not shrink */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Full status pill on sm+ screens */}
              <div className={`hidden sm:inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ${getStatusColorClass(automation.enabled)}`}>
                {automation.enabled ? 'Enabled' : 'Disabled'}
              </div>
              {/* Icon-only badge on small screens */}
              <div className={`sm:hidden inline-flex items-center justify-center p-1 rounded-md ${getStatusColorClass(automation.enabled)}`}>
                {automation.enabled
                  ? <CheckCircle2 className="h-4 w-4" />
                  : <XCircle className="h-4 w-4" />
                }
              </div>
              
              {/* Individual actions shown at sm+ */}
              <div className="hidden sm:flex items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button asChild variant="ghost" size="icon">
                      <Link href={`/automations/${automation.id}`}>
                        <Pencil className="h-4 w-4" />
                        <span className="sr-only">Edit automation</span>
                      </Link>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Edit automation</p>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleClone}
                      disabled={isCloning || isDeleting}
                      className="text-blue-600 hover:text-blue-700 hover:bg-blue-500/10 dark:text-blue-400 dark:hover:text-blue-300 dark:hover:bg-blue-500/10"
                    >
                      <Copy className="h-4 w-4" />
                      <span className="sr-only">Clone automation</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Clone automation</p>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setShowDeleteDialog(true)}
                      disabled={isDeleting}
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">Delete automation</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Delete automation</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              {/* Dropdown on small screens */}
              <div className="flex sm:hidden">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreVertical className="h-5 w-5" />
                      <span className="sr-only">Open actions menu</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => router.push(`/automations/${automation.id}`)} className="flex items-center gap-2">
                      <Pencil className="h-4 w-4" />
                      <span>Edit</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={handleClone} className="flex items-center gap-2">
                      <Copy className="h-4 w-4" />
                      <span>Clone</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="flex items-center gap-2 text-destructive" onSelect={() => setShowDeleteDialog(true)}>
                      <Trash2 className="h-4 w-4" />
                      <span>Delete</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="pt-4 pb-4">
          {/* Actions Section */}
          <div className="mb-3">
            <h4 className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Actions</h4>
            
            <div>
              {actions.length === 0 ? (
                <div className="text-sm text-muted-foreground">No actions configured</div>
              ) : (
                <div className="space-y-3">
                  {visibleActions.map((action, index) => (
                    <div key={index} className="flex items-center gap-2">
                      {getActionIconComponent(action.type)}
                      <div className="min-w-0 flex-1">
                        <span className="text-sm text-muted-foreground">
                          {formatActionDetail(
                            action.type, 
                            action.params, 
                            { 
                              connectors: sortedPikoConnectors, 
                              devices: sortedTargetDevices,
                              areas: safeAreas,
                              ruleLocationScope: currentRuleLocationScope
                            }
                          )}
                        </span>
                      </div>
                    </div>
                  ))}
                  
                  {/* Show indicator for additional actions */}
                  {hasMoreActions && (
                    <div className="mt-3 pt-2 border-t border-dashed border-muted">
                      <span className="flex items-center text-xs text-muted-foreground">
                        <Layers className="h-3 w-3 mr-1.5" />
                        {hiddenActionCount} more action{hiddenActionCount !== 1 ? 's' : ''}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              automation rule <span className="font-semibold">{automation.name}</span>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete} 
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}