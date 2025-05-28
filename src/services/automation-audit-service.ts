import 'server-only';

import { db } from '@/data/db';
import { automationExecutions, automationActionExecutions } from '@/data/db/schema';
import { eq } from 'drizzle-orm';
import {
  ExecutionStatus,
  ActionExecutionStatus,
  type StartExecutionParams,
  type UpdateConditionResultsParams,
  type StartActionExecutionParams,
  type CompleteActionExecutionParams,
  type CompleteExecutionParams,
} from '@/lib/automation-audit-types';

export class AutomationAuditService {
  /**
   * Start tracking an automation execution
   * @param params Parameters for starting the execution
   * @returns Promise<string> The execution ID
   */
  async startExecution(params: StartExecutionParams): Promise<string> {
    try {
      const executionId = crypto.randomUUID();
      const now = new Date();
      
      await db.insert(automationExecutions).values({
        id: executionId,
        automationId: params.automationId,
        triggerTimestamp: now, // Use Date object for timestamp_ms mode
        triggerEventId: params.triggerEventId || null,
        triggerContext: params.triggerContext,
        totalActions: params.totalActions,
        executionStatus: ExecutionStatus.SUCCESS, // Will be updated later
        successfulActions: 0,
        failedActions: 0,
        // Condition results will be updated separately
        stateConditionsMet: null,
        temporalConditionsMet: null,
        executionDurationMs: null,
      });

      console.log(`[AutomationAuditService] Started execution tracking: ${executionId} for automation ${params.automationId}`);
      return executionId;
    } catch (error) {
      console.error('[AutomationAuditService] Failed to start execution tracking:', error);
      throw error;
    }
  }

  /**
   * Update execution with condition evaluation results
   * @param executionId The execution ID
   * @param params Condition evaluation results
   */
  async updateConditionResults(
    executionId: string, 
    params: UpdateConditionResultsParams
  ): Promise<void> {
    try {
      const updateData: Partial<typeof automationExecutions.$inferInsert> = {};
      
      if (params.stateConditionsMet !== undefined) {
        updateData.stateConditionsMet = params.stateConditionsMet;
      }
      
      if (params.temporalConditionsMet !== undefined) {
        updateData.temporalConditionsMet = params.temporalConditionsMet;
      }

      await db.update(automationExecutions)
        .set(updateData)
        .where(eq(automationExecutions.id, executionId));

      console.log(`[AutomationAuditService] Updated condition results for execution ${executionId}:`, params);
    } catch (error) {
      console.error(`[AutomationAuditService] Failed to update condition results for execution ${executionId}:`, error);
      throw error;
    }
  }

  /**
   * Record action execution start
   * @param params Parameters for starting action execution
   * @returns Promise<string> The action execution ID
   */
  async startActionExecution(params: StartActionExecutionParams): Promise<string> {
    try {
      const actionExecutionId = crypto.randomUUID();
      const now = new Date();
      
      await db.insert(automationActionExecutions).values({
        id: actionExecutionId,
        executionId: params.executionId,
        actionIndex: params.actionIndex,
        actionType: params.actionType,
        actionParams: params.actionParams,
        status: ActionExecutionStatus.SUCCESS, // Will be updated on completion
        retryCount: 0,
        startedAt: now, // Use Date object for timestamp_ms mode
        completedAt: null,
        errorMessage: null,
        executionDurationMs: null,
        resultData: null,
      });

      console.log(`[AutomationAuditService] Started action execution tracking: ${actionExecutionId} (${params.actionType}) for execution ${params.executionId}`);
      return actionExecutionId;
    } catch (error) {
      console.error(`[AutomationAuditService] Failed to start action execution tracking:`, error);
      throw error;
    }
  }

  /**
   * Record action execution completion
   * @param actionExecutionId The action execution ID
   * @param params Completion parameters
   */
  async completeActionExecution(
    actionExecutionId: string, 
    params: CompleteActionExecutionParams
  ): Promise<void> {
    try {
      const now = new Date();
      
      await db.update(automationActionExecutions)
        .set({
          status: params.status,
          errorMessage: params.errorMessage || null,
          retryCount: params.retryCount || 0,
          resultData: params.resultData || null,
          executionDurationMs: params.executionDurationMs || null,
          completedAt: now, // Use Date object for timestamp_ms mode
        })
        .where(eq(automationActionExecutions.id, actionExecutionId));

      console.log(`[AutomationAuditService] Completed action execution ${actionExecutionId}: ${params.status}`);
    } catch (error) {
      console.error(`[AutomationAuditService] Failed to complete action execution ${actionExecutionId}:`, error);
      throw error;
    }
  }

  /**
   * Complete overall execution tracking
   * @param executionId The execution ID
   * @param params Completion parameters
   */
  async completeExecution(
    executionId: string, 
    params: CompleteExecutionParams
  ): Promise<void> {
    try {
      await db.update(automationExecutions)
        .set({
          executionStatus: params.executionStatus,
          successfulActions: params.successfulActions,
          failedActions: params.failedActions,
          executionDurationMs: params.executionDurationMs,
        })
        .where(eq(automationExecutions.id, executionId));

      console.log(`[AutomationAuditService] Completed execution ${executionId}: ${params.executionStatus} (${params.successfulActions}/${params.successfulActions + params.failedActions} actions successful)`);
    } catch (error) {
      console.error(`[AutomationAuditService] Failed to complete execution ${executionId}:`, error);
      throw error;
    }
  }

  /**
   * Helper method to determine overall execution status based on action results
   * @param totalActions Total number of actions
   * @param successfulActions Number of successful actions
   * @param failedActions Number of failed actions
   * @returns ExecutionStatus
   */
  static determineExecutionStatus(
    totalActions: number, 
    successfulActions: number, 
    failedActions: number
  ): ExecutionStatus {
    if (failedActions === 0) {
      return ExecutionStatus.SUCCESS;
    } else if (successfulActions > 0) {
      return ExecutionStatus.PARTIAL_FAILURE;
    } else {
      return ExecutionStatus.FAILURE;
    }
  }
}

// Export a singleton instance
export const automationAuditService = new AutomationAuditService(); 