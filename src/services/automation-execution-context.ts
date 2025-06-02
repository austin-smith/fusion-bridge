import 'server-only';

import { db } from '@/data/db';
import { automations, automationExecutions, automationActionExecutions } from '@/data/db/schema';
import { eq } from 'drizzle-orm';
import type { StandardizedEvent } from '@/types/events';
import type { OrgScopedDb } from '@/lib/db/org-scoped-db';
import type { AutomationConfig, AutomationAction } from '@/lib/automation-schemas';
import { AutomationConfigSchema } from '@/lib/automation-schemas';
import { AutomationTriggerType } from '@/lib/automation-types';
import { Engine } from 'json-rules-engine';
import type { JsonRuleGroup } from '@/lib/automation-schemas';

export interface OrganizationAutomation {
  id: string;
  name: string;
  enabled: boolean;
  configJson: AutomationConfig;
  organizationId: string;
  locationScopeId: string | null;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Placeholder action executor - will integrate with existing automation service logic
 */
async function executeAutomationAction(action: AutomationAction, context: Record<string, any>): Promise<void> {
  console.log(`[Automation Action Executor] Executing action type: ${action.type}`);
  // TODO: Integrate with existing automation service action execution logic
  // For now, this is a placeholder to fix the import error
  throw new Error(`Action execution not yet implemented for organization context: ${action.type}`);
}

/**
 * Organization-scoped automation execution context
 * Provides complete isolation and security for automation processing
 */
export class OrganizationAutomationContext {
  constructor(
    private readonly organizationId: string,
    private readonly orgDb: OrgScopedDb
  ) {}

  /**
   * Process an event for this organization's automations
   */
  async processEvent(event: StandardizedEvent): Promise<void> {
    console.log(`[Automation Context][${this.organizationId}] Processing event: ${event.eventId}`);
    
    try {
      // Get organization-scoped enabled automations
      const enabledAutomations = await this.getEnabledAutomations();
      
      if (enabledAutomations.length === 0) {
        console.log(`[Automation Context][${this.organizationId}] No enabled automations found`);
        return;
      }

      console.log(`[Automation Context][${this.organizationId}] Found ${enabledAutomations.length} enabled automations`);
      
      // Process each automation in isolation
      await Promise.allSettled(
        enabledAutomations.map(automation => this.executeAutomationSafely(automation, event))
      );
      
    } catch (error) {
      console.error(`[Automation Context][${this.organizationId}] Error processing event ${event.eventId}:`, error);
    }
  }

  /**
   * Process scheduled automations for this organization
   */
  async processScheduledAutomations(currentTime: Date): Promise<void> {
    console.log(`[Automation Context][${this.organizationId}] Processing scheduled automations at ${currentTime.toISOString()}`);
    
    try {
      // Get enabled automations with scheduled triggers
      const allAutomations = await this.getEnabledAutomations();
      const scheduledAutomations = allAutomations.filter(automation => {
        try {
          const parseResult = AutomationConfigSchema.safeParse(automation.configJson);
          return parseResult.success && parseResult.data.trigger.type === AutomationTriggerType.SCHEDULED;
        } catch {
          return false;
        }
      });

      if (scheduledAutomations.length === 0) {
        console.log(`[Automation Context][${this.organizationId}] No scheduled automations found`);
        return;
      }

      console.log(`[Automation Context][${this.organizationId}] Found ${scheduledAutomations.length} scheduled automations`);
      
      // Process each scheduled automation
      await Promise.allSettled(
        scheduledAutomations.map(automation => this.executeScheduledAutomation(automation, currentTime))
      );
      
    } catch (error) {
      console.error(`[Automation Context][${this.organizationId}] Error processing scheduled automations:`, error);
    }
  }

