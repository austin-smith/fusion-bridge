/**
 * Type definitions for Reports feature
 * Centralized location for all reports-related types and interfaces
 */

import type { Layout } from 'react-grid-layout';
import type { ChartConfig } from '@/components/ui/chart';

// Re-export types from other modules for convenience
export type { AutomationGroupedData } from '@/services/automation-audit-query-service';

// ==========================================
// Chart Data Types
// ==========================================

/**
 * Processed automation chart data for bar charts
 */
export interface AutomationChartData {
  automationName: string;
  successful: number;
  failed: number;
  total: number;
}

/**
 * Event chart data with dynamic connector categories
 */
export interface EventChartData {
  date: string;
  [connectorName: string]: number | string;
}

/**
 * Raw grouped event data from API
 */
export interface GroupedEventData {
  date: string;
  category: string;
  count: number;
  connectorCategory?: string; // Added for event data grouping
}

// ==========================================
// Stats Types
// ==========================================

/**
 * Automation execution statistics
 */
export interface AutomationStats {
  total: number;
  successful: number;
  failed: number;
  successRate: number;
}

// ==========================================
// Layout Types
// ==========================================

/**
 * Dashboard card identifiers
 */
export type DashboardCardId = 
  | 'devices-card'
  | 'connectors-card' 
  | 'active-alarms-card'
  | 'automation-success'
  | 'automation-executions'
  | 'events-chart';

/**
 * Dashboard card ID constants for type safety and consistency
 */
export const DASHBOARD_CARD_IDS: Record<string, DashboardCardId> = {
  DEVICES: 'devices-card',
  CONNECTORS: 'connectors-card', 
  ACTIVE_ALARMS: 'active-alarms-card',
  AUTOMATION_SUCCESS: 'automation-success',
  AUTOMATION_EXECUTIONS: 'automation-executions',
  EVENTS_CHART: 'events-chart',
} as const;

/**
 * Grid layout configuration for different breakpoints
 * Compatible with react-grid-layout's Layouts type
 */
export interface ReportsLayouts {
  lg: Layout[];
  md: Layout[];
  sm: Layout[];
  xs: Layout[];
  xxs: Layout[];
  [key: string]: Layout[]; // Index signature for react-grid-layout compatibility
}

/**
 * Individual layout item with dashboard card ID
 */
export interface DashboardLayoutItem extends Layout {
  i: DashboardCardId;
}

// ==========================================
// Chart Configuration Types  
// ==========================================

/**
 * Chart data with configuration
 */
export interface ChartDataWithConfig<T = any> {
  data: T[];
  config: ChartConfig;
}

/**
 * Time filter state for reports
 */
export interface TimeFilterState {
  filter: string;
  start?: string;
  end?: string;
}

// ==========================================
// API Response Types
// ==========================================

/**
 * Standard API response wrapper
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  count?: number;
  message?: string;
}

/**
 * Grouped data API response
 */
export interface GroupedDataResponse<T = any> extends ApiResponse<T[]> {
  data: T[];
}

// ==========================================
// Hook Return Types
// ==========================================

/**
 * Return type for data fetching hooks
 */
export interface DataHookResult<T = any> {
  data: T;
  isLoading: boolean;
  error?: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Return type for layout management hook
 */
export interface LayoutHookResult {
  layouts: ReportsLayouts;
  layoutsLoaded: boolean;
  onLayoutChange: (layout: Layout[], layouts: ReportsLayouts) => void;
  resetLayout: () => void;
}