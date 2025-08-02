/**
 * Event data fetching hook for reports
 * Handles event count and grouped event data fetching
 */

import { useState, useCallback, useMemo } from 'react';
import type { 
  EventChartData, 
  GroupedEventData, 
  DataHookResult,
  ApiResponse,
  GroupedDataResponse 
} from '@/types/reports';
import type { UseReportsTimeFilterResult } from './useReportsTimeFilter';
import { buildEventChartData } from '@/lib/reports';
import { useFusionStore } from '@/stores/store';

export interface EventData {
  eventCount: number | null;
  groupedEventData: GroupedEventData[];
  chartData: EventChartData[];
  chartConfig: any; // ChartConfig from UI components
}

/**
 * Hook for fetching and managing event data
 */
export function useEventData(timeFilter: UseReportsTimeFilterResult): DataHookResult<EventData> {
  const { connectors } = useFusionStore();
  const [eventCount, setEventCount] = useState<number | null>(null);
  const [groupedEventData, setGroupedEventData] = useState<GroupedEventData[]>([]);
  const [chartData, setChartData] = useState<EventChartData[]>([]);
  const [chartConfig, setChartConfig] = useState<any>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  /**
   * Fetch event count and grouped event data
   */
  const fetchEventData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const { start, end } = timeFilter.getDateRange();
      
      // Build query parameters for event count
      const params = new URLSearchParams();
      params.set('count', 'true');
      if (start) params.set('timeStart', start);
      if (end) params.set('timeEnd', end);
      
      // Fetch event count
      const eventResponse = await fetch(`/api/events?${params.toString()}`);
      
      if (eventResponse.ok) {
        const eventData: ApiResponse<any> = await eventResponse.json();
        if (eventData.success) {
          setEventCount(eventData.count || 0);
        }
      }

      // Fetch grouped event counts for chart
      const chartParams = new URLSearchParams(params);
      chartParams.set('groupBy', 'day,connector');
      const chartResponse = await fetch(`/api/events?${chartParams.toString()}`);
      
      if (chartResponse.ok) {
        const chartEventData: GroupedDataResponse<GroupedEventData> = await chartResponse.json();
        if (chartEventData.success && chartEventData.data) {
          setGroupedEventData(chartEventData.data);
          
          // Build chart data immediately after fetching grouped data
          if (connectors.length > 0) {
            const dateRange = timeFilter.getDateRange();
            const chartResult = buildEventChartData(chartEventData.data, connectors, dateRange);
            setChartData(chartResult.chartData);
            setChartConfig(chartResult.chartConfig);
          }
        }
      }
    } catch (err) {
      console.error('Error fetching event data:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch event data'));
    } finally {
      setIsLoading(false);
    }
  }, [timeFilter, connectors]);

  const data: EventData = useMemo(() => ({
    eventCount,
    groupedEventData,
    chartData,
    chartConfig,
  }), [eventCount, groupedEventData, chartData, chartConfig]);

  return useMemo(() => ({
    data,
    isLoading,
    error,
    refetch: fetchEventData,
  }), [data, isLoading, error, fetchEventData]);
}