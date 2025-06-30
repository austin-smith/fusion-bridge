import 'server-only';

import { db } from '@/data/db';
import { automations, automationExecutions, automationActionExecutions, connectors, devices, cameraAssociations, areas, areaDevices } from '@/data/db/schema';
import { eq, inArray, and } from 'drizzle-orm';
import type { StandardizedEvent } from '@/types/events';
import type { OrgScopedDb } from '@/lib/db/org-scoped-db';
import type { AutomationConfig, AutomationAction } from '@/lib/automation-schemas';
import { AutomationConfigSchema, SetDeviceStateActionParamsSchema, ArmAreaActionParamsSchema, DisarmAreaActionParamsSchema, SendPushNotificationActionParamsSchema } from '@/lib/automation-schemas';
import { AutomationTriggerType, AutomationActionType } from '@/lib/automation-types';
import { Engine } from 'json-rules-engine';
import type { JsonRuleGroup } from '@/lib/automation-schemas';
import { ActionableState, ArmedState, EVENT_TYPE_DISPLAY_MAP, EVENT_CATEGORY_DISPLAY_MAP, EVENT_SUBTYPE_DISPLAY_MAP } from '@/lib/mappings/definitions';
import { requestDeviceStateChange } from '@/lib/device-actions';
import { getPushoverConfiguration } from '@/data/repositories/service-configurations';
import { sendPushoverNotification } from '@/services/drivers/pushover';
import type { ResolvedPushoverMessageParams } from '@/types/pushover-types';
import { internalSetAreaArmedState } from '@/lib/actions/area-alarm-actions';
import * as piko from '@/services/drivers/piko';
import type { PikoCreateBookmarkPayload } from '@/services/drivers/piko';
import { z } from 'zod';

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

interface ActionExecutionResults {
  successful: number;
  failed: number;
}

/**
 * Resolves tokens in action parameter templates using the provided context
 */
function resolveTokens(
  params: Record<string, unknown> | null | undefined,
  stdEvent: StandardizedEvent | null,
  tokenFactContext: Record<string, any> | null | undefined
): Record<string, unknown> | null | undefined {
  if (params === null || params === undefined) return params;

  const contextForTokenReplacement: Record<string, any> = {
    // Prioritize facts from tokenFactContext
    schedule: tokenFactContext?.schedule ?? null,
    device: tokenFactContext?.device ?? null,
    area: tokenFactContext?.area ?? null,
    location: tokenFactContext?.location ?? null,
    connector: tokenFactContext?.connector ?? null,
    // Use the event context from tokenFactContext if available, otherwise build from stdEvent
    event: tokenFactContext?.event ?? (stdEvent ? {
      id: stdEvent.eventId,
      // Display versions (user-friendly)
      category: EVENT_CATEGORY_DISPLAY_MAP[stdEvent.category] || stdEvent.category,
      type: EVENT_TYPE_DISPLAY_MAP[stdEvent.type] || stdEvent.type,
      subtype: stdEvent.subtype ? (EVENT_SUBTYPE_DISPLAY_MAP[stdEvent.subtype] || stdEvent.subtype) : null,
      // ID versions (backend values)
      categoryId: stdEvent.category,
      typeId: stdEvent.type,
      subtypeId: stdEvent.subtype,
      timestamp: stdEvent.timestamp.toISOString(),
      timestampMs: stdEvent.timestamp.getTime(),
      deviceId: stdEvent.deviceId,
      connectorId: stdEvent.connectorId,
      ...(stdEvent.payload && typeof stdEvent.payload === 'object' ? {
        displayState: (stdEvent.payload as any).displayState,
        statusType: (stdEvent.payload as any).statusType,
        detectionType: (stdEvent.payload as any).detectionType,
        confidence: (stdEvent.payload as any).confidence,
        zone: (stdEvent.payload as any).zone,
        originalEventType: (stdEvent.payload as any).originalEventType,
        rawStateValue: (stdEvent.payload as any).rawStateValue,
        rawStatusValue: (stdEvent.payload as any).rawStatusValue,
        buttonNumber: (stdEvent.payload as any).buttonNumber,
        buttonPressType: (stdEvent.payload as any).pressType,
      } : {}),
    } : null),
  };

  const resolved = { ...params };

  const replaceToken = (template: string): string => {
    if (typeof template !== 'string') return template;
    if (!contextForTokenReplacement) return template;

    return template.replace(/\{\{\s*([^}]+)\s*\}\}/g, (match, path) => {
      const keys = path.trim().split('.');
      let value: unknown = contextForTokenReplacement;
      try {
        for (const key of keys) {
          if (value === null || value === undefined || typeof value !== 'object') {
            console.warn(`[Token Resolve] Cannot access key '${key}' in path '${path}'. Parent not object or null/undefined.`);
            return match;
          }
          if (key in value) value = (value as Record<string, unknown>)[key];
          else { console.warn(`[Token Resolve] Path '${path}' not found (key '${key}' missing).`); return match; }
        }
        if (value === undefined || value === null) return '';
        else if (typeof value === 'object') return JSON.stringify(value);
        else return String(value);
      } catch (e) { console.error(`[Token Resolve] Error resolving path ${path}:`, e); return match; }
    });
  };

  for (const key in resolved) {
    if (Object.prototype.hasOwnProperty.call(resolved, key)) {
      const paramValue = resolved[key];
      if (typeof paramValue === 'string') resolved[key] = replaceToken(paramValue);
      else if (Array.isArray(paramValue) && key === 'headers') {
        resolved[key] = paramValue.map(header => {
          if (typeof header === 'object' && header !== null && 'keyTemplate' in header && 'valueTemplate' in header) {
            return {
              keyTemplate: typeof header.keyTemplate === 'string' ? replaceToken(header.keyTemplate) : header.keyTemplate,
              valueTemplate: typeof header.valueTemplate === 'string' ? replaceToken(header.valueTemplate) : header.valueTemplate,
            };
          }
          return header;
        });
      }
    }
  }
  return resolved;
}