  /**
   * Safely execute a single automation with full error isolation
   */
  private async executeAutomationSafely(automation: OrganizationAutomation, event: StandardizedEvent): Promise<void> {
    const executionId = await this.createExecutionRecord(automation.id, event.eventId);
    
    try {
      console.log(`[Automation Context][${this.organizationId}] Evaluating automation: ${automation.name} (${automation.id})`);
      
      // Parse and validate automation config
      const parseResult = AutomationConfigSchema.safeParse(automation.configJson);
      if (!parseResult.success) {
        throw new Error(`Invalid automation configuration: ${parseResult.error.message}`);
      }
      
      const config = parseResult.data;
      
      // Only process event-triggered automations here
      if (config.trigger.type !== AutomationTriggerType.EVENT) {
        console.log(`[Automation Context][${this.organizationId}] Skipping non-event automation: ${automation.name}`);
        return;
      }
      
      // Evaluate triggers within organization context
      const shouldExecute = await this.evaluateEventTriggers(config.trigger.conditions, event);
      
      if (!shouldExecute) {
        console.log(`[Automation Context][${this.organizationId}] Trigger conditions not met for: ${automation.name}`);
        return;
      }
      
      console.log(`[Automation Context][${this.organizationId}] Executing automation: ${automation.name}`);
      
      // Execute actions with organization-scoped permissions
      await this.executeActions(config.actions, executionId, { triggerEvent: event });
      
      await this.markExecutionSuccess(executionId);
      console.log(`[Automation Context][${this.organizationId}] Successfully executed automation: ${automation.name}`);
      
    } catch (error) {
      console.error(`[Automation Context][${this.organizationId}] Error executing automation ${automation.name}:`, error);
      await this.handleExecutionError(executionId, error);
    }
  }

  /**
   * Execute a scheduled automation
   */
  private async executeScheduledAutomation(automation: OrganizationAutomation, currentTime: Date): Promise<void> {
    const executionId = await this.createExecutionRecord(automation.id);
    
    try {
      console.log(`[Automation Context][${this.organizationId}] Evaluating scheduled automation: ${automation.name}`);
      
      // Parse and validate automation config
      const parseResult = AutomationConfigSchema.safeParse(automation.configJson);
      if (!parseResult.success) {
        throw new Error(`Invalid automation configuration: ${parseResult.error.message}`);
      }
      
      const config = parseResult.data;
      
      // Evaluate schedule trigger
      const shouldExecute = await this.evaluateScheduleTrigger(config, automation, currentTime);
      
      if (!shouldExecute) {
        console.log(`[Automation Context][${this.organizationId}] Schedule conditions not met for: ${automation.name}`);
        return;
      }
      
      console.log(`[Automation Context][${this.organizationId}] Executing scheduled automation: ${automation.name}`);
      
      // Execute actions with organization-scoped permissions
      await this.executeActions(config.actions, executionId, { currentTime });
      
      await this.markExecutionSuccess(executionId);
      console.log(`[Automation Context][${this.organizationId}] Successfully executed scheduled automation: ${automation.name}`);
      
    } catch (error) {
      console.error(`[Automation Context][${this.organizationId}] Error executing scheduled automation ${automation.name}:`, error);
      await this.handleExecutionError(executionId, error);
    }
  }

  /**
   * Get enabled automations for this organization
   */
  private async getEnabledAutomations(): Promise<OrganizationAutomation[]> {
    const results = await this.orgDb.automations.findEnabled();
    return results as OrganizationAutomation[];
  }

  /**
   * Evaluate event-based trigger conditions using json-rules-engine
   */
  private async evaluateEventTriggers(conditions: JsonRuleGroup, event: StandardizedEvent): Promise<boolean> {
    try {
      const engine = new Engine();
      
      // Convert our conditions to json-rules-engine format
      const rule = {
        conditions: conditions,
        event: { type: 'automation-trigger' }
      };
      
      engine.addRule(rule as any); // Type assertion to bypass complex type validation
      
      // Create facts object from the standardized event
      const facts = {
        eventType: event.type,
        eventCategory: event.category, // Fixed: use 'category' not 'eventCategory'
        eventSubtype: event.subtype,   // Fixed: use 'subtype' not 'eventSubtype'
        deviceId: event.deviceId,
        connectorId: event.connectorId,
        timestamp: event.timestamp,
        payload: event.payload || {},
        deviceInfo: event.deviceInfo || {}
      };
      
      const results = await engine.run(facts);
      return results.events.length > 0;
      
    } catch (error) {
      console.error(`[Automation Context][${this.organizationId}] Error evaluating trigger conditions:`, error);
      return false;
    }
  }

