/**
 * Time filter state management hook for reports
 * Handles time filter state from Zustand store and date range calculations
 */

import { useCallback, useMemo } from 'react';
import { useFusionStore } from '@/stores/store';
import { calculateDateRangeForFilter, type TimeFilterValue } from '@/components/features/events/TimeFilterDropdown';
import type { TimeFilterState } from '@/types/reports';

export interface UseReportsTimeFilterResult {
  filter: TimeFilterValue;
  start: string | null;
  end: string | null;
  setFilter: (filter: TimeFilterValue) => void;
  setTimeStart: (start: string | null) => void;
  setTimeEnd: (end: string | null) => void;
  initializePreferences: () => void;
  getDateRange: () => { start: string | null; end: string | null };
}

/**
 * Hook for managing reports time filter state
 */
export function useReportsTimeFilter(): UseReportsTimeFilterResult {
  // Get state and actions from Zustand store
  const filterRaw = useFusionStore(state => state.reportsTimeFilter);
  const startRaw = useFusionStore(state => state.reportsTimeStart);
  const endRaw = useFusionStore(state => state.reportsTimeEnd);
  const setFilterRaw = useFusionStore(state => state.setReportsTimeFilter);
  const setTimeStartRaw = useFusionStore(state => state.setReportsTimeStart);
  const setTimeEndRaw = useFusionStore(state => state.setReportsTimeEnd);
  const initializePreferences = useFusionStore(state => state.initializeReportsPreferences);

  // Type-safe wrappers
  const setFilter = useCallback((filter: TimeFilterValue) => {
    setFilterRaw(filter);
  }, [setFilterRaw]);

  const setTimeStart = useCallback((start: string | null) => {
    setTimeStartRaw(start);
  }, [setTimeStartRaw]);

  const setTimeEnd = useCallback((end: string | null) => {
    setTimeEndRaw(end);
  }, [setTimeEndRaw]);

  /**
   * Calculate date range based on current filter settings
   */
  const getDateRange = useCallback((): { start: string | null; end: string | null } => {
    if (startRaw && endRaw) {
      return { start: startRaw, end: endRaw };
    }
    
    return calculateDateRangeForFilter(filterRaw as TimeFilterValue);
  }, [filterRaw, startRaw, endRaw]);

  return useMemo(() => ({
    filter: filterRaw as TimeFilterValue,
    start: startRaw,
    end: endRaw,
    setFilter,
    setTimeStart,
    setTimeEnd,
    initializePreferences,
    getDateRange,
  }), [filterRaw, startRaw, endRaw, setFilter, setTimeStart, setTimeEnd, initializePreferences, getDateRange]);
}