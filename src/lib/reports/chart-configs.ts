/**
 * Chart configurations and color schemes for reports
 * Centralized configuration builders for consistent chart styling
 */

import type { ChartConfig } from '@/components/ui/chart';

/**
 * Standard chart color palette
 */
export const CHART_COLORS = [
  '--chart-1',
  '--chart-2', 
  '--chart-3',
  '--chart-4',
  '--chart-5'
] as const;

/**
 * Standard automation status chart configuration
 */
export const AUTOMATION_STATUS_CONFIG: ChartConfig = {
  successful: {
    label: "Successful",
    color: "var(--chart-2)",
  },
  failed: {
    label: "Failed", 
    color: "var(--chart-5)",
  },
} as const;

/**
 * Build a chart config for connector categories
 */
export function buildCategoryChartConfig(categories: string[]): ChartConfig {
  const config: ChartConfig = {};
  
  categories.forEach((category, index) => {
    config[category] = {
      label: category.charAt(0).toUpperCase() + category.slice(1), // Capitalize first letter
      color: `var(${CHART_COLORS[index % CHART_COLORS.length]})`
    };
  });
  
  return config;
}

/**
 * Build a chart config for dynamic data keys with automatic color assignment
 */
export function buildDynamicChartConfig(
  keys: string[], 
  labelTransform?: (key: string) => string
): ChartConfig {
  const config: ChartConfig = {};
  
  keys.forEach((key, index) => {
    config[key] = {
      label: labelTransform ? labelTransform(key) : key,
      color: `var(${CHART_COLORS[index % CHART_COLORS.length]})`
    };
  });
  
  return config;
}

/**
 * Get next available chart color
 */
export function getChartColor(index: number): string {
  return `var(${CHART_COLORS[index % CHART_COLORS.length]})`;
}