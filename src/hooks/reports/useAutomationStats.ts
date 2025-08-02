/**
 * Automation stats fetching hook for reports
 * Handles automation execution stats and grouped automation data
 */

import { useState, useCallback, useMemo } from 'react';
import type { 
  AutomationStats,
  AutomationGroupedData,
  AutomationChartData,
  DataHookResult,
  ApiResponse,
  GroupedDataResponse 
} from '@/types/reports';
import type { UseReportsTimeFilterResult } from './useReportsTimeFilter';
import { buildAutomationChartData } from '@/lib/reports';

export interface AutomationData {
  automationStats: AutomationStats | null;
  groupedAutomationData: AutomationGroupedData[];
  automationChartData: AutomationChartData[];
  automationChartConfig: any; // ChartConfig from UI components
}

/**
 * Hook for fetching and managing automation statistics
 */
export function useAutomationStats(timeFilter: UseReportsTimeFilterResult): DataHookResult<AutomationData> {
  const [automationStats, setAutomationStats] = useState<AutomationStats | null>(null);
  const [groupedAutomationData, setGroupedAutomationData] = useState<AutomationGroupedData[]>([]);
  const [automationChartData, setAutomationChartData] = useState<AutomationChartData[]>([]);
  const [automationChartConfig, setAutomationChartConfig] = useState<any>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  /**
   * Fetch automation execution stats and grouped data
   */
  const fetchAutomationData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const { start, end } = timeFilter.getDateRange();
      
      // Build query parameters for automation stats
      const automationParams = new URLSearchParams();
      automationParams.set('count', 'true');
      if (start) automationParams.set('timeStart', start);
      if (end) automationParams.set('timeEnd', end);
      
      // Fetch automation execution stats
      const automationResponse = await fetch(`/api/automations/executions?${automationParams.toString()}`);
      
      if (automationResponse.ok) {
        const automationData: ApiResponse<AutomationStats> = await automationResponse.json();
        if (automationData.success && automationData.data) {
          setAutomationStats(automationData.data);
        }
      }

      // Fetch grouped automation execution counts for chart
      const automationChartParams = new URLSearchParams(automationParams);
      automationChartParams.set('groupBy', 'automation');
      const automationChartResponse = await fetch(`/api/automations/executions?${automationChartParams.toString()}`);
      
      if (automationChartResponse.ok) {
        const automationChartData: GroupedDataResponse<AutomationGroupedData> = await automationChartResponse.json();
        if (automationChartData.success && automationChartData.data) {
          setGroupedAutomationData(automationChartData.data);
          
          // Build chart data immediately after fetching grouped data
          const chartResult = buildAutomationChartData(automationChartData.data);
          setAutomationChartData(chartResult.chartData);
          setAutomationChartConfig(chartResult.chartConfig);
        }
      }
    } catch (err) {
      console.error('Error fetching automation data:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch automation data'));
    } finally {
      setIsLoading(false);
    }
  }, [timeFilter]);

  const data: AutomationData = useMemo(() => ({
    automationStats,
    groupedAutomationData,
    automationChartData,
    automationChartConfig,
  }), [automationStats, groupedAutomationData, automationChartData, automationChartConfig]);

  return useMemo(() => ({
    data,
    isLoading,
    error,
    refetch: fetchAutomationData,
  }), [data, isLoading, error, fetchAutomationData]);
}