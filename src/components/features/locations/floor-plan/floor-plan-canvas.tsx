'use client';

import React, { useState, useCallback, useRef, useEffect, useLayoutEffect } from 'react';
import { Stage, Layer, Image as KonvaImage } from 'react-konva';
import Konva from 'konva';
import { useFloorPlanImage, usePdfRenderer, isImageSource, isPdfSource } from '@/hooks/floor-plan';
import { DeviceOverlayLayer } from './device-overlays/device-overlay-layer';
import { canvasToNormalized, normalizedToCanvas, type DeviceOverlayWithDevice, type CreateDeviceOverlayPayload, type UpdateDeviceOverlayPayload } from '@/types/device-overlay';
import { toast } from 'sonner';
import { Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getDeviceTypeIcon, getDisplayStateIcon } from '@/lib/mappings/presentation';
import { DeviceType } from '@/lib/mappings/definitions';
import { ConnectorIcon } from '@/components/features/connectors/connector-icon';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import type { FloorPlan } from '@/types';

export interface FloorPlanCanvasProps {
  floorPlan: FloorPlan | null;
  locationId: string;
  className?: string;
  width?: number;
  height?: number;
  onLoad?: (dimensions: { width: number; height: number }) => void;
  onError?: (error: string) => void;
  onScaleChange?: (scale: number) => void;
  // Device overlay props
  overlays: DeviceOverlayWithDevice[];
  selectedOverlayId: string | null;
  createOverlay: (payload: CreateDeviceOverlayPayload) => Promise<void>;
  updateOverlay: (overlayId: string, updates: UpdateDeviceOverlayPayload) => Promise<void>;
  deleteOverlay: (overlayId: string) => Promise<void>;
  selectOverlay: (overlay: DeviceOverlayWithDevice | null) => void;
  // Zoom control props
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetZoom?: () => void;
  canZoomIn?: boolean;
  canZoomOut?: boolean;
  onZoomActionsReady?: (actions: {
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
  }) => void;
}

interface ViewportState {
  x: number;
  y: number;
  scale: number;
}

// The minimum allowed zoom scale for the floor plan canvas.
// Prevents zooming out too far, which would make the image too small to be useful.
// Chosen as 0.1 to allow significant zoom-out while keeping the image visible.
const MIN_SCALE = 0.1;

// The maximum allowed zoom scale for the floor plan canvas.
// Prevents zooming in too far, which could cause pixelation or performance issues.
// Chosen as 5 to allow detailed inspection without excessive magnification.
const MAX_SCALE = 5;

// The factor by which the zoom changes on each zoom-in or zoom-out action.
const ZOOM_FACTOR = 1.5;

// Pinch (two-finger) zoom sensitivity. Values close to 1 produce smoother/slower zoom.
// We use an exponential mapping: newScale = oldScale * base^(-deltaY)
const PINCH_SCALE_POWER = 1.003;

// PDF rendering scale for canvas quality vs performance tradeoff
const PDF_RENDER_SCALE = 2;

// Threshold for inferring a trackpad pinch gesture (when ctrlKey is not set).
// Typical mouse wheel steps produce smaller |deltaY| values; pinch gestures often emit larger deltas.
// 40 was chosen empirically to separate single-notch wheel scrolls from pinch zoom intents.
const PINCH_DELTA_Y_THRESHOLD = 40;

// Cache of valid device types for fast runtime validation
const DEVICE_TYPES_SET = new Set<string>(Object.values(DeviceType));

function getValidDeviceType(value: unknown): DeviceType {
  if (typeof value === 'string' && DEVICE_TYPES_SET.has(value)) {
    return value as DeviceType;
  }
  return DeviceType.Unmapped;
}

