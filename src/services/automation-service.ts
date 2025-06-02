import 'server-only';

import { db } from '@/data/db';
import { automations, connectors, devices, cameraAssociations, areas, areaDevices, locations, automationExecutions, automationActionExecutions } from '@/data/db/schema';
import { eq, and, inArray, or, isNotNull } from 'drizzle-orm';
import type { StandardizedEvent } from '@/types/events'; // <-- Import StandardizedEvent
import { DeviceType } from '@/lib/mappings/definitions'; // <-- Import DeviceType enum
import * as piko from '@/services/drivers/piko'; // Assuming Piko driver functions are here
import { type AutomationConfig, AutomationConfigSchema, type AutomationAction, type TemporalCondition, SetDeviceStateActionParamsSchema, type ArmAreaActionParamsSchema, type DisarmAreaActionParamsSchema } from '@/lib/automation-schemas';
import pRetry from 'p-retry'; // Import p-retry
import type { PikoCreateBookmarkPayload } from '@/services/drivers/piko'; // Import the specific payload type
// Import other necessary drivers or services as needed
import type { SendHttpRequestActionParamsSchema } from '@/lib/automation-schemas';
import { z } from 'zod'; // Add Zod import
import * as eventsRepository from '@/data/repositories/events'; // Import the event repository
import { findEventsInWindow } from '@/data/repositories/events'; // Import the specific function
import { Engine } from 'json-rules-engine';
import type { JsonRuleCondition, JsonRuleGroup } from '@/lib/automation-schemas'; // Import rule types
import { requestDeviceStateChange } from '@/lib/device-actions';
import { ActionableState, ArmedState } from '@/lib/mappings/definitions';
// Import Pushover config repository and driver
import { getPushoverConfiguration } from '@/data/repositories/service-configurations';
import { sendPushoverNotification } from '@/services/drivers/pushover';
import type { ResolvedPushoverMessageParams } from '@/types/pushover-types';
// Import the new action schema
import type { SendPushNotificationActionParamsSchema } from '@/lib/automation-schemas';
import { internalSetAreaArmedState } from '@/lib/actions/area-alarm-actions'; // Updated import
import { AutomationActionType, AutomationTriggerType } from '@/lib/automation-types'; // Import AutomationActionType and AutomationTriggerType
import { CronExpressionParser } from 'cron-parser'; // Using named import as per user example
import { formatInTimeZone } from 'date-fns-tz'; // For formatting time in specific timezone
import { automationAuditService, AutomationAuditService } from '@/services/automation-audit-service';
import { ExecutionStatus, ActionExecutionStatus } from '@/lib/automation-audit-types';
import { OrganizationAutomationContext } from '@/services/automation-execution-context';
import { createOrgScopedDb } from '@/lib/db/org-scoped-db'; // Import the factory function

// Helper for exhaustive checks
function assertNever(value: never, message: string = "Unhandled discriminated union member"): never {
    throw new Error(`${message}: ${JSON.stringify(value)}`);
}

// --- Moved Type Definition Earlier ---
// Define structure for trigger device context, including nested location
type SourceDeviceContext = {
    id: string;
    name: string;
    standardizedDeviceType: string | null;
    standardizedDeviceSubtype: string | null;
    area: (typeof areas.$inferSelect & { location: typeof locations.$inferSelect | null }) | null; 
};

// --- NEW: Helper function to recursively remove null values --- 
const removeNulls = (obj: any): any => {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }
    if (Array.isArray(obj)) {
        return obj.map(removeNulls).filter(item => item !== null);
    }
    const newObj: Record<string, any> = {};
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const value = removeNulls(obj[key]);
            if (value !== null) {
                newObj[key] = value;
            }
        }
    }
    // Return the new object only if it has keys, otherwise return null
    return Object.keys(newObj).length > 0 ? newObj : null;
};
// --- End NEW --- 

// --- NEW: Helper function to extract fact paths from conditions --- 
function extractReferencedFactPaths(condition: JsonRuleCondition | JsonRuleGroup | undefined): Set<string> {
    const paths = new Set<string>();

    if (!condition) {
        return paths;
    }

    // Check if it's a single condition with a 'fact' property
    if ('fact' in condition && typeof condition.fact === 'string') {
        paths.add(condition.fact);
    } 
    // Check if it's a group condition ('all' or 'any')
    else if ('all' in condition && Array.isArray(condition.all)) {
        condition.all.forEach(subCondition => {
            extractReferencedFactPaths(subCondition).forEach(path => paths.add(path));
        });
    } else if ('any' in condition && Array.isArray(condition.any)) {
        condition.any.forEach(subCondition => {
            extractReferencedFactPaths(subCondition).forEach(path => paths.add(path));
        });
    }
    // Note: This doesn't handle 'not' conditions or referenced conditions ('condition' key) yet.
    // Add logic here if those features are used and might contain facts.

    return paths;
}

