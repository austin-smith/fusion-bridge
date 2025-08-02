/**
 * Chart utilities for reports
 * Pure functions for building chart data and configurations
 */

import { differenceInDays } from 'date-fns';
import type { ChartConfig } from '@/components/ui/chart';
import type { 
  AutomationGroupedData, 
  AutomationChartData, 
  EventChartData, 
  GroupedEventData 
} from '@/types/reports';
import { buildCategoryChartConfig, AUTOMATION_STATUS_CONFIG } from './chart-configs';

export interface ConnectorData {
  category: string;
  [key: string]: any;
}

export interface DateRange {
  start: string | null;
  end: string | null;
}

export interface EventChartResult {
  chartData: EventChartData[];
  chartConfig: ChartConfig;
}

export interface AutomationChartResult {
  chartData: AutomationChartData[];
  chartConfig: ChartConfig;
}

/**
 * Build chart data for events grouped by connector category over time
 */
export function buildEventChartData(
  groupedData: GroupedEventData[],
  connectors: ConnectorData[],
  dateRange: DateRange
): EventChartResult {
  if (!connectors.length) {
    return {
      chartData: [],
      chartConfig: {}
    };
  }

  // Create date range based on provided filter
  const dates: string[] = [];
  
  if (dateRange.start && dateRange.end) {
    const startDate = new Date(dateRange.start);
    const endDate = new Date(dateRange.end);
    const daysDiff = Math.min(differenceInDays(endDate, startDate), 30); // Limit to 30 days for chart readability
    
    for (let i = 0; i <= daysDiff; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      dates.push(date.toISOString().split('T')[0]);
    }
  } else {
    // Fallback to last 7 days if no specific range
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      dates.push(date.toISOString().split('T')[0]);
    }
  }

  // Get unique connector categories
  const categories = [...new Set(connectors.map(c => c.category))];
  
  // Build chart data structure
  const chartData: EventChartData[] = dates.map(date => ({
    date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    ...categories.reduce((acc, category) => {
      acc[category] = 0;
      return acc;
    }, {} as Record<string, number>)
  }));

  // Populate with grouped count data
  if (groupedData.length > 0) {
    groupedData.forEach((item) => {
      const dateStr = item.date; // Already in YYYY-MM-DD format from SQL
      const category = item.connectorCategory || item.category;
      const count = item.count || 0;
      
      const dateIndex = dates.indexOf(dateStr);
      if (dateIndex >= 0 && chartData[dateIndex] && category) {
        chartData[dateIndex][category] = count;
      }
    });
  }

  // Build chart config using shared configuration builder
  const chartConfig = buildCategoryChartConfig(categories);

  return {
    chartData,
    chartConfig
  };
}

/**
 * Build chart data for automation executions with success/failure breakdown
 */
export function buildAutomationChartData(
  groupedData: AutomationGroupedData[]
): AutomationChartResult {
  if (groupedData.length === 0) {
    return {
      chartData: [],
      chartConfig: {}
    };
  }

  // Build stacked bar chart data - automation name with success/failure breakdown
  const chartData: AutomationChartData[] = groupedData.map((item) => ({
    automationName: item.automationName,
    successful: Number(item.successfulCount) || 0,
    failed: Number(item.failedCount) || 0,
    total: item.count || 0
  }));

  // Build chart config using shared configuration
  const chartConfig = AUTOMATION_STATUS_CONFIG;

  return {
    chartData,
    chartConfig
  };
}

/**
 * Calculate totals for each connector category from grouped event data
 */
export function calculateCategoryTotals(
  groupedEventData: GroupedEventData[]
): Record<string, number> {
  if (!groupedEventData.length) return {};
  
  const categoryTotals: Record<string, number> = {};
  groupedEventData.forEach((item) => {
    const category = item.connectorCategory || item.category;
    const count = item.count || 0;
    if (category) {
      categoryTotals[category] = (categoryTotals[category] || 0) + count;
    }
  });
  
  return categoryTotals;
}