export function FloorPlanCanvas({
  floorPlan,
  locationId,
  className,
  width,
  height,
  onLoad,
  onError,
  onScaleChange,
  overlays,
  selectedOverlayId,
  createOverlay,
  updateOverlay,
  deleteOverlay,
  selectOverlay,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  canZoomIn,
  canZoomOut,
  onZoomActionsReady
}: FloorPlanCanvasProps) {
  const stageRef = useRef<Konva.Stage>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<ViewportState>({ x: 0, y: 0, scale: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: width || 0, height: height || 0 });
  const [hoverLabel, setHoverLabel] = useState<{ 
    text: string; 
    canvasX: number; 
    canvasY: number; 
    connectorCategory?: string;
    deviceType?: string;
    deviceSubtype?: string;
    displayState?: string;
  } | null>(null);

  // Ensure the first Stage render happens only after we can compute a correct fit viewport
  const [isStageReady, setIsStageReady] = useState(false);

  // Synchronously measure container before first paint to avoid initial 1x flash
  useLayoutEffect(() => {
    if (width || height) return; // external sizing provided
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width && rect.height) {
      setCanvasSize({ width: rect.width, height: rect.height });
    }
  }, [width, height]);

  // Update canvas size when container resizes (use ResizeObserver to avoid initial layout jumps)
  useEffect(() => {
    if (width || height) return; // external sizing provided
    const el = containerRef.current;
    if (!el) return;

    const applySize = () => {
      const rect = el.getBoundingClientRect();
      setCanvasSize((prev) => {
        const newWidth = rect.width || prev.width;
        const newHeight = rect.height || prev.height;
        if (prev.width === newWidth && prev.height === newHeight) return prev;
        return { width: newWidth, height: newHeight };
      });
    };

    // Initial measure synchronously after mount
    applySize();

    const ro = new ResizeObserver(() => {
      applySize();
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
    };
  }, [width, height, canvasSize.width, canvasSize.height]);

  // Use provided dimensions or calculated ones
  const finalWidth = width || canvasSize.width;
  const finalHeight = height || canvasSize.height;

  // Determine source type and use appropriate hook
  const floorPlanData = floorPlan?.floorPlanData || null;
  const isImage = isImageSource(floorPlanData);
  const isPdf = isPdfSource(floorPlanData);

  // Image loading hook
  const imageResult = useFloorPlanImage(
    isImage ? floorPlan : null,
    locationId
  );

  // PDF rendering hook
  const pdfResult = usePdfRenderer(
    isPdf ? floorPlan : null,
    locationId,
    { scale: PDF_RENDER_SCALE } // Higher scale for better quality
  );

  // Get the current result based on file type
  const currentResult = isImage ? imageResult : pdfResult;
  const sourceAsset = isImage ? imageResult.image : pdfResult.canvas;

  // Device overlays now passed as props from parent

  // Handle loading and error states
  useEffect(() => {
    if (currentResult.error) {
      onError?.(currentResult.error);
    }
  }, [currentResult.error, onError]);



  useEffect(() => {
    if (currentResult.dimensions) {
      onLoad?.(currentResult.dimensions);
    }
  }, [currentResult.dimensions, onLoad]);

  // Reset viewport to fit content
  const resetViewport = useCallback(() => {
    if (!currentResult.dimensions) return;

    const { width: assetWidth, height: assetHeight } = currentResult.dimensions;
    const scaleX = finalWidth / assetWidth;
    const scaleY = finalHeight / assetHeight;
    const scale = Math.min(scaleX, scaleY); // Scale to fit available space

    const centeredX = (finalWidth - assetWidth * scale) / 2;
    const centeredY = (finalHeight - assetHeight * scale) / 2;

    setViewport({
      x: centeredX,
      y: centeredY,
      scale
    });
  }, [currentResult.dimensions, finalWidth, finalHeight]);

  // Derived fit viewport is no longer needed since initial viewport is set before first paint

  // Block first paint of Stage until we can commit a correct initial viewport
  useLayoutEffect(() => {
    if (isStageReady) return;
    if (!finalWidth || !finalHeight) return;
    if (!currentResult.dimensions || !sourceAsset) return;
    const { width: assetWidth, height: assetHeight } = currentResult.dimensions;
    const scaleX = finalWidth / assetWidth;
    const scaleY = finalHeight / assetHeight;
    const scale = Math.min(scaleX, scaleY);
    const centeredX = (finalWidth - assetWidth * scale) / 2;
    const centeredY = (finalHeight - assetHeight * scale) / 2;
    setViewport({ x: centeredX, y: centeredY, scale });
    setIsStageReady(true);
  }, [isStageReady, finalWidth, finalHeight, currentResult.dimensions, sourceAsset]);

  // Reset viewport when asset changes (only once per asset to avoid layout oscillation)
  const lastAssetDimsRef = useRef<{ w: number; h: number } | null>(null);
  useEffect(() => {
    if (!sourceAsset || !currentResult.dimensions) return;
    const { width: w, height: h } = currentResult.dimensions;
    const last = lastAssetDimsRef.current;
    if (!last || last.w !== w || last.h !== h) {
      lastAssetDimsRef.current = { w, h };
      resetViewport();
    }
  }, [sourceAsset, currentResult.dimensions, resetViewport]);

  // Notify parent when scale changes
  useEffect(() => {
    onScaleChange?.(viewport.scale);
  }, [viewport.scale, onScaleChange]);

  // Zoom functions
  const zoomIn = useCallback(() => {
    if (onZoomIn) {
      onZoomIn();
    } else {
      setViewport((prev) => {
        const anchor = { x: finalWidth / 2, y: finalHeight / 2 };
        const newScale = Math.min(prev.scale * ZOOM_FACTOR, MAX_SCALE);
        if (newScale === prev.scale) return prev;
        const mousePointTo = {
          x: (anchor.x - prev.x) / prev.scale,
          y: (anchor.y - prev.y) / prev.scale,
        };
        const newPos = {
          x: anchor.x - mousePointTo.x * newScale,
          y: anchor.y - mousePointTo.y * newScale,
        };
        return { ...prev, x: newPos.x, y: newPos.y, scale: newScale };
      });
    }
  }, [onZoomIn, finalWidth, finalHeight]);

  const zoomOut = useCallback(() => {
    if (onZoomOut) {
      onZoomOut();
    } else {
      setViewport((prev) => {
        const anchor = { x: finalWidth / 2, y: finalHeight / 2 };
        const newScale = Math.max(prev.scale / ZOOM_FACTOR, MIN_SCALE);
        if (newScale === prev.scale) return prev;
        const mousePointTo = {
          x: (anchor.x - prev.x) / prev.scale,
          y: (anchor.y - prev.y) / prev.scale,
        };
        const newPos = {
          x: anchor.x - mousePointTo.x * newScale,
          y: anchor.y - mousePointTo.y * newScale,
        };
        return { ...prev, x: newPos.x, y: newPos.y, scale: newScale };
      });
    }
  }, [onZoomOut, finalWidth, finalHeight]);

  // Double-click to zoom in at cursor position (standard UX)
  const handleDoubleClick = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const newScale = Math.min(viewport.scale * ZOOM_FACTOR, MAX_SCALE);
    if (newScale === viewport.scale) return;
    const mousePointTo = {
      x: (pointer.x - viewport.x) / viewport.scale,
      y: (pointer.y - viewport.y) / viewport.scale,
    };
    const newPos = {
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    };
    setViewport({ x: newPos.x, y: newPos.y, scale: newScale });
  }, [viewport]);

  const resetZoom = useCallback(() => {
    if (onResetZoom) {
      onResetZoom();
    } else {
      resetViewport();
    }
  }, [onResetZoom, resetViewport]);

  // Expose zoom functions to parent
  useEffect(() => {
    if (onZoomActionsReady) {
      // Helper for animated pan
      const animatePan = (
        start: { x: number; y: number },
        target: { x: number; y: number },
        durationMs: number
      ) => {
        const startTime = performance.now();
        const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
        const frame = (now: number) => {
          const elapsed = now - startTime;
          const t = Math.min(1, elapsed / durationMs);
          const e = easeOutCubic(t);
          const nx = start.x + (target.x - start.x) * e;
          const ny = start.y + (target.y - start.y) * e;
          setViewport((prev) => ({ ...prev, x: nx, y: ny }));
          if (t < 1) requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      };

      const panBy = (
        delta: { dx: number; dy: number },
        options?: { animate?: boolean; durationMs?: number }
      ) => {
        const duration = options?.durationMs ?? 220;
        if (options?.animate) {
          const start = { x: viewport.x, y: viewport.y };
          const target = { x: viewport.x + delta.dx, y: viewport.y + delta.dy };
          animatePan(start, target, duration);
        } else {
          setViewport((prev) => ({ ...prev, x: prev.x + delta.dx, y: prev.y + delta.dy }));
        }
      };

      const ensureOverlayVisibleById = (
        overlayId: string,
        safeArea: { left: number; top: number; right: number; bottom: number },
        options?: { padding?: number; animate?: boolean; durationMs?: number; axis?: 'x' | 'y' | 'both' }
      ) => {
        try {
          const overlay = overlays.find((o) => o.id === overlayId);
          if (!overlay || !currentResult.dimensions) return;
          const canvasPt = normalizedToCanvas(
            { x: overlay.x, y: overlay.y },
            { width: currentResult.dimensions.width, height: currentResult.dimensions.height }
          );
          const projected = {
            x: viewport.x + canvasPt.x * viewport.scale,
            y: viewport.y + canvasPt.y * viewport.scale,
          };
          const axis = options?.axis ?? 'x';
          const padLeft = safeArea.left;
          const padTop = safeArea.top;
          const padRight = safeArea.right;
          const padBottom = safeArea.bottom;

          let dx = 0;
          let dy = 0;
          if (axis === 'x' || axis === 'both') {
            if (projected.x < padLeft) dx = padLeft - projected.x;
            else if (projected.x > padRight) dx = padRight - projected.x;
          }
          if (axis === 'y' || axis === 'both') {
            if (projected.y < padTop) dy = padTop - projected.y;
            else if (projected.y > padBottom) dy = padBottom - projected.y;
          }

          // Avoid micro-jitter: ignore tiny movements that are visually negligible
          const epsilon = 2; // px in container space
          if (Math.abs(dx) < epsilon && Math.abs(dy) < epsilon) return;

          const duration = options?.durationMs ?? 220;
          if (options?.animate) {
            const start = { x: viewport.x, y: viewport.y };
            const target = { x: viewport.x + dx, y: viewport.y + dy };
            animatePan(start, target, duration);
          } else {
            setViewport((prev) => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
          }
        } catch (e) {
          // Swallow errors; ensure-visible is best-effort
        }
      };

      const getContainerRect = () => {
        return containerRef.current?.getBoundingClientRect() ?? null;
      };

      onZoomActionsReady({
        zoomIn,
        zoomOut,
        resetZoom,
        panBy,
        ensureOverlayVisibleById,
        getContainerRect,
      });
    }
  }, [onZoomActionsReady, zoomIn, zoomOut, resetZoom, viewport.x, viewport.y, viewport.scale, overlays, currentResult.dimensions]);



  // Handle wheel zoom
  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();

    const stage = stageRef.current;
    if (!stage) return;

    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const looksLikePinch = e.evt.ctrlKey || Math.abs(e.evt.deltaY) > PINCH_DELTA_Y_THRESHOLD;
    const scaleBy = looksLikePinch
      ? Math.pow(PINCH_SCALE_POWER, -e.evt.deltaY)
      : (e.evt.deltaY > 0 ? 1 / ZOOM_FACTOR : ZOOM_FACTOR);
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, viewport.scale * scaleBy));

    if (newScale === viewport.scale) return;

    // Calculate new position to zoom towards pointer
    const mousePointTo = {
      x: (pointer.x - viewport.x) / viewport.scale,
      y: (pointer.y - viewport.y) / viewport.scale,
    };

    const newPos = {
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    };

    setViewport({
      x: newPos.x,
      y: newPos.y,
      scale: newScale
    });
  }, [viewport]);

  // Handle drag
  const handleDragStart = useCallback(() => {
    setIsDragging(true);
  }, []);

  const handleDragEnd = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    setIsDragging(false);
    setViewport(prev => ({
      ...prev,
      x: e.target.x(),
      y: e.target.y()
    }));
  }, []);

  // Overlay hover label via DOM for perfect text rendering and no canvas clipping
  const handleOverlayHoverChange = useCallback((payload: { overlay: DeviceOverlayWithDevice; position: { x: number; y: number } } | null) => {
    if (!payload) {
      setHoverLabel(null);
      return;
    }
    const { overlay, position } = payload;
    // Store canvas-space position; we will project to container space in render
    setHoverLabel({
      text: overlay.device.name,
      canvasX: position.x,
      canvasY: position.y,
      connectorCategory: overlay.device.connectorCategory,
      deviceType: (overlay.device as any).standardizedDeviceType || (overlay.device as any).deviceTypeInfo?.type,
      deviceSubtype: (overlay.device as any).standardizedDeviceSubtype || (overlay.device as any).deviceTypeInfo?.subtype,
      displayState: (overlay.device as any).status
    });
  }, []);

  // Handle cursor changes from device overlays
  const handleCursorChange = useCallback((cursor: string) => {
    const stage = stageRef.current;
    if (stage) {
      const container = stage.container();
      if (container) {
        container.style.cursor = cursor || 'grab';
      }
    }
  }, []);

  // Device drop zone handlers
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    
    try {
      // Get the dropped device data
      const deviceData = JSON.parse(e.dataTransfer.getData('application/json'));
      
      if (deviceData.type !== 'device') {
        return; // Not a device drop
      }

      // Get the stage and calculate drop position
      const stage = stageRef.current;
      if (!stage || !currentResult.dimensions) {
        return;
      }

      // Get the container rect and pointer position
      const containerRect = stage.container().getBoundingClientRect();
      const pointerX = e.clientX - containerRect.left;
      const pointerY = e.clientY - containerRect.top;

      // Convert to stage coordinates (accounting for zoom and pan)
      const canvasPosition = {
        x: (pointerX - viewport.x) / viewport.scale,
        y: (pointerY - viewport.y) / viewport.scale
      };

      // Convert canvas position to normalized coordinates
      const normalizedPosition = canvasToNormalized(
        canvasPosition,
        { width: currentResult.dimensions.width, height: currentResult.dimensions.height }
      );

      // Validate coordinates are within bounds
      if (normalizedPosition.x < 0 || normalizedPosition.x > 1 || 
          normalizedPosition.y < 0 || normalizedPosition.y > 1) {
        toast.error('Please drop the device within the floor plan area');
        return;
      }

      // Create the device overlay
      if (!floorPlan?.id) {
        toast.error('No floor plan selected');
        return;
      }
      
      createOverlay({
        deviceId: deviceData.deviceId,
        floorPlanId: floorPlan.id,
        x: normalizedPosition.x,
        y: normalizedPosition.y
      }).then(() => {
        toast.success(`${deviceData.deviceName} placed on floor plan`);
      }).catch((error) => {
        console.error('Failed to create device overlay:', error);
        toast.error('Failed to place device on floor plan');
      });

    } catch (error) {
      console.error('Error handling device drop:', error);
      toast.error('Failed to place device on floor plan');
    }
  }, [viewport, currentResult.dimensions, createOverlay, floorPlan?.id]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault(); // Allow drop
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  // Delete overlay handlers
  const handleDeleteSelected = useCallback(async () => {
    if (!selectedOverlayId) return;
    
    const selectedOverlay = overlays.find(o => o.id === selectedOverlayId);
    if (!selectedOverlay) return;
    
    try {
      await deleteOverlay(selectedOverlayId);
      toast.success(`${selectedOverlay.device.name} removed from floor plan`);
    } catch (error) {
      console.error('Failed to delete device overlay:', error);
      toast.error('Failed to remove device from floor plan');
    }
  }, [selectedOverlayId, overlays, deleteOverlay]);

  // Keyboard event handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      const tag = active?.tagName?.toLowerCase();
      const isEditable = tag === 'input' || tag === 'textarea' || active?.isContentEditable;
      const sheetFocused = Boolean(document.querySelector('[data-floorplan-detail-sheet="true"]:focus-within'));
      if (isEditable || sheetFocused) return;

      if (selectedOverlayId && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        handleDeleteSelected();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedOverlayId, handleDeleteSelected]);

  // Error state
  if (currentResult.error) {
    return (
      <div ref={containerRef} className={cn("relative w-full", className)}>
        <div className="flex min-h-[60vh] sm:min-h-[70vh] lg:min-h-[80vh] items-center justify-center p-8">
          <div className="flex flex-col items-center gap-4">
            <AlertCircle className="h-12 w-12 text-destructive" />
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {currentResult.error}
              </AlertDescription>
            </Alert>
            <Button onClick={currentResult.reload} variant="outline">
              Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Loading state (preserve final layout footprint to avoid jumps)
  if (!isStageReady || currentResult.isLoading || !sourceAsset) {
    return (
      <div ref={containerRef} className={cn("relative w-full", className)}>
        <div className="flex min-h-[60vh] sm:min-h-[70vh] lg:min-h-[80vh] items-center justify-center p-8">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading floor plan...</p>
          </div>
        </div>
      </div>
    );
  }

  // Compute selected overlay position in canvas and then in container space for contextual actions
  const selectedOverlay = selectedOverlayId ? overlays.find((o) => o.id === selectedOverlayId) : null;
  const selectedCanvasPosition = selectedOverlay && currentResult.dimensions
    ? normalizedToCanvas(
        { x: selectedOverlay.x, y: selectedOverlay.y },
        { width: currentResult.dimensions.width, height: currentResult.dimensions.height }
      )
    : null;

  // If we don't yet know container size, reserve space and show simple loader
  if (!finalWidth || !finalHeight) {
    return (
      <div ref={containerRef} className={cn("relative w-full", className)}>
        <div className="flex min-h-[60vh] sm:min-h-[70vh] lg:min-h-[80vh] items-center justify-center p-8">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading floor plan...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn("relative w-full", className)}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {/* Removed global top-right delete button; contextual bubble handles delete */}

      {/* PDF Page Controls */}
      {isPdf && pdfResult.numPages > 1 && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-10">
          <div className="flex items-center gap-2 bg-background/80 backdrop-blur-sm rounded-lg px-3 py-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => pdfResult.setCurrentPage(pdfResult.currentPage - 1)}
              disabled={pdfResult.currentPage <= 1}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              {pdfResult.currentPage} / {pdfResult.numPages}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => pdfResult.setCurrentPage(pdfResult.currentPage + 1)}
              disabled={pdfResult.currentPage >= pdfResult.numPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Selected device indicator removed; details shown in left sheet */}

      {/* Scale indicator removed; shown in external toolbar */}

      {/* Konva Stage */}
      <Stage
        ref={stageRef}
        width={finalWidth}
        height={finalHeight}
        x={viewport.x}
        y={viewport.y}
        scaleX={viewport.scale}
        scaleY={viewport.scale}
        draggable
        onWheel={handleWheel}
        onDblClick={handleDoubleClick}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      >
        {/* Background Layer - Floor Plan Image */}
        <Layer>
          <KonvaImage
            image={sourceAsset}
            width={currentResult.dimensions?.width}
            height={currentResult.dimensions?.height}
            x={0}
            y={0}
          />
        </Layer>
        
        {/* Device Overlay Layer */}
        {currentResult.dimensions && (
          <DeviceOverlayLayer
            overlays={overlays}
            canvasDimensions={{
              width: currentResult.dimensions.width,
              height: currentResult.dimensions.height
            }}
            visibleBounds={{
              left: -viewport.x / viewport.scale,
              top: -viewport.y / viewport.scale,
              right: (-viewport.x + finalWidth) / viewport.scale,
              bottom: (-viewport.y + finalHeight) / viewport.scale
            }}
            canvasScale={viewport.scale}
            selectedOverlayId={selectedOverlayId}
            onSelectOverlay={selectOverlay}
            onOverlayClicked={(overlay) => {
              // Only open details if not currently dragging
              // Selection is already handled; FloorPlanDetail listens to selection to open sheet
              // No-op here; selection is sufficient for sheet open
            }}
            onUpdateOverlay={updateOverlay}
            onHoverChange={handleOverlayHoverChange}
            onCursorChange={handleCursorChange}
            onEditOverlay={(overlay) => {
              // TODO: Implement edit overlay dialog
          
            }}

          />
        )}
      </Stage>
      {/* Unified DOM label for hover/selection to avoid positional flicker */}
      {(() => {
        const hasSelected = Boolean(selectedOverlay && selectedCanvasPosition);
        const hasHover = Boolean(hoverLabel) && !hasSelected;
        if (!hasSelected && !hasHover) return null;
        const labelX = hasSelected
          ? (selectedCanvasPosition!.x * viewport.scale + viewport.x)
          : (hoverLabel!.canvasX * viewport.scale + viewport.x);
        const labelY = hasSelected
          ? (selectedCanvasPosition!.y * viewport.scale + viewport.y - 32)
          : (hoverLabel!.canvasY * viewport.scale + viewport.y - 32);
        const labelText = hasSelected
          ? (selectedOverlay!.device.name)
          : (hoverLabel!.text);
        const connectorCategory = hasSelected
          ? selectedOverlay!.device.connectorCategory
          : (hoverLabel!.connectorCategory || '');
        const typeText = hasSelected
          ? ((selectedOverlay!.device as any).standardizedDeviceType || (selectedOverlay!.device as any).deviceTypeInfo?.type || 'Unmapped')
          : (hoverLabel!.deviceType || 'Unmapped');
        const subtypeText = hasSelected
          ? ((selectedOverlay!.device as any).standardizedDeviceSubtype || (selectedOverlay!.device as any).deviceTypeInfo?.subtype || '')
          : (hoverLabel!.deviceSubtype || '');
        const displayState = hasSelected
          ? ((selectedOverlay!.device as any).status || '')
          : (hoverLabel!.displayState || '');
        const TypeIcon = getDeviceTypeIcon(getValidDeviceType(typeText));
        const StateIcon = displayState ? getDisplayStateIcon(displayState as any) : null;
        return (
          <div
            style={{
              position: 'absolute',
              left: labelX,
              top: labelY,
              transform: 'translate(-50%, -100%)',
              zIndex: 50,
              pointerEvents: 'none'
            }}
          >
            <div className="rounded-md bg-background/95 backdrop-blur border shadow-sm px-2 py-1 text-xs font-medium">
              <div className="flex items-center gap-1.5">
                {connectorCategory && (
                  <ConnectorIcon connectorCategory={connectorCategory} size={12} />
                )}
                <span>{labelText}</span>
              </div>
              <div className="mt-0.5 flex items-center gap-1.5">
                <Badge variant="secondary" className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 font-normal">
                  {TypeIcon && <TypeIcon className="h-3 w-3 text-muted-foreground" />}
                  <span className="text-[10px]">
                    {typeText}
                    {subtypeText && (
                      <span className="text-muted-foreground ml-1">/ {subtypeText}</span>
                    )}
                  </span>
                </Badge>
                {displayState && (
                  <Badge variant="outline" className="inline-flex items-center gap-1 px-2 py-0.5 font-normal">
                    {StateIcon && <StateIcon className="h-3 w-3" />}
                    <span className="text-[10px]">{displayState}</span>
                  </Badge>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}