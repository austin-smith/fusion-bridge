// Types for Natural Language Query System

// Query Types
export enum QueryType {
  EVENTS = 'events',
  STATUS = 'status',
  ANALYTICS = 'analytics'
}

// Time Range
export interface TimeRange {
  start: Date;
  end: Date;
  description?: string;
}

// Query Filters
export interface QueryFilters {
  deviceTypes?: string[];
  deviceNames?: string[];
  deviceIds?: string[];
  locationNames?: string[];
  locationIds?: string[];
  areaNames?: string[];
  areaIds?: string[];
  eventTypes?: string[];
  eventCategories?: string[];
  onlineStatus?: boolean;
}

// Aggregation
export interface QueryAggregation {
  type: 'count' | 'timeline' | 'groupBy';
  field?: string;
}

// Interpreted Query
export interface InterpretedQuery {
  interpretation: string;
  queryType: QueryType;
  filters: QueryFilters;
  timeRange?: TimeRange;
  aggregation?: QueryAggregation;
  confidence: number;
  ambiguities?: string[];
  suggestions?: string[];
}

// Query Context (for OpenAI)
export interface QueryContext {
  devices: Array<{
    id: string;
    name: string;
    type: string;
    connectorCategory: string;
  }>;
  locations: Array<{
    id: string;
    name: string;
    path: string;
  }>;
  areas: Array<{
    id: string;
    name: string;
    locationName?: string;
  }>;
  eventTypes: string[];
  eventCategories: string[];
  currentTime: Date;
  organizationId: string;
}

// Query Results
export interface QueryResults {
  interpretation: string;
  queryType: QueryType;
  totalResults: number;
  executionTime: number;
  queryExecutedAt: Date;
  
  // Type-specific results
  events?: Array<{
    id: string;
    eventUuid: string;
    timestamp: Date;
    deviceName?: string;
    eventType: string;
    eventCategory: string;
    locationName?: string;
    areaName?: string;
    displayState?: string;
    payload?: any;
  }>;
  
  deviceStatuses?: Array<{
    deviceId: string;
    deviceName: string;
    deviceType: string;
    status: string;
    lastSeen?: Date;
    locationName?: string;
    areaName?: string;
  }>;
  
  analytics?: {
    count?: number;
    breakdown?: Record<string, number>;
    timeline?: Array<{
      timestamp: Date;
      count: number;
    }>;
  };
}

// Query Error
export interface QueryError {
  type: 'interpretation_failed' | 'execution_failed' | 'service_unavailable' | 'invalid_input';
  message: string;
  details?: any;
}

// API Request/Response Types
export interface QueryInterpretationRequest {
  query: string;
}

export interface QueryInterpretationResponse {
  success: boolean;
  interpretedQuery?: InterpretedQuery;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  error?: QueryError;
} 