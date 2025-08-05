import { useState, useEffect, useCallback } from 'react';
import type { 
  DeviceOverlayWithDevice, 
  CreateDeviceOverlayPayload, 
  UpdateDeviceOverlayPayload 
} from '@/types/device-overlay';

interface UseDeviceOverlaysResult {
  /** Array of device overlays for the location */
  overlays: DeviceOverlayWithDevice[];
  /** Loading state */
  isLoading: boolean;
  /** Error message if any */
  error: string | null;
  /** Selected overlay ID */
  selectedOverlayId: string | null;
  /** Refresh overlays from server */
  refetch: () => Promise<void>;
  /** Create a new device overlay */
  createOverlay: (payload: CreateDeviceOverlayPayload) => Promise<void>;
  /** Update an existing device overlay */
  updateOverlay: (overlayId: string, updates: UpdateDeviceOverlayPayload) => Promise<void>;
  /** Delete a device overlay */
  deleteOverlay: (overlayId: string) => Promise<void>;
  /** Select an overlay */
  selectOverlay: (overlay: DeviceOverlayWithDevice | null) => void;
}

interface UseDeviceOverlaysOptions {
  /** Location ID to fetch overlays for */
  locationId: string;
  /** Whether to automatically fetch on mount */
  enabled?: boolean;
}

/**
 * Hook for managing device overlay state and operations
 */
export function useDeviceOverlays({ 
  locationId, 
  enabled = true 
}: UseDeviceOverlaysOptions): UseDeviceOverlaysResult {
  const [overlays, setOverlays] = useState<DeviceOverlayWithDevice[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);

  const fetchOverlays = useCallback(async () => {
    if (!locationId || !enabled) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/locations/${locationId}/floor-plan/device-overlays`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch device overlays: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch device overlays');
      }
      
      setOverlays(data.overlays || []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      console.error('Error fetching device overlays:', err);
    } finally {
      setIsLoading(false);
    }
  }, [locationId, enabled]);

  const createOverlay = useCallback(async (payload: CreateDeviceOverlayPayload) => {
    setError(null);
    
    try {
      const response = await fetch(`/api/locations/${locationId}/floor-plan/device-overlays`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to create device overlay: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to create device overlay');
      }
      
      // Refresh the overlays list
      await fetchOverlays();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      console.error('Error creating device overlay:', err);
      throw err; // Re-throw so caller can handle
    }
  }, [locationId, fetchOverlays]);

  const updateOverlay = useCallback(async (overlayId: string, updates: UpdateDeviceOverlayPayload) => {
    setError(null);
    
    try {
      const response = await fetch(`/api/locations/${locationId}/floor-plan/device-overlays/${overlayId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to update device overlay: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to update device overlay');
      }
      
      // Update local state optimistically
      setOverlays(prev => prev.map(overlay => 
        overlay.id === overlayId 
          ? { ...overlay, ...updates, updatedAt: new Date() }
          : overlay
      ));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      console.error('Error updating device overlay:', err);
      // Refresh on error to get correct state
      await fetchOverlays();
      throw err; // Re-throw so caller can handle
    }
  }, [locationId, fetchOverlays]);

  const deleteOverlay = useCallback(async (overlayId: string) => {
    setError(null);
    
    try {
      const response = await fetch(`/api/locations/${locationId}/floor-plan/device-overlays/${overlayId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error(`Failed to delete device overlay: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to delete device overlay');
      }
      
      // Remove from local state
      setOverlays(prev => prev.filter(overlay => overlay.id !== overlayId));
      
      // Clear selection if deleted overlay was selected
      if (selectedOverlayId === overlayId) {
        setSelectedOverlayId(null);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      console.error('Error deleting device overlay:', err);
      throw err; // Re-throw so caller can handle
    }
  }, [locationId, selectedOverlayId]);

  const selectOverlay = useCallback((overlay: DeviceOverlayWithDevice | null) => {
    setSelectedOverlayId(overlay?.id || null);
  }, []);

  // Fetch overlays when component mounts or locationId changes
  useEffect(() => {
    fetchOverlays();
  }, [fetchOverlays]);

  return {
    overlays,
    isLoading,
    error,
    selectedOverlayId,
    refetch: fetchOverlays,
    createOverlay,
    updateOverlay,
    deleteOverlay,
    selectOverlay
  };
}