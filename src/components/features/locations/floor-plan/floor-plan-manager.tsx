'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Plus, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFloorPlans } from '@/hooks/floor-plan/use-floor-plans';
import { FloorPlanTabs } from './floor-plan-tabs';
import { FloorPlanDetail, type FloorPlanDetailRef } from './floor-plan-detail';
import { FloorPlanUploadDialog } from './floor-plan-upload-dialog';
import { FloorPlanNameDialog } from './floor-plan-name-dialog';
import { FloorPlanLoadingSkeleton } from './floor-plan-loading-skeleton';
import { useFusionStore } from '@/stores/store';
import { toast } from 'sonner';

interface FloorPlanManagerProps {
  locationId: string;
  expectedToHaveFloorPlans?: boolean;
  className?: string;
}

export function FloorPlanManager({ locationId, expectedToHaveFloorPlans = false, className }: FloorPlanManagerProps) {
  const [activeFloorPlanId, setActiveFloorPlanId] = useState<string | null>(null);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [isNameDialogOpen, setIsNameDialogOpen] = useState(false);
  const [floorPlanToRename, setFloorPlanToRename] = useState<{ id: string; currentName: string } | null>(null);
  
  // Zoom control state
  const [zoomLevel, setZoomLevel] = useState(1);
  const floorPlanDetailRef = useRef<FloorPlanDetailRef>(null);

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
    <div className={className}>
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
          />
          
          <div className="flex items-center gap-2">
            {/* Zoom Controls */}
            {activeFloorPlan && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleZoomIn}
                  title="Zoom In"
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleZoomOut}
                  title="Zoom Out"
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetZoom}
                  title="Reset Zoom"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
                
                {/* Divider */}
                <div className="h-4 w-px bg-border mx-1" />
              </>
            )}
            
            <Button
              onClick={() => setIsUploadDialogOpen(true)}
              size="sm"
            >
              <Plus className="h-4 w-4" />
              Add Floor Plan
            </Button>
          </div>
        </div>
      )}

      {/* Floor plan content */}
      {activeFloorPlan ? (
        <FloorPlanDetail
          ref={floorPlanDetailRef}
          floorPlan={activeFloorPlan}
          locationId={locationId}
          onFloorPlanUpdated={refetch}
          onDelete={() => handleDeleteFloorPlan(activeFloorPlan.id)}
          allDevices={allDevices}
          spaces={spaces}
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
    </div>
  );
}