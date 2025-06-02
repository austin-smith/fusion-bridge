import 'server-only';

import { db } from '@/data/db';
import { automationExecutions, automationActionExecutions, automations } from '@/data/db/schema';
import { eq, desc, and, gte, lte, count, sql } from 'drizzle-orm';
import type { ExecutionStatus, ActionExecutionStatus } from '@/lib/automation-audit-types';

export interface AutomationExecutionSummary {
  id: string;
  automationId: string;
  automationName: string;
  triggerTimestamp: Date;
  triggerEventId?: string;
  executionStatus: ExecutionStatus;
  executionDurationMs?: number;
  totalActions: number;
  successfulActions: number;
  failedActions: number;
  stateConditionsMet?: boolean;
  temporalConditionsMet?: boolean;
}

export interface AutomationActionExecutionDetail {
  id: string;
  actionIndex: number;
  actionType: string;
  actionParams: Record<string, any>;
  status: ActionExecutionStatus;
  errorMessage?: string;
  retryCount: number;
  executionDurationMs?: number;
  startedAt: Date;
  completedAt?: Date;
}

export interface AutomationExecutionDetail extends AutomationExecutionSummary {
  triggerContext: Record<string, any>;
  actions: AutomationActionExecutionDetail[];
}

export interface ExecutionStatsFilter {
  automationId?: string;
  startDate?: Date;
  endDate?: Date;
  status?: ExecutionStatus;
}

export interface ExecutionStats {
  totalExecutions: number;
  successfulExecutions: number;
  partialFailureExecutions: number;
  failedExecutions: number;
  averageExecutionTimeMs?: number;
  totalActions: number;
  successfulActions: number;
  failedActions: number;
}