  /**
   * Evaluate scheduled trigger conditions (placeholder for now)
   */
  private async evaluateScheduleTrigger(config: AutomationConfig, automation: OrganizationAutomation, currentTime: Date): Promise<boolean> {
    // TODO: Implement proper schedule evaluation logic
    // For now, return false to avoid unintended executions
    console.log(`[Automation Context][${this.organizationId}] Schedule evaluation not yet implemented for: ${automation.name}`);
    return false;
  }

  /**
   * Execute automation actions with organization-scoped permissions
   */
  private async executeActions(actions: AutomationAction[], executionId: string, context: Record<string, any>): Promise<void> {
    console.log(`[Automation Context][${this.organizationId}] Executing ${actions.length} actions for execution: ${executionId}`);
    
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      const actionExecutionId = await this.createActionExecutionRecord(executionId, i, action);
      
      try {
        const startTime = Date.now();
        
        // Execute action with organization context
        await executeAutomationAction(action, {
          organizationId: this.organizationId,
          orgDb: this.orgDb,
          ...context
        });
        
        const duration = Date.now() - startTime;
        await this.markActionExecutionSuccess(actionExecutionId, duration);
        
      } catch (error) {
        console.error(`[Automation Context][${this.organizationId}] Error executing action ${i}:`, error);
        await this.markActionExecutionFailure(actionExecutionId, error);
        // Continue with other actions even if one fails
      }
    }
  }

  /**
   * Create organization-scoped execution record
   */
  private async createExecutionRecord(automationId: string, triggerEventId?: string): Promise<string> {
    const executionData = {
      automationId,
      triggerTimestamp: new Date(),
      triggerEventId: triggerEventId || null,
      triggerContext: {}, // Will be populated with facts
      executionStatus: 'running' as const,
      totalActions: 0,
      successfulActions: 0,
      failedActions: 0
    };
    
    const result = await db.insert(automationExecutions)
      .values(executionData)
      .returning({ id: automationExecutions.id });
      
    return result[0].id;
  }

  /**
   * Create action execution record
   */
  private async createActionExecutionRecord(executionId: string, actionIndex: number, action: AutomationAction): Promise<string> {
    const actionData = {
      executionId,
      actionIndex,
      actionType: action.type,
      actionParams: action.params,
      status: 'running' as const,
      retryCount: 0,
      startedAt: new Date()
    };
    
    const result = await db.insert(automationActionExecutions)
      .values(actionData)
      .returning({ id: automationActionExecutions.id });
      
    return result[0].id;
  }

  /**
   * Mark execution as successful
   */
  private async markExecutionSuccess(executionId: string): Promise<void> {
    await db.update(automationExecutions)
      .set({
        executionStatus: 'success',
        executionDurationMs: Date.now() - new Date().getTime() // Will be calculated properly
      })
      .where(eq(automationExecutions.id, executionId));
  }

  /**
   * Mark action execution as successful
   */
  private async markActionExecutionSuccess(actionExecutionId: string, durationMs: number): Promise<void> {
    await db.update(automationActionExecutions)
      .set({
        status: 'success',
        executionDurationMs: durationMs,
        completedAt: new Date()
      })
      .where(eq(automationActionExecutions.id, actionExecutionId));
  }

  /**
   * Mark action execution as failed
   */
  private async markActionExecutionFailure(actionExecutionId: string, error: any): Promise<void> {
    await db.update(automationActionExecutions)
      .set({
        status: 'failure',
        errorMessage: error instanceof Error ? error.message : String(error),
        completedAt: new Date()
      })
      .where(eq(automationActionExecutions.id, actionExecutionId));
  }

  /**
   * Handle execution errors with organization-scoped logging
   */
  private async handleExecutionError(executionId: string, error: any): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    await db.update(automationExecutions)
      .set({
        executionStatus: 'failure'
      })
      .where(eq(automationExecutions.id, executionId));
    
    // TODO: Implement organization-specific error notification
    console.error(`[Automation Context][${this.organizationId}] Execution ${executionId} failed: ${errorMessage}`);
  }
}

/**
 * Create an organization-scoped automation context
 */
export function createOrganizationAutomationContext(organizationId: string, orgDb: OrgScopedDb): OrganizationAutomationContext {
  return new OrganizationAutomationContext(organizationId, orgDb);
} 