'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Group, Circle, Rect, Text, Image as KonvaImage } from 'react-konva';
import { getDeviceTypeIconName } from '@/lib/mappings/presentation';
import { DeviceType } from '@/lib/mappings/definitions';
import type { DeviceOverlayWithDevice, CanvasCoordinates, CanvasDimensions } from '@/types/device-overlay';
import { getLucideIconImage } from './icon-cache';

export interface DeviceOverlayIconProps {
  /** Device overlay data with device information */
  overlay: DeviceOverlayWithDevice;
  /** Position on canvas in pixels */
  position: CanvasCoordinates;
  /** Canvas dimensions for bounding label placement */
  canvasDimensions?: CanvasDimensions;
  /** Visible bounds (after transform); helps prevent labels drawing off-screen */
  visibleBounds?: { left: number; top: number; right: number; bottom: number };
  /** Notify parent when hover state changes to position external DOM tooltip */
  onHoverChange?: (payload: { overlay: DeviceOverlayWithDevice; position: CanvasCoordinates } | null) => void;
  /** Scale factor from canvas zoom */
  canvasScale?: number;
  /** Whether the overlay is selected */
  isSelected?: boolean;
  /** Whether the overlay is being dragged */
  isDragging?: boolean;
  /** Callback when overlay is clicked */
  onClick?: (overlay: DeviceOverlayWithDevice) => void;
  /** Callback when overlay is double-clicked */
  onDoubleClick?: (overlay: DeviceOverlayWithDevice) => void;
  /** Callback when overlay starts being dragged */
  onDragStart?: (overlay: DeviceOverlayWithDevice) => void;
  /** Callback when overlay is being dragged */
  onDragMove?: (overlay: DeviceOverlayWithDevice, newPosition: CanvasCoordinates) => void;
  /** Callback when overlay stops being dragged */
  onDragEnd?: (overlay: DeviceOverlayWithDevice, newPosition: CanvasCoordinates) => void;
}

// Rendering fallback color for icons (neutral)
const DEFAULT_ICON_COLOR = '#6b7280'; // Tailwind gray-500

// Scaling and sizing constants
// Target ~20px at 1x zoom, maintaining constant screen size across zoom levels
const BASE_SIZE = 20;
const SCALE_FACTOR = 1;
const MIN_SCALE = 0.3;
const MIN_FONT_SIZE = 8;
const MIN_STROKE_WIDTH = 1;
const BASE_STROKE_WIDTH = 2;

