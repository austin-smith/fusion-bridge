/**
 * Device Overlay Types
 * 
 * Types for managing device positions on floor plan canvases.
 * Coordinates are normalized (0-1 scale) for responsive layouts.
 */

export interface DeviceOverlayPosition {
  /** Device's internal UUID */
  deviceId: string;
  /** Floor plan's internal UUID */
  floorPlanId: string;
  /** Normalized X coordinate (0-1 scale) relative to floor plan width */
  x: number;
  /** Normalized Y coordinate (0-1 scale) relative to floor plan height */
  y: number;
  /** When the position was created */
  createdAt: Date;
  /** When the position was last updated */
  updatedAt: Date;
  /** User who created this position */
  createdByUserId: string;
  /** User who last updated this position */
  updatedByUserId: string;
}

export interface DeviceOverlayData extends DeviceOverlayPosition {
  /** Internal UUID for the overlay record */
  id: string;
  /** Organization ID for multi-tenancy */
  organizationId: string;
}

/**
 * Create payload for new device overlay position
 */
export interface CreateDeviceOverlayPayload {
  deviceId: string;
  floorPlanId: string;
  x: number;
  y: number;
}

/**
 * Update payload for existing device overlay position
 */
export interface UpdateDeviceOverlayPayload {
  x?: number;
  y?: number;
}

/**
 * Device overlay with enriched device information
 */
export interface DeviceOverlayWithDevice extends DeviceOverlayData {
  device: {
    id: string;
    name: string;
    type: string;
    standardizedDeviceType?: string;
    standardizedDeviceSubtype?: string;
    status?: string;
    connectorCategory: string;
    connectorName?: string;
  };
}

/**
 * Canvas coordinate conversion utilities
 */
export interface CanvasCoordinates {
  /** Absolute pixel X coordinate on canvas */
  x: number;
  /** Absolute pixel Y coordinate on canvas */
  y: number;
}

export interface CanvasDimensions {
  width: number;
  height: number;
}

/**
 * Convert normalized coordinates (0-1) to canvas pixel coordinates
 */
export function normalizedToCanvas(
  normalized: { x: number; y: number },
  canvasDimensions: CanvasDimensions
): CanvasCoordinates {
  return {
    x: normalized.x * canvasDimensions.width,
    y: normalized.y * canvasDimensions.height
  };
}

/**
 * Convert canvas pixel coordinates to normalized coordinates (0-1)
 */
export function canvasToNormalized(
  canvas: CanvasCoordinates,
  canvasDimensions: CanvasDimensions
): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(1, canvas.x / canvasDimensions.width)),
    y: Math.max(0, Math.min(1, canvas.y / canvasDimensions.height))
  };
}

/**
 * Validate normalized coordinates are within bounds
 */
export function isValidNormalizedCoordinate(x: number, y: number): boolean {
  return x >= 0 && x <= 1 && y >= 0 && y <= 1;
}