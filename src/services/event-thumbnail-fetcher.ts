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
 * Now considers both best-shot and space camera availability.
 */
export function shouldFetchThumbnail(
  event: StandardizedEvent,
  spaceCameras?: DeviceWithConnector[]
): boolean {
  const source = getThumbnailSource(event, spaceCameras);
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

    console.log(`${logPrefix} Fetching ${source.type} thumbnail${source.type === 'best-shot' ? ` for objectTrackId ${source.objectTrackId}` : ` for timestamp ${source.timestamp}`} with size ${THUMBNAIL_SIZE}`);

    let thumbnailBlob: Blob;

    if (source.type === 'best-shot' && source.objectTrackId) {
      // Use best-shot API for analytics events
      const { buffer, contentType } = await Promise.race([
        pikoDriver.getPikoBestShotImageData(source.connectorId, source.objectTrackId, source.cameraId),
        timeoutPromise
      ]) as { buffer: Buffer; contentType: string };
      
      thumbnailBlob = new Blob([buffer], { type: contentType });
    } else {
      // Use regular thumbnail API for other events
      thumbnailBlob = await Promise.race([
        pikoDriver.getPikoDeviceThumbnail(source.connectorId, source.cameraId, source.timestamp, THUMBNAIL_SIZE),
        timeoutPromise
      ]) as Blob;
    }

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
      console.warn(`${logPrefix} Failed to fetch ${source.type} thumbnail:`, error);
    }
    return null;
  }
}

/**
 * Fetches a thumbnail for an event.
 * Tries best-shot first for analytics events, then falls back to space camera.
 * Returns null if fetch fails or times out.
 * Never throws to ensure event processing continues.
 */
export async function fetchEventThumbnail(
  event: StandardizedEvent,
  spaceCameras?: DeviceWithConnector[]
): Promise<EventThumbnailData | null> {
  const source = getThumbnailSource(event, spaceCameras);
  if (!source) {
    return null;
  }
  
  return fetchThumbnailFromSource(source);
}


// Remove once event processor is updated
export async function fetchEventThumbnail_legacy(
  connectorId: string,
  deviceId: string,
  timestampMs: number
): Promise<EventThumbnailData | null> {
  const source: ThumbnailSource = {
    type: 'space-camera',
    connectorId,
    cameraId: deviceId,
    timestamp: timestampMs
  };
  
  return fetchThumbnailFromSource(source);
} 