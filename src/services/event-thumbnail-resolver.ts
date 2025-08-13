import { StandardizedEvent } from '@/types/events';
import { EnrichedEvent } from '@/types/events';
import { EventCategory, DeviceType } from '@/lib/mappings/definitions';
import type { DeviceWithConnector, Space } from '@/types';

export interface ThumbnailSource {
  type: 'best-shot' | 'space-camera';
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
  spaceCameras?: DeviceWithConnector[]
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
  
  // 2. Fallback to space camera if available
  const pikoCamera = spaceCameras?.find(cam => 
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
      type: 'space-camera',
      connectorId: pikoCamera.connectorId,
      cameraId: pikoCamera.deviceId,
      timestamp
    };
  }
  
  return null;
}

/**
 * Finds Piko cameras in a specific space
 * Can work with either space objects or direct device filtering
 */
export function findSpaceCameras(
  spaceId: string | undefined,
  allDevices: DeviceWithConnector[],
  spaces?: Space[]
): DeviceWithConnector[] {
  if (!spaceId) return [];
  
  // If spaces provided, use them to get device IDs
  if (spaces && spaces.length > 0) {
    const space = spaces.find(s => s.id === spaceId);
    if (!space?.deviceIds?.length) return [];
    
    const deviceIdSet = new Set(space.deviceIds);
    return allDevices.filter(device =>
      deviceIdSet.has(device.id) &&
      device.deviceTypeInfo?.type === DeviceType.Camera &&
      device.connectorCategory === 'piko' &&
      device.connectorId &&
      device.deviceId
    );
  }
  
  // Otherwise filter by spaceId directly (for backend use)
  return allDevices.filter(device =>
    (device as any).spaceId === spaceId && // Type assertion for backend device records
    device.deviceTypeInfo?.type === DeviceType.Camera &&
    device.connectorCategory === 'piko' &&
    device.connectorId &&
    device.deviceId
  );
}

/**
 * Builds thumbnail URL for frontend use
 */
export function buildThumbnailUrl(source: ThumbnailSource, size?: string): string {
  // Normalize and encode params to avoid invalid URL characters (e.g., Piko camera GUIDs with braces)
  const normalizedConnectorId = encodeURIComponent(source.connectorId);
  const normalizedCameraId = encodeURIComponent(source.cameraId.replace(/[{}]/g, ''));
  const timestampParam = `timestamp=${encodeURIComponent(String(source.timestamp))}`;

  if (source.type === 'best-shot' && source.objectTrackId) {
    // Size parameter is not supported for best-shot endpoint currently
    const trackId = encodeURIComponent(source.objectTrackId);
    return `/api/piko/best-shot?connectorId=${normalizedConnectorId}&cameraId=${normalizedCameraId}&objectTrackId=${trackId}`;
  }

  const sizeParam = size ? `&size=${encodeURIComponent(size)}` : '';
  return `/api/piko/device-thumbnail?connectorId=${normalizedConnectorId}&cameraId=${normalizedCameraId}&${timestampParam}${sizeParam}`;
}