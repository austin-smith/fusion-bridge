'use client';

import React, { useState, useCallback } from 'react';
import { Layer } from 'react-konva';
import { DeviceOverlayIcon } from './device-overlay-icon';
import { normalizedToCanvas, canvasToNormalized } from '@/types/device-overlay';
import type { 
  DeviceOverlayWithDevice, 
  CanvasCoordinates, 
  CanvasDimensions,
  UpdateDeviceOverlayPayload 
} from '@/types/device-overlay';

export interface DeviceOverlayLayerProps {
  /** Array of device overlays to render */
  overlays: DeviceOverlayWithDevice[];
  /** Canvas dimensions for coordinate conversion */
  canvasDimensions: CanvasDimensions;
  /** Visible bounds of the floor plan in canvas coordinates (post-transform) */
  visibleBounds?: { left: number; top: number; right: number; bottom: number };
  /** Current canvas scale for responsive sizing */
  canvasScale?: number;
  /** Selected overlay ID */
  selectedOverlayId?: string | null;
  /** Whether overlay editing is enabled */
  editingEnabled?: boolean;
  /** Callback when an overlay is selected */
  onSelectOverlay?: (overlay: DeviceOverlayWithDevice | null) => void;
  /** Callback when an overlay is clicked (intent to open details) */
  onOverlayClicked?: (overlay: DeviceOverlayWithDevice) => void;
  /** Callback when an overlay position is updated */
  onUpdateOverlay?: (overlayId: string, updates: UpdateDeviceOverlayPayload) => void;
  /** Callback when an overlay is double-clicked (for editing) */
  onEditOverlay?: (overlay: DeviceOverlayWithDevice) => void;
  /** External hover label handler */
  onHoverChange?: (payload: { overlay: DeviceOverlayWithDevice; position: CanvasCoordinates } | null) => void;

}

export function DeviceOverlayLayer({
  overlays,
  canvasDimensions,
  visibleBounds,
  canvasScale = 1,
  selectedOverlayId,
  editingEnabled = true,
  onSelectOverlay,
  onOverlayClicked,
  onUpdateOverlay,
  onEditOverlay,
  onHoverChange
}: DeviceOverlayLayerProps) {
  const [draggingOverlayId, setDraggingOverlayId] = useState<string | null>(null);

  const handleOverlayClick = useCallback((overlay: DeviceOverlayWithDevice) => {
    if (!editingEnabled) return;
    
    // Toggle selection
    const isCurrentlySelected = selectedOverlayId === overlay.id;
    onSelectOverlay?.(isCurrentlySelected ? null : overlay);
    if (!isCurrentlySelected) {
      onOverlayClicked?.(overlay);
    }
  }, [selectedOverlayId, editingEnabled, onSelectOverlay, onOverlayClicked]);

  const handleOverlayDoubleClick = useCallback((overlay: DeviceOverlayWithDevice) => {
    if (!editingEnabled) return;
    
    onEditOverlay?.(overlay);
  }, [editingEnabled, onEditOverlay]);

  const handleDragStart = useCallback((overlay: DeviceOverlayWithDevice) => {
    if (!editingEnabled) return;
    
    setDraggingOverlayId(overlay.id);
    // Do not auto-select on drag start to avoid opening details sheet while dragging
  }, [editingEnabled]);

  const handleDragMove = useCallback((overlay: DeviceOverlayWithDevice, newPosition: CanvasCoordinates) => {
    // Optional: Real-time position updates during drag
    // For now, we'll wait until drag end to save
  }, []);

  const handleDragEnd = useCallback((overlay: DeviceOverlayWithDevice, newPosition: CanvasCoordinates) => {
    if (!editingEnabled) return;
    
    setDraggingOverlayId(null);
    
    // Convert canvas position to normalized coordinates
    const normalizedPosition = canvasToNormalized(newPosition, canvasDimensions);
    
    // Update the overlay position
    onUpdateOverlay?.(overlay.id, {
      x: normalizedPosition.x,
      y: normalizedPosition.y
    });
  }, [editingEnabled, canvasDimensions, onUpdateOverlay]);

  // Handle clicks on empty space to deselect
  const handleLayerClick = useCallback((e: any) => {
    // Only deselect if clicking on the layer itself, not on an overlay
    if (e.target === e.currentTarget) {
      onSelectOverlay?.(null);
    }
  }, [onSelectOverlay]);

  return (
    <Layer onClick={handleLayerClick}>
      {overlays.map((overlay) => {
        // Convert normalized coordinates to canvas coordinates
        const canvasPosition = normalizedToCanvas(
          { x: overlay.x, y: overlay.y },
          canvasDimensions
        );
        


        const isSelected = selectedOverlayId === overlay.id;
        const isDragging = draggingOverlayId === overlay.id;

        return (
          <DeviceOverlayIcon
            key={overlay.id}
            overlay={overlay}
            position={canvasPosition}
            canvasScale={canvasScale}
            canvasDimensions={canvasDimensions}
            visibleBounds={visibleBounds}
            onHoverChange={onHoverChange}
            isSelected={isSelected}
            isDragging={isDragging}
            onClick={handleOverlayClick}
            onDoubleClick={handleOverlayDoubleClick}
            onDragStart={handleDragStart}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
          />
        );
      })}
    </Layer>
  );
}