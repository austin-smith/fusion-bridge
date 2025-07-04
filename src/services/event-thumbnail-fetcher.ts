import { StandardizedEvent } from '@/types/events';
import * as pikoDriver from '@/services/drivers/piko';
import { getThumbnailSource, type ThumbnailSource } from './event-thumbnail-resolver';
import type { DeviceWithConnector } from '@/types';

const THUMBNAIL_SIZE = '640x0'; // 480p width, auto height
const THUMBNAIL_TIMEOUT_MS = 3000;

export interface EventThumbnailData {
  data: string;        // base64
  contentType: string;
  size: number;
}

/**
 * Determines if a thumbnail should be fetched for the given event.
 * Now considers both best-shot and area camera availability.
 */
export function shouldFetchThumbnail(
  event: StandardizedEvent,
  areaCameras?: DeviceWithConnector[]
): boolean {
  const source = getThumbnailSource(event, areaCameras);
  return source !== null;
}

/**
 * Fetches thumbnail data for a thumbnail source
 */
async function fetchThumbnailFromSource(
  source: ThumbnailSource
): Promise<EventThumbnailData | null> {
  const logPrefix = `[ThumbnailFetcher][${source.connectorId}][${source.cameraId}]`;
  
  try {
    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Thumbnail fetch timeout')), THUMBNAIL_TIMEOUT_MS);
    });

    console.log(`${logPrefix} Fetching ${source.type} thumbnail for timestamp ${source.timestamp} with size ${THUMBNAIL_SIZE}`);

    // For now, both best-shot and area-camera use the same API
    // In the future, best-shot could use a specialized endpoint
    const thumbnailBlob = await Promise.race([
      pikoDriver.getPikoDeviceThumbnail(source.connectorId, source.cameraId, source.timestamp, THUMBNAIL_SIZE),
      timeoutPromise
    ]) as Blob;

    // Verify we got a valid blob
    if (!(thumbnailBlob instanceof Blob)) {
      console.error(`${logPrefix} Expected Blob but got ${typeof thumbnailBlob}`);
      return null;
    }

    // Convert blob to base64
    const arrayBuffer = await thumbnailBlob.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    const result = {
      data: base64,
      contentType: thumbnailBlob.type || 'image/jpeg',
      size: thumbnailBlob.size
    };

    console.log(`${logPrefix} Successfully fetched ${source.type} thumbnail (${result.size} bytes, ${result.contentType})`);
    return result;

  } catch (error) {
    if (error instanceof Error && error.message === 'Thumbnail fetch timeout') {
      console.warn(`${logPrefix} Thumbnail fetch timed out after ${THUMBNAIL_TIMEOUT_MS}ms`);
    } else {
      console.warn(`${logPrefix} Failed to fetch thumbnail:`, error);
    }
    return null;
  }
}

/**
 * Fetches a thumbnail for an event.
 * Tries best-shot first for analytics events, then falls back to area camera.
 * Returns null if fetch fails or times out.
 * Never throws to ensure event processing continues.
 */
export async function fetchEventThumbnail(
  event: StandardizedEvent,
  areaCameras?: DeviceWithConnector[]
): Promise<EventThumbnailData | null> {
  const source = getThumbnailSource(event, areaCameras);
  if (!source) {
    return null;
  }
  
  return fetchThumbnailFromSource(source);
}

// Legacy function for backward compatibility
// Remove once event processor is updated
export async function fetchEventThumbnail_legacy(
  connectorId: string,
  deviceId: string,
  timestampMs: number
): Promise<EventThumbnailData | null> {
  const source: ThumbnailSource = {
    type: 'area-camera',
    connectorId,
    cameraId: deviceId,
    timestamp: timestampMs
  };
  
  return fetchThumbnailFromSource(source);
} 