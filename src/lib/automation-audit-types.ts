// Types for automation audit trail functionality

export enum ExecutionStatus {
  SUCCESS = 'success',
  PARTIAL_FAILURE = 'partial_failure', 
  FAILURE = 'failure'
}

export enum ActionExecutionStatus {
  SUCCESS = 'success',
  FAILURE = 'failure',
  SKIPPED = 'skipped'
}

export interface AutomationExecutionRecord {
  id: string;
  automationId: string;
  
  // Trigger information
  triggerTimestamp: Date;
  triggerEventId?: string;
  triggerContext: Record<string, any>;
  
  // Condition evaluation results
  stateConditionsMet?: boolean;
  temporalConditionsMet?: boolean;
  
  // Execution results
  executionStatus: ExecutionStatus;
  executionDurationMs?: number;
  
  // Action execution summary
  totalActions: number;
  successfulActions: number;
  failedActions: number;
  
  // Metadata
  createdAt: Date;
}

export interface ActionExecutionRecord {
  id: string;
  executionId: string;
  actionIndex: number;
  actionType: string;
  actionParams: Record<string, any>;
  
  // Execution results
  status: ActionExecutionStatus;
  errorMessage?: string;
  retryCount: number;
  executionDurationMs?: number;
  resultData?: Record<string, any>;
  
  // Timing
  startedAt: Date;
  completedAt?: Date;
}

// Parameters for starting an execution
export interface StartExecutionParams {
  automationId: string;
  triggerType: 'event' | 'scheduled';
  triggerEventId?: string;
  triggerContext: Record<string, any>;
  totalActions: number;
}

// Parameters for updating condition results
export interface UpdateConditionResultsParams {
  stateConditionsMet?: boolean;
  temporalConditionsMet?: boolean;
}

// Parameters for starting action execution
export interface StartActionExecutionParams {
  executionId: string;
  actionIndex: number;
  actionType: string;
  actionParams: Record<string, any>;
}

// Parameters for completing action execution
export interface CompleteActionExecutionParams {
  status: ActionExecutionStatus;
  errorMessage?: string;
  retryCount?: number;
  resultData?: Record<string, any>;
  executionDurationMs?: number;
}

// Parameters for completing overall execution
export interface CompleteExecutionParams {
  executionStatus: ExecutionStatus;
  successfulActions: number;
  failedActions: number;
  executionDurationMs: number;
} 