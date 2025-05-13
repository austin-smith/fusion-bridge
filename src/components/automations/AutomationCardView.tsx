'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { 
  Workflow, 
  Trash2, 
  Pencil, 
  AlertTriangle, 
  ChevronRight, 
  TriangleAlert, 
  Bookmark, 
  Globe, 
  Power,
  HelpCircle,
  Layers,
  CheckCircle2, 
  XCircle,
  Copy
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';

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
import { ActionableState } from '@/lib/mappings/definitions';
import { 
  getActionTitle, 
  getActionIcon, 
  getActionIconProps,
  formatActionDetail, 
  getActionStyling 
} from '@/lib/automation-types';

// Interface for API response
interface AutomationApiResponse {
  id: string;
  name: string;
  enabled: boolean;
  createdAt: string; 
  updatedAt: string;
  configJson: AutomationConfig | null;
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

// Update the skeleton for a single-column layout
function AutomationCardSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <Card key={index} className="overflow-hidden">
          <div className="p-4 pb-2 border-b">
            <div className="flex items-center justify-between">
              <Skeleton className="h-6 w-1/3 mb-1" />
              
              <div className="flex items-center gap-2">
                <div className="h-5 w-20 flex items-center border rounded-md px-1.5">
                  <Skeleton className="h-3 w-3 rounded-full mr-1" />
                  <Skeleton className="h-3.5 w-12" />
                </div>
                
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

// Main AutomationCardView Component
export function AutomationCardView() {
  const [automations, setAutomations] = useState<AutomationApiResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [targetDevices, setTargetDevices] = useState<TargetDevice[]>([]);
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
        // Handle potential API response formats
        const devicesArray = Array.isArray(devicesData) 
          ? devicesData 
          : devicesData.data && Array.isArray(devicesData.data) 
            ? devicesData.data 
            : [];
        setTargetDevices(devicesArray);
      }
    } catch (e) {
      console.error('Failed to fetch connectors or devices:', e);
      // Set empty arrays to avoid null errors in the component
      setConnectors([]);
      setTargetDevices([]);
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

  if (automations.length === 0) {
    return (
      <div className="p-4">
        <Card className="p-6 text-center">
          <CardTitle className="mb-2">No Automations Found</CardTitle>
          <CardDescription>Create your first automation rule to get started</CardDescription>
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
        <div className="space-y-4 p-4">
          {automations.map((automation) => (
            <AutomationCard 
              key={automation.id} 
              automation={automation} 
              refreshData={fetchAutomations} 
              connectors={connectors}
              targetDevices={targetDevices}
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
}

function AutomationCard({ automation, refreshData, connectors, targetDevices }: AutomationCardProps) {
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

  // Remove border color function - use the shared styling instead
  const getCardBorderColor = () => {
    return "border-l-border"; // Use the neutral border color from the theme
  };

  return (
    <>
      <Card className="overflow-hidden hover:shadow-md transition-shadow">
        <CardHeader className="pb-2 border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold">
              {automation.name}
            </CardTitle>
            
            {/* Status badge and action buttons grouped together */}
            <div className="flex items-center gap-2">
              <Badge 
                variant={automation.enabled ? "outline" : "secondary"} 
                className={`h-5 py-0 px-1.5 text-xs ${automation.enabled ? 'text-green-600 dark:text-green-500 border-green-400 dark:border-green-500 bg-green-50 dark:bg-green-950/30' : ''}`}
              >
                {automation.enabled ? (
                  <>
                    <CheckCircle2 className="h-3 w-3 mr-0.5" />
                    Enabled
                  </>
                ) : (
                  <>
                    <XCircle className="h-3 w-3 mr-0.5" />
                    Disabled
                  </>
                )}
              </Badge>
              
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
                              devices: sortedTargetDevices 
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