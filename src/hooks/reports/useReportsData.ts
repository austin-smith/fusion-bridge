/**
 * Main reports data orchestration hook
 * Combines all individual data hooks and manages overall state
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useReportsTimeFilter, type UseReportsTimeFilterResult } from './useReportsTimeFilter';
import { useEventData, type EventData } from './useEventData';
import { useAutomationStats, type AutomationData } from './useAutomationStats';
import { useAlarmData, type AlarmData } from './useAlarmData';
import type { DataHookResult } from '@/types/reports';

export interface UseReportsDataResult {
  // Time filter
  timeFilter: UseReportsTimeFilterResult;
  
  // Individual data hooks
  eventData: DataHookResult<EventData>;
  automationData: DataHookResult<AutomationData>;
  alarmData: DataHookResult<AlarmData>;
  
  // Overall state
  isLoading: boolean;
  hasError: boolean;
  
  // Actions
  refetchAll: () => Promise<void>;
}

/**
 * Main hook for orchestrating all reports data
 * Manages loading states and coordinates data fetching
 */
export function useReportsData(): UseReportsDataResult {
  const [isInitializing, setIsInitializing] = useState(true);
  const isFirstRender = useRef(true);
  
  // Initialize time filter
  const timeFilter = useReportsTimeFilter();
  
  // Initialize individual data hooks
  const eventData = useEventData(timeFilter);
  const automationData = useAutomationStats(timeFilter);
  const alarmData = useAlarmData();
  
  // Extract stable refetch functions
  const { refetch: refetchEventData } = eventData;
  const { refetch: refetchAutomationData } = automationData;
  const { refetch: refetchAlarmData } = alarmData;
  
  // Calculate overall loading state
  const isLoading = isInitializing || 
    eventData.isLoading || 
    automationData.isLoading || 
    alarmData.isLoading;
  
  // Check if any hook has an error
  const hasError = Boolean(
    eventData.error || 
    automationData.error || 
    alarmData.error
  );

  /**
   * Fetch all data from all hooks
   */
  const refetchAll = useCallback(async () => {
    setIsInitializing(true);
    try {
      await Promise.all([
        refetchEventData(),
        refetchAutomationData(),
        refetchAlarmData(),
      ]);
    } finally {
      setIsInitializing(false);
    }
  }, [refetchEventData, refetchAutomationData, refetchAlarmData]);

  // Initialize reports preferences on mount
  useEffect(() => {
    timeFilter.initializePreferences();
  }, [timeFilter]);

  // Initial data fetch
  useEffect(() => {
    refetchAll();
  }, [refetchAll]);

  // Refetch time-dependent data when time filter changes
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const fetchTimeFilterData = async () => {
      await Promise.all([
        refetchEventData(),
        refetchAutomationData(),
      ]);
    };
    fetchTimeFilterData();
  }, [timeFilter.filter, timeFilter.start, timeFilter.end, refetchEventData, refetchAutomationData]);

  return {
    timeFilter,
    eventData,
    automationData,
    alarmData,
    isLoading,
    hasError,
    refetchAll,
  };
}