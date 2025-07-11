import 'server-only';

import { db } from '@/data/db';
import { automations, automationExecutions, automationActionExecutions, connectors, devices, cameraAssociations, areas, areaDevices, locations } from '@/data/db/schema';
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
import type { ThumbnailContext } from '@/types/automation-thumbnails';
import { createEmptyThumbnailContext } from '@/types/automation-thumbnails';
import { evaluateAutomationTimeFilter } from '@/lib/automation-time-evaluator';
import { CronExpressionParser } from 'cron-parser';
import { formatInTimeZone, toZonedTime } from 'date-fns-tz';
import { parse, format } from 'date-fns';

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
  tokenFactContext: Record<string, any> | null | undefined,
  thumbnailContext: ThumbnailContext | null = null
): Record<string, unknown> | null | undefined {
  if (params === null || params === undefined) return params;

  // Create thumbnail context if not provided
  const thumbnailCtx = thumbnailContext || createEmptyThumbnailContext();

  const contextForTokenReplacement: Record<string, any> = {
    // Prioritize facts from tokenFactContext
    schedule: tokenFactContext?.schedule ?? null,
    device: tokenFactContext?.device ?? null,
    area: tokenFactContext?.area ?? null,
    location: tokenFactContext?.location ?? null,
    connector: tokenFactContext?.connector ?? null,
    // Use the event context from tokenFactContext if available (preferred), otherwise build from stdEvent
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
      // Thumbnail data
      thumbnail: thumbnailCtx.dataUri || '',
      ...(stdEvent.payload && typeof stdEvent.payload === 'object' ? {
        displayState: (stdEvent.payload as any).displayState,
      } : {}),
    } : {
      // For cases without stdEvent, still provide thumbnail data
      thumbnail: thumbnailCtx.dataUri || '',
    }),
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
  const thumbnailContext = context.thumbnailContext || createEmptyThumbnailContext();

  switch (action.type) {
    case AutomationActionType.CREATE_EVENT: {
      const resolvedParams = resolveTokens(action.params, stdEvent, tokenFactContext, thumbnailContext) as any;
      
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
      const resolvedParams = resolveTokens(action.params, stdEvent, tokenFactContext, thumbnailContext) as any;
      
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
      const resolvedParams = resolveTokens(action.params, stdEvent, tokenFactContext, thumbnailContext) as any;
      
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
      const resolvedTemplates = resolveTokens(action.params, stdEvent, tokenFactContext, thumbnailContext) as z.infer<typeof SendPushNotificationActionParamsSchema>;
      
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

      console.log(`[Automation Action Executor] Attempting to arm ${areasToProcess.length} area(s). IDs: ${areasToProcess.join(', ')}`);
      for (const areaId of areasToProcess) {
        try {
          const updatedArea = await internalSetAreaArmedState(areaId, ArmedState.ARMED, {
            lastArmedStateChangeReason: 'automation_arm',
            isArmingSkippedUntil: null,
            nextScheduledArmTime: null,
            nextScheduledDisarmTime: null,
          });
          if (updatedArea) {
            console.log(`[Automation Action Executor] Successfully armed area ${areaId}.`);
          } else {
            console.warn(`[Automation Action Executor] Failed to arm area ${areaId} (area not found or no update occurred).`);
          }
        } catch (areaError) {
          console.error(`[Automation Action Executor] Error arming area ${areaId}:`, areaError instanceof Error ? areaError.message : areaError);
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
      const shouldExecute = await this.evaluateEventTriggers(config.trigger.conditions, event, { 
        id: automation.id, 
        name: automation.name 
      });
      
      if (!shouldExecute) {
        console.log(`[Automation Context][${this.organizationId}] Trigger conditions not met for: ${automation.name}`);
        return;
      }
      
      // Check time-of-day filter if configured (only on event triggers)
      if (config.trigger.type === AutomationTriggerType.EVENT) {
        const eventTrigger = config.trigger; // TypeScript now knows this is an event trigger
        if (eventTrigger.timeOfDayFilter) {
          const timeFilterPassed = await evaluateAutomationTimeFilter(
            automation.id,
            eventTrigger.timeOfDayFilter,
            event.timestamp, // Use event timestamp as reference
            event.deviceId   // Event's device location context
          );
          
          if (!timeFilterPassed) {
            console.log(`[Automation Context][${this.organizationId}] Time-of-day filter not met for: ${automation.name}`);
            return;
          }
        }
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
      
      // Note: Scheduled automations don't have time-of-day filters since they're already time-based
      // Time-of-day filters are only available on event-based automations
      
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
   * Fetch event context data including device, area, location, and connector information
   * Uses organization-scoped database client for proper access control
   */
  private async fetchEventContextData(event: StandardizedEvent): Promise<{
    deviceRecord: any,
    areaRecord: any,
    locationRecord: any,
    connectorRecord: any
  }> {
    try {
      // Use organization-scoped database client for security
      const deviceResults = await this.orgDb.devices.findByExternalId(event.deviceId);
      const deviceResult = deviceResults[0]; // findByExternalId returns array

      if (!deviceResult) {
        // Device not found in this organization
        return {
          deviceRecord: null,
          areaRecord: null,
          locationRecord: null,
          connectorRecord: null
        };
      }

      // Build structured objects from org-scoped query result
      const deviceRecord = {
        id: deviceResult.id,
        name: deviceResult.name,
        standardizedDeviceType: deviceResult.standardizedDeviceType,
        standardizedDeviceSubtype: deviceResult.standardizedDeviceSubtype,
        vendor: deviceResult.vendor,
        model: deviceResult.model,
        status: deviceResult.status,
        batteryPercentage: deviceResult.batteryPercentage,
      };

             // Area and location data are included in the org-scoped device query
       const areaRecord = deviceResult.areaId ? {
         id: deviceResult.areaId,
         name: undefined as string | undefined,
         armedState: undefined as any,
         locationId: deviceResult.locationId,
       } : null;

       const locationRecord = deviceResult.locationId ? {
         id: deviceResult.locationId,
         name: undefined as string | undefined,
         timeZone: undefined as string | undefined,
         addressCity: undefined as string | undefined,
         addressState: undefined as string | undefined,
       } : null;

      // Connector data is included in the org-scoped device query
      const connectorRecord = {
        id: deviceResult.connector.id,
        name: deviceResult.connector.name,
        category: deviceResult.connector.category,
      };

      // If we need full area/location details, fetch them using org-scoped methods
      if (areaRecord && deviceResult.areaId) {
        try {
          const areaResults = await this.orgDb.areas.findById(deviceResult.areaId);
          const fullArea = areaResults[0];
          if (fullArea) {
            areaRecord.name = fullArea.name;
            areaRecord.armedState = fullArea.armedState;
            
                         // Location details are included in area query
             if (fullArea.location && locationRecord) {
               locationRecord.name = fullArea.location.name;
               
               // Fetch complete location details for automation facts
               try {
                 const locationResults = await this.orgDb.locations.findById(fullArea.location.id);
                 const fullLocation = locationResults[0];
                 if (fullLocation) {
                   locationRecord.timeZone = fullLocation.timeZone;
                   locationRecord.addressCity = fullLocation.addressCity;
                   locationRecord.addressState = fullLocation.addressState;
                 }
               } catch (locationError) {
                 console.warn(`[Automation Context][${this.organizationId}] Failed to fetch location details:`, locationError);
               }
             }
          }
        } catch (areaError) {
          console.warn(`[Automation Context][${this.organizationId}] Failed to fetch area details:`, areaError);
        }
      }

      return { deviceRecord, areaRecord, locationRecord, connectorRecord };

    } catch (contextError) {
      console.warn(`[Automation Context][${this.organizationId}] Failed to fetch context data:`, contextError);
      return {
        deviceRecord: null,
        areaRecord: null,
        locationRecord: null,
        connectorRecord: null
      };
    }
  }

  /**
   * Evaluate event-based trigger conditions using json-rules-engine
   */
  private async evaluateEventTriggers(conditions: JsonRuleGroup, event: StandardizedEvent, automationContext?: { id: string, name: string }): Promise<boolean> {
    // Fetch comprehensive context data
    const { deviceRecord, areaRecord, locationRecord, connectorRecord } = await this.fetchEventContextData(event);

    // Create comprehensive facts object with all available context
    const facts: Record<string, any> = {
      // Event facts
      'event.category': event.category,
      'event.type': event.type,
      'event.subtype': event.subtype,
      'event.displayState': (event.payload as any)?.displayState,
      'event.buttonNumber': this.getValidButtonNumber(event.payload),
      'event.buttonPressType': this.getValidButtonPressType(event.payload),
      
      // Device facts - enhanced with database data
      'device.id': deviceRecord?.id || event.deviceId,
      'device.externalId': event.deviceId,
      'device.name': deviceRecord?.name || event.deviceId,
      'device.type': deviceRecord?.standardizedDeviceType || event.deviceInfo?.type,
      'device.subtype': deviceRecord?.standardizedDeviceSubtype || event.deviceInfo?.subtype,
      'device.vendor': deviceRecord?.vendor,
      'device.model': deviceRecord?.model,
      'device.status': deviceRecord?.status,
      'device.batteryPercentage': deviceRecord?.batteryPercentage,
      
      // Area facts
      'area.id': areaRecord?.id,
      'area.name': areaRecord?.name,
      'area.armedState': areaRecord?.armedState,
      'area.locationId': areaRecord?.locationId,
      
      // Location facts
      'location.id': locationRecord?.id,
      'location.name': locationRecord?.name,
      'location.timeZone': locationRecord?.timeZone,
      'location.addressCity': locationRecord?.addressCity,
      'location.addressState': locationRecord?.addressState,
      
      // Connector facts - enhanced with database data
      'connector.id': event.connectorId,
      'connector.name': connectorRecord?.name,
      'connector.category': connectorRecord?.category,
      
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
    
    // Convert undefined to null
    Object.keys(facts).forEach(key => {
      if (facts[key] === undefined) {
        facts[key] = null;
      }
    });

    try {
      const engine = new Engine();
      
      // Convert our conditions to json-rules-engine format
      const rule = {
        conditions: conditions,
        event: { type: 'automation-trigger' }
      };
      
      engine.addRule(rule as any); // Type assertion to bypass complex type validation
      
      const results = await engine.run(facts);
      return results.events.length > 0;
      
    } catch (error) {
      const errorCode = (error as any)?.code || 'UNKNOWN';
      const baseMessage = `AUTOMATION_CONDITION_ERROR [${errorCode}] Org: ${this.organizationId}`;
      
      if (automationContext) {
        console.error(`${baseMessage} | Automation: "${automationContext.name}" (${automationContext.id}) | Event: ${event.type} from ${event.deviceId} | Facts: ${Object.keys(facts).join(', ')}`);
      } else {
        console.error(`${baseMessage} | Event: ${event.type} from ${event.deviceId} | Facts: ${Object.keys(facts).join(', ')}`, error);
      }
      return false;
    }
  }

  /**
   * Evaluate scheduled trigger conditions
   */
  private async evaluateScheduleTrigger(config: AutomationConfig, automation: OrganizationAutomation, currentTime: Date): Promise<boolean> {
    const logPrefix = `[Automation Context][${this.organizationId}]`;
    
    try {
      // Extract the scheduled trigger - we know it's scheduled from the caller
      const scheduledTrigger = config.trigger;
      if (scheduledTrigger.type !== AutomationTriggerType.SCHEDULED) {
        console.error(`${logPrefix} Expected scheduled trigger but got: ${scheduledTrigger.type}`);
        return false;
      }

      // Get timezone - use trigger timezone, fall back to location timezone, then UTC
      let timezone = scheduledTrigger.timeZone || 'UTC';
      
      // For sunrise/sunset schedules, we need location data
      if (scheduledTrigger.scheduleType === 'sunrise' || scheduledTrigger.scheduleType === 'sunset') {
        // Get location ID for sun times lookup
        const locationId = automation.locationScopeId;
        if (!locationId) {
          console.warn(`${logPrefix} Sunrise/sunset schedule requires location scope but none set for: ${automation.name}`);
          return false;
        }

        // Get location data for timezone and sun times
        const location = await db.query.locations.findFirst({
          where: eq(locations.id, locationId),
          columns: {
            timeZone: true,
            sunriseTime: true,
            sunsetTime: true,
            sunTimesUpdatedAt: true
          }
        });

        if (!location) {
          console.warn(`${logPrefix} Location ${locationId} not found for sunrise/sunset schedule: ${automation.name}`);
          return false;
        }

        // Use location timezone if not overridden
        if (!scheduledTrigger.timeZone) {
          timezone = location.timeZone;
        }

        // Check if sun times are available and fresh
        if (!location.sunriseTime || !location.sunsetTime) {
          console.warn(`${logPrefix} No sun times data for location ${locationId}. Skipping: ${automation.name}`);
          return false;
        }

        // Check if sun times are reasonably fresh (within 7 days)
        if (location.sunTimesUpdatedAt && (Date.now() - location.sunTimesUpdatedAt.getTime()) > 7 * 24 * 60 * 60 * 1000) {
          console.warn(`${logPrefix} Sun times data for location ${locationId} is stale. Skipping: ${automation.name}`);
          return false;
        }

        // Evaluate sunrise/sunset schedule
        return this.evaluateSunSchedule(
          scheduledTrigger.scheduleType,
          scheduledTrigger.scheduleType === 'sunrise' ? location.sunriseTime : location.sunsetTime,
          scheduledTrigger.offsetMinutes || 0,
          currentTime,
          timezone
        );
      }

      // Handle fixed_time schedule
      if (scheduledTrigger.scheduleType === 'fixed_time') {
        if (!scheduledTrigger.cronExpression) {
          console.error(`${logPrefix} Fixed time schedule missing CRON expression: ${automation.name}`);
          return false;
        }

        return this.evaluateFixedTimeSchedule(
          scheduledTrigger.cronExpression,
          currentTime,
          timezone
        );
      }

      console.error(`${logPrefix} Unknown schedule type: ${(scheduledTrigger as any).scheduleType}`);
      return false;

    } catch (error) {
      console.error(`${logPrefix} Error evaluating schedule trigger for ${automation.name}:`, error);
      return false;
    }
  }

  /**
   * Evaluate fixed time schedule using CRON expression
   */
  private evaluateFixedTimeSchedule(cronExpression: string, currentTime: Date, timezone: string): boolean {
    try {
      const interval = CronExpressionParser.parse(cronExpression, { 
        currentDate: currentTime,
        tz: timezone 
      });
      
      // Get the previous scheduled time
      const prevTime = interval.prev();
      
      // Check if the previous scheduled time is within the last minute
      // This handles the case where we run every minute and need to catch schedules
      const timeDiff = currentTime.getTime() - prevTime.getTime();
      const shouldExecute = timeDiff >= 0 && timeDiff < 60000; // Within last minute
      
      if (shouldExecute) {
        console.log(`[Schedule Evaluation] Fixed time schedule triggered: ${cronExpression} (prev: ${prevTime.toISOString()}, current: ${currentTime.toISOString()})`);
      }
      
      return shouldExecute;
    } catch (error) {
      console.error(`[Schedule Evaluation] Error parsing CRON expression "${cronExpression}":`, error);
      return false;
    }
  }

  /**
   * Evaluate sunrise/sunset schedule
   */
  private evaluateSunSchedule(
    scheduleType: 'sunrise' | 'sunset',
    sunTimeStr: string, // "HH:mm" format
    offsetMinutes: number,
    currentTime: Date,
    timezone: string
  ): boolean {
    try {
      // Parse the sun time for today in the timezone
      const todayStr = formatInTimeZone(currentTime, timezone, 'yyyy-MM-dd');
      const sunTimeToday = parse(`${todayStr} ${sunTimeStr}`, 'yyyy-MM-dd HH:mm', new Date());
      
      // Apply offset
      const scheduledTime = new Date(sunTimeToday.getTime() + (offsetMinutes * 60 * 1000));
      
      // Check if current time is within 1 minute of the scheduled time
      const timeDiff = Math.abs(currentTime.getTime() - scheduledTime.getTime());
      const shouldExecute = timeDiff < 60000; // Within 1 minute
      
      if (shouldExecute) {
        console.log(`[Schedule Evaluation] ${scheduleType} schedule triggered: ${sunTimeStr} + ${offsetMinutes}min = ${format(scheduledTime, 'HH:mm')} (current: ${formatInTimeZone(currentTime, timezone, 'HH:mm')})`);
      }
      
      return shouldExecute;
    } catch (error) {
      console.error(`[Schedule Evaluation] Error evaluating ${scheduleType} schedule:`, error);
      return false;
    }
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

    // Extract thumbnail context from event if available
    const thumbnailContext: ThumbnailContext = (event as any)._thumbnailContext || createEmptyThumbnailContext();

    try {
      // Use shared context fetching method
      const { deviceRecord, areaRecord, locationRecord, connectorRecord } = await this.fetchEventContextData(event);

      if (deviceRecord) {
        context.device = {
          id: deviceRecord.id,
          externalId: event.deviceId,
          name: deviceRecord.name,
          type: deviceRecord.standardizedDeviceType,
          subtype: deviceRecord.standardizedDeviceSubtype,
          vendor: deviceRecord.vendor,
          model: deviceRecord.model,
          status: deviceRecord.status,
          batteryPercentage: deviceRecord.batteryPercentage
        };
      } else {
        // Device not found in database, use event info as fallback
        context.device = {
          id: null,
          externalId: event.deviceId,
          name: event.deviceId, // Use external ID as fallback name
          type: event.deviceInfo?.type || null,
          subtype: event.deviceInfo?.subtype || null,
          vendor: null,
          model: null,
          status: null,
          batteryPercentage: null
        };
      }

      // Build area context
      if (areaRecord) {
        context.area = {
          id: areaRecord.id,
          name: areaRecord.name,
          armedState: areaRecord.armedState,
          locationId: areaRecord.locationId
        };
      }

      // Build location context
      if (locationRecord) {
        context.location = {
          id: locationRecord.id,
          name: locationRecord.name,
          timeZone: locationRecord.timeZone,
          addressCity: locationRecord.addressCity,
          addressState: locationRecord.addressState
        };
      }

      // Build connector context
      if (connectorRecord) {
        context.connector = {
          id: connectorRecord.id,
          name: connectorRecord.name,
          category: connectorRecord.category
        };
      }

    } catch (error) {
      console.error(`[Automation Context][${this.organizationId}] Error building action context:`, error);
      // Continue with minimal context on error
      context.device = {
        id: null,
        externalId: event.deviceId,
        name: event.deviceId,
        type: event.deviceInfo?.type || null,
        subtype: event.deviceInfo?.subtype || null
      };
    }

      // Add event context for easy access including thumbnail data
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
        // Thumbnail data from context
        thumbnail: thumbnailContext.dataUri || '',
        ...(event.payload && typeof event.payload === 'object' ? {
          displayState: (event.payload as any).displayState,
          statusType: (event.payload as any).statusType,
          detectionType: (event.payload as any).detectionType,
          confidence: (event.payload as any).confidence,
          zone: (event.payload as any).zone,
          rawStatusValue: (event.payload as any).rawStatusValue,
          buttonNumber: (event.payload as any).buttonNumber,
          buttonPressType: (event.payload as any).pressType,
        } : {})
      };

      // Store thumbnail context separately for easy access in action execution
      context.thumbnailContext = thumbnailContext;

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
          
          // Execute action with organization context including thumbnail data
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