// --- NEW: Simple path resolver --- 
function resolvePath(obj: any, path: string): any {
    if (!path) return undefined;
    const keys = path.split('.');
    let current = obj;
    for (const key of keys) {
        if (current === null || current === undefined || typeof current !== 'object') {
            return undefined;
        }
        current = current[key];
    }
    return current;
}
// --- End NEW ---

/**
 * NEW: Organization-scoped event processing
 * Processes a standardized event using the organization-scoped automation context.
 * @param stdEvent The incoming StandardizedEvent object.
 */
export async function processEvent(stdEvent: StandardizedEvent): Promise<void> {
    console.log(`[Automation Service] ENTERED processEvent for event: ${stdEvent.eventId}`);
    console.log(`[Automation Service] Processing event: ${stdEvent.type} (${stdEvent.category}) for device ${stdEvent.deviceId} from connector ${stdEvent.connectorId}`);

    try {
        // Get the organization ID from the event's connector
        const connectorRecord = await db.query.connectors.findFirst({
            where: eq(connectors.id, stdEvent.connectorId),
            columns: { organizationId: true }
        });

        if (!connectorRecord || !connectorRecord.organizationId) {
            console.warn(`[Automation Service] Cannot process event ${stdEvent.eventId}: connector ${stdEvent.connectorId} not found or has no organization`);
            return;
        }

        const organizationId = connectorRecord.organizationId;
        console.log(`[Automation Service] Processing event ${stdEvent.eventId} within organization ${organizationId}`);

        // Use organization-scoped automation context
        const orgDb = createOrgScopedDb(organizationId);
        const automationContext = new OrganizationAutomationContext(organizationId, orgDb);
        await automationContext.processEvent(stdEvent);

    } catch (error) {
        console.error('[Automation Service] Top-level error processing event:', error);
    }
}

/**
 * NEW: Organization-scoped scheduled automation processing
 * Processes scheduled automations for all organizations.
 * @param currentTime The current time to check schedules against.
 */
export async function processScheduledAutomations(currentTime: Date): Promise<void> {
    console.log(`[Automation Service] ENTERED processScheduledAutomations at ${currentTime.toISOString()}`);

    try {
        // Get all organizations that have automations
        const organizationsWithAutomations = await db
            .selectDistinct({ organizationId: automations.organizationId })
            .from(automations)
            .where(and(
                eq(automations.enabled, true),
                isNotNull(automations.organizationId)
            ));

        if (organizationsWithAutomations.length === 0) {
            console.log(`[Automation Service] No organizations with enabled automations found.`);
            return;
        }

        console.log(`[Automation Service] Processing scheduled automations for ${organizationsWithAutomations.length} organization(s)`);

        // Process scheduled automations for each organization in parallel
        await Promise.allSettled(
            organizationsWithAutomations.map(async ({ organizationId }) => {
                if (!organizationId) return;
                
                try {
                    console.log(`[Automation Service] Processing scheduled automations for organization ${organizationId}`);
                    const orgDb = createOrgScopedDb(organizationId);
                    const automationContext = new OrganizationAutomationContext(organizationId, orgDb);
                    await automationContext.processScheduledAutomations(currentTime);
                } catch (orgError) {
                    console.error(`[Automation Service] Error processing scheduled automations for organization ${organizationId}:`, orgError);
                }
            })
        );

    } catch (error) {
        console.error(`[Automation Service] Top-level error processing scheduled automations:`, error);
    }
}

/**
 * Executes a single automation action with retry logic.
 * The stdEvent parameter is now optional for scheduled tasks.
 */
