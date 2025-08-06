'use client';

import { useState, useEffect, useCallback } from 'react';
import type { FloorPlan } from '@/types';

export interface UseFloorPlansOptions {
  locationId: string;
  enabled?: boolean;
}

export interface UseFloorPlansResult {
  floorPlans: FloorPlan[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  createFloorPlan: (name: string, file: File) => Promise<FloorPlan>;
  updateFloorPlan: (id: string, name?: string, file?: File) => Promise<FloorPlan>;
  deleteFloorPlan: (id: string) => Promise<void>;
}

export function useFloorPlans({
  locationId,
  enabled = true
}: UseFloorPlansOptions): UseFloorPlansResult {
  const [floorPlans, setFloorPlans] = useState<FloorPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFloorPlans = useCallback(async () => {
    if (!locationId || !enabled) {
      setIsLoading(false);
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/locations/${locationId}/floor-plans`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch floor plans');
      }
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch floor plans');
      }
      
      setFloorPlans(data.floorPlans || []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      console.error('Error fetching floor plans:', err);
    } finally {
      setIsLoading(false);
    }
  }, [locationId, enabled]);

  const createFloorPlan = useCallback(async (name: string, file: File): Promise<FloorPlan> => {
    const formData = new FormData();
    formData.append('name', name);
    formData.append('floorPlan', file);
    
    const response = await fetch(`/api/locations/${locationId}/floor-plans`, {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      throw new Error('Failed to create floor plan');
    }
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Failed to create floor plan');
    }
    
    const newFloorPlan = data.floorPlan;
    setFloorPlans(prev => [...prev, newFloorPlan]);
    
    return newFloorPlan;
  }, [locationId]);

  const updateFloorPlan = useCallback(async (id: string, name?: string, file?: File): Promise<FloorPlan> => {
    const formData = new FormData();
    if (name) formData.append('name', name);
    if (file) formData.append('floorPlan', file);
    
    const response = await fetch(`/api/locations/${locationId}/floor-plans/${id}`, {
      method: 'PUT',
      body: formData,
    });
    
    if (!response.ok) {
      throw new Error('Failed to update floor plan');
    }
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Failed to update floor plan');
    }
    
    const updatedFloorPlan = data.floorPlan;
    setFloorPlans(prev => prev.map(fp => fp.id === id ? updatedFloorPlan : fp));
    
    return updatedFloorPlan;
  }, [locationId]);

  const deleteFloorPlan = useCallback(async (id: string): Promise<void> => {
    const response = await fetch(`/api/locations/${locationId}/floor-plans/${id}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      throw new Error('Failed to delete floor plan');
    }
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Failed to delete floor plan');
    }
    
    setFloorPlans(prev => prev.filter(fp => fp.id !== id));
  }, [locationId]);

  const refetch = useCallback(async () => {
    await fetchFloorPlans();
  }, [fetchFloorPlans]);

  useEffect(() => {
    fetchFloorPlans();
  }, [fetchFloorPlans]);

  return {
    floorPlans,
    isLoading,
    error,
    refetch,
    createFloorPlan,
    updateFloorPlan,
    deleteFloorPlan
  };
}