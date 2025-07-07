/**
 * Simple types for AI chat with function calling
 * No complex hierarchies, just what we need
 */

export interface ChatRequest {
  query: string;
  userTimezone?: string; // User's timezone for calculating "today", "yesterday", etc.
  context?: {
    conversationId?: string;
    previousResults?: any;
  };
}

export interface ChatResponse {
  success: boolean;
  response?: string;
  data?: any;  // Raw data if UI needs to render it specially
  error?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// Function parameter types - keep them simple!
export interface TimeRange {
  start: string;  // ISO date string
  end: string;    // ISO date string
}

export interface EventFilters {
  deviceNames?: string[];
  eventTypes?: string[];
  locations?: string[];
  areas?: string[];
}

export interface DeviceFilters {
  names?: string[];
  types?: string[];
  locations?: string[];
  statuses?: string[];
}

export interface AggregationOptions {
  groupBy?: 'device' | 'type' | 'location' | 'area' | 'time';
  timeBucket?: 'hour' | 'day' | 'week' | 'month';
} 