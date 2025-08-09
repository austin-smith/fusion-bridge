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
  const sheetResizeObserverRef = useRef<ResizeObserver | null>(null);
  const pendingEnsureRafRef = useRef<number | null>(null);
  const scaleEnsureTimeoutRef = useRef<number | null>(null);

  // Debounce to allow Konva scale to apply before ensuring visibility
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

  // Compute safe area within the canvas container accounting for left sheet occlusion
  const computeSafeArea = React.useCallback((): { left: number; top: number; right: number; bottom: number } | null => {
    if (!zoomActions) return null;
    const containerRect = zoomActions.getContainerRect();

    const padding = 16; // px
    // Extra buffer on the left to account for the selection tooltip (centered above the device)
    // and any minor animation/layout variance. Tuned conservatively for readability.
    const tooltipHalfWidthBuffer = 120; // px
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

    // Use actual sheet measurement if available; otherwise fall back to CSS width
    if (leftSheetEl) {
      const sheetRect = leftSheetEl.getBoundingClientRect();
      if (containerRect) {
        const overlapLeft = Math.max(0, Math.min(containerRect.right, sheetRect.right) - containerRect.left);
        leftSafe = Math.min(
          Math.max(overlapLeft + padding + tooltipHalfWidthBuffer, padding),
          containerRect.width - padding
        );
      } else {
        leftSafe = fallbackPanelWidth + padding + tooltipHalfWidthBuffer;
      }
    } else {
      // If the sheet ref isn't available but the sheet is visually open, still try a reasonable fallback
      leftSafe = fallbackPanelWidth + padding + tooltipHalfWidthBuffer;
    }

    return { left: leftSafe, top: topSafe, right: rightSafe, bottom: bottomSafe };
  }, [zoomActions, leftSheetEl]);

  // Schedule ensure-visible on next animation frame (twice) after layout settles
  const scheduleEnsureVisible = React.useCallback(() => {
    if (!selectedOverlayId || !zoomActions) return;
    if (pendingEnsureRafRef.current !== null) {
      cancelAnimationFrame(pendingEnsureRafRef.current);
      pendingEnsureRafRef.current = null;
    }
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => {
        const safe = computeSafeArea();
        if (safe) {
          zoomActions.ensureOverlayVisibleById(selectedOverlayId, safe, {
            axis: 'x',
            animate: true,
            durationMs: 260,
          });
        } else {
          // Retry shortly if layout or canvas not ready yet
          const t = window.setTimeout(() => {
            const s2 = computeSafeArea();
            if (s2) {
              zoomActions.ensureOverlayVisibleById(selectedOverlayId, s2, {
                axis: 'x',
                animate: true,
                durationMs: 260,
              });
            }
            window.clearTimeout(t);
          }, 30);
        }
      });
      pendingEnsureRafRef.current = raf2;
    });
    pendingEnsureRafRef.current = raf1;
  }, [selectedOverlayId, zoomActions, computeSafeArea]);

  // Immediate ensure to start animating pan in sync with sheet open
  const ensureImmediately = React.useCallback(() => {
    if (!selectedOverlayId || !zoomActions) return;
    const safe = computeSafeArea();
    if (safe) {
      zoomActions.ensureOverlayVisibleById(selectedOverlayId, safe, {
        axis: 'x',
        animate: true,
        durationMs: 220,
      });
    }
  }, [selectedOverlayId, zoomActions, computeSafeArea]);

  // React to selection open -> ensure visible after sheet lays out
  useEffect(() => {
    if (selectedOverlayId) {
      // kick off immediately, then refine on next frames
      ensureImmediately();
      scheduleEnsureVisible();
    }
    return () => {
      if (pendingEnsureRafRef.current !== null) {
        cancelAnimationFrame(pendingEnsureRafRef.current);
        pendingEnsureRafRef.current = null;
      }
    };
  }, [selectedOverlayId, ensureImmediately, scheduleEnsureVisible]);

  // When sheet element mounts and is open, run an additional ensure after its slide-in animation (~500ms)
  useEffect(() => {
    if (!selectedOverlayId || !leftSheetEl) return;
    const handleTransitionEnd = (e: TransitionEvent) => {
      // Only respond to transitions on the sheet element itself
      if (e.target === leftSheetEl) {
        scheduleEnsureVisible();
      }
    };
    leftSheetEl.addEventListener('transitionend', handleTransitionEnd);
    // In case the element is already settled with no transition, schedule a micro follow-up
    const rafId = requestAnimationFrame(() => scheduleEnsureVisible());
    return () => {
      leftSheetEl.removeEventListener('transitionend', handleTransitionEnd);
      cancelAnimationFrame(rafId);
    };
  }, [selectedOverlayId, leftSheetEl, scheduleEnsureVisible]);

  // When canvas actions become available while a selection exists, ensure visibility
  useEffect(() => {
    if (zoomActions && selectedOverlayId) {
      scheduleEnsureVisible();
    }
  }, [zoomActions, selectedOverlayId, scheduleEnsureVisible]);

  // Observe left sheet size changes to re-ensure
  useEffect(() => {
    if (!leftSheetEl) return;
    if (sheetResizeObserverRef.current) {
      sheetResizeObserverRef.current.disconnect();
      sheetResizeObserverRef.current = null;
    }
    try {
      const ro = new ResizeObserver(() => {
        if (selectedOverlayId) {
          ensureImmediately();
          scheduleEnsureVisible();
        }
      });
      ro.observe(leftSheetEl);
      sheetResizeObserverRef.current = ro;
      return () => {
        ro.disconnect();
        sheetResizeObserverRef.current = null;
      };
    } catch {
      return;
    }
  }, [leftSheetEl, selectedOverlayId, ensureImmediately, scheduleEnsureVisible]);

  // Re-ensure on window resize
  useEffect(() => {
    const handler = () => {
      if (selectedOverlayId) scheduleEnsureVisible();
    };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [selectedOverlayId, scheduleEnsureVisible]);

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
    if (selectedOverlayId) scheduleEnsureVisible();
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
                } else {
                  // start pan immediately alongside sheet open
                  ensureImmediately();
                }
              }}
              onSheetElementRef={(el) => {
                leftSheetElRef.current = el;
                setLeftSheetEl(el);
                if (el && selectedOverlayId) scheduleEnsureVisible();
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
                // Bubble up
                onScaleChange?.(scale);
                // Debounce ensure while user is zooming
                if (scaleEnsureTimeoutRef.current) {
                  window.clearTimeout(scaleEnsureTimeoutRef.current);
                  scaleEnsureTimeoutRef.current = null;
                }
                if (selectedOverlayId) {
                  // small delay to let Konva apply scale and layout reflow
                  scaleEnsureTimeoutRef.current = window.setTimeout(() => {
                    scheduleEnsureVisible();
                  }, ENSURE_VISIBLE_AFTER_SCALE_MS);
                }
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