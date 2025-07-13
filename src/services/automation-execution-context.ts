import 'server-only';

import { db } from '@/data/db';
import { automations, automationExecutions, automationActionExecutions, connectors, devices, spaceDevices, spaces, locations } from '@/data/db/schema';
import { eq, inArray, and } from 'drizzle-orm';
import type { StandardizedEvent } from '@/types/events';
import type { EventWithContext } from '@/lib/automation-types';
import type { OrgScopedDb } from '@/lib/db/org-scoped-db';
import type { AutomationConfig, AutomationAction } from '@/lib/automation-schemas';
import { AutomationConfigSchema, SetDeviceStateActionParamsSchema, ArmAlarmZoneActionParamsSchema, DisarmAlarmZoneActionParamsSchema, SendPushNotificationActionParamsSchema } from '@/lib/automation-schemas';
import { AutomationTriggerType, AutomationActionType } from '@/lib/automation-types';
import { Engine } from 'json-rules-engine';
import type { JsonRuleGroup } from '@/lib/automation-schemas';
import { ActionableState, ArmedState, EVENT_TYPE_DISPLAY_MAP, EVENT_CATEGORY_DISPLAY_MAP, EVENT_SUBTYPE_DISPLAY_MAP, DeviceType } from '@/lib/mappings/definitions';
import { requestDeviceStateChange } from '@/lib/device-actions';
import { getPushoverConfiguration } from '@/data/repositories/service-configurations';
import { sendPushoverNotification } from '@/services/drivers/pushover';
import type { ResolvedPushoverMessageParams } from '@/types/pushover-types';
import { internalSetAlarmZoneArmedState } from '@/lib/actions/alarm-zone-actions';
import * as piko from '@/services/drivers/piko';
import type { PikoCreateBookmarkPayload } from '@/services/drivers/piko';
import { z } from 'zod';
import type { ThumbnailContext } from '@/types/automation-thumbnails';
import { createEmptyThumbnailContext } from '@/types/automation-thumbnails';
import { evaluateAutomationTimeFilter } from '@/lib/automation-time-evaluator';
import { CronExpressionParser } from 'cron-parser';
import { formatInTimeZone, toZonedTime, fromZonedTime } from 'date-fns-tz';

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
    device: tokenFactContext?.device ?? null,
    space: tokenFactContext?.space ?? null,
    alarmZone: tokenFactContext?.alarmZone ?? null,
    location: tokenFactContext?.location ?? null,
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
      
      const eventTimestamp = stdEvent?.timestamp.toISOString() ?? new Date().toISOString();
      
      if (targetConnector.category === 'piko') {
        const sourceDeviceInternalId = tokenFactContext.device?.id;
        let associatedPikoCameraExternalIds: string[] = [];
        
        if (sourceDeviceInternalId && typeof sourceDeviceInternalId === 'string') {
          try {
            // First, find the space ID of the source device
            const sourceDeviceSpace = await db
              .select({ spaceId: spaceDevices.spaceId })
              .from(spaceDevices)
              .where(eq(spaceDevices.deviceId, sourceDeviceInternalId))
              .limit(1);
              
            if (sourceDeviceSpace.length === 0) {
              console.warn(`[Automation Action Executor] Source device ${sourceDeviceInternalId} is not assigned to any space.`);
            } else {
              const spaceId = sourceDeviceSpace[0].spaceId;
              
              // Find all Piko cameras in the same space
              const camerasInSameSpace = await db
                .select({ externalId: devices.deviceId })
                .from(devices)
                .innerJoin(spaceDevices, eq(devices.id, spaceDevices.deviceId))
                .innerJoin(connectors, eq(devices.connectorId, connectors.id))
                .where(and(
                  eq(spaceDevices.spaceId, spaceId),
                  eq(connectors.category, 'piko'),
                  eq(devices.standardizedDeviceType, DeviceType.Camera)
                ));
              associatedPikoCameraExternalIds = camerasInSameSpace.map(d => d.externalId);
              console.log(`[Automation Action Executor] Found ${associatedPikoCameraExternalIds.length} Piko cameras in same space as source device.`);
            }
          } catch (spaceError) {
            console.error(`[Automation Action Executor] Error fetching cameras in same space:`, spaceError);
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
      
      const eventTimestampMs = stdEvent?.timestamp.getTime() ?? new Date().getTime();
      
      if (targetConnector.category === 'piko') {
        let associatedPikoCameraExternalIds: string[] = [];
        const sourceDeviceInternalId = tokenFactContext.device?.id;
        
        if (sourceDeviceInternalId && typeof sourceDeviceInternalId === 'string') {
          try {
            // First, find the space ID of the source device
            const sourceDeviceSpace = await db
              .select({ spaceId: spaceDevices.spaceId })
              .from(spaceDevices)
              .where(eq(spaceDevices.deviceId, sourceDeviceInternalId))
              .limit(1);
              
            if (sourceDeviceSpace.length === 0) {
              console.warn(`[Automation Action Executor] Source device ${sourceDeviceInternalId} is not assigned to any space. Skipping.`);
              break;
            } else {
              const spaceId = sourceDeviceSpace[0].spaceId;
              
              // Find all Piko cameras in the same space
              const camerasInSameSpace = await db
                .select({ externalId: devices.deviceId })
                .from(devices)
                .innerJoin(spaceDevices, eq(devices.id, spaceDevices.deviceId))
                .innerJoin(connectors, eq(devices.connectorId, connectors.id))
                                 .where(and(
                   eq(spaceDevices.spaceId, spaceId),
                   eq(connectors.category, 'piko'),
                   eq(devices.standardizedDeviceType, DeviceType.Camera)
                 ));
              associatedPikoCameraExternalIds = camerasInSameSpace.map(d => d.externalId);
              console.log(`[Automation Action Executor] Found ${associatedPikoCameraExternalIds.length} Piko cameras in same space as source device.`);
              
              if (associatedPikoCameraExternalIds.length === 0) {
                console.warn(`[Automation Action Executor] No Piko cameras found in same space. Skipping.`);
                break;
              }
            }
          } catch (spaceError) {
            console.error(`[Automation Action Executor] Error fetching cameras in same space:`, spaceError);
            throw new Error(`Failed to fetch cameras in same space: ${spaceError instanceof Error ? spaceError.message : String(spaceError)}`);
          }
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

    case AutomationActionType.ARM_ALARM_ZONE: {
      const params = action.params as z.infer<typeof ArmAlarmZoneActionParamsSchema>;
      const { scoping, targetZoneIds: specificZoneIds } = params;
      let zonesToProcess: string[] = [];

      if (scoping === 'SPECIFIC_ZONES') {
        if (!specificZoneIds || specificZoneIds.length === 0) {
          console.warn(`[Automation Action Executor] Scoping is SPECIFIC_ZONES but no targetZoneIds provided. Skipping.`);
          break;
        }
        zonesToProcess = specificZoneIds;
      } else if (scoping === 'ALL_ZONES_IN_SCOPE') {
        // For organization context, get all alarm zones in the organization
        const orgZones = await context.orgDb.alarmZones.findAll();
        zonesToProcess = orgZones.map((z: any) => z.id);
        if (zonesToProcess.length === 0) {
          console.log(`[Automation Action Executor] No alarm zones found in organization scope.`);
          break;
        }
      }

      console.log(`[Automation Action Executor] Attempting to arm ${zonesToProcess.length} alarm zone(s). IDs: ${zonesToProcess.join(', ')}`);
      for (const zoneId of zonesToProcess) {
        try {
          const updatedZone = await internalSetAlarmZoneArmedState(
            zoneId, 
            ArmedState.ARMED,
            undefined, // No user ID for automation actions
            'automation'
          );
          if (updatedZone) {
            console.log(`[Automation Action Executor] Successfully armed alarm zone ${zoneId}.`);
          } else {
            console.warn(`[Automation Action Executor] Failed to arm alarm zone ${zoneId} (zone not found or no update occurred).`);
          }
        } catch (zoneError) {
          console.error(`[Automation Action Executor] Error arming alarm zone ${zoneId}:`, zoneError instanceof Error ? zoneError.message : zoneError);
          throw zoneError; // Re-throw to mark action as failed
        }
      }
      break;
    }

    case AutomationActionType.DISARM_ALARM_ZONE: {
      const params = action.params as z.infer<typeof DisarmAlarmZoneActionParamsSchema>;
      const { scoping, targetZoneIds: specificZoneIds } = params;
      let zonesToProcess: string[] = [];

      if (scoping === 'SPECIFIC_ZONES') {
        if (!specificZoneIds || specificZoneIds.length === 0) {
          console.warn(`[Automation Action Executor] Scoping is SPECIFIC_ZONES but no targetZoneIds provided. Skipping.`);
          break;
        }
        zonesToProcess = specificZoneIds;
      } else if (scoping === 'ALL_ZONES_IN_SCOPE') {
        // For organization context, get all alarm zones in the organization
        const orgZones = await context.orgDb.alarmZones.findAll();
        zonesToProcess = orgZones.map((z: any) => z.id);
        if (zonesToProcess.length === 0) {
          console.log(`[Automation Action Executor] No alarm zones found in organization scope.`);
          break;
        }
      }

      console.log(`[Automation Action Executor] Attempting to disarm ${zonesToProcess.length} alarm zone(s). IDs: ${zonesToProcess.join(', ')}`);
      for (const zoneId of zonesToProcess) {
        try {
          const updatedZone = await internalSetAlarmZoneArmedState(
            zoneId, 
            ArmedState.DISARMED,
            undefined, // No user ID for automation actions
            'automation'
          );
          if (updatedZone) {
            console.log(`[Automation Action Executor] Successfully disarmed alarm zone ${zoneId}.`);
          } else {
            console.warn(`[Automation Action Executor] Failed to disarm alarm zone ${zoneId} (zone not found or no update occurred).`);
          }
        } catch (zoneError) {
          console.error(`[Automation Action Executor] Error disarming alarm zone ${zoneId}:`, zoneError instanceof Error ? zoneError.message : zoneError);
          throw zoneError; // Re-throw to mark action as failed
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
  async processEvent(event: StandardizedEvent, deviceContext: EventWithContext['deviceContext']): Promise<void> {
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
        enabledAutomations.map(automation => this.executeAutomationSafely(automation, event, deviceContext))
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
  private async executeAutomationSafely(automation: OrganizationAutomation, event: StandardizedEvent, deviceContext: EventWithContext['deviceContext']): Promise<void> {
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
      const shouldExecute = await this.evaluateEventTriggers(config.trigger.conditions, event, deviceContext, { 
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
      const actionContext = await this.buildActionContext(event, automation, deviceContext);
      
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
    const results = await this.orgDb.automations.findAll();
    return results.filter((automation: any) => automation.enabled) as OrganizationAutomation[];
  }

  /**
   * Get event context data from passed device context
   */
  private getEventContextData(deviceContext: EventWithContext['deviceContext']): {
    deviceRecord: any,
    spaceRecord: any,
    alarmZoneRecord: any,
    locationRecord: any,
    connectorRecord: any
  } {
    return {
      deviceRecord: deviceContext.deviceRecord,
      spaceRecord: deviceContext.spaceRecord,
      alarmZoneRecord: deviceContext.alarmZoneRecord,
      locationRecord: deviceContext.locationRecord,
      connectorRecord: deviceContext.connectorRecord
    };
  }



  /**
   * Evaluate event-based trigger conditions using json-rules-engine
   */
  private async evaluateEventTriggers(conditions: JsonRuleGroup, event: StandardizedEvent, deviceContext: EventWithContext['deviceContext'], automationContext?: { id: string, name: string }): Promise<boolean> {
    // Get comprehensive context data from passed device context
    const { deviceRecord, spaceRecord, alarmZoneRecord, locationRecord, connectorRecord } = this.getEventContextData(deviceContext);

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
      'device.type': deviceRecord?.deviceType || event.deviceInfo?.type,
      'device.subtype': deviceRecord?.deviceSubtype || event.deviceInfo?.subtype,
      'device.vendor': deviceRecord?.vendor,
      'device.model': deviceRecord?.model,
      'device.status': deviceRecord?.status,
      'device.batteryPercentage': deviceRecord?.batteryPercentage,
      
      // Space facts
      'space.id': spaceRecord?.id,
      'space.name': spaceRecord?.name,
      
      // Alarm Zone facts
      'alarmZone.id': alarmZoneRecord?.id,
      'alarmZone.name': alarmZoneRecord?.name,
      'alarmZone.armedState': alarmZoneRecord?.armedState,
      
      // Location facts
      'location.id': locationRecord?.id,
      'location.name': locationRecord?.name,
      'location.timeZone': locationRecord?.timeZone,
      
      // Connector facts - enhanced with database data
      'connector.id': event.connectorId,
      'connector.name': connectorRecord?.name,
      'connector.category': connectorRecord?.category,
      
  
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

      // Get timezone with proper fallback chain:
      // 1. Manual timezone from trigger
      // 2. Location timezone (if automation has location scope)
      // 3. Error if no location scope and no manual timezone
      let timezone = scheduledTrigger.timeZone;
      
      if (!timezone) {
        // Try location timezone if automation has location scope
        if (automation.locationScopeId) {
          const location = await db.query.locations.findFirst({
            where: eq(locations.id, automation.locationScopeId),
            columns: { timeZone: true }
          });
          if (location) {
            timezone = location.timeZone;
          }
        }
        
        // If still no timezone, automation must specify one manually
        if (!timezone) {
          console.error(`${logPrefix} Automation ${automation.name} requires manual timezone specification when not location-scoped`);
          return false;
        }
      }

      // For sunrise/sunset schedules, we need location data
      if (scheduledTrigger.scheduleType === 'sunrise' || scheduledTrigger.scheduleType === 'sunset') {
        // Get location ID for sun times lookup
        const locationId = automation.locationScopeId;
        if (!locationId) {
          console.warn(`${logPrefix} Sunrise/sunset schedule requires location scope but none set for: ${automation.name}`);
          return false;
        }

        // Get location data for sun times
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

      // Handle fixed time schedules
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

      console.error(`${logPrefix} Unknown schedule type: ${scheduledTrigger.scheduleType} for ${automation.name}`);
      return false;
    } catch (error) {
      console.error(`${logPrefix} Error evaluating scheduled trigger for ${automation.name}:`, error);
      return false;
    }
  }

  /**
   * Evaluate fixed time schedule using CRON expression
   */
  private evaluateFixedTimeSchedule(cronExpression: string, currentTime: Date, timezone: string): boolean {
    try {
      // Convert UTC time from cron job to the target timezone for evaluation
      const currentTimeInTimezone = toZonedTime(currentTime, timezone);
      
      const interval = CronExpressionParser.parse(cronExpression, { 
        currentDate: currentTimeInTimezone, // Time in target timezone
        tz: timezone // Target timezone
      });
      
      // Get the previous scheduled time (this will be in the target timezone)
      const prevTime = interval.prev();
      
      // Check if the previous scheduled time is within the last minute
      // Both times are now in the same timezone
      const timeDiff = currentTimeInTimezone.getTime() - prevTime.getTime();
      const shouldExecute = timeDiff >= 0 && timeDiff < 60000; // Within last minute
      
      if (shouldExecute) {
        console.log(`[Schedule Evaluation] Fixed time schedule triggered: ${cronExpression} (prev: ${prevTime.toISOString()}, current: ${currentTimeInTimezone.toISOString()}, timezone: ${timezone})`);
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
      // Create scheduled time for today in the target timezone
      const todayStr = formatInTimeZone(currentTime, timezone, 'yyyy-MM-dd');
      const sunTimeToday = fromZonedTime(`${todayStr} ${sunTimeStr}`, timezone);
      
      // Apply offset to get the actual scheduled time
      const scheduledTime = new Date(sunTimeToday.getTime() + (offsetMinutes * 60 * 1000));
      
      // Check if current time is within 1 minute of the scheduled time
      const timeDiff = Math.abs(currentTime.getTime() - scheduledTime.getTime());
      const shouldExecute = timeDiff < 60000; // Within 1 minute
      
      if (shouldExecute) {
        console.log(`[Schedule Evaluation] ${scheduleType} schedule triggered: ${sunTimeStr} + ${offsetMinutes}min = ${formatInTimeZone(scheduledTime, timezone, 'HH:mm')} (current: ${formatInTimeZone(currentTime, timezone, 'HH:mm')}, timezone: ${timezone})`);
      }
      
      return shouldExecute;
    } catch (error) {
      console.error(`[Schedule Evaluation] Error evaluating ${scheduleType} schedule:`, error);
      return false;
    }
  }

  /**
   * Build rich action context including device, space, location, and connector information
   */
  private async buildActionContext(event: StandardizedEvent, automation: OrganizationAutomation, deviceContext: EventWithContext['deviceContext']): Promise<Record<string, any>> {
    const context: Record<string, any> = {
      triggerEvent: event,
      organizationId: this.organizationId,
      orgDb: this.orgDb
    };

    // Extract thumbnail context from event if available
    const thumbnailContext: ThumbnailContext = (event as any)._thumbnailContext || createEmptyThumbnailContext();

    try {
      // Use shared context fetching method
      const { deviceRecord, spaceRecord, alarmZoneRecord, locationRecord, connectorRecord } = this.getEventContextData(deviceContext);

      if (deviceRecord) {
        context.device = {
          id: deviceRecord.id,
          externalId: event.deviceId,
          name: deviceRecord.name,
          type: deviceRecord.deviceType,
          subtype: deviceRecord.deviceSubtype,
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

      // Build space context
      if (spaceRecord) {
        context.space = {
          id: spaceRecord.id,
          name: spaceRecord.name
        };
      }

      // Build alarm zone context
      if (alarmZoneRecord) {
        context.alarmZone = {
          id: alarmZoneRecord.id,
          name: alarmZoneRecord.name,
          armedState: alarmZoneRecord.armedState
        };
      }

      // Build location context
      if (locationRecord) {
        context.location = {
          id: locationRecord.id,
          name: locationRecord.name,
          timeZone: locationRecord.timeZone
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