export class AutomationAuditQueryService {
  /**
   * Get recent automation executions with pagination (organization-scoped)
   */
  async getRecentExecutions(
    limit: number = 50,
    offset: number = 0,
    automationId?: string,
    organizationId?: string
  ): Promise<AutomationExecutionSummary[]> {
    try {
      const conditions = [];
      
      // Filter by organization if provided
      if (organizationId) {
        conditions.push(eq(automations.organizationId, organizationId));
      }
      
      // Filter by specific automation if provided
      if (automationId) {
        conditions.push(eq(automationExecutions.automationId, automationId));
      }
      
      const results = await db
        .select({
          id: automationExecutions.id,
          automationId: automationExecutions.automationId,
          automationName: automations.name,
          triggerTimestamp: automationExecutions.triggerTimestamp,
          triggerEventId: automationExecutions.triggerEventId,
          executionStatus: automationExecutions.executionStatus,
          executionDurationMs: automationExecutions.executionDurationMs,
          totalActions: automationExecutions.totalActions,
          successfulActions: automationExecutions.successfulActions,
          failedActions: automationExecutions.failedActions,
          stateConditionsMet: automationExecutions.stateConditionsMet,
          temporalConditionsMet: automationExecutions.temporalConditionsMet,
        })
        .from(automationExecutions)
        .innerJoin(automations, eq(automationExecutions.automationId, automations.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(automationExecutions.triggerTimestamp))
        .limit(limit)
        .offset(offset);

      return results.map(row => ({
        id: row.id,
        automationId: row.automationId,
        automationName: row.automationName,
        triggerTimestamp: new Date(row.triggerTimestamp),
        triggerEventId: row.triggerEventId || undefined,
        executionStatus: row.executionStatus as ExecutionStatus,
        executionDurationMs: row.executionDurationMs || undefined,
        totalActions: row.totalActions,
        successfulActions: row.successfulActions,
        failedActions: row.failedActions,
        stateConditionsMet: row.stateConditionsMet !== null ? Boolean(row.stateConditionsMet) : undefined,
        temporalConditionsMet: row.temporalConditionsMet !== null ? Boolean(row.temporalConditionsMet) : undefined,
      }));
    } catch (error) {
      console.error('[AutomationAuditQueryService] Error fetching recent executions:', error);
      return [];
    }
  }

  /**
   * Get detailed execution information including all actions (organization-scoped)
   */
  async getExecutionDetail(executionId: string, organizationId?: string): Promise<AutomationExecutionDetail | null> {
    try {
      const conditions = [eq(automationExecutions.id, executionId)];
      
      // Filter by organization if provided
      if (organizationId) {
        conditions.push(eq(automations.organizationId, organizationId));
      }
      
      // Get execution summary
      const executionResult = await db
        .select({
          id: automationExecutions.id,
          automationId: automationExecutions.automationId,
          automationName: automations.name,
          triggerTimestamp: automationExecutions.triggerTimestamp,
          triggerEventId: automationExecutions.triggerEventId,
          triggerContext: automationExecutions.triggerContext,
          executionStatus: automationExecutions.executionStatus,
          executionDurationMs: automationExecutions.executionDurationMs,
          totalActions: automationExecutions.totalActions,
          successfulActions: automationExecutions.successfulActions,
          failedActions: automationExecutions.failedActions,
          stateConditionsMet: automationExecutions.stateConditionsMet,
          temporalConditionsMet: automationExecutions.temporalConditionsMet,
        })
        .from(automationExecutions)
        .innerJoin(automations, eq(automationExecutions.automationId, automations.id))
        .where(and(...conditions))
        .limit(1);

      if (executionResult.length === 0) {
        return null;
      }

      const execution = executionResult[0];

      // Get action executions
      const actionResults = await db
        .select({
          id: automationActionExecutions.id,
          actionIndex: automationActionExecutions.actionIndex,
          actionType: automationActionExecutions.actionType,
          actionParams: automationActionExecutions.actionParams,
          status: automationActionExecutions.status,
          errorMessage: automationActionExecutions.errorMessage,
          retryCount: automationActionExecutions.retryCount,
          executionDurationMs: automationActionExecutions.executionDurationMs,
          startedAt: automationActionExecutions.startedAt,
          completedAt: automationActionExecutions.completedAt,
        })
        .from(automationActionExecutions)
        .where(eq(automationActionExecutions.executionId, executionId))
        .orderBy(automationActionExecutions.actionIndex);

      const actions: AutomationActionExecutionDetail[] = actionResults.map(action => ({
        id: action.id,
        actionIndex: action.actionIndex,
        actionType: action.actionType,
        actionParams: action.actionParams,
        status: action.status as ActionExecutionStatus,
        errorMessage: action.errorMessage || undefined,
        retryCount: action.retryCount,
        executionDurationMs: action.executionDurationMs || undefined,
        startedAt: new Date(action.startedAt),
        completedAt: action.completedAt ? new Date(action.completedAt) : undefined,
      }));

      return {
        id: execution.id,
        automationId: execution.automationId,
        automationName: execution.automationName,
        triggerTimestamp: new Date(execution.triggerTimestamp),
        triggerEventId: execution.triggerEventId || undefined,
        triggerContext: execution.triggerContext,
        executionStatus: execution.executionStatus as ExecutionStatus,
        executionDurationMs: execution.executionDurationMs || undefined,
        totalActions: execution.totalActions,
        successfulActions: execution.successfulActions,
        failedActions: execution.failedActions,
        stateConditionsMet: execution.stateConditionsMet !== null ? Boolean(execution.stateConditionsMet) : undefined,
        temporalConditionsMet: execution.temporalConditionsMet !== null ? Boolean(execution.temporalConditionsMet) : undefined,
        actions,
      };
    } catch (error) {
      console.error('[AutomationAuditQueryService] Error fetching execution detail:', error);
      return null;
    }
  }

  /**
   * Get execution statistics for an automation or overall system (organization-scoped)
   */
  async getExecutionStats(filter: ExecutionStatsFilter = {}, organizationId?: string): Promise<ExecutionStats> {
    try {
      const conditions = [];
      
      // Filter by organization if provided
      if (organizationId) {
        conditions.push(eq(automations.organizationId, organizationId));
      }
      
      if (filter.automationId) {
        conditions.push(eq(automationExecutions.automationId, filter.automationId));
      }
      
      if (filter.startDate) {
        conditions.push(gte(automationExecutions.triggerTimestamp, filter.startDate));
      }
      
      if (filter.endDate) {
        conditions.push(lte(automationExecutions.triggerTimestamp, filter.endDate));
      }
      
      if (filter.status) {
        conditions.push(eq(automationExecutions.executionStatus, filter.status));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      // Get overall stats
      const statsResult = await db
        .select({
          totalExecutions: count(),
          successfulExecutions: sql<number>`SUM(CASE WHEN ${automationExecutions.executionStatus} = 'success' THEN 1 ELSE 0 END)`,
          partialFailureExecutions: sql<number>`SUM(CASE WHEN ${automationExecutions.executionStatus} = 'partial_failure' THEN 1 ELSE 0 END)`,
          failedExecutions: sql<number>`SUM(CASE WHEN ${automationExecutions.executionStatus} = 'failure' THEN 1 ELSE 0 END)`,
          averageExecutionTimeMs: sql<number>`AVG(${automationExecutions.executionDurationMs})`,
          totalActions: sql<number>`SUM(${automationExecutions.totalActions})`,
          successfulActions: sql<number>`SUM(${automationExecutions.successfulActions})`,
          failedActions: sql<number>`SUM(${automationExecutions.failedActions})`,
        })
        .from(automationExecutions)
        .innerJoin(automations, eq(automationExecutions.automationId, automations.id))
        .where(whereClause);

      const stats = statsResult[0];

      return {
        totalExecutions: stats.totalExecutions,
        successfulExecutions: Number(stats.successfulExecutions) || 0,
        partialFailureExecutions: Number(stats.partialFailureExecutions) || 0,
        failedExecutions: Number(stats.failedExecutions) || 0,
        averageExecutionTimeMs: stats.averageExecutionTimeMs ? Math.round(Number(stats.averageExecutionTimeMs)) : undefined,
        totalActions: Number(stats.totalActions) || 0,
        successfulActions: Number(stats.successfulActions) || 0,
        failedActions: Number(stats.failedActions) || 0,
      };
    } catch (error) {
      console.error('[AutomationAuditQueryService] Error fetching execution stats:', error);
      return {
        totalExecutions: 0,
        successfulExecutions: 0,
        partialFailureExecutions: 0,
        failedExecutions: 0,
        totalActions: 0,
        successfulActions: 0,
        failedActions: 0,
      };
    }
  }

  /**
   * Get minimal last run info for automation cards (organization-scoped)
   */
  async getLastRunSummary(organizationId?: string): Promise<AutomationExecutionSummary[]> {
    try {
      // Build base conditions
      const baseConditions = [];
      if (organizationId) {
        baseConditions.push(eq(automations.organizationId, organizationId));
      }
      
      // Use a subquery to find the max timestamp per automation within organization, then join back for full data
      const maxTimestampsQuery = db
        .select({
          automationId: automationExecutions.automationId,
          maxTimestamp: sql<number>`MAX(${automationExecutions.triggerTimestamp})`.as('max_timestamp'),
        })
        .from(automationExecutions)
        .innerJoin(automations, eq(automationExecutions.automationId, automations.id))
        .where(baseConditions.length > 0 ? and(...baseConditions) : undefined)
        .groupBy(automationExecutions.automationId)
        .as('max_times');

      const results = await db
        .select({
          id: automationExecutions.id,
          automationId: automationExecutions.automationId,
          automationName: automations.name,
          triggerTimestamp: automationExecutions.triggerTimestamp,
          triggerEventId: automationExecutions.triggerEventId,
          executionStatus: automationExecutions.executionStatus,
          executionDurationMs: automationExecutions.executionDurationMs,
          totalActions: automationExecutions.totalActions,
          successfulActions: automationExecutions.successfulActions,
          failedActions: automationExecutions.failedActions,
          stateConditionsMet: automationExecutions.stateConditionsMet,
          temporalConditionsMet: automationExecutions.temporalConditionsMet,
        })
        .from(automationExecutions)
        .innerJoin(automations, eq(automationExecutions.automationId, automations.id))
        .innerJoin(
          maxTimestampsQuery,
          and(
            eq(automationExecutions.automationId, maxTimestampsQuery.automationId),
            eq(automationExecutions.triggerTimestamp, maxTimestampsQuery.maxTimestamp)
          )
        );

      return results.map(row => ({
        id: row.id,
        automationId: row.automationId,
        automationName: row.automationName,
        triggerTimestamp: new Date(row.triggerTimestamp),
        triggerEventId: row.triggerEventId || undefined,
        executionStatus: row.executionStatus as ExecutionStatus,
        executionDurationMs: row.executionDurationMs || undefined,
        totalActions: row.totalActions,
        successfulActions: row.successfulActions,
        failedActions: row.failedActions,
        stateConditionsMet: row.stateConditionsMet !== null ? Boolean(row.stateConditionsMet) : undefined,
        temporalConditionsMet: row.temporalConditionsMet !== null ? Boolean(row.temporalConditionsMet) : undefined,
      }));
    } catch (error) {
      console.error('[AutomationAuditQueryService] Error fetching last run summary:', error);
      return [];
    }
  }

  /**
   * Get execution count for pagination (organization-scoped)
   */
  async getExecutionCount(automationId?: string, organizationId?: string): Promise<number> {
    try {
      const conditions = [];
      
      // Filter by organization if provided
      if (organizationId) {
        conditions.push(eq(automations.organizationId, organizationId));
      }
      
      // Filter by specific automation if provided
      if (automationId) {
        conditions.push(eq(automationExecutions.automationId, automationId));
      }
      
      const result = await db
        .select({ count: count() })
        .from(automationExecutions)
        .innerJoin(automations, eq(automationExecutions.automationId, automations.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined);

      return result[0]?.count || 0;
    } catch (error) {
      console.error('[AutomationAuditQueryService] Error fetching execution count:', error);
      return 0;
    }
  }
}

// Export singleton instance
export const automationAuditQueryService = new AutomationAuditQueryService(); 