/**
 * Floor plan components exports
 */

// Note: Components with Konva imports are NOT exported here to avoid static bundling
// FloorPlanCanvas, DeviceOverlayIcon, and DeviceOverlayLayer all use Konva and must be imported dynamically
export { FloorPlanCanvasDynamic } from './floor-plan-canvas-dynamic';
export { DevicePalette, type DevicePaletteProps } from './device-overlays/device-palette';