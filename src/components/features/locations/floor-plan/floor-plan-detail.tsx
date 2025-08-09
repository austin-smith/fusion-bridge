'use client';

import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { X, PanelLeftOpen, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { FloorPlanCanvasDynamic, DevicePalette, FloorPlanUploadDialog } from '.';
import { useDeviceOverlays } from '@/hooks/floor-plan/device-overlays';
import { useFusionStore } from '@/stores/store';
import { toast } from 'sonner';
import type { FloorPlan, DeviceWithConnector, Space } from '@/types';
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { FloorPlanDeviceDetailSheet } from './floor-plan-device-detail-sheet';

export interface FloorPlanDetailRef {
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  startReplace: () => void;
  openDevices: () => void;
}

interface FloorPlanDetailProps {
  floorPlan: FloorPlan | null;
  locationId: string;
  onFloorPlanUpdated?: () => void;
  onDelete?: () => void;
  showActions?: boolean;
  allDevices: DeviceWithConnector[];
  spaces: Space[];
  onScaleChange?: (scale: number) => void;
}

export const FloorPlanDetail = forwardRef<FloorPlanDetailRef, FloorPlanDetailProps>(({ 
  floorPlan,
  locationId,
  onFloorPlanUpdated,
  onDelete,
  showActions = true,
  allDevices,
  spaces,
  onScaleChange
}, ref) => {
  const [isReplacing, setIsReplacing] = useState(false);
  // Replace dialog visibility
  const [isReplaceOpen, setIsReplaceOpen] = useState(false);
  const [deviceSearchTerm, setDeviceSearchTerm] = useState('');
  const [isPaletteCollapsed, setIsPaletteCollapsed] = useState(true);
  
  // Device sheet visibility
  const [isDeviceSheetOpen, setIsDeviceSheetOpen] = useState(false);

  
  // Zoom state to pass to canvas
  const [zoomActions, setZoomActions] = useState<{
    zoomIn: () => void;
    zoomOut: () => void;
    resetZoom: () => void;
  } | null>(null);

  // Get device overlays and management functions
  const {
    overlays,
    isLoading: overlaysLoading,
    error: overlaysError,
    selectedOverlayId,
    createOverlay,
    updateOverlay,
    deleteOverlay,
    selectOverlay
  } = useDeviceOverlays({ 
    locationId, 
    floorPlanId: floorPlan?.id || '',
    enabled: !!floorPlan?.id
  });

  // Close the right-side device palette when a device overlay is selected (left detail sheet opens)
  useEffect(() => {
    if (selectedOverlayId) {
      setIsDeviceSheetOpen(false);
    }
  }, [selectedOverlayId]);

  // Create set of device IDs that are already placed on floor plan
  const placedDeviceIds = new Set(overlays.map(overlay => overlay.deviceId));

  // Handle overlay errors
  useEffect(() => {
    if (overlaysError) {
      toast.error(`Device overlay error: ${overlaysError}`);
    }
  }, [overlaysError]);

  // Expose zoom functions through ref
  useImperativeHandle(ref, () => ({
    zoomIn: () => {
      zoomActions?.zoomIn();
    },
    zoomOut: () => {
      zoomActions?.zoomOut();
    },
    resetZoom: () => {
      zoomActions?.resetZoom();
    },
    startReplace: () => {
      setIsReplacing(true);
      setIsReplaceOpen(true);
    },
    openDevices: () => {
      setIsDeviceSheetOpen(true);
    }
  }), [zoomActions]);

  // Replace submit handler using PUT
  const handleReplaceSubmit = async (name: string, file: File) => {
    if (!floorPlan) return;
    const formData = new FormData();
    if (name) formData.append('name', name);
    formData.append('floorPlan', file);
    const response = await fetch(`/api/locations/${locationId}/floor-plans/${floorPlan.id}`, {
      method: 'PUT',
      body: formData,
    });
    if (!response.ok) {
      throw new Error('Failed to update floor plan');
    }
    toast.success('Floor plan updated successfully');
    setIsReplacing(false);
    setIsReplaceOpen(false);
    onFloorPlanUpdated?.();
  };

  // Generate serving URL for floor plan
  const getServingUrl = (floorPlan: FloorPlan) => {
    if (!floorPlan.floorPlanData) {
  
      return '#';
    }
    
    const internalFilename = floorPlan.floorPlanData.filePath?.split('/').pop();
    if (!internalFilename) {
      console.error('Invalid floor plan file path:', floorPlan.floorPlanData.filePath);
      return '#'; // Return placeholder URL to avoid crashes
    }
    const url = `/api/locations/${locationId}/floor-plans/${floorPlan.id}?file=${internalFilename}`;

    return url;
  };

  // Handle no floor plan case
  if (!floorPlan) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">No floor plan selected</p>
      </div>
    );
  }

  // Note: replace now handled via FloorPlanUploadDialog instead of inline UI

  // Handle viewing mode with interactive canvas
  const handleCanvasLoad = (dimensions: { width: number; height: number }) => {

  };

  const handleCanvasError = (error: string) => {
    console.error('Floor plan canvas error:', error);
    toast.error('Failed to load floor plan');
  };

  const handleAssignDevices = () => {
    // This would open the device assignment dialog
    // For now, just show a toast that this feature is coming
    toast.info('Device assignment dialog will be implemented in a future update');
  };

  return (
    <div className="space-y-4 max-w-full overflow-hidden">
      <Card className="overflow-hidden flex flex-col">
        <CardContent className="p-0">
          {/* Two-panel layout: Device Palette + Canvas */}
          <div className="min-h-[600px] min-w-0 relative p-4">
            <Sheet open={isDeviceSheetOpen} onOpenChange={setIsDeviceSheetOpen} modal={false}>
              <SheetContent
                side="right"
                className="w-[360px] sm:max-w-[420px]"
                onInteractOutside={(e) => e.preventDefault()}
                onPointerDownOutside={(e) => e.preventDefault()}
                onEscapeKeyDown={(e) => e.preventDefault()}
              >
                <SheetHeader>
                  <SheetTitle>Devices</SheetTitle>
                </SheetHeader>
                <div className="pt-4 h-full">
                  <DevicePalette
                    devices={allDevices}
                    spaces={spaces}
                    locationId={locationId}
                    searchTerm={deviceSearchTerm}
                    onSearchChange={setDeviceSearchTerm}
                    onAssignDevices={handleAssignDevices}
                    placedDeviceIds={placedDeviceIds}
                    className="h-full"
                  />
                </div>
              </SheetContent>
            </Sheet>
            {/* Left device details sheet controlled by selection */}
            <FloorPlanDeviceDetailSheet
              overlay={selectedOverlayId ? overlays.find(o => o.id === selectedOverlayId) || null : null}
              open={!!selectedOverlayId}
              onOpenChange={(open) => {
                if (!open) selectOverlay(null);
              }}
              onDelete={async (overlayId) => {
                const overlay = overlays.find(o => o.id === overlayId);
                try {
                  await deleteOverlay(overlayId);
                  if (overlay) {
                    toast.success(`${overlay.device.name} removed from floor plan`);
                  }
                } catch (error) {
                  console.error('Failed to delete device overlay:', error);
                  toast.error('Failed to remove device from floor plan');
                }
              }}
            />
            <FloorPlanCanvasDynamic
              floorPlan={floorPlan}
              locationId={locationId}
              onLoad={handleCanvasLoad}
              onError={handleCanvasError}
              onScaleChange={onScaleChange}
              overlays={overlays}
              selectedOverlayId={selectedOverlayId}
              createOverlay={createOverlay}
              updateOverlay={updateOverlay}
              deleteOverlay={deleteOverlay}
              selectOverlay={selectOverlay}
              onZoomActionsReady={setZoomActions}
              className="w-full min-h-[600px]"
            />
          </div>
        </CardContent>

        {/* Action buttons removed; actions live in the tabs menu */}
      </Card>

      {/* Replace Floor Plan Dialog */}
      <FloorPlanUploadDialog
        open={isReplaceOpen}
        onOpenChange={(open) => {
          setIsReplaceOpen(open);
          if (!open) setIsReplacing(false);
        }}
        onSubmit={handleReplaceSubmit}
        title="Replace Floor Plan"
        defaultName={floorPlan.name}
        hideName
      />
    </div>
  );
});

FloorPlanDetail.displayName = 'FloorPlanDetail';