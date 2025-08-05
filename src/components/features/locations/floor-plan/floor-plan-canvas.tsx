'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Stage, Layer, Image as KonvaImage } from 'react-konva';
import Konva from 'konva';
import { useFloorPlanImage, usePdfRenderer, isImageSource, isPdfSource } from '@/hooks/floor-plan';
import { DeviceOverlayLayer } from './device-overlays/device-overlay-layer';
import { canvasToNormalized, type DeviceOverlayWithDevice, type CreateDeviceOverlayPayload, type UpdateDeviceOverlayPayload } from '@/types/device-overlay';
import { toast } from 'sonner';
import { Loader2, ZoomIn, ZoomOut, RotateCcw, AlertCircle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import type { FloorPlanData } from '@/lib/storage/file-storage';

export interface FloorPlanCanvasProps {
  floorPlan: FloorPlanData | null;
  locationId: string;
  className?: string;
  width?: number;
  height?: number;
  onLoad?: (dimensions: { width: number; height: number }) => void;
  onError?: (error: string) => void;
  // Device overlay props
  overlays: DeviceOverlayWithDevice[];
  selectedOverlayId: string | null;
  createOverlay: (payload: CreateDeviceOverlayPayload) => Promise<void>;
  updateOverlay: (overlayId: string, updates: UpdateDeviceOverlayPayload) => Promise<void>;
  deleteOverlay: (overlayId: string) => Promise<void>;
  selectOverlay: (overlay: DeviceOverlayWithDevice | null) => void;
}

interface ViewportState {
  x: number;
  y: number;
  scale: number;
}

const MIN_SCALE = 0.1;
const MAX_SCALE = 5;
const ZOOM_FACTOR = 1.1;

export function FloorPlanCanvas({
  floorPlan,
  locationId,
  className,
  width,
  height,
  onLoad,
  onError,
  overlays,
  selectedOverlayId,
  createOverlay,
  updateOverlay,
  deleteOverlay,
  selectOverlay
}: FloorPlanCanvasProps) {
  const stageRef = useRef<Konva.Stage>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<ViewportState>({ x: 0, y: 0, scale: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: width || 800, height: height || 600 });

  // Update canvas size when container resizes
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current && !width && !height) {
        const rect = containerRef.current.getBoundingClientRect();
        setCanvasSize({
          width: rect.width || 800,
          height: rect.height || 600
        });
      }
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [width, height]);

  // Use provided dimensions or calculated ones
  const finalWidth = width || canvasSize.width;
  const finalHeight = height || canvasSize.height;

  // Determine source type and use appropriate hook
  const isImage = isImageSource(floorPlan);
  const isPdf = isPdfSource(floorPlan);

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
    const scale = Math.min(scaleX, scaleY, 1); // Don't scale up by default

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

  // Zoom functions
  const zoomIn = useCallback(() => {
    setViewport(prev => ({
      ...prev,
      scale: Math.min(prev.scale * ZOOM_FACTOR, MAX_SCALE)
    }));
  }, []);

  const zoomOut = useCallback(() => {
    setViewport(prev => ({
      ...prev,
      scale: Math.max(prev.scale / ZOOM_FACTOR, MIN_SCALE)
    }));
  }, []);

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
      createOverlay({
        deviceId: deviceData.deviceId,
        locationId,
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
  }, [viewport, currentResult.dimensions, locationId, createOverlay]);

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
      <Card className={cn("flex items-center justify-center", className)}>
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

  return (
    <div 
      ref={containerRef}
      className={cn("relative border rounded-lg overflow-hidden bg-muted/20", className)}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {/* Toolbar */}
      <div className="absolute top-4 right-4 z-10 flex gap-2">
        <Button
          variant="secondary"
          size="icon"
          onClick={zoomIn}
          disabled={viewport.scale >= MAX_SCALE}
          className="h-8 w-8 bg-background/80 backdrop-blur-sm"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          onClick={zoomOut}
          disabled={viewport.scale <= MIN_SCALE}
          className="h-8 w-8 bg-background/80 backdrop-blur-sm"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          onClick={resetViewport}
          className="h-8 w-8 bg-background/80 backdrop-blur-sm"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
        
        {/* Delete Button - only show when device is selected */}
        {selectedOverlayId && (
          <Button
            variant="destructive"
            size="icon"
            onClick={handleDeleteSelected}
            className="h-8 w-8 bg-destructive/80 backdrop-blur-sm hover:bg-destructive"
            title="Delete selected device (Del key)"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

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

      {/* Selected device indicator */}
      {selectedOverlayId && (
        <div className="absolute bottom-4 left-4 z-10">
          <div className="bg-background/80 backdrop-blur-sm rounded px-2 py-1 text-xs flex items-center gap-2">
            <div className="w-2 h-2 bg-primary rounded-full"></div>
            <span className="text-foreground font-medium">
              {overlays.find(o => o.id === selectedOverlayId)?.device.name}
            </span>
            <span className="text-muted-foreground">selected</span>
          </div>
        </div>
      )}

      {/* Scale indicator */}
      <div className="absolute bottom-4 right-4 z-10">
        <div className="bg-background/80 backdrop-blur-sm rounded px-2 py-1 text-xs text-muted-foreground">
          {Math.round(viewport.scale * 100)}%
        </div>
      </div>

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
            canvasScale={viewport.scale}
            selectedOverlayId={selectedOverlayId}
            onSelectOverlay={selectOverlay}
            onUpdateOverlay={updateOverlay}
            onEditOverlay={(overlay) => {
              // TODO: Implement edit overlay dialog
              console.log('Edit overlay:', overlay);
            }}
          />
        )}
      </Stage>
    </div>
  );
}