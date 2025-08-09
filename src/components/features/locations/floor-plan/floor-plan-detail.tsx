'use client';

import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { Upload, Trash2, X, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { FloorPlanUpload } from './floor-plan-upload';
import { FloorPlanCanvasDynamic, DevicePalette } from '.';
import { useDeviceOverlays } from '@/hooks/floor-plan/device-overlays';
import { useFusionStore } from '@/stores/store';
import { toast } from 'sonner';
import type { FloorPlan, DeviceWithConnector, Space } from '@/types';

export interface FloorPlanDetailRef {
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [deviceSearchTerm, setDeviceSearchTerm] = useState('');
  const [isPaletteCollapsed, setIsPaletteCollapsed] = useState(true);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  
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
    }
  }), [zoomActions]);

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
  };

  const handleFileRemove = () => {
    setSelectedFile(null);
  };

  const handleUpload = async () => {
    if (!selectedFile || !floorPlan) return;
    
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('floorPlan', selectedFile);
      
      const response = await fetch(`/api/locations/${locationId}/floor-plans/${floorPlan.id}`, {
        method: 'PUT',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error('Failed to upload floor plan');
      }
      
      toast.success('Floor plan uploaded successfully');
      setIsReplacing(false);
      setSelectedFile(null);
      onFloorPlanUpdated?.();
    } catch (error) {
      console.error('Error uploading floor plan:', error);
      toast.error('Failed to upload floor plan');
    } finally {
      setIsUploading(false);
    }
  };

  const handleStartReplace = () => {
    setIsReplacing(true);
    setSelectedFile(null);
  };

  const handleCancelReplace = () => {
    setIsReplacing(false);
    setSelectedFile(null);
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

  // Handle replace mode
  if (isReplacing) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium">Replace Floor Plan</h3>
          <Button variant="ghost" size="icon" onClick={handleCancelReplace}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <FloorPlanUpload
          onFileSelect={handleFileSelect}
          onFileRemove={handleFileRemove}
          selectedFile={selectedFile}
          isUploading={isUploading}
        />
        {selectedFile && (
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleCancelReplace}>
              Cancel
            </Button>
            <Button onClick={handleUpload} disabled={isUploading}>
              {isUploading ? 'Uploading...' : 'Replace Floor Plan'}
            </Button>
          </div>
        )}
      </div>
    );
  }

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
          <div className="flex gap-4 min-h-[600px] min-w-0 relative p-4">
            {/* Device Palette */}
            {!isPaletteCollapsed && (
              <div className="w-72 flex-shrink-0 relative">
                <div className="absolute -right-3 top-2 z-10">
                  <TooltipProvider delayDuration={150}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="secondary"
                          size="icon"
                          aria-label="Hide device palette"
                          title="Hide device palette"
                          onClick={() => setIsPaletteCollapsed(true)}
                          className="h-7 w-7 shadow-sm"
                        >
                          <PanelLeftClose className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="right">Hide device palette</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
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
            )}

            {/* Interactive Floor Plan Canvas */}
            <div className="flex-1 min-w-0 overflow-hidden relative">
              {isPaletteCollapsed && (
                <div className="absolute left-2 top-2 z-10">
                  <TooltipProvider delayDuration={150}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="secondary"
                          size="sm"
                          aria-label="Show device palette"
                          title="Show device palette"
                          onClick={() => setIsPaletteCollapsed(false)}
                          className="h-7 shadow-sm"
                        >
                          <PanelLeftOpen className="h-4 w-4 mr-1.5" />
                          Devices
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="right">Show device palette</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              )}
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
          </div>
        </CardContent>

        {/* Action Buttons */}
        {showActions && (
          <CardFooter className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleStartReplace}>
              <Upload className="h-4 w-4 mr-2" />
              Replace
            </Button>
            <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="text-destructive hover:text-destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Floor Plan</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete this floor plan and all device positions placed on it. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      setIsDeleteOpen(false);
                      onDelete?.();
                    }}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardFooter>
        )}
      </Card>
    </div>
  );
});

FloorPlanDetail.displayName = 'FloorPlanDetail';