export function DeviceOverlayIcon({
  overlay,
  position,
  canvasDimensions,
  visibleBounds,
  canvasScale = 1,
  isSelected = false,
  isDragging = false,
  onClick,
  onDoubleClick,
  onDragStart,
  onDragMove,
  onDragEnd,
  onHoverChange
}: DeviceOverlayIconProps) {
  const [isHovered, setIsHovered] = useState(false);
  const groupRef = useRef<any>(null);

  const deviceType = overlay.device.standardizedDeviceType || DeviceType.Unmapped;

  // Calculate responsive sizing based on canvas scale
  const size = BASE_SIZE / Math.max(canvasScale * SCALE_FACTOR, MIN_SCALE); // Keep readable at all zoom levels
  const radius = size / 2;
  const strokeWidth = Math.max(MIN_STROKE_WIDTH, BASE_STROKE_WIDTH / canvasScale);
  const iconDisplaySize = size; // Konva display size
  const iconRenderSize = 96; // High-res render for crisp scaling
  const badgeRadius = iconDisplaySize / 2 + 4; // background circle behind icon
  // External DOM tooltip will handle label sizing; remove canvas text.

  // State-based styling
  const isOffline = overlay.device.status === 'offline';
  const opacity = isDragging ? 0.7 : isOffline ? 0.6 : 1;
  // Selection ring uses white; icon remains neutral. No per-device coloring.

  // Load Lucide icon image via cache
  const [iconImage, setIconImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    const maybeDeviceType = (overlay.device.standardizedDeviceType || DeviceType.Unmapped) as string;
    // Ensure we map to a known icon name; fall back inside mapping function
    const iconName = getDeviceTypeIconName(
      (Object.values(DeviceType).includes(maybeDeviceType as DeviceType)
        ? (maybeDeviceType as DeviceType)
        : DeviceType.Unmapped)
    );

    let mounted = true;
    getLucideIconImage(iconName, { size: iconRenderSize, color: DEFAULT_ICON_COLOR, strokeWidth: 2 })
      .then((img) => {
        if (mounted) setIconImage(img);
      })
      .catch(() => {
        if (mounted) setIconImage(null);
      });
    return () => {
      mounted = false;
    };
  }, [overlay.device.standardizedDeviceType]);

  const handleClick = () => {
    // Ignore clicks immediately following a drag to avoid accidental openings
    if (!isDragging) {
      onClick?.(overlay);
    }
  };

  const handleDoubleClick = () => {
    onDoubleClick?.(overlay);
  };

  const handleDragStart = (e: any) => {
    e.cancelBubble = true; // Prevent event from bubbling to Stage
    onDragStart?.(overlay);
  };

  const handleDragMove = (e: any) => {
    e.cancelBubble = true; // Prevent event from bubbling to Stage
    const newPosition = {
      x: e.target.x(),
      y: e.target.y()
    };
    onDragMove?.(overlay, newPosition);
  };

  const handleDragEnd = (e: any) => {
    e.cancelBubble = true; // Prevent event from bubbling to Stage
    // Get position relative to the layer (which contains the floor plan image)
    const newPosition = {
      x: e.target.x(),
      y: e.target.y()
    };

    onDragEnd?.(overlay, newPosition);
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
    onHoverChange?.({ overlay, position });
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    onHoverChange?.(null);
  };

  const renderIcon = () => {
    if (!iconImage) {
      // Minimal fallback skeleton while icon loads
      return (
        <>
          <Circle
            radius={badgeRadius}
            fill="rgba(255,255,255,0.92)"
            stroke="#cbd5e1"
            strokeWidth={strokeWidth}
          />
          <Circle
            radius={radius}
            fill={DEFAULT_ICON_COLOR}
            opacity={0.35}
          />
        </>
      );
    }
    return (
      <>
        {/* Background badge for visibility */}
        <Circle
          radius={badgeRadius}
          fill="rgba(255,255,255,0.92)"
          stroke="#cbd5e1"
          strokeWidth={strokeWidth}
          shadowColor="rgba(0,0,0,0.25)"
          shadowBlur={4}
          shadowOffset={{ x: 1, y: 1 }}
          opacity={opacity}
        />
        {/* Icon image */}
        <KonvaImage
          image={iconImage}
          width={iconDisplaySize}
          height={iconDisplaySize}
          offsetX={iconDisplaySize / 2}
          offsetY={iconDisplaySize / 2}
          opacity={opacity}
        />
      </>
    );
  };

  return (
    <Group
      ref={groupRef}
      x={position.x}
      y={position.y}
      draggable
      dragBoundFunc={(pos) => pos} // no bounding change, but ensures Konva sets dragging state
      onClick={handleClick}
      onDblClick={handleDoubleClick}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Selection indicator (prominent ring + soft glow) */}
      {isSelected && (
        <>
          <Circle
            radius={badgeRadius + 6}
            stroke="#3b82f6" /* Tailwind blue-500 approximation */
            strokeWidth={Math.max(2, strokeWidth * 2)}
            shadowColor="rgba(59,130,246,0.6)"
            shadowBlur={12}
            shadowOpacity={0.9}
            opacity={0.95}
          />
        </>
      )}

      {/* Main device icon */}
      {renderIcon()}

      {/* No canvas label. External DOM label will be positioned by parent. */}

      {/* Status indicator */}
      {isOffline && (
        <Circle
          x={badgeRadius - 4}
          y={-badgeRadius + 4}
          radius={3}
          fill="#ef4444"
          stroke="white"
          strokeWidth={1}
        />
      )}
    </Group>
  );
}