async function executeActionWithRetry(
    rule: typeof automations.$inferSelect,
    action: AutomationAction,
    stdEvent: StandardizedEvent | null, // Now optional
    tokenFactContext: Record<string, any>,
    executionId: string | null = null, // For audit tracking
    actionIndex: number = 0 // For audit tracking
) {
    console.log(`[Automation Service] Attempting action type '${action.type}' for rule ${rule.id} (${rule.name})`);
    
    let actionExecutionId: string | null = null;
    const actionStartTime = Date.now();
    
    // Start action audit tracking
    if (executionId) {
        try {
            const resolvedParams = resolveTokens(action.params, stdEvent, tokenFactContext);
            actionExecutionId = await automationAuditService.startActionExecution({
                executionId,
                actionIndex,
                actionType: action.type,
                actionParams: resolvedParams || {},
            });
        } catch (auditError) {
            console.error(`[Automation Service] Failed to start action audit tracking for rule ${rule.id}, action ${actionIndex}:`, auditError);
        }
    }
    
    const runAction = async () => {
        switch (action.type) {
            case AutomationActionType.CREATE_EVENT: {
                // This action inherently relies on a triggering event context for some fields like timestamp.
                // If stdEvent is null (scheduled trigger), we might need to adjust behavior or disallow.
                // For now, it will try to use stdEvent if present, or tokenFactContext.schedule.triggeredAtUTC...
                const resolvedParams = resolveTokens(action.params, stdEvent, tokenFactContext) as z.infer<typeof import('@/lib/automation-schemas').CreateEventActionParamsSchema>;
                // Validation as before
                // ...
                // For pikoPayload.timestamp, use stdEvent.timestamp or fallback to context.schedule.triggeredAtUTC
                const eventTimestamp = stdEvent?.timestamp.toISOString() ?? tokenFactContext.schedule?.triggeredAtUTC ?? new Date().toISOString();

                // The rest of CREATE_EVENT logic needs careful review if stdEvent is null
                // e.g., sourceDeviceInternalId for cameraAssociations
                // For now, proceeding with existing logic, which might warn or skip if context is missing.
                // ... (original CREATE_EVENT logic, ensuring stdEvent?.deviceId is handled if stdEvent is null)

                // Simplified example for placeholder
                const targetConnector = await db.query.connectors.findFirst({ where: eq(connectors.id, resolvedParams.targetConnectorId!) });
                if (!targetConnector) throw new Error("Target connector not found for CREATE_EVENT");
                console.log(`[Automation Service] Action CREATE_EVENT: Connector ${targetConnector.id}, Timestamp ${eventTimestamp}`);
                // Actual piko.createPikoEvent call would be here
                if (targetConnector.category === 'piko') {
                    const sourceDeviceInternalId = tokenFactContext.device?.id; // This would be null for scheduled unless set differently
                    let associatedPikoCameraExternalIds: string[] = [];
                    if (sourceDeviceInternalId && typeof sourceDeviceInternalId === 'string') {
                         try {
                            const associations = await db.select({ pikoCameraInternalId: cameraAssociations.pikoCameraId }).from(cameraAssociations).where(eq(cameraAssociations.deviceId, sourceDeviceInternalId));
                            const internalCameraIds = associations.map(a => a.pikoCameraInternalId);
                            if (internalCameraIds.length > 0) {
                                const cameraDevices = await db.select({ externalId: devices.deviceId }).from(devices).where(inArray(devices.id, internalCameraIds)); 
                                associatedPikoCameraExternalIds = cameraDevices.map(d => d.externalId);
                            }
                        } catch (assocError) { console.error(`[Rule ${rule.id}][Action createEvent] Error fetching camera associations:`, assocError); }
                    } else if (!stdEvent) { // only warn if no stdEvent and no sourceDeviceInternalId from facts
                        console.warn(`[Rule ${rule.id}][Action createEvent (Scheduled)] No source device context to fetch camera associations.`);
                    }


                    const pikoPayload: piko.PikoCreateEventPayload = { 
                        source: resolvedParams.sourceTemplate, 
                        caption: resolvedParams.captionTemplate, 
                        description: resolvedParams.descriptionTemplate, 
                        timestamp: eventTimestamp, // Use determined timestamp
                        ...(associatedPikoCameraExternalIds.length > 0 && { metadata: { cameraRefs: associatedPikoCameraExternalIds } })
                    };
                    await piko.createPikoEvent(targetConnector.id, pikoPayload);
                } else { console.warn(`[Rule ${rule.id}][Action createEvent] Unsupported target connector category ${targetConnector.category}`); }
                break;
            }
            case AutomationActionType.CREATE_BOOKMARK: {
                const resolvedParams = resolveTokens(action.params, stdEvent, tokenFactContext) as z.infer<typeof import('@/lib/automation-schemas').CreateBookmarkParamsSchema>;
                // ... validation ...
                const eventTimestampMs = stdEvent?.timestamp.getTime() ?? tokenFactContext.schedule?.triggeredAtMs ?? new Date().getTime();
                // ... (original CREATE_BOOKMARK logic, ensuring stdEvent?.deviceId is handled if stdEvent is null)

                // Simplified example for placeholder
                const targetConnector = await db.query.connectors.findFirst({ where: eq(connectors.id, resolvedParams.targetConnectorId!) });
                 if (!targetConnector) throw new Error("Target connector not found for CREATE_BOOKMARK");
                 console.log(`[Automation Service] Action CREATE_BOOKMARK: Connector ${targetConnector.id}, StartTimeMs ${eventTimestampMs}`);
                // Actual piko.createPikoBookmark call
                 if (targetConnector.category === 'piko') {
                    let associatedPikoCameraExternalIds: string[] = [];
                    const sourceDeviceInternalId = tokenFactContext.device?.id; // null for scheduled
                    if (sourceDeviceInternalId && typeof sourceDeviceInternalId === 'string') {
                        try {
                            const associations = await db.select({ pikoCameraInternalId: cameraAssociations.pikoCameraId }).from(cameraAssociations).where(eq(cameraAssociations.deviceId, sourceDeviceInternalId));
                            const internalCameraIds = associations.map(a => a.pikoCameraInternalId);
                            if (internalCameraIds.length === 0) { console.warn(`[Rule ${rule.id}][Action createBookmark] No Piko cameras associated with source device ${sourceDeviceInternalId}. Skipping.`); break; }
                            const cameraDevices = await db.select({ externalId: devices.deviceId }).from(devices).where(inArray(devices.id, internalCameraIds)); 
                            associatedPikoCameraExternalIds = cameraDevices.map(d => d.externalId);
                        } catch (assocError) { console.error(`[Rule ${rule.id}][Action createBookmark] Error fetching camera associations:`, assocError); throw new Error(`Failed to fetch camera associations: ${assocError instanceof Error ? assocError.message : String(assocError)}`); }
                    } else if (!stdEvent) {
                         console.warn(`[Rule ${rule.id}][Action createBookmark (Scheduled)] No source device context for camera associations. Bookmark will not be camera-specific.`);
                         // If no associations, perhaps bookmark globally on the connector if supported, or skip?
                         // For now, if no camera association, it seems it would attempt to create a bookmark without camera ID,
                         // which piko.createPikoBookmark might not support or handle gracefully.
                         // The original code requires associatedPikoCameraExternalIds.length > 0 for the loop.
                         // If no cameras, then it effectively skips.
                         if(associatedPikoCameraExternalIds.length === 0){
                            console.warn(`[Rule ${rule.id}][Action createBookmark (Scheduled)] No camera associations, skipping bookmark creation as per current logic flow.`);
                            break;
                         }
                    }
                    let durationMs = 5000;
                    try { const parsedDuration = parseInt(resolvedParams.durationMsTemplate, 10); if (!isNaN(parsedDuration) && parsedDuration > 0) durationMs = parsedDuration; } catch {} 
                    let tags: string[] = [];
                    if (resolvedParams.tagsTemplate && resolvedParams.tagsTemplate.trim() !== '') { try { tags = resolvedParams.tagsTemplate.split(',').map(tag => tag.trim()).filter(tag => tag !== ''); } catch {} }
                    
                    for (const pikoCameraDeviceId of associatedPikoCameraExternalIds) { // This loop won't run if no cameras found.
                        const pikoPayload: PikoCreateBookmarkPayload = {
                            name: resolvedParams.nameTemplate,
                            description: resolvedParams.descriptionTemplate || undefined,
                            startTimeMs: eventTimestampMs,
                            durationMs: durationMs,
                            tags: tags.length > 0 ? tags : undefined
                        };
                        await piko.createPikoBookmark(targetConnector.id, pikoCameraDeviceId, pikoPayload);
                    }
                } else { console.warn(`[Rule ${rule.id}][Action createBookmark] Unsupported target connector category ${targetConnector.category}`); }
                break;
            }
            // ... other cases remain largely the same but use resolveTokens which is now null-aware for stdEvent
            case AutomationActionType.SEND_HTTP_REQUEST: {
                const resolvedParams = resolveTokens(action.params, stdEvent, tokenFactContext) as z.infer<typeof SendHttpRequestActionParamsSchema>;
                // ... (original SEND_HTTP_REQUEST logic)
                const headers = new Headers({ 'User-Agent': 'FusionBridge Automation/1.0' });
                if (Array.isArray(resolvedParams.headers)) {
                    for (const header of resolvedParams.headers) {
                        if (header.keyTemplate && typeof header.keyTemplate === 'string' && typeof header.valueTemplate === 'string') {
                            const key = header.keyTemplate.trim();
                            if (key) { try { headers.set(key, header.valueTemplate); } catch (e) { console.warn(`[Rule ${rule.id}][Action sendHttpRequest] Invalid header name: "${key}". Skipping.`, e); }}
                        }
                    }
                }
                const fetchOptions: RequestInit = { method: resolvedParams.method, headers: headers };
                if (['POST', 'PUT', 'PATCH'].includes(resolvedParams.method) && resolvedParams.bodyTemplate) {
                    if (!headers.has('Content-Type') && resolvedParams.bodyTemplate.trim().startsWith('{')) headers.set('Content-Type', 'application/json');
                    fetchOptions.body = resolvedParams.bodyTemplate;
                }
                const response = await fetch(resolvedParams.urlTemplate, fetchOptions);
                if (!response.ok) {
                    let responseBody = '';
                    try { responseBody = await response.text(); console.error(`[Rule ${rule.id}][Action sendHttpRequest] Response body (error): ${responseBody.substring(0, 500)}...`); } catch { console.error(`[Rule ${rule.id}][Action sendHttpRequest] Could not read response body on error.`); }
                    throw new Error(`HTTP request failed with status ${response.status}: ${response.statusText}`);
                }
                break;
            }
            case AutomationActionType.SET_DEVICE_STATE: {
                // This action is specific and uses params directly, not from resolved tokens for its core logic
                const params = action.params as z.infer<typeof SetDeviceStateActionParamsSchema>;
                if (!params.targetDeviceInternalId || typeof params.targetDeviceInternalId !== 'string') {
                    throw new Error(`Invalid or missing targetDeviceInternalId for setDeviceState action.`);
                }
                if (!params.targetState || !Object.values(ActionableState).includes(params.targetState as ActionableState)) {
                    throw new Error(`Invalid or missing targetState for setDeviceState action.`);
                }
                console.log(`[Automation Service] Rule ${rule.id} (${rule.name}): Executing setDeviceState. Target: ${params.targetDeviceInternalId}, State: ${params.targetState}`);
                await requestDeviceStateChange(params.targetDeviceInternalId, params.targetState as ActionableState);
                console.log(`[Automation Service] Rule ${rule.id} (${rule.name}): Successfully requested state change for ${params.targetDeviceInternalId} to ${params.targetState}`);
                break;
            }
            case AutomationActionType.SEND_PUSH_NOTIFICATION: {
                // Resolve tokens for title, message, and target user key
                const resolvedTemplates = resolveTokens(action.params, stdEvent, tokenFactContext) as z.infer<typeof SendPushNotificationActionParamsSchema>;
                // ... (original SEND_PUSH_NOTIFICATION logic)
                const resolvedTitle = resolvedTemplates.titleTemplate;
                const resolvedMessage = resolvedTemplates.messageTemplate; 
                const resolvedTargetUserKey = resolvedTemplates.targetUserKeyTemplate;
                const pushoverConfig = await getPushoverConfiguration();
                if (!pushoverConfig) throw new Error(`Pushover service is not configured.`);
                if (!pushoverConfig.isEnabled) throw new Error(`Pushover service is disabled.`);
                if (!pushoverConfig.apiToken || !pushoverConfig.groupKey) throw new Error(`Pushover configuration is incomplete.`);
                const recipientKey = (resolvedTargetUserKey && resolvedTargetUserKey !== '__all__') ? resolvedTargetUserKey : pushoverConfig.groupKey;
                const pushoverParams: ResolvedPushoverMessageParams = {
                     message: resolvedMessage, title: resolvedTitle,
                     ...( (action.params as any).priority !== 0 && { priority: (action.params as any).priority }), // Use original priority before token resolution
                 };
                const result = await sendPushoverNotification(pushoverConfig.apiToken, recipientKey, pushoverParams);
                if (!result.success) {
                    const errorDetail = result.errors?.join(', ') || result.errorMessage || 'Unknown Pushover API error';
                    throw new Error(`Failed to send Pushover notification: ${errorDetail}`);
                }
                console.log(`[Automation Service] Rule ${rule.id} (${rule.name}): Successfully sent Pushover notification.`);
                break;
            }
            case AutomationActionType.ARM_AREA: {
                const params = action.params as z.infer<typeof ArmAreaActionParamsSchema>;
                const { scoping, targetAreaIds: specificAreaIds, armMode } = params;
                let areasToProcess: string[] = [];

                if (scoping === 'SPECIFIC_AREAS') {
                    if (!specificAreaIds || specificAreaIds.length === 0) {
                        console.warn(`[Rule ${rule.id}][Action armArea] Scoping is SPECIFIC_AREAS but no targetAreaIds provided. Skipping.`);
                        break;
                    }
                    areasToProcess = specificAreaIds;
                } else if (scoping === 'ALL_AREAS_IN_SCOPE') {
                    if (rule.locationScopeId) {
                        const areasInLocation = await db.query.areas.findMany({ where: eq(areas.locationId, rule.locationScopeId), columns: { id: true } });
                        areasToProcess = areasInLocation.map(a => a.id);
                        if (areasToProcess.length === 0) {
                            console.log(`[Rule ${rule.id}][Action armArea] No areas found in rule's location scope ${rule.locationScopeId}.`);
                            break;
                        }
                    } else {
                        const allSystemAreas = await db.query.areas.findMany({ columns: { id: true } });
                        areasToProcess = allSystemAreas.map(a => a.id);
                        if (areasToProcess.length === 0) {
                            console.log(`[Rule ${rule.id}][Action armArea] No areas found in system.`);
                            break;
                        }
                    }
                }

                if (areasToProcess.length === 0) {
                    console.log(`[Rule ${rule.id}][Action armArea] No areas determined for processing. Scoping: ${scoping}.`);
                    break;
                }

                console.log(`[Rule ${rule.id}][Action armArea] Attempting to arm ${areasToProcess.length} area(s) to mode ${armMode}. IDs: ${areasToProcess.join(', ')}`);
                for (const areaId of areasToProcess) {
                    try {
                        const updatedArea = await internalSetAreaArmedState(areaId, armMode, {
                            lastArmedStateChangeReason: 'automation_arm', // Added reason
                            isArmingSkippedUntil: null,                  // Clear schedule fields
                            nextScheduledArmTime: null,
                            nextScheduledDisarmTime: null,
                        });
                        if (updatedArea) {
                            console.log(`[Rule ${rule.id}][Action armArea] Successfully armed area ${areaId} to ${armMode}.`);
                        } else {
                            console.warn(`[Rule ${rule.id}][Action armArea] Failed to arm area ${areaId} to ${armMode} (area not found or no update occurred).`);
                        }
                    } catch (areaError) {
                        console.error(`[Rule ${rule.id}][Action armArea] Error arming area ${areaId} to ${armMode}:`, areaError instanceof Error ? areaError.message : areaError);
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
                        console.warn(`[Rule ${rule.id}][Action disarmArea] Scoping is SPECIFIC_AREAS but no targetAreaIds provided. Skipping.`);
                        break;
                    }
                    areasToProcess = specificAreaIds;
                } else if (scoping === 'ALL_AREAS_IN_SCOPE') {
                    if (rule.locationScopeId) {
                        const areasInLocation = await db.query.areas.findMany({ where: eq(areas.locationId, rule.locationScopeId), columns: { id: true } });
                        areasToProcess = areasInLocation.map(a => a.id);
                        if (areasToProcess.length === 0) {
                            console.log(`[Rule ${rule.id}][Action disarmArea] No areas found in rule's location scope ${rule.locationScopeId}.`);
                            break;
                        }
                    } else {
                        const allSystemAreas = await db.query.areas.findMany({ columns: { id: true } });
                        areasToProcess = allSystemAreas.map(a => a.id);
                         if (areasToProcess.length === 0) {
                            console.log(`[Rule ${rule.id}][Action disarmArea] No areas found in system.`);
                            break;
                         }
                    }
                }

                if (areasToProcess.length === 0) {
                    console.log(`[Rule ${rule.id}][Action disarmArea] No areas determined for processing. Scoping: ${scoping}.`);
                    break;
                }

                console.log(`[Rule ${rule.id}][Action disarmArea] Attempting to disarm ${areasToProcess.length} area(s). IDs: ${areasToProcess.join(', ')}`);
                for (const areaId of areasToProcess) {
                    try {
                        const updatedArea = await internalSetAreaArmedState(areaId, ArmedState.DISARMED, {
                            lastArmedStateChangeReason: 'automation_disarm', // Added reason
                            isArmingSkippedUntil: null,                     // Clear schedule fields
                            nextScheduledArmTime: null,
                            nextScheduledDisarmTime: null,
                        });
                        if (updatedArea) {
                            console.log(`[Rule ${rule.id}][Action disarmArea] Successfully disarmed area ${areaId}.`);
                        } else {
                            console.warn(`[Rule ${rule.id}][Action disarmArea] Failed to disarm area ${areaId} (area not found or no update occurred).`);
                        }
                    } catch (areaError) {
                        console.error(`[Rule ${rule.id}][Action disarmArea] Error disarming area ${areaId}:`, areaError instanceof Error ? areaError.message : areaError);
                    }
                }
                break;
            }
            default:
                console.error(`[Automation Service] FATAL: Unhandled action type: ${(action as any).type} in rule ${rule.id} (${rule.name}).`);
                throw new Error(`Unhandled action type: ${(action as any).type}`);
        }
    };

    let retryCount = 0;
    const actionResult: any = null;
    let actionError: Error | null = null;

    try {
        await pRetry(runAction, {
            retries: 3, minTimeout: 500, maxTimeout: 5000, factor: 2, 
            onFailedAttempt: (error) => {
                retryCount = error.attemptNumber - 1; // pRetry counts from 1, we want 0-based
                console.warn(`[Rule ${rule.id}][Action ${action.type}] Attempt ${error.attemptNumber} failed. Retries left: ${error.retriesLeft}. Error: ${error.message}`);
            },
        });
        console.log(`[Automation Service] Successfully executed action type '${action.type}' for rule ${rule.id}`);
        
        // Complete action audit tracking - SUCCESS
        if (actionExecutionId) {
            try {
                await automationAuditService.completeActionExecution(actionExecutionId, {
                    status: ActionExecutionStatus.SUCCESS,
                    retryCount,
                    executionDurationMs: Date.now() - actionStartTime,
                    resultData: actionResult,
                });
            } catch (auditError) {
                console.error(`[Automation Service] Failed to complete action audit tracking for success:`, auditError);
            }
        }
        
    } catch (finalError) {
        actionError = finalError instanceof Error ? finalError : new Error(String(finalError));
        console.error(`[Rule ${rule.id}][Action ${action.type}] Failed permanently after all retries:`, actionError.message);
        
        // Complete action audit tracking - FAILURE
        if (actionExecutionId) {
            try {
                await automationAuditService.completeActionExecution(actionExecutionId, {
                    status: ActionExecutionStatus.FAILURE,
                    errorMessage: actionError.message,
                    retryCount,
                    executionDurationMs: Date.now() - actionStartTime,
                });
            } catch (auditError) {
                console.error(`[Automation Service] Failed to complete action audit tracking for failure:`, auditError);
            }
        }
        
        // Re-throw the error so the calling code can handle it
        throw actionError;
    }
}

