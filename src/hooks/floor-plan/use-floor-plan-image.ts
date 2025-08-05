'use client';

import { useState, useEffect, useCallback } from 'react';
import useImage from 'use-image';
import type { FloorPlanData } from '@/lib/storage/file-storage';

export interface UseFloorPlanImageResult {
  image: HTMLImageElement | undefined;
  isLoading: boolean;
  error: string | null;
  reload: () => void;
  dimensions: {
    width: number;
    height: number;
  } | null;
}

interface UseFloorPlanImageOptions {
  crossOrigin?: 'anonymous' | 'use-credentials' | '';
  referrerPolicy?: string;
}

/**
 * Hook for loading floor plan images with error handling and retry capability
 * Works with both direct image URLs and floor plan data objects
 */
export function useFloorPlanImage(
  source: string | FloorPlanData | null,
  locationId?: string,
  options: UseFloorPlanImageOptions = {}
): UseFloorPlanImageResult {
  const [error, setError] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Generate the image URL
  const imageUrl = generateImageUrl(source, locationId);
  
  // Use the use-image hook with reload key for retry functionality
  // Add cache busting as a separate parameter, not attached to filename
  const [image, status] = useImage(
    imageUrl ? `${imageUrl}&v=${reloadKey}` : ''
  );

  // Handle image loading states
  useEffect(() => {
    if (status === 'loading') {
      setError(null);
      setDimensions(null);
    } else if (status === 'loaded' && image) {
      setError(null);
      setDimensions({
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height
      });
    } else if (status === 'failed') {
      setError('Failed to load floor plan image');
      setDimensions(null);
    }
  }, [status, image]);

  // Reload function to retry loading
  const reload = useCallback(() => {
    setReloadKey(prev => prev + 1);
  }, []);

  const isLoading = status === 'loading';

  return {
    image,
    isLoading,
    error,
    reload,
    dimensions
  };
}

/**
 * Generate the appropriate image URL from various source types
 */
function generateImageUrl(
  source: string | FloorPlanData | null,
  locationId?: string
): string | null {
  if (!source) {
    return null;
  }

  // If source is already a string URL, use it directly
  if (typeof source === 'string') {
    return source;
  }

  // If source is FloorPlanData, construct the serving URL
  if (typeof source === 'object' && source.filePath && locationId) {
    const internalFilename = source.filePath.split('/').pop();
    if (!internalFilename) {
      console.error('Invalid floor plan file path:', source.filePath);
      return null;
    }
    return `/api/locations/${locationId}/floor-plan?file=${internalFilename}`;
  }

  return null;
}

/**
 * Check if the source represents an image file
 */
export function isImageSource(source: string | FloorPlanData | null): boolean {
  if (!source) {
    return false;
  }

  if (typeof source === 'string') {
    // Check URL extension or content type if available
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.svg', '.webp', '.gif'];
    return imageExtensions.some(ext => source.toLowerCase().includes(ext));
  }

  if (typeof source === 'object' && source.contentType) {
    return source.contentType.startsWith('image/');
  }

  return false;
}