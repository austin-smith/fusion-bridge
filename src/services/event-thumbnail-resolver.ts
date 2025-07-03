import { StandardizedEvent } from '@/types/events';
import { EnrichedEvent } from '@/types/events';
import { EventCategory, DeviceType } from '@/lib/mappings/definitions';
import type { DeviceWithConnector, Area } from '@/types';

export interface ThumbnailSource {
  type: 'best-shot' | 'area-camera';
  connectorId: string;
  cameraId: string;
  objectTrackId?: string; // Only for best-shot
  timestamp: number;
}

/**
 * Determines the best thumbnail source for an event
 * Returns null if no thumbnail is available
 */
export function getThumbnailSource(
  event: StandardizedEvent | EnrichedEvent,
  areaCameras?: DeviceWithConnector[]
): ThumbnailSource | null {
  // Get event category - handle both StandardizedEvent and EnrichedEvent
  const eventCategory = 'category' in event ? event.category : event.eventCategory;
  
  // 1. Check for best shot (Piko analytics events with objectTrackId)
  if (eventCategory === EventCategory.ANALYTICS && 
      event.payload?.objectTrackId &&
      typeof event.payload.objectTrackId === 'string' &&
      'connectorId' in event) {
    
    // Handle both StandardizedEvent (Date) and EnrichedEvent (number) timestamp formats
    const timestamp = 'timestamp' in event && typeof event.timestamp === 'number' 
      ? event.timestamp 
      : (event.timestamp as Date).getTime();
    
    return {
      type: 'best-shot',
      connectorId: event.connectorId,
      cameraId: event.deviceId,
      objectTrackId: event.payload.objectTrackId,
      timestamp
    };
  }
  
  // 2. Fallback to area camera if available
  const pikoCamera = areaCameras?.find(cam => 
    cam.deviceTypeInfo?.type === DeviceType.Camera &&
    cam.connectorCategory === 'piko' &&
    cam.connectorId &&
    cam.deviceId
  );
  
  if (pikoCamera) {
    const timestamp = 'timestamp' in event && typeof event.timestamp === 'number'
      ? event.timestamp
      : (event.timestamp as Date).getTime();
    
    return {
      type: 'area-camera',
      connectorId: pikoCamera.connectorId,
      cameraId: pikoCamera.deviceId,
      timestamp
    };
  }
  
  return null;
}

/**
 * Finds Piko cameras in a specific area
 * Can work with either area objects or direct device filtering
 */
export function findAreaCameras(
  areaId: string | undefined,
  allDevices: DeviceWithConnector[],
  areas?: Area[]
): DeviceWithConnector[] {
  if (!areaId) return [];
  
  // If areas provided, use them to get device IDs
  if (areas && areas.length > 0) {
    const area = areas.find(a => a.id === areaId);
    if (!area?.deviceIds?.length) return [];
    
    const deviceIdSet = new Set(area.deviceIds);
    return allDevices.filter(device =>
      deviceIdSet.has(device.id) &&
      device.deviceTypeInfo?.type === DeviceType.Camera &&
      device.connectorCategory === 'piko' &&
      device.connectorId &&
      device.deviceId
    );
  }
  
  // Otherwise filter by areaId directly (for backend use)
  return allDevices.filter(device =>
    (device as any).areaId === areaId && // Type assertion for backend device records
    device.deviceTypeInfo?.type === DeviceType.Camera &&
    device.connectorCategory === 'piko' &&
    device.connectorId &&
    device.deviceId
  );
}

/**
 * Builds thumbnail URL for frontend use
 */
export function buildThumbnailUrl(source: ThumbnailSource): string {
  if (source.type === 'best-shot' && source.objectTrackId) {
    return `/api/piko/best-shot?connectorId=${source.connectorId}&cameraId=${source.cameraId}&objectTrackId=${source.objectTrackId}`;
  }
  
  return `/api/piko/device-thumbnail?connectorId=${source.connectorId}&cameraId=${source.cameraId}&timestamp=${source.timestamp}`;
} 