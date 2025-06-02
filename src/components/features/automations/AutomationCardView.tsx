'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { 
  Trash2, 
  Pencil, 
  AlertTriangle, 
  CheckCircle2,
  XCircle,
  Copy,
  Building,
  MoreVertical,
  Activity,
  Calendar,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
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

// Execution Details Modal
import { ExecutionDetailsModal } from '@/components/features/automations/ExecutionDetailsModal';

// Store
import { useFusionStore } from '@/stores/store';

// Types
import type { AutomationConfig } from '@/lib/automation-schemas';
import {
  getActionIconProps,
  formatActionDetail,
  AutomationTriggerType,
} from '@/lib/automation-types';
import type { AutomationExecutionSummary } from '@/services/automation-audit-query-service';

// Interface for API response - Updated to match store types
interface AutomationApiResponse {
  id: string;
  name: string;
  enabled: boolean;
  createdAt: Date; // Changed from string to Date to match store
  updatedAt: Date; // Changed from string to Date to match store
  configJson: AutomationConfig | null;
  organizationId: string; // Added to match store
  locationScopeId?: string | null;
  tags: string[];
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
              {/* Collapsible header skeleton */}
              <div className="flex items-center gap-1 mb-2">
                <Skeleton className="h-3 w-3" />
                <Skeleton className="h-3 w-20" />
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
  selectedTags?: string[];
}

// Main AutomationCardView Component
export function AutomationCardView({ selectedLocationId, selectedTags = [] }: AutomationCardViewProps) {
  // Use store instead of local state
  const {
    automations,
    isLoadingAutomations: loading,
    errorAutomations: error,
    fetchAutomations,
    connectors,
    allDevices,
    locations,
    areas,
  } = useFusionStore();

  // Transform allDevices to match TargetDevice interface
  const targetDevices = React.useMemo(() => {
    return allDevices.map(device => ({
      id: device.id,
      name: device.name || 'Unknown Device',
      displayType: device.type || 'unknown',
      iconName: 'device', // Default icon name
    }));
  }, [allDevices]);

  // --- NEW: State for last runs ---
  const [lastRuns, setLastRuns] = useState<Map<string, AutomationExecutionSummary>>(new Map());
  // --- END NEW ---
  // --- NEW: State for execution details modal ---
  const [selectedExecution, setSelectedExecution] = useState<AutomationExecutionSummary | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  // --- END NEW ---
  const router = useRouter();

  // Fetch last runs for all automations
  const fetchLastRuns = useCallback(async () => {
    try {
      const response = await fetch('/api/automations/executions?lastRunOnly=true');
      if (!response.ok) {
        console.warn(`Failed to fetch last runs: ${response.status}`);
        return;
      }
      const result = await response.json();
      if (!result.success) {
        console.warn(`Failed to fetch last runs: ${result.error}`);
        return;
      }
      const lastRunsData = result.data as AutomationExecutionSummary[];
      const lastRunsMap = new Map<string, AutomationExecutionSummary>();
      lastRunsData.forEach(execution => {
        lastRunsMap.set(execution.automationId, execution);
      });
      setLastRuns(lastRunsMap);
    } catch (e) {
      console.error('Failed to fetch last runs:', e);
    }
  }, []);

  // Fetch on component mount
  useEffect(() => {
    fetchAutomations();
    fetchLastRuns();
  }, [fetchAutomations, fetchLastRuns]);

  // --- NEW: Function to open execution details modal ---
  const openExecutionDetails = (execution: AutomationExecutionSummary) => {
    setSelectedExecution(execution);
    setModalOpen(true);
  };
  // --- END NEW ---

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

  // Filter automations based on selected location and tags
  let filteredAutomations = selectedLocationId 
    ? automations.filter(automation => automation.locationScopeId === selectedLocationId)
    : automations;

  // Apply tags filtering - automation must have ALL selected tags
  if (selectedTags && selectedTags.length > 0) {
    filteredAutomations = filteredAutomations.filter(automation => {
      const automationTags = automation.tags || [];
      return selectedTags.every(selectedTag => automationTags.includes(selectedTag));
    });
  }

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
              lastRun={lastRuns.get(automation.id)}
              onOpenExecutionDetails={openExecutionDetails}
            />
          ))}
        </div>
      </ScrollArea>
      
      <ExecutionDetailsModal
        execution={selectedExecution}
        open={modalOpen}
        onOpenChange={setModalOpen}
      />
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
  lastRun?: AutomationExecutionSummary;
  onOpenExecutionDetails: (execution: AutomationExecutionSummary) => void;
}

