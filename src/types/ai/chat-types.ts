/**
 * Simple types for AI chat with function calling
 * No complex hierarchies, just what we need
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'function';
  content: string;
  name?: string; // For function calls
}

export interface ChatRequest {
  query: string;
  userTimezone?: string; // User's timezone for calculating "today", "yesterday", etc.
  conversationHistory?: ChatMessage[]; // Previous messages for context
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
  spaces?: string[];
}

export interface DeviceFilters {
  names?: string[];
  types?: string[];
  locations?: string[];
  statuses?: string[];
}

export interface AggregationOptions {
  groupBy?: 'device' | 'type' | 'location' | 'space' | 'time';
  timeBucket?: 'hour' | 'day' | 'week' | 'month';
}

/**
 * Clean data structure for AI natural language generation
 * Contains ONLY the information needed for AI to understand and explain
 * NO UI action metadata or rendering instructions
 */
export interface AiFunctionResult {
  // Core data for AI understanding
  summary?: string;
  count?: number;
  totalCount?: number;
  
  // Entity names for individual operations
  deviceName?: string;
  zoneName?: string; // For alarm zone operations
  
  // Structured data for AI analysis
  devices?: Array<{
    id: string;
    name: string;
    type: string;
    status: string;
    displayState?: string;
    connectorCategory?: string;
    space?: string;
    location?: string;
  }>;
  
  // New alarm zones
  alarmZones?: Array<{
    id: string;
    name: string;
    armedState: string;
    locationId?: string;
    description?: string;
    triggerBehavior?: string;
  }>;
  
  // New spaces
  spaces?: Array<{
    id: string;
    name: string;
    description?: string;
    locationId?: string;
    deviceIds?: string[];
  }>;
  
  events?: Array<{
    id: string;
    timestamp: string;
    device: string;
    type: string;
    space?: string;
    location?: string;
  }>;
  
  // Analytics/aggregations for AI explanation
  metrics?: {
    byStatus?: Array<{ status: string; count: number }>;
    byConnectorCategory?: Array<{ category: string; count: number }>;
    byType?: Array<{ type: string; count: number }>;
  };
  
  // System overview data
  deviceCount?: number;
  spaceCount?: number;
  alarmZoneCount?: number;
  locationCount?: number;
  armedStates?: Array<{ state: string; count: number }>;
  
  // Current state for individual operations
  currentState?: string;
  
  // Action availability for individual operations
  canPerformAction?: boolean;
  actionReason?: string; // Explanation when action cannot be performed
  
  // Time context for AI responses
  timeRange?: TimeRange;
  filters?: {
    deviceNames?: string[];
    eventTypes?: string[];
    connectorCategories?: string[];
    deviceTypes?: string[];
    statuses?: string[];
  };
  
  // Error information
  error?: string;
}

/**
 * Complete function execution result that includes both AI data and UI metadata
 * This is what functions return - clean separation of concerns
 */
export interface FunctionExecutionResult {
  // Data for AI natural language generation (clean, no UI metadata)
  aiData: AiFunctionResult;
  
  // UI action metadata (buttons, interactions)
  uiData?: {
    actions?: import('@/types/ai/chat-actions').ChatAction[];
    [key: string]: any; // Allow additional UI-specific data
  };
} 