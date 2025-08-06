'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Group, Circle, Rect, Text, Line } from 'react-konva';
import { getDeviceTypeIconName, getDisplayStateColorClass } from '@/lib/mappings/presentation';
import { DeviceType } from '@/lib/mappings/definitions';
import type { DeviceOverlayWithDevice, CanvasCoordinates } from '@/types/device-overlay';

export interface DeviceOverlayIconProps {
  /** Device overlay data with device information */
  overlay: DeviceOverlayWithDevice;
  /** Position on canvas in pixels */
  position: CanvasCoordinates;
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

// Device type to color mapping
const deviceTypeColors: Record<string, string> = {
  [DeviceType.Camera]: '#3b82f6', // Blue
  [DeviceType.Door]: '#8b5cf6', // Purple
  [DeviceType.Lock]: '#f59e0b', // Yellow
  [DeviceType.Sensor]: '#10b981', // Green
  [DeviceType.Alarm]: '#ef4444', // Red
  [DeviceType.Switch]: '#6366f1', // Indigo
  [DeviceType.Outlet]: '#f97316', // Orange
  [DeviceType.Thermostat]: '#06b6d4', // Cyan
  [DeviceType.Hub]: '#8b5cf6', // Purple
  [DeviceType.SmartFob]: '#ec4899', // Pink
  [DeviceType.Sprinkler]: '#0ea5e9', // Sky
  [DeviceType.GarageDoor]: '#84cc16', // Lime
  [DeviceType.WaterValveController]: '#14b8a6', // Teal
  [DeviceType.Encoder]: '#a855f7', // Violet
  [DeviceType.IOModule]: '#64748b', // Slate
  [DeviceType.Unmapped]: '#6b7280', // Gray
};

// Device type to shape mapping
const deviceTypeShapes: Record<string, 'circle' | 'square' | 'diamond'> = {
  [DeviceType.Camera]: 'circle',
  [DeviceType.Door]: 'square',
  [DeviceType.Lock]: 'diamond',
  [DeviceType.Sensor]: 'circle',
  [DeviceType.Alarm]: 'diamond',
  [DeviceType.Switch]: 'square',
  [DeviceType.Outlet]: 'square',
  [DeviceType.Thermostat]: 'circle',
  [DeviceType.Hub]: 'square',
  [DeviceType.SmartFob]: 'circle',
  [DeviceType.Sprinkler]: 'circle',
  [DeviceType.GarageDoor]: 'square',
  [DeviceType.WaterValveController]: 'circle',
  [DeviceType.Encoder]: 'square',
  [DeviceType.IOModule]: 'square',
  [DeviceType.Unmapped]: 'circle',
};

// Device type short labels for display
const deviceTypeLabels: Record<string, string> = {
  [DeviceType.Camera]: 'CAM',
  [DeviceType.Door]: 'DOOR',
  [DeviceType.Lock]: 'LOCK',
  [DeviceType.Sensor]: 'SENS',
  [DeviceType.Alarm]: 'ALRM',
  [DeviceType.Switch]: 'SWCH',
  [DeviceType.Outlet]: 'PLUG',
  [DeviceType.Thermostat]: 'TEMP',
  [DeviceType.Hub]: 'HUB',
  [DeviceType.SmartFob]: 'FOB',
  [DeviceType.Sprinkler]: 'SPRL',
  [DeviceType.GarageDoor]: 'GRGE',
  [DeviceType.WaterValveController]: 'VALV',
  [DeviceType.Encoder]: 'ENC',
  [DeviceType.IOModule]: 'IO',
  [DeviceType.Unmapped]: '?',
};

// Scaling and sizing constants
const BASE_SIZE = 24;
const SCALE_FACTOR = 0.5;
const MIN_SCALE = 0.3;
const FONT_SIZE_RATIO = 0.3;
const MIN_FONT_SIZE = 8;
const MIN_STROKE_WIDTH = 1;
const BASE_STROKE_WIDTH = 2;

export function DeviceOverlayIcon({
  overlay,
  position,
  canvasScale = 1,
  isSelected = false,
  isDragging = false,
  onClick,
  onDoubleClick,
  onDragStart,
  onDragMove,
  onDragEnd
}: DeviceOverlayIconProps) {
  const [isHovered, setIsHovered] = useState(false);
  const groupRef = useRef<any>(null);

  const deviceType = overlay.device.standardizedDeviceType || DeviceType.Unmapped;
  const color = deviceTypeColors[deviceType] || deviceTypeColors[DeviceType.Unmapped];
  const shape = deviceTypeShapes[deviceType] || 'circle';
  const label = deviceTypeLabels[deviceType] || '?';

  // Calculate responsive sizing based on canvas scale
  const size = BASE_SIZE / Math.max(canvasScale * SCALE_FACTOR, MIN_SCALE); // Keep readable at all zoom levels
  const radius = size / 2;
  const fontSize = Math.max(MIN_FONT_SIZE, size * FONT_SIZE_RATIO);
  const strokeWidth = Math.max(MIN_STROKE_WIDTH, BASE_STROKE_WIDTH / canvasScale);

  // State-based styling
  const isOffline = overlay.device.status === 'offline';
  const opacity = isDragging ? 0.7 : isOffline ? 0.6 : 1;
  const strokeColor = isSelected ? '#ffffff' : isHovered ? color : 'transparent';

  const handleClick = () => {
    onClick?.(overlay);
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
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  const renderShape = () => {
    const shapeProps = {
      fill: color,
      stroke: strokeColor,
      strokeWidth: strokeWidth * 2,
      shadowColor: 'rgba(0, 0, 0, 0.3)',
      shadowBlur: isHovered || isSelected ? 6 : 3,
      shadowOffset: { x: 1, y: 1 },
      opacity
    };

    switch (shape) {
      case 'square':
        return (
          <Rect
            x={-radius}
            y={-radius}
            width={size}
            height={size}
            cornerRadius={2}
            {...shapeProps}
          />
        );
      case 'diamond':
        return (
          <Line
            points={[0, -radius, radius, 0, 0, radius, -radius, 0]}
            closed
            {...shapeProps}
          />
        );
      case 'circle':
      default:
        return (
          <Circle
            radius={radius}
            {...shapeProps}
          />
        );
    }
  };

  return (
    <Group
      ref={groupRef}
      x={position.x}
      y={position.y}
      draggable
      onClick={handleClick}
      onDblClick={handleDoubleClick}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Selection indicator */}
      {isSelected && (
        <Circle
          radius={radius + 4}
          stroke="#ffffff"
          strokeWidth={strokeWidth * 2}
          dash={[3, 3]}
          opacity={0.8}
        />
      )}

      {/* Main device shape */}
      {renderShape()}

      {/* Device type label */}
      <Text
        text={label}
        fontSize={fontSize}
        fill="white"
        fontFamily="Arial, sans-serif"
        fontWeight="bold"
        align="center"
        verticalAlign="middle"
        offsetX={label.length * fontSize * 0.25}
        offsetY={fontSize * 0.4}
        opacity={opacity}
      />

      {/* Device name label (shown when hovered or selected) */}
      {(isHovered || isSelected) && (
        <Group y={radius + 8}>
          {/* Background for text readability */}
          <Rect
            x={-overlay.device.name.length * 3}
            y={-6}
            width={overlay.device.name.length * 6}
            height={12}
            fill="rgba(0, 0, 0, 0.8)"
            cornerRadius={2}
          />
          <Text
            text={overlay.device.name}
            fontSize={10}
            fill="white"
            fontFamily="Arial, sans-serif"
            align="center"
            offsetX={overlay.device.name.length * 3}
          />
        </Group>
      )}

      {/* Status indicator */}
      {isOffline && (
        <Circle
          x={radius - 4}
          y={-radius + 4}
          radius={3}
          fill="#ef4444"
          stroke="white"
          strokeWidth={1}
        />
      )}
    </Group>
  );
}