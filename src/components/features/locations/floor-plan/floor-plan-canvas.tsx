'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Stage, Layer, Image as KonvaImage } from 'react-konva';
import Konva from 'konva';
import { useFloorPlanImage, usePdfRenderer, isImageSource, isPdfSource } from '@/hooks/floor-plan';
import { DeviceOverlayLayer } from './device-overlays/device-overlay-layer';
import { canvasToNormalized, normalizedToCanvas, type DeviceOverlayWithDevice, type CreateDeviceOverlayPayload, type UpdateDeviceOverlayPayload } from '@/types/device-overlay';
import { toast } from 'sonner';
import { Loader2, ZoomIn, ZoomOut, RotateCcw, AlertCircle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
  onZoomActionsReady?: (actions: { zoomIn: () => void; zoomOut: () => void; resetZoom: () => void }) => void;
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
// A value of 1.1 provides a smooth and gradual zoom experience.
const ZOOM_FACTOR = 1.1;

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
  const [canvasSize, setCanvasSize] = useState({ width: width || 1200, height: height || 800 });
  const [hoverLabel, setHoverLabel] = useState<{ text: string; canvasX: number; canvasY: number } | null>(null);

  // Update canvas size when container resizes
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current && !width && !height) {
        const rect = containerRef.current.getBoundingClientRect();
        
        // Ensure we have meaningful dimensions
        const newWidth = Math.max(rect.width, 800);
        const newHeight = Math.max(rect.height, 600);
        
        setCanvasSize({
          width: newWidth,
          height: newHeight
        });
      }
    };

    // Use a small delay to ensure the container is properly sized
    const timeoutId = setTimeout(updateSize, 100);
    updateSize(); // Also call immediately
    
    window.addEventListener('resize', updateSize);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', updateSize);
    };
  }, [width, height]);

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
    { scale: 2 } // Higher scale for better quality
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

  // Reset viewport when asset changes
  useEffect(() => {
    if (sourceAsset && currentResult.dimensions) {
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
      setViewport(prev => ({
        ...prev,
        scale: Math.min(prev.scale * ZOOM_FACTOR, MAX_SCALE)
      }));
    }
  }, [onZoomIn]);

  const zoomOut = useCallback(() => {
    if (onZoomOut) {
      onZoomOut();
    } else {
      setViewport(prev => ({
        ...prev,
        scale: Math.max(prev.scale / ZOOM_FACTOR, MIN_SCALE)
      }));
    }
  }, [onZoomOut]);

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
      onZoomActionsReady({
        zoomIn,
        zoomOut,
        resetZoom
      });
    }
  }, [onZoomActionsReady, zoomIn, zoomOut, resetZoom]);



  // Handle wheel zoom
  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();

    const stage = stageRef.current;
    if (!stage) return;

    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const scaleBy = e.evt.deltaY > 0 ? 1 / ZOOM_FACTOR : ZOOM_FACTOR;
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
    setHoverLabel({ text: overlay.device.name, canvasX: position.x, canvasY: position.y });
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
      <Card className={cn("flex items-center justify-center min-h-[400px]", className)}>
        <CardContent className="flex flex-col items-center gap-4 p-8">
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
        </CardContent>
      </Card>
    );
  }

  // Loading state
  if (currentResult.isLoading || !sourceAsset) {
    return (
      <Card className={cn("flex items-center justify-center", className)}>
        <CardContent className="flex flex-col items-center gap-4 p-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">
            Loading floor plan...
          </p>
        </CardContent>
      </Card>
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
            onEditOverlay={(overlay) => {
              // TODO: Implement edit overlay dialog
          
            }}

          />
        )}
      </Stage>
      {/* Selected device contextual bubble with Delete */}
      {selectedCanvasPosition && (
        <div
          style={{
            position: 'absolute',
            left: selectedCanvasPosition.x * viewport.scale + viewport.x,
            top: selectedCanvasPosition.y * viewport.scale + viewport.y - 38,
            transform: 'translate(-50%, -100%)',
            zIndex: 50,
          }}
        >
          <div className="bg-background/90 backdrop-blur-md border shadow-sm rounded-md px-2 py-1 flex items-center gap-2">
            <span className="text-xs font-medium">{selectedOverlay?.device.name}</span>
            <Button
              variant="destructive"
              size="icon"
              onClick={handleDeleteSelected}
              className="h-6 w-6"
              title="Delete device"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
      {/* Absolute DOM hover label */}
      {hoverLabel && (
        <div
          style={{
            position: 'absolute',
            left: hoverLabel.canvasX * viewport.scale + viewport.x,
            top: hoverLabel.canvasY * viewport.scale + viewport.y + 28,
            transform: 'translateX(-50%)',
            zIndex: 50,
            pointerEvents: 'none'
          }}
          className="rounded-md bg-black/85 text-white px-2.5 py-1 text-xs font-semibold shadow-md"
        >
          {hoverLabel.text}
        </div>
      )}
    </div>
  );
}