/**
 * Real action executor for organization context
 * Implements actual action execution logic with proper error handling
 */
async function executeAutomationAction(action: AutomationAction, context: Record<string, any>): Promise<void> {
  console.log(`[Automation Action Executor] Executing action type: ${action.type}`);
  
  const stdEvent = context.triggerEvent || null;
  const tokenFactContext = context;

  switch (action.type) {
    case AutomationActionType.CREATE_EVENT: {
      const resolvedParams = resolveTokens(action.params, stdEvent, tokenFactContext) as any;
      
      const targetConnector = await db.query.connectors.findFirst({ 
        where: eq(connectors.id, resolvedParams.targetConnectorId!) 
      });
      if (!targetConnector) throw new Error("Target connector not found for CREATE_EVENT");
      
      const eventTimestamp = stdEvent?.timestamp.toISOString() ?? tokenFactContext.schedule?.triggeredAtUTC ?? new Date().toISOString();
      
      if (targetConnector.category === 'piko') {
        const sourceDeviceInternalId = tokenFactContext.device?.id;
        let associatedPikoCameraExternalIds: string[] = [];
        
        if (sourceDeviceInternalId && typeof sourceDeviceInternalId === 'string') {
          try {
            const associations = await db.select({ pikoCameraInternalId: cameraAssociations.pikoCameraId })
              .from(cameraAssociations)
              .where(eq(cameraAssociations.deviceId, sourceDeviceInternalId));
            const internalCameraIds = associations.map(a => a.pikoCameraInternalId);
            if (internalCameraIds.length > 0) {
              const cameraDevices = await db.select({ externalId: devices.deviceId })
                .from(devices)
                .where(inArray(devices.id, internalCameraIds));
              associatedPikoCameraExternalIds = cameraDevices.map(d => d.externalId);
            }
          } catch (assocError) {
            console.error(`[Automation Action Executor] Error fetching camera associations:`, assocError);
          }
        }

        const pikoPayload: piko.PikoCreateEventPayload = {
          source: resolvedParams.sourceTemplate,
          caption: resolvedParams.captionTemplate,
          description: resolvedParams.descriptionTemplate,
          timestamp: eventTimestamp,
          ...(associatedPikoCameraExternalIds.length > 0 && { metadata: { cameraRefs: associatedPikoCameraExternalIds } })
        };
        await piko.createPikoEvent(targetConnector.id, pikoPayload);
      } else {
        console.warn(`[Automation Action Executor] Unsupported target connector category ${targetConnector.category}`);
        throw new Error(`Unsupported connector category: ${targetConnector.category}`);
      }
      break;
    }

    case AutomationActionType.CREATE_BOOKMARK: {
      const resolvedParams = resolveTokens(action.params, stdEvent, tokenFactContext) as any;
      
      const targetConnector = await db.query.connectors.findFirst({ 
        where: eq(connectors.id, resolvedParams.targetConnectorId!) 
      });
      if (!targetConnector) throw new Error("Target connector not found for CREATE_BOOKMARK");
      
      const eventTimestampMs = stdEvent?.timestamp.getTime() ?? tokenFactContext.schedule?.triggeredAtMs ?? new Date().getTime();
      
      if (targetConnector.category === 'piko') {
        let associatedPikoCameraExternalIds: string[] = [];
        const sourceDeviceInternalId = tokenFactContext.device?.id;
        
        if (sourceDeviceInternalId && typeof sourceDeviceInternalId === 'string') {
          try {
            const associations = await db.select({ pikoCameraInternalId: cameraAssociations.pikoCameraId })
              .from(cameraAssociations)
              .where(eq(cameraAssociations.deviceId, sourceDeviceInternalId));
            const internalCameraIds = associations.map(a => a.pikoCameraInternalId);
            if (internalCameraIds.length === 0) {
              console.warn(`[Automation Action Executor] No Piko cameras associated with source device ${sourceDeviceInternalId}. Skipping.`);
              break;
            }
            const cameraDevices = await db.select({ externalId: devices.deviceId })
              .from(devices)
              .where(inArray(devices.id, internalCameraIds));
            associatedPikoCameraExternalIds = cameraDevices.map(d => d.externalId);
          } catch (assocError) {
            console.error(`[Automation Action Executor] Error fetching camera associations:`, assocError);
            throw new Error(`Failed to fetch camera associations: ${assocError instanceof Error ? assocError.message : String(assocError)}`);
          }
        }
        
        if (associatedPikoCameraExternalIds.length === 0) {
          console.warn(`[Automation Action Executor] No camera associations, skipping bookmark creation.`);
          break;
        }

        let durationMs = 5000;
        try {
          const parsedDuration = parseInt(resolvedParams.durationMsTemplate, 10);
          if (!isNaN(parsedDuration) && parsedDuration > 0) durationMs = parsedDuration;
        } catch {}

        let tags: string[] = [];
        if (resolvedParams.tagsTemplate && resolvedParams.tagsTemplate.trim() !== '') {
          try {
            tags = resolvedParams.tagsTemplate.split(',').map((tag: string) => tag.trim()).filter((tag: string) => tag !== '');
          } catch {}
        }

        for (const pikoCameraDeviceId of associatedPikoCameraExternalIds) {
          const pikoPayload: PikoCreateBookmarkPayload = {
            name: resolvedParams.nameTemplate,
            description: resolvedParams.descriptionTemplate || undefined,
            startTimeMs: eventTimestampMs,
            durationMs: durationMs,
            tags: tags.length > 0 ? tags : undefined
          };
          await piko.createPikoBookmark(targetConnector.id, pikoCameraDeviceId, pikoPayload);
        }
      } else {
        console.warn(`[Automation Action Executor] Unsupported target connector category ${targetConnector.category}`);
        throw new Error(`Unsupported connector category: ${targetConnector.category}`);
      }
      break;
    }

    case AutomationActionType.SEND_HTTP_REQUEST: {
      const resolvedParams = resolveTokens(action.params, stdEvent, tokenFactContext) as any;
      
      const headers = new Headers({ 'User-Agent': 'FusionBridge Automation/1.0' });
      if (Array.isArray(resolvedParams.headers)) {
        for (const header of resolvedParams.headers) {
          if (header.keyTemplate && typeof header.keyTemplate === 'string' && typeof header.valueTemplate === 'string') {
            const key = header.keyTemplate.trim();
            if (key) {
              try {
                headers.set(key, header.valueTemplate);
              } catch (e) {
                console.warn(`[Automation Action Executor] Invalid header name: "${key}". Skipping.`, e);
              }
            }
          }
        }
      }
      
      const fetchOptions: RequestInit = { method: resolvedParams.method, headers: headers };
      if (['POST', 'PUT', 'PATCH'].includes(resolvedParams.method) && resolvedParams.bodyTemplate) {
        if (!headers.has('Content-Type') && resolvedParams.bodyTemplate.trim().startsWith('{')) {
          headers.set('Content-Type', 'application/json');
        }
        fetchOptions.body = resolvedParams.bodyTemplate;
      }
      
      const response = await fetch(resolvedParams.urlTemplate, fetchOptions);
      if (!response.ok) {
        let responseBody = '';
        try {
          responseBody = await response.text();
          console.error(`[Automation Action Executor] Response body (error): ${responseBody.substring(0, 500)}...`);
        } catch {
          console.error(`[Automation Action Executor] Could not read response body on error.`);
        }
        throw new Error(`HTTP request failed with status ${response.status}: ${response.statusText}`);
      }
      break;
    }

    case AutomationActionType.SET_DEVICE_STATE: {
      const params = action.params as z.infer<typeof SetDeviceStateActionParamsSchema>;
      if (!params.targetDeviceInternalId || typeof params.targetDeviceInternalId !== 'string') {
        throw new Error(`Invalid or missing targetDeviceInternalId for setDeviceState action.`);
      }
      if (!params.targetState || !Object.values(ActionableState).includes(params.targetState as ActionableState)) {
        throw new Error(`Invalid or missing targetState for setDeviceState action.`);
      }
      
      console.log(`[Automation Action Executor] Executing setDeviceState. Target: ${params.targetDeviceInternalId}, State: ${params.targetState}`);
      await requestDeviceStateChange(params.targetDeviceInternalId, params.targetState as ActionableState);
      console.log(`[Automation Action Executor] Successfully requested state change for ${params.targetDeviceInternalId} to ${params.targetState}`);
      break;
    }

    case AutomationActionType.SEND_PUSH_NOTIFICATION: {
      const resolvedTemplates = resolveTokens(action.params, stdEvent, tokenFactContext) as z.infer<typeof SendPushNotificationActionParamsSchema>;
      
      const resolvedTitle = resolvedTemplates.titleTemplate;
      const resolvedMessage = resolvedTemplates.messageTemplate;
      const resolvedTargetUserKey = resolvedTemplates.targetUserKeyTemplate;
      
      const pushoverConfig = await getPushoverConfiguration();
      if (!pushoverConfig) throw new Error(`Pushover service is not configured.`);
      if (!pushoverConfig.isEnabled) throw new Error(`Pushover service is disabled.`);
      if (!pushoverConfig.apiToken || !pushoverConfig.groupKey) throw new Error(`Pushover configuration is incomplete.`);
      
      const recipientKey = (resolvedTargetUserKey && resolvedTargetUserKey !== '__all__') ? resolvedTargetUserKey : pushoverConfig.groupKey;
      const pushoverParams: ResolvedPushoverMessageParams = {
        message: resolvedMessage,
        title: resolvedTitle,
        ...((action.params as any).priority !== 0 && { priority: (action.params as any).priority }),
      };
      
      const result = await sendPushoverNotification(pushoverConfig.apiToken, recipientKey, pushoverParams);
      if (!result.success) {
        const errorDetail = result.errors?.join(', ') || result.errorMessage || 'Unknown Pushover API error';
        throw new Error(`Failed to send Pushover notification: ${errorDetail}`);
      }
      console.log(`[Automation Action Executor] Successfully sent Pushover notification.`);
      break;
    }

    case AutomationActionType.ARM_AREA: {
      const params = action.params as z.infer<typeof ArmAreaActionParamsSchema>;
      const { scoping, targetAreaIds: specificAreaIds, armMode } = params;
      let areasToProcess: string[] = [];

      if (scoping === 'SPECIFIC_AREAS') {
        if (!specificAreaIds || specificAreaIds.length === 0) {
          console.warn(`[Automation Action Executor] Scoping is SPECIFIC_AREAS but no targetAreaIds provided. Skipping.`);
          break;
        }
        areasToProcess = specificAreaIds;
      } else if (scoping === 'ALL_AREAS_IN_SCOPE') {
        // For organization context, get all areas in the organization
        const orgAreas = await context.orgDb.areas.findAll();
        areasToProcess = orgAreas.map((a: any) => a.id);
        if (areasToProcess.length === 0) {
          console.log(`[Automation Action Executor] No areas found in organization scope.`);
          break;
        }
      }

      console.log(`[Automation Action Executor] Attempting to arm ${areasToProcess.length} area(s) to mode ${armMode}. IDs: ${areasToProcess.join(', ')}`);
      for (const areaId of areasToProcess) {
        try {
          const updatedArea = await internalSetAreaArmedState(areaId, armMode, {
            lastArmedStateChangeReason: 'automation_arm',
            isArmingSkippedUntil: null,
            nextScheduledArmTime: null,
            nextScheduledDisarmTime: null,
          });
          if (updatedArea) {
            console.log(`[Automation Action Executor] Successfully armed area ${areaId} to ${armMode}.`);
          } else {
            console.warn(`[Automation Action Executor] Failed to arm area ${areaId} to ${armMode} (area not found or no update occurred).`);
          }
        } catch (areaError) {
          console.error(`[Automation Action Executor] Error arming area ${areaId} to ${armMode}:`, areaError instanceof Error ? areaError.message : areaError);
          throw areaError; // Re-throw to mark action as failed
        }
      }
      break;
    }

    case AutomationActionType.DISARM_AREA: {
      const params = action.params as z.infer<typeof DisarmAreaActionParamsSchema>;
      const { scoping, targetAreaIds: specificAreaIds } = params;
      let areasToProcess: string[] = [];

      if (scoping === 'SPECIFIC_AREAS') {
        if (!specificAreaIds || specificAreaIds.length === 0) {
          console.warn(`[Automation Action Executor] Scoping is SPECIFIC_AREAS but no targetAreaIds provided. Skipping.`);
          break;
        }
        areasToProcess = specificAreaIds;
      } else if (scoping === 'ALL_AREAS_IN_SCOPE') {
        // For organization context, get all areas in the organization
        const orgAreas = await context.orgDb.areas.findAll();
        areasToProcess = orgAreas.map((a: any) => a.id);
        if (areasToProcess.length === 0) {
          console.log(`[Automation Action Executor] No areas found in organization scope.`);
          break;
        }
      }

      console.log(`[Automation Action Executor] Attempting to disarm ${areasToProcess.length} area(s). IDs: ${areasToProcess.join(', ')}`);
      for (const areaId of areasToProcess) {
        try {
          const updatedArea = await internalSetAreaArmedState(areaId, ArmedState.DISARMED, {
            lastArmedStateChangeReason: 'automation_disarm',
            isArmingSkippedUntil: null,
            nextScheduledArmTime: null,
            nextScheduledDisarmTime: null,
          });
          if (updatedArea) {
            console.log(`[Automation Action Executor] Successfully disarmed area ${areaId}.`);
          } else {
            console.warn(`[Automation Action Executor] Failed to disarm area ${areaId} (area not found or no update occurred).`);
          }
        } catch (areaError) {
          console.error(`[Automation Action Executor] Error disarming area ${areaId}:`, areaError instanceof Error ? areaError.message : areaError);
          throw areaError; // Re-throw to mark action as failed
        }
      }
      break;
    }

    default:
      console.warn(`[Automation Action Executor] Unknown action type: ${(action as any).type}`);
      throw new Error(`Unhandled action type: ${(action as any).type}`);
  }
  
  console.log(`[Automation Action Executor] Successfully executed action type: ${action.type}`);
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
      
      // Create execution record with correct total actions count
      const executionId = await this.createExecutionRecord(automation.id, config.actions.length, event.eventId);
      
      // Build rich context for action execution including device information
      const actionContext = await this.buildActionContext(event, automation);
      
      // Execute actions with organization-scoped permissions
      const actionResults = await this.executeActions(config.actions, executionId, actionContext);
      
      // Complete execution with final counts
      await this.completeExecution(executionId, actionResults);
      console.log(`[Automation Context][${this.organizationId}] Successfully executed automation: ${automation.name}`);
      
    } catch (error) {
      console.error(`[Automation Context][${this.organizationId}] Error executing automation ${automation.name}:`, error);
      // If we have an executionId, mark it as failed, otherwise just log
      // (executionId might not exist if error occurred before creation)
    }
  }

  /**
   * Execute a scheduled automation
   */
  private async executeScheduledAutomation(automation: OrganizationAutomation, currentTime: Date): Promise<void> {
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
      
      // Create execution record with correct total actions count
      const executionId = await this.createExecutionRecord(automation.id, config.actions.length);
      
      // Execute actions with organization-scoped permissions
      const actionResults = await this.executeActions(config.actions, executionId, { currentTime });
      
      // Complete execution with final counts
      await this.completeExecution(executionId, actionResults);
      console.log(`[Automation Context][${this.organizationId}] Successfully executed scheduled automation: ${automation.name}`);
      
    } catch (error) {
      console.error(`[Automation Context][${this.organizationId}] Error executing scheduled automation ${automation.name}:`, error);
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
      
      // Create facts object with flattened structure for json-rules-engine
      const facts: Record<string, any> = {
        // Nested facts flattened with dot notation
        'event.category': event.category,
        'event.type': event.type,
        'event.subtype': event.subtype,
        'event.displayState': (event.payload as any)?.displayState,
        'event.originalEventType': (event.payload as any)?.originalEventType,
        'event.buttonNumber': this.getValidButtonNumber(event.payload),
        'event.buttonPressType': this.getValidButtonPressType(event.payload),
        
        'device.id': event.deviceId,
        'device.externalId': event.deviceId,
        'device.type': event.deviceInfo?.type,
        'device.subtype': event.deviceInfo?.subtype,
        
        'connector.id': event.connectorId,
        
        // Legacy flat structure for backward compatibility
        eventType: event.type,
        eventCategory: event.category,
        eventSubtype: event.subtype,
        deviceId: event.deviceId,
        connectorId: event.connectorId,
        timestamp: event.timestamp,
        payload: event.payload || {},
        deviceInfo: event.deviceInfo || {}
      };
      
      // Remove undefined values to avoid json-rules-engine issues
      Object.keys(facts).forEach(key => {
        if (facts[key] === undefined) {
          delete facts[key];
        }
      });
      
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
   * Build rich action context including device, area, location, and connector information
   */
  private async buildActionContext(event: StandardizedEvent, automation: OrganizationAutomation): Promise<Record<string, any>> {
    const context: Record<string, any> = {
      triggerEvent: event,
      organizationId: this.organizationId,
      orgDb: this.orgDb
    };

    try {
      // Fetch device information
      const deviceRecord = await db.query.devices.findFirst({
        where: and(
          eq(devices.connectorId, event.connectorId),
          eq(devices.deviceId, event.deviceId)
        ),
        columns: {
          id: true,
          name: true,
          standardizedDeviceType: true,
          standardizedDeviceSubtype: true,
          vendor: true,
          model: true,
          status: true,
          batteryPercentage: true
        }
      });

      if (deviceRecord) {
        context.device = {
          id: deviceRecord.id,
          name: deviceRecord.name,
          type: deviceRecord.standardizedDeviceType,
          subtype: deviceRecord.standardizedDeviceSubtype,
          vendor: deviceRecord.vendor,
          model: deviceRecord.model,
          status: deviceRecord.status,
          batteryPercentage: deviceRecord.batteryPercentage
        };

        // Fetch area and location information if device is associated
        const areaAssociation = await db.query.areaDevices.findFirst({
          where: eq(areaDevices.deviceId, deviceRecord.id),
          with: {
            area: {
              with: {
                location: true
              }
            }
          }
        });

        if (areaAssociation?.area) {
          context.area = {
            id: areaAssociation.area.id,
            name: areaAssociation.area.name,
            armedState: areaAssociation.area.armedState,
            locationId: areaAssociation.area.locationId
          };

          if (areaAssociation.area.location) {
            context.location = {
              id: areaAssociation.area.location.id,
              name: areaAssociation.area.location.name,
              timeZone: areaAssociation.area.location.timeZone,
              addressCity: areaAssociation.area.location.addressCity,
              addressState: areaAssociation.area.location.addressState
            };
          }
        }
      } else {
        // Device not found in database, use event info as fallback
        context.device = {
          id: null,
          name: event.deviceId, // Use external ID as fallback name
          type: event.deviceInfo?.type || null,
          subtype: event.deviceInfo?.subtype || null,
          vendor: null,
          model: null,
          status: null,
          batteryPercentage: null
        };
      }

      // Fetch connector information
      const connectorRecord = await db.query.connectors.findFirst({
        where: eq(connectors.id, event.connectorId),
        columns: {
          id: true,
          name: true,
          category: true
        }
      });

      if (connectorRecord) {
        context.connector = {
          id: connectorRecord.id,
          name: connectorRecord.name,
          category: connectorRecord.category
        };
      }

      // Add event context for easy access
      context.event = {
        id: event.eventId,
        // Display versions (user-friendly)
        category: EVENT_CATEGORY_DISPLAY_MAP[event.category] || event.category,
        type: EVENT_TYPE_DISPLAY_MAP[event.type] || event.type,
        subtype: event.subtype ? (EVENT_SUBTYPE_DISPLAY_MAP[event.subtype] || event.subtype) : null,
        // ID versions (backend values)
        categoryId: event.category,
        typeId: event.type,
        subtypeId: event.subtype,
        timestamp: event.timestamp.toISOString(),
        timestampMs: event.timestamp.getTime(),
        deviceId: event.deviceId,
        connectorId: event.connectorId,
        ...(event.payload && typeof event.payload === 'object' ? {
          displayState: (event.payload as any).displayState,
          statusType: (event.payload as any).statusType,
          detectionType: (event.payload as any).detectionType,
          confidence: (event.payload as any).confidence,
          zone: (event.payload as any).zone,
          originalEventType: (event.payload as any).originalEventType,
          rawStateValue: (event.payload as any).rawStateValue,
          rawStatusValue: (event.payload as any).rawStatusValue,
          buttonNumber: (event.payload as any).buttonNumber,
          buttonPressType: (event.payload as any).pressType,
        } : {})
      };

    } catch (error) {
      console.error(`[Automation Context][${this.organizationId}] Error building action context:`, error);
      // Continue with minimal context on error
      context.device = {
        id: null,
        name: event.deviceId,
        type: event.deviceInfo?.type || null,
        subtype: event.deviceInfo?.subtype || null
      };
    }

    return context;
  }

  /**
   * Execute automation actions with organization-scoped permissions
   */
  private async executeActions(actions: AutomationAction[], executionId: string, context: Record<string, any>): Promise<ActionExecutionResults> {
    console.log(`[Automation Context][${this.organizationId}] Executing ${actions.length} actions for execution: ${executionId}`);
    
    if (actions.length === 0) {
      console.warn(`[Automation Context][${this.organizationId}] No actions to execute for execution: ${executionId}`);
      return { successful: 0, failed: 0 };
    }
    
    let successful = 0;
    let failed = 0;
    
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      
      try {
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
          successful++;
          
        } catch (execError) {
          console.error(`[Automation Context][${this.organizationId}] Error executing action ${i} (${action.type}):`, execError);
          await this.markActionExecutionFailure(actionExecutionId, execError);
          failed++;
        }
        
      } catch (recordError) {
        console.error(`[Automation Context][${this.organizationId}] Error creating action execution record for action ${i} (${action.type}):`, recordError);
        failed++;
      }
    }
    
    return { successful, failed };
  }

  /**
   * Create organization-scoped execution record
   */
  private async createExecutionRecord(automationId: string, totalActions: number, triggerEventId?: string): Promise<string> {
    const executionData = {
      automationId,
      triggerTimestamp: new Date(),
      triggerEventId: triggerEventId || null,
      triggerContext: {}, // Will be populated with facts
      executionStatus: 'running' as const,
      totalActions: totalActions,
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
      actionParams: action.params || {},
      status: 'running' as const,
      retryCount: 0,
      startedAt: new Date()
    };
    
    try {
      const result = await db.insert(automationActionExecutions)
        .values(actionData)
        .returning({ id: automationActionExecutions.id });
      
      return result[0].id;
      
    } catch (dbError) {
      console.error(`[Automation Context][${this.organizationId}] Database error inserting action execution record:`, dbError);
      throw dbError;
    }
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
   * Complete execution with final action counts
   */
  private async completeExecution(executionId: string, results: ActionExecutionResults): Promise<void> {
    const executionStatus = results.failed === 0 ? 'success' : 
                          results.successful > 0 ? 'partial_failure' : 'failure';
    
    await db.update(automationExecutions)
      .set({
        executionStatus: executionStatus,
        successfulActions: results.successful,
        failedActions: results.failed,
        executionDurationMs: Date.now() - new Date().getTime() // Will be calculated properly later
      })
      .where(eq(automationExecutions.id, executionId));
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

  /**
   * Validate and extract button number from event payload
   */
  private getValidButtonNumber(payload: any): number | undefined {
    if (payload && typeof payload.buttonNumber === 'number' && payload.buttonNumber >= 1 && payload.buttonNumber <= 8) {
      return payload.buttonNumber;
    }
    return undefined;
  }

  /**
   * Validate and extract button press type from event payload
   */
  private getValidButtonPressType(payload: any): string | undefined {
    if (payload && typeof payload.pressType === 'string' && ['Press', 'LongPress'].includes(payload.pressType)) {
      return payload.pressType;
    }
    return undefined;
  }
}

/**
 * Create an organization-scoped automation context
 */
export function createOrganizationAutomationContext(organizationId: string, orgDb: OrgScopedDb): OrganizationAutomationContext {
  return new OrganizationAutomationContext(organizationId, orgDb);
} 