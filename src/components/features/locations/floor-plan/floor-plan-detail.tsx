'use client';

import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { X, PanelLeftOpen, Plus, Cpu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { FloorPlanCanvasDynamic, DevicePalette, FloorPlanUploadDialog } from '.';
import { useDeviceOverlays } from '@/hooks/floor-plan/device-overlays';
import { useFusionStore } from '@/stores/store';
import { toast } from 'sonner';
import type { FloorPlan, DeviceWithConnector, Space } from '@/types';
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
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
  const [filteredDeviceCount, setFilteredDeviceCount] = useState<number | null>(null);

  // Ref to the left sheet element for occlusion measurements
  const leftSheetElRef = useRef<HTMLDivElement | null>(null);
  const [leftSheetEl, setLeftSheetEl] = useState<HTMLDivElement | null>(null);
  const lastEnsuredOverlayIdRef = useRef<string | null>(null);

  // No longer re-ensuring on scale; keep constant for potential future tuning
  const ENSURE_VISIBLE_AFTER_SCALE_MS = 80;

  
  // Zoom state to pass to canvas
  const [zoomActions, setZoomActions] = useState<{
    zoomIn: () => void;
    zoomOut: () => void;
    resetZoom: () => void;
    panBy: (delta: { dx: number; dy: number }, options?: { animate?: boolean; durationMs?: number }) => void;
    ensureOverlayVisibleById: (
      overlayId: string,
      safeArea: { left: number; top: number; right: number; bottom: number },
      options?: { padding?: number; animate?: boolean; durationMs?: number; axis?: 'x' | 'y' | 'both' }
    ) => void;
    getContainerRect: () => DOMRect | null;
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
  // Defer to next frame to avoid interfering with the click event that set the selection
  useEffect(() => {
    if (!selectedOverlayId) return;
    const raf = requestAnimationFrame(() => setIsDeviceSheetOpen(false));
    return () => cancelAnimationFrame(raf);
  }, [selectedOverlayId]);

  // Clearing selection is handled explicitly when opening the device palette via onOpenChange

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
      // Ensure mutual exclusivity: clear any active selection so the left sheet closes
      selectOverlay(null);
      // When closing the detail sheet programmatically, also reset zoom to match manual close behavior
      zoomActions?.resetZoom();
      setIsDeviceSheetOpen(true);
    }
  }), [zoomActions, selectOverlay]);

  // Compute safe area within the canvas container accounting for left sheet occlusion
  const computeSafeArea = React.useCallback((): { left: number; top: number; right: number; bottom: number } | null => {
    if (!zoomActions) return null;
    const containerRect = zoomActions.getContainerRect();

    const padding = 16; // px
    // Dynamic horizontal buffer: ~2% of container width, clamped to [8, 20] px
    const containerW = zoomActions.getContainerRect()?.width ?? 0;
    const dynamicBuffer = containerW
      ? Math.min(20, Math.max(8, Math.round(containerW * 0.02)))
      : 12;
    const prefersSm = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(min-width: 640px)').matches;
    const fallbackPanelWidth = prefersSm ? 500 : 420; // mirrors sheet width classes

    // Defaults when container size is unknown; only X-axis enforcement will be meaningful
    let leftSafe = padding;
    let topSafe = padding;
    let rightSafe = Number.MAX_SAFE_INTEGER; // effectively disables right bound checks
    let bottomSafe = Number.MAX_SAFE_INTEGER;

    if (containerRect) {
      topSafe = padding;
      rightSafe = containerRect.width - padding;
      bottomSafe = containerRect.height - padding;
    }

    if (containerRect && leftSheetEl) {
      const sheetRect = leftSheetEl.getBoundingClientRect();
      // Compute actual horizontal occlusion of the canvas container by the sheet
      const overlapLeftPx = Math.max(
        0,
        Math.min(containerRect.right, sheetRect.right) - Math.max(containerRect.left, sheetRect.left)
      );
      leftSafe = Math.min(
        Math.max(overlapLeftPx + padding + dynamicBuffer, padding),
        containerRect.width - padding
      );
    } else {
      // Fallback: approximate using the sheet's configured width
      const approxWidth = leftSheetEl ? leftSheetEl.getBoundingClientRect().width : fallbackPanelWidth;
      if (containerRect) {
        leftSafe = Math.min(
          Math.max(approxWidth + padding + dynamicBuffer, padding),
          containerRect.width - padding
        );
      } else {
        leftSafe = approxWidth + padding + dynamicBuffer;
      }
    }

    // Snap to integer pixels to avoid sub-pixel oscillation during comparisons
    leftSafe = Math.round(leftSafe);
    topSafe = Math.round(topSafe);
    rightSafe = Number.isFinite(rightSafe) ? Math.round(rightSafe) : rightSafe;
    bottomSafe = Number.isFinite(bottomSafe) ? Math.round(bottomSafe) : bottomSafe;

    return { left: leftSafe, top: topSafe, right: rightSafe, bottom: bottomSafe };
  }, [zoomActions, leftSheetEl]);

  // One-time ensure for current selection, with a single follow-up after sheet transition
  const ensureOnceForSelection = React.useCallback(() => {
    if (!selectedOverlayId || !zoomActions) return;
    if (lastEnsuredOverlayIdRef.current === selectedOverlayId) return;

    // Mark ensured right away to avoid duplicate scheduling from multiple callers
    lastEnsuredOverlayIdRef.current = selectedOverlayId;

    let followUpRan = false;
    const handleAfterOpen = () => {
      if (followUpRan) return;
      followUpRan = true;
      const s2 = computeSafeArea();
      if (s2) {
        zoomActions.ensureOverlayVisibleById(selectedOverlayId, s2, {
          axis: 'x',
          animate: true,
          durationMs: 220,
        });
      }
    };

    if (leftSheetEl) {
      // Wait for the sheet to finish opening to compute a stable safe area
      leftSheetEl.addEventListener('transitionend', handleAfterOpen as any, { once: true });
      // Fallback in case no transition event fires
      window.setTimeout(() => {
        handleAfterOpen();
      }, 500);
    } else {
      // If we don't yet have the element, run a single follow-up shortly after to avoid double-pan
      window.setTimeout(handleAfterOpen, 350);
    }
  }, [selectedOverlayId, zoomActions, computeSafeArea, leftSheetEl]);

  // Kick off ensure when selection changes and actions are ready (onOpenChange may not fire on controlled open)
  useEffect(() => {
    if (!selectedOverlayId || !zoomActions) return;
    ensureOnceForSelection();
  }, [selectedOverlayId, zoomActions, ensureOnceForSelection]);

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
    // Do not auto-ensure on load; handled by one-time selection flow
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
            <Sheet
              open={isDeviceSheetOpen}
              onOpenChange={(open) => {
                setIsDeviceSheetOpen(open);
                if (open && selectedOverlayId) {
                  // Ensure mutual exclusivity: opening palette clears selection (closes left sheet)
                  selectOverlay(null);
                  // Also reset zoom when clearing the selection via palette open
                  zoomActions?.resetZoom();
                }
              }}
              modal={false}
            >
              <SheetContent
                side="right"
                className="w-[360px] sm:max-w-[420px]"
                onInteractOutside={(e) => e.preventDefault()}
                onPointerDownOutside={(e) => e.preventDefault()}
              >
                <SheetHeader>
                  <div className="flex items-center gap-2 pr-10 min-w-0">
                    <Cpu className="h-5 w-5 shrink-0" />
                    <SheetTitle className="truncate">Devices</SheetTitle>
                    <Badge variant="secondary" className="shrink-0">{
                      filteredDeviceCount ?? allDevices.filter(d => {
                        const inLocation = spaces.some(s => s.locationId === locationId && s.id === d.spaceId);
                        return inLocation && !overlays.some(o => o.deviceId === d.id);
                      }).length
                    }</Badge>
                  </div>
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
                    onFilteredCountChange={setFilteredDeviceCount}
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
                if (!open) {
                  selectOverlay(null);
                  // Reset canvas to fit-to-screen when the detail sheet is closed
                  zoomActions?.resetZoom();
                  // Allow re-ensure if the same selection is reopened later
                  lastEnsuredOverlayIdRef.current = null;
                } else {
                  ensureOnceForSelection();
                }
              }}
              onSheetElementRef={(el) => {
                leftSheetElRef.current = el;
                setLeftSheetEl(el);
                // No auto-ensure here; rely on the one-time selection flow
              }}
              onUpdateOverlay={async (overlayId, updates) => {
                try {
                  await updateOverlay(overlayId, updates);
                } catch (e) {
                  console.error('Failed to update overlay props:', e);
                  toast.error('Failed to save camera settings');
                }
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
              onScaleChange={(scale) => {
                onScaleChange?.(scale);
              }}
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