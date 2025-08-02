/**
 * Alarm data fetching hook for reports
 * Handles active alarm count fetching
 */

import { useState, useCallback, useMemo } from 'react';
import type { DataHookResult, ApiResponse } from '@/types/reports';

export interface AlarmData {
  activeAlarmCount: number | null;
}

/**
 * Hook for fetching and managing alarm data
 * Note: Alarm data is not time-dependent like other reports data
 */
export function useAlarmData(): DataHookResult<AlarmData> {
  const [activeAlarmCount, setActiveAlarmCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  /**
   * Fetch active alarm count from alarm zones
   */
  const fetchAlarmData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Fetch alarm zones to count active alarms (not time-dependent)
      const alarmZonesResponse = await fetch('/api/alarm-zones');
      
      if (alarmZonesResponse.ok) {
        const alarmZonesData: ApiResponse<any[]> = await alarmZonesResponse.json();
        if (alarmZonesData.success && alarmZonesData.data) {
          const triggeredCount = alarmZonesData.data.filter(
            (zone: any) => zone.armedState === 'triggered'
          ).length;
          setActiveAlarmCount(triggeredCount);
        }
      }
    } catch (err) {
      console.error('Error fetching alarm data:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch alarm data'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const data: AlarmData = useMemo(() => ({
    activeAlarmCount,
  }), [activeAlarmCount]);

  return useMemo(() => ({
    data,
    isLoading,
    error,
    refetch: fetchAlarmData,
  }), [data, isLoading, error, fetchAlarmData]);
}