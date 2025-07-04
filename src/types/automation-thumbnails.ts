import type { EventThumbnailData } from '@/services/event-thumbnail-fetcher';
import type { ThumbnailSource } from '@/services/event-thumbnail-resolver';

/**
 * Context object for passing thumbnail data through the automation pipeline
 */
export interface ThumbnailContext {
  // Raw thumbnail data from the fetcher
  base64?: string;
  dataUri?: string;
  available: boolean;
}

/**
 * Factory function to create ThumbnailContext from EventThumbnailData
 */
export function createThumbnailContext(
  thumbnailData: EventThumbnailData | null,
  source?: ThumbnailSource
): ThumbnailContext {
  if (!thumbnailData) {
    return {
      available: false,
    };
  }

  return {
    base64: thumbnailData.data,
    dataUri: `data:${thumbnailData.contentType};base64,${thumbnailData.data}`,
    available: true,
  };
}

/**
 * Creates an empty thumbnail context for cases where no thumbnail is available
 */
export function createEmptyThumbnailContext(): ThumbnailContext {
  return {
    available: false,
  };
} 