function AutomationCard({ automation, refreshData, connectors, targetDevices, locations, areas, lastRun, onOpenExecutionDetails }: AutomationCardProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isCloning, setIsCloning] = useState(false);
  const [actionsExpanded, setActionsExpanded] = useState(false);
  
  // Use store methods for delete and clone
  const { deleteAutomation, cloneAutomation } = useFusionStore();
  const router = useRouter();

  // Get trigger type icon and styling
  const getTriggerTypeIcon = () => {
    const triggerType = automation.configJson?.trigger?.type;
    if (triggerType === AutomationTriggerType.SCHEDULED) {
      return {
        icon: Calendar,
        label: 'Scheduled'
      };
    } else if (triggerType === AutomationTriggerType.EVENT) {
      return {
        icon: Activity,
        label: 'Event-based'
      };
    }
    return null;
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const success = await deleteAutomation(automation.id);
      if (success) {
        setShowDeleteDialog(false);
        refreshData();
      }
    } catch (error) {
      // Store method handles error toasts, just log for debugging
      console.error('Delete failed:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleClone = async () => {
    setIsCloning(true);
    try {
      const clonedAutomation = await cloneAutomation(automation.id);
      if (clonedAutomation) {
        // Navigate to the edit page of the new automation
        router.push(`/automations/${clonedAutomation.id}`);
      }
    } catch (error) {
      // Store method handles error toasts, just log for debugging
      console.error('Clone failed:', error);
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
              
              {/* Trigger type indicator */}
              {(() => {
                const triggerInfo = getTriggerTypeIcon();
                if (!triggerInfo) return null;
                const IconComponent = triggerInfo.icon;
                return (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <IconComponent className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{triggerInfo.label} automation</p>
                    </TooltipContent>
                  </Tooltip>
                );
              })()}
              
              {currentRuleLocationScope && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Building className="h-4 w-4 shrink-0 text-muted-foreground" />
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
        
        <CardContent className="p-4">
          {/* Actions Section */}
          <div>
            {actions.length === 0 ? (
              <div>
                <h4 className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Actions</h4>
                <div className="text-sm text-muted-foreground">No actions configured</div>
              </div>
            ) : (
              <div>
                <h4 className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Actions</h4>
                
                {!actionsExpanded ? (
                  /* Collapsed: Show first action with indicator */
                  <div>
                    <div 
                      className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => setActionsExpanded(true)}
                    >
                      {getActionIconComponent(actions[0].type)}
                      <div className="min-w-0 flex-1">
                        <span className="text-sm text-muted-foreground">
                          {formatActionDetail(
                            actions[0].type, 
                            actions[0].params, 
                            { 
                              connectors: sortedPikoConnectors, 
                              devices: sortedTargetDevices,
                              areas: safeAreas,
                              ruleLocationScope: currentRuleLocationScope
                            }
                          )}
                        </span>
                      </div>
                      {actions.length > 1 && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                          <span>1 of {actions.length}</span>
                          <ChevronRight className="h-3 w-3" />
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Expanded: Entire area clickable, but indicator stays on first action */
                  <div 
                    className="p-2 rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => setActionsExpanded(false)}
                  >
                    <div className="space-y-3">
                      {/* First action with collapse indicator */}
                      <div className="flex items-center gap-2">
                        {getActionIconComponent(actions[0].type)}
                        <div className="min-w-0 flex-1">
                          <span className="text-sm text-muted-foreground">
                            {formatActionDetail(
                              actions[0].type, 
                              actions[0].params, 
                              { 
                                connectors: sortedPikoConnectors, 
                                devices: sortedTargetDevices,
                                areas: safeAreas,
                                ruleLocationScope: currentRuleLocationScope
                              }
                            )}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                          <span>Showing all {actions.length}</span>
                          <ChevronDown className="h-3 w-3" />
                        </div>
                      </div>
                      
                      {/* Remaining actions */}
                      {actions.slice(1).map((action, index) => (
                        <div key={index + 1} className="flex items-center gap-2">
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
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
        
        {/* Card Footer with Tags and Last Run */}
        {((automation.tags && automation.tags.length > 0) || lastRun) && (
          <CardFooter className="pt-3 pb-4 px-4 border-t">
            <div className="flex items-center justify-between w-full">
              {/* Tags on the left */}
              <div className="flex flex-wrap gap-1">
                {automation.tags && automation.tags.length > 0 && automation.tags.map((tag, index) => (
                  <Badge key={index} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
              
              {/* Last run on the right */}
              {lastRun && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto p-1 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => onOpenExecutionDetails(lastRun)}
                    >
                      <div className="flex items-center gap-2">
                        {lastRun.executionStatus === 'success' && (
                          <CheckCircle2 className="h-3 w-3 text-green-600" />
                        )}
                        {lastRun.executionStatus === 'failure' && (
                          <XCircle className="h-3 w-3 text-red-600" />
                        )}
                        {lastRun.executionStatus === 'partial_failure' && (
                          <AlertTriangle className="h-3 w-3 text-yellow-600" />
                        )}
                        <span>Last run {formatDistanceToNow(lastRun.triggerTimestamp, { addSuffix: true })}</span>
                      </div>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="text-sm">
                      <div className="font-medium">Last Run: {lastRun.executionStatus}</div>
                      <div>{formatDistanceToNow(lastRun.triggerTimestamp, { addSuffix: true })}</div>
                      {lastRun.totalActions > 0 && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {lastRun.successfulActions}/{lastRun.totalActions} actions succeeded
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground mt-1">
                        Click to view execution details
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </CardFooter>
        )}
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