/**
 * Resolves tokens in action parameter templates.
 * stdEvent is now optional and used if present for event-specific tokens.
 * tokenFactContext is the primary source for general facts (device, area, location, schedule).
 */
function resolveTokens(
    params: Record<string, unknown> | null | undefined,
    stdEvent: StandardizedEvent | null, // Now optional
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
        // Event-specific details, only if stdEvent is provided
        event: stdEvent ? {
            ...(tokenFactContext?.event ?? {}), // Allow override from facts if specific event fields put there
            id: stdEvent.eventId,
            category: stdEvent.category,
            type: stdEvent.type,
            subtype: stdEvent.subtype,
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
            } : {}),
        } : (tokenFactContext?.event ?? null), // If no stdEvent, still allow facts to have an 'event' object
        // For global access like {{currentTimeUTC}} if needed, could be added to tokenFactContext.schedule
        // currentTimeUTC: tokenFactContext?.schedule?.triggeredAtUTC, 
        // currentTimeLocal: tokenFactContext?.schedule?.triggeredAtLocal
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
 * Evaluates a temporal condition.
 * triggerEvent and triggerDeviceContext are optional (for scheduled triggers).
 * referenceTime is the anchor time for the window (either event time or current time for schedules).
 */
async function evaluateTemporalCondition(
    triggerEvent: StandardizedEvent | null, 
    condition: TemporalCondition, 
    triggerDeviceContext: SourceDeviceContext | null,
    referenceTime: Date // Explicitly pass the reference time
): Promise<boolean> {
    
    const triggerTimeToUse = referenceTime.getTime();

    const startTimeMs = condition.timeWindowSecondsBefore
        ? triggerTimeToUse - (condition.timeWindowSecondsBefore * 1000)
        : triggerTimeToUse;
    const endTimeMs = condition.timeWindowSecondsAfter
        ? triggerTimeToUse + (condition.timeWindowSecondsAfter * 1000)
        : triggerTimeToUse;

    const finalStartTime = new Date(Math.min(startTimeMs, endTimeMs));
    const finalEndTime = new Date(Math.max(startTimeMs, endTimeMs));
    
    let targetDeviceExternalIds: string[] | undefined = undefined;

    if (condition.scoping === 'sameArea' || condition.scoping === 'sameLocation') {
        // This scoping relies on triggerDeviceContext, which will be null for scheduled tasks
        // unless we define "sameArea/Location" relative to the rule's own scopeId.
        // For now, if triggerDeviceContext is null, these scopings will likely result in no devices.
        const scopeId = (condition.scoping === 'sameArea' && triggerDeviceContext?.area?.id)
                        ? triggerDeviceContext.area.id
                        : (condition.scoping === 'sameLocation' && triggerDeviceContext?.area?.location?.id)
                            ? triggerDeviceContext.area.location.id
                            : null; // If context is null, or area/location is null in context
        
        if (!scopeId && triggerDeviceContext) { // Only warn if context was expected but scopeId couldn't be derived
            console.warn(`[evaluateTemporalCondition] Cannot scope by ${condition.scoping}: Trigger device context available but no associated ${condition.scoping === 'sameArea' ? 'area' : 'location'}. Condition type ${condition.type} may fail.`);
        } else if (!scopeId && !triggerDeviceContext && (condition.scoping === 'sameArea' || condition.scoping === 'sameLocation')) {
            console.warn(`[evaluateTemporalCondition] Cannot scope by ${condition.scoping} for a non-event-triggered rule without a defined rule location scope to infer from. Condition type ${condition.type} may fail.`);
             // If no scopeId, this implies that for a scheduled trigger, these scopings are problematic
             // unless we adjust logic to use rule.locationScopeId if available.
             // For now, this will likely lead to no devices found.
        }


        if (scopeId) { // Only proceed if we derived a scopeId
            try {
                const scopedDeviceQuery = db.select({ externalId: devices.deviceId })
                                            .from(devices)
                                            .leftJoin(areaDevices, eq(devices.id, areaDevices.deviceId))
                                            .leftJoin(areas, eq(areaDevices.areaId, areas.id))
                                            .where(condition.scoping === 'sameArea' 
                                                    ? eq(areaDevices.areaId, scopeId)
                                                    : eq(areas.locationId, scopeId)); 
                const targetDevices = await scopedDeviceQuery;
                if (targetDevices.length === 0) {
                     console.log(`[evaluateTemporalCondition] No devices found matching scope '${condition.scoping}' (ID: ${scopeId}).`);
                     return condition.type === 'noEventOccurred'; // This makes sense: no devices means no events occurred from them
                }
                targetDeviceExternalIds = targetDevices.map(d => d.externalId);
            } catch (dbError) {
                console.error(`[evaluateTemporalCondition] Error fetching devices for ${condition.scoping} scope (ID: ${scopeId}):`, dbError);
                return false;
            }
        } else if (condition.scoping === 'sameArea' || condition.scoping === 'sameLocation') {
            // If scopeId could not be determined for these scopings, it means no devices match this criteria.
            return condition.type === 'noEventOccurred';
        }
    } 
    
    const repoFilter: eventsRepository.FindEventsFilter = {
        startTime: finalStartTime,
        endTime: finalEndTime,
        specificDeviceIds: targetDeviceExternalIds, 
    };
    
    let candidateEvents: StandardizedEvent[] = [];
    try {
        candidateEvents = await findEventsInWindow(repoFilter);
    } catch (error) {
        console.error(`[evaluateTemporalCondition] Error calling findEventsInWindow. Filter: ${JSON.stringify(repoFilter)}`, error);
        return false;
    }

    if (candidateEvents.length === 0) {
        return condition.type === 'noEventOccurred';
    }
    
    let finalMatchCount = 0;
    for (const event of candidateEvents) {
        const eventPayload = event.payload as any;
        // For temporal conditions, the facts for the engine are derived purely from the candidate event itself.
        // No area/location context is assumed for these past events unless already on event.deviceInfo
        const eventFacts: Record<string, any> = {
             event: {
                 category: event.category ?? null, type: event.type ?? null, subtype: event.subtype ?? null,
                 displayState: eventPayload?.displayState ?? null, statusType: eventPayload?.statusType ?? null,
                 rawStateValue: eventPayload?.rawStateValue ?? null, originalEventType: eventPayload?.originalEventType ?? null,
             },
             device: { 
                 externalId: event.deviceId ?? null, type: event.deviceInfo?.type ?? null, subtype: event.deviceInfo?.subtype ?? null
             },
             connector: { id: event.connectorId ?? null },
             area: null, // Cannot easily get historical area for an event for this check
             location: null, // Cannot easily get historical location
        };
        
        const temporalRequiredPaths = extractReferencedFactPaths(condition.eventFilter);
        const minimalTemporalFacts: Record<string, any> = {};
        temporalRequiredPaths.forEach(path => {
            const value = resolvePath(eventFacts, path);
            minimalTemporalFacts[path] = (value === undefined ? null : value);
        });
        
        try {
            const engine = new Engine(); // Fresh engine
            engine.addRule({ conditions: condition.eventFilter as any, event: { type: 'eventFilterMatch' } });
            const { events: filterMatchEvents } = await engine.run(minimalTemporalFacts);
            if (filterMatchEvents.length > 0) {
                finalMatchCount++;
            }
        } catch (engineError) {
            console.error(`[evaluateTemporalCondition] Error running engine for event filter count check on event ${event.eventId}:`, engineError);
        }
    }

    console.log(`[evaluateTemporalCondition] Condition ID ${condition.id}: Found ${finalMatchCount} events matching filter within window.`);

    switch (condition.type) {
        case 'eventOccurred': return finalMatchCount > 0;
        case 'noEventOccurred': return finalMatchCount === 0;
        case 'eventCountEquals':
            if (condition.expectedEventCount === undefined) { console.warn(`Temporal Cond ID ${condition.id}: Missing expectedEventCount.`); return false; }
            return finalMatchCount === condition.expectedEventCount;
        case 'eventCountLessThan':
            if (condition.expectedEventCount === undefined) { console.warn(`Temporal Cond ID ${condition.id}: Missing expectedEventCount.`); return false; }
            return finalMatchCount < condition.expectedEventCount;
        case 'eventCountGreaterThan':
            if (condition.expectedEventCount === undefined) { console.warn(`Temporal Cond ID ${condition.id}: Missing expectedEventCount.`); return false; }
            return finalMatchCount > condition.expectedEventCount;
        case 'eventCountLessThanOrEqual':
             if (condition.expectedEventCount === undefined) { console.warn(`Temporal Cond ID ${condition.id}: Missing expectedEventCount.`); return false; }
             return finalMatchCount <= condition.expectedEventCount;
        case 'eventCountGreaterThanOrEqual':
            if (condition.expectedEventCount === undefined) { console.warn(`Temporal Cond ID ${condition.id}: Missing expectedEventCount.`); return false; }
            return finalMatchCount >= condition.expectedEventCount;
        default:
            console.warn(`[evaluateTemporalCondition] Condition ID ${condition.id}: Unknown condition type '${(condition as any).type}'.`);
            return false;
    }
}


