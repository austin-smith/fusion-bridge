'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Plus, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFloorPlans } from '@/hooks/floor-plan/use-floor-plans';
import { FloorPlanTabs } from './floor-plan-tabs';
import { FloorPlanDetail, type FloorPlanDetailRef } from './floor-plan-detail';
import { FloorPlanNameDialog } from './floor-plan-name-dialog';
import { FloorPlanUploadDialog } from './floor-plan-upload-dialog';
import { FloorPlanLoadingSkeleton } from './floor-plan-loading-skeleton';
import { useFusionStore } from '@/stores/store';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface FloorPlanManagerProps {
  locationId: string;
  expectedToHaveFloorPlans?: boolean;
  className?: string;
}

export function FloorPlanManager({ locationId, expectedToHaveFloorPlans = false, className }: FloorPlanManagerProps) {
  const [activeFloorPlanId, setActiveFloorPlanId] = useState<string | null>(null);
  const [isNameDialogOpen, setIsNameDialogOpen] = useState(false);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [floorPlanToRename, setFloorPlanToRename] = useState<{ id: string; currentName: string } | null>(null);
  
  // Zoom control state
  const [zoomLevel, setZoomLevel] = useState(1);
  const floorPlanDetailRef = useRef<FloorPlanDetailRef>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const { allDevices, spaces } = useFusionStore();

  const {
    floorPlans,
    isLoading,
    error,
    refetch,
    createFloorPlan,
    updateFloorPlan,
    deleteFloorPlan
  } = useFloorPlans({ locationId });

  // Set active floor plan when floor plans load
  useEffect(() => {
    if (floorPlans.length > 0 && !activeFloorPlanId) {
      setActiveFloorPlanId(floorPlans[0].id);
    }
  }, [floorPlans, activeFloorPlanId]);

  const handleUpdateFloorPlan = async (id: string, name?: string, file?: File) => {
    try {
      await updateFloorPlan(id, name, file);
      toast.success('Floor plan updated successfully');
    } catch (error) {
      console.error('Error updating floor plan:', error);
      toast.error('Failed to update floor plan');
    }
  };

  const handleDeleteFloorPlan = async (id: string) => {
    try {
      await deleteFloorPlan(id);
      
      // If we deleted the active floor plan, switch to another one
      const remainingPlans = floorPlans.filter(fp => fp.id !== id);
      setActiveFloorPlanId(remainingPlans.length > 0 ? remainingPlans[0].id : null);
      
      toast.success('Floor plan deleted successfully');
    } catch (error) {
      console.error('Error deleting floor plan:', error);
      toast.error('Failed to delete floor plan');
    }
  };

  const handleCreateFloorPlan = async (name: string, file: File) => {
    try {
      const newFloorPlan = await createFloorPlan(name, file);
      setActiveFloorPlanId(newFloorPlan.id);
      setIsUploadDialogOpen(false);
      toast.success('Floor plan created successfully');
    } catch (error) {
      console.error('Error creating floor plan:', error);
      toast.error('Failed to create floor plan');
    }
  };

  const handleRenameFloorPlan = (id: string, currentName: string) => {
    setFloorPlanToRename({ id, currentName });
    setIsNameDialogOpen(true);
  };

  const handleRenameSubmit = async (newName: string) => {
    if (!floorPlanToRename) return;
    try {
      await handleUpdateFloorPlan(floorPlanToRename.id, newName);
      setIsNameDialogOpen(false);
      setFloorPlanToRename(null);
    } catch (error) {
      console.error('Error renaming floor plan:', error);
    }
  };

  // Zoom control handlers
  const handleZoomIn = () => {
    floorPlanDetailRef.current?.zoomIn();
  };

  const handleZoomOut = () => {
    floorPlanDetailRef.current?.zoomOut();
  };

  const handleResetZoom = () => {
    floorPlanDetailRef.current?.resetZoom();
  };

  const handleReplaceClick = () => {
    floorPlanDetailRef.current?.startReplace();
  };

  const handleOpenDevices = () => {
    floorPlanDetailRef.current?.openDevices();
  };

  const activeFloorPlan = floorPlans.find(fp => fp.id === activeFloorPlanId) || null;

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-destructive">Error loading floor plans: {error}</p>
        <Button onClick={refetch} className="mt-4">
          Retry
        </Button>
      </div>
    );
  }

  // Show loading skeleton when loading, regardless of expected state
  if (isLoading) {
    return (
      <div className={className}>
        <FloorPlanLoadingSkeleton />
      </div>
    );
  }

  return (
    <div className={['flex flex-col h-full', className].filter(Boolean).join(' ')}>
      {/* Show header with tabs and add button only when there are floor plans */}
      {floorPlans.length > 0 && (
        <div className="flex items-center justify-between mb-4">
          <FloorPlanTabs
            floorPlans={floorPlans}
            activeFloorPlanId={activeFloorPlanId}
            onFloorPlanSelect={setActiveFloorPlanId}
            onFloorPlanUpdate={handleUpdateFloorPlan}
            onFloorPlanDelete={handleDeleteFloorPlan}
            isLoading={isLoading}
            onReplaceRequest={(id) => {
              if (id === activeFloorPlanId) {
                handleReplaceClick();
              } else {
                setActiveFloorPlanId(id);
                // Delay to allow detail to mount before replace
                setTimeout(() => handleReplaceClick(), 0);
              }
            }}
            onCreateRequest={() => setIsUploadDialogOpen(true)}
          />

          {/* Local toolbar above canvas (not in page header) */}
          <div className="flex items-center gap-2">
            {activeFloorPlan && (
              <>
                <TooltipProvider delayDuration={150}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline" size="sm" onClick={handleZoomIn} aria-label="Zoom in">
                        <ZoomIn className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Zoom in</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <TooltipProvider delayDuration={150}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline" size="sm" onClick={handleZoomOut} aria-label="Zoom out">
                        <ZoomOut className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Zoom out</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <TooltipProvider delayDuration={150}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline" size="sm" onClick={handleResetZoom} aria-label="Fit to screen">
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Fit to screen</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <span className="text-xs text-muted-foreground ml-1 select-none">{Math.round(zoomLevel * 100)}%</span>
                <div className="h-4 w-px bg-border mx-1" />
                {/* Add device (opens sheet) */}
                <TooltipProvider delayDuration={150}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline" size="sm" onClick={handleOpenDevices} aria-label="Add device">
                        <Plus className="h-4 w-4 mr-1" />
                        Add device
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Add device</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </>
            )}
            {/* Add floor plan moved into tabs as icon-only button */}
          </div>
        </div>
      )}

      {/* Floor plan content */}
      <div className="flex-1 min-h-0">
        {activeFloorPlan ? (
          <FloorPlanDetail
            ref={floorPlanDetailRef}
            floorPlan={activeFloorPlan}
            locationId={locationId}
            onFloorPlanUpdated={refetch}
            onDelete={() => handleDeleteFloorPlan(activeFloorPlan.id)}
            allDevices={allDevices}
            spaces={spaces}
            onScaleChange={(s) => setZoomLevel(s)}
          />
        ) : (
          <div className="text-center py-12 border-2 border-dashed border-muted rounded-lg">
            <div className="space-y-4">
              <div className="space-y-2">
                <h3 className="text-lg font-medium">No Floor Plans</h3>
                <p className="text-sm text-muted-foreground">
                  Get started by uploading your first floor plan for this location.
                </p>
              </div>
              <Button onClick={() => setIsUploadDialogOpen(true)}>
                <Plus className="h-4 w-4" />
                Add your first floor plan
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Upload Dialog */}
      <FloorPlanUploadDialog
        open={isUploadDialogOpen}
        onOpenChange={setIsUploadDialogOpen}
        onSubmit={handleCreateFloorPlan}
        isLoading={isLoading}
      />

      {/* Rename Dialog */}
      <FloorPlanNameDialog
        open={isNameDialogOpen}
        onOpenChange={setIsNameDialogOpen}
        onSubmit={handleRenameSubmit}
        currentName={floorPlanToRename?.currentName || ''}
        isLoading={isLoading}
      />
      {/* Delete confirm dialog for actions menu */}
      {activeFloorPlan && isDeleteOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          {/* Reuse AlertDialog from shadcn by toggling state in place of dedicated component to keep scope small */}
          <div className="bg-background border rounded-lg shadow-lg p-6 max-w-sm w-full mx-4">
            <h3 className="font-semibold mb-2">Delete Floor Plan</h3>
            <p className="text-sm text-muted-foreground mb-4">This will permanently delete this floor plan and all device positions. This action cannot be undone.</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsDeleteOpen(false)}>Cancel</Button>
              <Button
                size="sm"
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  setIsDeleteOpen(false);
                  handleDeleteFloorPlan(activeFloorPlan.id);
                }}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}