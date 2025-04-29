// import 'server-only'; // Removed for now

import { db } from '@/data/db';
import { automations, connectors, devices, cameraAssociations } from '@/data/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import type { StandardizedEvent } from '@/types/events'; // <-- Import StandardizedEvent
import { DeviceType } from '@/lib/mappings/definitions'; // <-- Import DeviceType enum
import * as piko from '@/services/drivers/piko'; // Assuming Piko driver functions are here
import { type AutomationConfig, AutomationConfigSchema, type AutomationAction, type SecondaryCondition } from '@/lib/automation-schemas';
import pRetry from 'p-retry'; // Import p-retry
import type { PikoCreateBookmarkPayload } from '@/services/drivers/piko'; // Import the specific payload type
// Import other necessary drivers or services as needed
import type { SendHttpRequestActionParamsSchema } from '@/lib/automation-schemas';
import { z } from 'zod'; // Add Zod import
import * as eventsRepository from '@/data/repositories/events'; // Import the event repository

/**
 * Processes a standardized event against connector-agnostic automation rules.
 * @param stdEvent The incoming StandardizedEvent object.
 */
export async function processEvent(stdEvent: StandardizedEvent): Promise<void> {
    console.log(`[Automation Service] ENTERED processEvent for event: ${stdEvent.eventId}`);
    console.log(`[Automation Service] Processing event: ${stdEvent.type} (${stdEvent.category}) for device ${stdEvent.deviceId} from connector ${stdEvent.connectorId}`);

    try {
        // Fetch all enabled automations
        const allEnabledAutomations = await db.query.automations.findMany({
            where: eq(automations.enabled, true),
        });

        if (allEnabledAutomations.length === 0) {
            console.log(`[Automation Service] No enabled automations found.`);
            return;
        }

        console.log(`[Automation Service] Evaluating ${allEnabledAutomations.length} enabled automation(s) against event ${stdEvent.eventId}`);

        const triggerDeviceType = stdEvent.deviceInfo?.type ?? DeviceType.Unmapped;

        for (const rule of allEnabledAutomations) {
            let ruleConfig: AutomationConfig;
            try {
                const parseResult = AutomationConfigSchema.safeParse(rule.configJson);
                if (!parseResult.success) {
                    console.error(`[Automation Service] Rule ID ${rule.id} (${rule.name}): Failed to parse configJson - ${parseResult.error.message}. Skipping.`);
                    continue; 
                }
                ruleConfig = parseResult.data;

                // --- Primary Trigger Matching (Connector-Agnostic) --- 
                const trigger = ruleConfig.primaryTrigger;
                let primaryTriggerMatched = false;

                // Match based on event type / subtype filter (array of combined strings)
                if (!trigger.eventTypeFilter || trigger.eventTypeFilter.length === 0) {
                    primaryTriggerMatched = true; // No filter means match any event type
                } else {
                    for (const filterString of trigger.eventTypeFilter) {
                        const [filterType, filterSubtype] = filterString.split('.'); // e.g., "ACCESS_DENIED" or "ACCESS_DENIED.INVALID_CREDENTIAL"
                        
                        // Check if the event's type matches the filter's type part
                        if (stdEvent.type === filterType) {
                            // If a subtype is specified in the filter, check if it matches the event's subtype
                            // If no subtype is specified (filter is just "TYPE"), it matches any event subtype (including undefined)
                            if (!filterSubtype || stdEvent.subtype === filterSubtype) {
                                primaryTriggerMatched = true;
                                break; // Found a match, no need to check other filters in the array
                            }
                        }
                    }
                }
                
                if (!primaryTriggerMatched) {
                    // console.log(`[Rule ${rule.id}] Skipping: Event type/subtype does not match filter.`);
                    continue;
                }

                // Match based on standardized device type
                if (trigger.sourceEntityTypes && trigger.sourceEntityTypes.length > 0) { 
                    // TODO: Handle "Type.Subtype" format in trigger.sourceEntityTypes if needed?
                    // Currently assumes triggerDeviceType is just the base type (e.g., "Sensor")
                    if (!trigger.sourceEntityTypes.includes(triggerDeviceType)) {
                        continue; 
                    }
                }
                
                console.log(`[Automation Service] Rule ID ${rule.id} (${rule.name}): Primary trigger matched for event ${stdEvent.eventId}.`);

                // --- Secondary Condition Evaluation (Connector-Agnostic) --- 
                let allConditionsMet = true; 
                if (ruleConfig.secondaryConditions && ruleConfig.secondaryConditions.length > 0) {
                    console.log(`[Rule ${rule.id}] Evaluating ${ruleConfig.secondaryConditions.length} secondary condition(s)...`);
                    
                    for (const condition of ruleConfig.secondaryConditions) {
                        const conditionMet = await evaluateSecondaryCondition(stdEvent, condition);
                        if (!conditionMet) {
                            console.log(`[Rule ${rule.id}] Secondary condition ID ${condition.id} (Type: ${condition.type}) NOT MET. Stopping evaluation for this rule.`);
                            allConditionsMet = false;
                            break; 
                        } else {
                            console.log(`[Rule ${rule.id}] Secondary condition ID ${condition.id} (Type: ${condition.type}) MET.`);
                        }
                    } 
                } else {
                    console.log(`[Rule ${rule.id}] No secondary conditions to evaluate.`);
                }

                // --- Action Execution --- 
                if (allConditionsMet) {
                    console.log(`[Automation Service] Rule ID ${rule.id} (${rule.name}): All conditions passed. Proceeding to execute ${ruleConfig.actions.length} action(s).`);
                    
                    if (!ruleConfig.actions || ruleConfig.actions.length === 0) {
                         console.warn(`[Automation Service] Rule ID ${rule.id}: Skipping action execution - No actions defined despite passing conditions.`);
                         continue;
                    }

                    // Fetch Source Device details (using trigger event context) for token replacement
                    let sourceDevice = null;
                    if (stdEvent.deviceId) { 
                        sourceDevice = await db.query.devices.findFirst({
                            where: and(
                                eq(devices.connectorId, stdEvent.connectorId), 
                                eq(devices.deviceId, stdEvent.deviceId)
                            ),
                            // Select columns needed for tokens or action logic (e.g., internal id for associations)
                            columns: { id: true, name: true, type: true } 
                        });
                    }
                    const deviceContext = sourceDevice ?? { 
                        id: stdEvent.deviceId, 
                        name: 'Unknown Device', 
                        type: triggerDeviceType 
                    }; 

                    for (const action of ruleConfig.actions) {
                        await executeActionWithRetry(rule, action, stdEvent, deviceContext);
                    } 
                } else {
                     console.log(`[Automation Service] Rule ID ${rule.id} (${rule.name}): Did not execute actions because not all conditions were met.`);
                }

            } catch (ruleProcessingError) {
                console.error(`[Automation Service] Error processing rule ${rule.id} (${rule.name}):`, ruleProcessingError);
                continue; 
            }
        } // End loop through rules
    } catch (error) {
        console.error('[Automation Service] Top-level error processing event:', error);
    }
}

/**
 * Evaluates a single secondary condition (connector-agnostic).
 */
async function evaluateSecondaryCondition(
    triggerEvent: StandardizedEvent, 
    condition: SecondaryCondition
): Promise<boolean> {
    const triggerTime = triggerEvent.timestamp.getTime();

    const startTimeMs = condition.timeWindowSecondsBefore
        ? triggerTime - (condition.timeWindowSecondsBefore * 1000)
        : triggerTime; 
    const endTimeMs = condition.timeWindowSecondsAfter
        ? triggerTime + (condition.timeWindowSecondsAfter * 1000)
        : triggerTime; 

    const finalStartTime = new Date(Math.min(startTimeMs, endTimeMs));
    const finalEndTime = new Date(Math.max(startTimeMs, endTimeMs));
    
    // --- Parse combined event type/subtype filters --- 
    let targetEventTypes: string[] | undefined = undefined;
    let targetEventSubtypes: string[] | undefined = undefined;
    if (condition.eventTypeFilter && condition.eventTypeFilter.length > 0) {
        const uniqueTypes = new Set<string>();
        const uniqueSubtypes = new Set<string>();
        const matchAnySubtypeForType = new Set<string>(); // Change let to const

        for (const filterString of condition.eventTypeFilter) {
            const [filterType, filterSubtype] = filterString.split('.');
            uniqueTypes.add(filterType);
            if (filterSubtype) {
                uniqueSubtypes.add(filterSubtype);
            } else {
                 // If filter is just "TYPE", we need to match any event with this type
                 // This is handled by default if uniqueSubtypes is empty for this type
                 // OR we can explicitly track it if mixing "TYPE" and "TYPE.SUBTYPE" filters
                 matchAnySubtypeForType.add(filterType);
            }
        }
        targetEventTypes = Array.from(uniqueTypes);
        // Only filter by specific subtypes if they were provided AND we aren't explicitly matching any subtype for all types
        if (uniqueSubtypes.size > 0) {
            // Refine: What if filter is ["TYPE", "TYPE.SUBTYPE1"]? 
            // We want TYPE events with *any* subtype OR specifically SUBTYPE1. 
            // Current repo logic might not support this OR logic easily.
            // Simplification: If *any* filter is just "TYPE", don't filter by subtype.
            const matchAnyOverall = targetEventTypes.some(t => matchAnySubtypeForType.has(t));
            if (!matchAnyOverall) { 
                targetEventSubtypes = Array.from(uniqueSubtypes);
            } // Else: targetEventSubtypes remains undefined, matching any subtype for the specified types
        }
    }
    
    // Prepare filter for repository
    const repoFilter: eventsRepository.FindEventsFilter = {
        startTime: finalStartTime,
        endTime: finalEndTime,
        standardizedEventTypes: targetEventTypes, // Pass parsed types
        standardizedEventSubtypes: targetEventSubtypes, // Pass parsed subtypes (if applicable)
        standardizedDeviceTypes: condition.entityTypeFilter?.length ? condition.entityTypeFilter : undefined, 
    };
    
    console.log(`[evaluateSecondaryCondition] Condition ID ${condition.id}: Querying eventsRepository.findEventsInWindow with filter:`, repoFilter);
    
    try {
        const eventExists = await eventsRepository.findEventsInWindow(repoFilter);
        console.log(`[evaluateSecondaryCondition] Condition ID ${condition.id}: findEventsInWindow returned: ${eventExists}`);

        if (condition.type === 'eventOccurred') {
            return eventExists;
        } else if (condition.type === 'noEventOccurred') {
            return !eventExists;
        } else {
            // Should not happen due to schema validation, but good practice
            console.warn(`[evaluateSecondaryCondition] Condition ID ${condition.id}: Unknown condition type '${(condition as any).type}'. Evaluating as false.`);
            return false;
        }
    } catch (error) {
        console.error(`[evaluateSecondaryCondition] Condition ID ${condition.id}: Error calling findEventsInWindow:`, error);
        return false;
    }
}

/**
 * Executes a single automation action with retry logic.
 */
async function executeActionWithRetry(
    rule: { id: string; name: string }, 
    action: AutomationAction, 
    stdEvent: StandardizedEvent, 
    deviceContext: Record<string, unknown>
) {
    console.log(`[Automation Service] Attempting action type '${action.type}' for rule ${rule.id} (${rule.name})`);
    
    const runAction = async () => {
        const resolvedParams = resolveTokens(action.params, stdEvent, deviceContext) as AutomationAction['params'];
        
        switch (action.type) {
            // Case 'createEvent'
            case 'createEvent': {
                if (!('sourceTemplate' in resolvedParams && 'captionTemplate' in resolvedParams && 'descriptionTemplate' in resolvedParams && 'targetConnectorId' in resolvedParams)) {
                    throw new Error(`Invalid/missing parameters for createEvent action.`);
                }
                const targetConnector = await db.query.connectors.findFirst({
                    where: eq(connectors.id, resolvedParams.targetConnectorId!),
                    columns: { id: true, category: true, cfg_enc: true }
                });
                if (!targetConnector || !targetConnector.cfg_enc || !targetConnector.category) {
                    throw new Error(`Target connector ${resolvedParams.targetConnectorId} not found or has no config/category for createEvent action.`);
                }
                const targetConfig = JSON.parse(targetConnector.cfg_enc);
                if (targetConnector.category === 'piko') {
                    const { username, password, selectedSystem } = targetConfig as Partial<piko.PikoConfig>;
                    if (!username || !password || !selectedSystem) { throw new Error(`Missing Piko config for target connector ${targetConnector.id}`); }
                    const pikoTokenResponse: piko.PikoTokenResponse = await piko.getSystemScopedAccessToken(username, password, selectedSystem);
                    let associatedPikoCameraExternalIds: string[] = [];
                    const sourceDeviceInternalId = (deviceContext as any).id; // Assuming internal ID is on context
                    if (sourceDeviceInternalId && typeof sourceDeviceInternalId === 'string' && sourceDeviceInternalId !== stdEvent.deviceId /* Check if it's UUID */) {
                        try {
                            const associations = await db.select({ pikoCameraInternalId: cameraAssociations.pikoCameraId }).from(cameraAssociations).where(eq(cameraAssociations.deviceId, sourceDeviceInternalId));
                            const internalCameraIds = associations.map(a => a.pikoCameraInternalId);
                            if (internalCameraIds.length > 0) {
                                const cameraDevices = await db.select({ externalId: devices.deviceId }).from(devices).where(inArray(devices.id, internalCameraIds)); 
                                associatedPikoCameraExternalIds = cameraDevices.map(d => d.externalId);
                            }
                        } catch (assocError) { console.error(`[Rule ${rule.id}][Action createEvent] Error fetching camera associations:`, assocError); }
                    } else { console.warn(`[Rule ${rule.id}][Action createEvent] Could not get internal ID for source device ${stdEvent.deviceId}. Cannot fetch camera associations.`); }
                    const pikoPayload: piko.PikoCreateEventPayload = { 
                        source: resolvedParams.sourceTemplate, 
                        caption: resolvedParams.captionTemplate, 
                        description: resolvedParams.descriptionTemplate, 
                        timestamp: stdEvent.timestamp.toISOString(),
                        ...(associatedPikoCameraExternalIds.length > 0 && { metadata: { cameraRefs: associatedPikoCameraExternalIds } })
                    };
                    await piko.createPikoEvent(selectedSystem, pikoTokenResponse.accessToken, pikoPayload);
                } else { console.warn(`[Rule ${rule.id}][Action createEvent] Unsupported target connector category ${targetConnector.category}`); }
                break;
            }
            // Case 'createBookmark'
            case 'createBookmark': {
                if (!('nameTemplate' in resolvedParams && 'durationMsTemplate' in resolvedParams && 'targetConnectorId' in resolvedParams)) {
                    throw new Error(`Invalid/missing parameters for createBookmark action.`);
                }
                const targetConnector = await db.query.connectors.findFirst({
                    where: eq(connectors.id, resolvedParams.targetConnectorId!),
                    columns: { id: true, category: true, cfg_enc: true }
                });
                if (!targetConnector || !targetConnector.cfg_enc || !targetConnector.category) {
                    throw new Error(`Target connector ${resolvedParams.targetConnectorId} not found or has no config/category for createBookmark action.`);
                }
                const targetConfig = JSON.parse(targetConnector.cfg_enc);
                if (targetConnector.category === 'piko') {
                    const { username, password, selectedSystem } = targetConfig as Partial<piko.PikoConfig>;
                    if (!username || !password || !selectedSystem) { throw new Error(`Missing Piko config for target connector ${targetConnector.id}`); }
                    let associatedPikoCameraExternalIds: string[] = [];
                    const sourceDeviceInternalId = (deviceContext as any).id;
                    if (sourceDeviceInternalId && typeof sourceDeviceInternalId === 'string' && sourceDeviceInternalId !== stdEvent.deviceId) {
                        try {
                            const associations = await db.select({ pikoCameraInternalId: cameraAssociations.pikoCameraId }).from(cameraAssociations).where(eq(cameraAssociations.deviceId, sourceDeviceInternalId));
                            const internalCameraIds = associations.map(a => a.pikoCameraInternalId);
                            if (internalCameraIds.length === 0) { console.warn(`[Rule ${rule.id}][Action createBookmark] No Piko cameras associated with source device ${sourceDeviceInternalId}. Skipping.`); break; }
                            const cameraDevices = await db.select({ externalId: devices.deviceId }).from(devices).where(inArray(devices.id, internalCameraIds)); 
                            associatedPikoCameraExternalIds = cameraDevices.map(d => d.externalId);
                        } catch (assocError) { console.error(`[Rule ${rule.id}][Action createBookmark] Error fetching camera associations:`, assocError); throw new Error(`Failed to fetch camera associations: ${assocError instanceof Error ? assocError.message : assocError}`); }
                    } else { console.warn(`[Rule ${rule.id}][Action createBookmark] Could not get internal ID for source device ${stdEvent.deviceId}. Skipping bookmark creation.`); break; }
                    let durationMs = 5000;
                    try { const parsedDuration = parseInt(resolvedParams.durationMsTemplate, 10); if (!isNaN(parsedDuration) && parsedDuration > 0) durationMs = parsedDuration; } catch {} 
                    let tags: string[] = [];
                    if (resolvedParams.tagsTemplate && resolvedParams.tagsTemplate.trim() !== '') { try { tags = resolvedParams.tagsTemplate.split(',').map(tag => tag.trim()).filter(tag => tag !== ''); } catch {} }
                    const pikoTokenResponse: piko.PikoTokenResponse = await piko.getSystemScopedAccessToken(username, password, selectedSystem);
                    for (const pikoCameraDeviceId of associatedPikoCameraExternalIds) {
                        const pikoPayload: PikoCreateBookmarkPayload = {
                            name: resolvedParams.nameTemplate,
                            description: resolvedParams.descriptionTemplate || undefined,
                            startTimeMs: stdEvent.timestamp.getTime(),
                            durationMs: durationMs,
                            tags: tags.length > 0 ? tags : undefined
                        };
                        await piko.createPikoBookmark(selectedSystem, pikoTokenResponse.accessToken, pikoCameraDeviceId, pikoPayload);
                    }
                } else { console.warn(`[Rule ${rule.id}][Action createBookmark] Unsupported target connector category ${targetConnector.category}`); }
                break;
            }
            // Case 'sendHttpRequest'
            case 'sendHttpRequest': {
                const httpParams = resolvedParams as z.infer<typeof SendHttpRequestActionParamsSchema>; 
                const headers = new Headers({ 'User-Agent': 'FusionBridge Automation/1.0' });
                if (Array.isArray(httpParams.headers)) {
                    for (const header of httpParams.headers) {
                        if (header.keyTemplate && typeof header.keyTemplate === 'string' && typeof header.valueTemplate === 'string') {
                            const key = header.keyTemplate.trim();
                            if (key) try { headers.set(key, header.valueTemplate); } catch (e) { console.warn(`[Rule ${rule.id}][Action sendHttpRequest] Invalid header name: "${key}". Skipping.`, e); }
                        }
                    }
                }
                const fetchOptions: RequestInit = { method: httpParams.method, headers: headers };
                if (['POST', 'PUT', 'PATCH'].includes(httpParams.method) && httpParams.bodyTemplate) {
                    if (!headers.has('Content-Type') && httpParams.bodyTemplate.trim().startsWith('{')) headers.set('Content-Type', 'application/json');
                    fetchOptions.body = httpParams.bodyTemplate;
                }
                const response = await fetch(httpParams.urlTemplate, fetchOptions);
                if (!response.ok) {
                    let responseBody = '';
                    try { responseBody = await response.text(); console.error(`[Rule ${rule.id}][Action sendHttpRequest] Response body (error): ${responseBody.substring(0, 500)}...`); } catch { console.error(`[Rule ${rule.id}][Action sendHttpRequest] Could not read response body on error.`); }
                    throw new Error(`HTTP request failed with status ${response.status}: ${response.statusText}`);
                }
                break;
            }
            // Default case
            default: {
                const _exhaustiveCheck: never = action;
                console.warn(`[Rule ${rule.id}] Unknown or unhandled action type: ${(_exhaustiveCheck as any)?.type}`);
            }
        }
    };

    try {
        await pRetry(runAction, {
            retries: 3, 
            minTimeout: 500, 
            maxTimeout: 5000, 
            factor: 2, 
            onFailedAttempt: (error) => {
                console.warn(`[Rule ${rule.id}][Action ${action.type}] Attempt ${error.attemptNumber} failed. Retries left: ${error.retriesLeft}. Error: ${error.message}`);
            },
        });
        console.log(`[Automation Service] Successfully executed action type '${action.type}' for rule ${rule.id}`);
    } catch (finalError) {
        console.error(`[Rule ${rule.id}][Action ${action.type}] Failed permanently after all retries:`, finalError instanceof Error ? finalError.message : finalError);
    }
}

/**
 * Resolves tokens in action parameter templates using StandardizedEvent data.
 */
function resolveTokens(
    params: Record<string, unknown> | null | undefined, 
    stdEvent: StandardizedEvent, 
    deviceContext: Record<string, unknown> | null | undefined 
): Record<string, unknown> | null | undefined { 
    
    if (params === null || params === undefined) {
        return params;
    }
    
    // --- Build the context for token replacement --- 
    const tokenContext = {
        // Event-related tokens
        event: {
            id: stdEvent.eventId,
            category: stdEvent.category,
            type: stdEvent.type,
            timestamp: stdEvent.timestamp.toISOString(), // Keep ISO string format
            timestampMs: stdEvent.timestamp.getTime(), // Add epoch ms
            deviceId: stdEvent.deviceId,
            connectorId: stdEvent.connectorId,
            // Flatten relevant payload fields for easier access
            // Add more fields from specific payload types as needed
            ...(stdEvent.payload && typeof stdEvent.payload === 'object' ? {
                newState: (stdEvent.payload as any).newState,
                displayState: (stdEvent.payload as any).displayState,
                statusType: (stdEvent.payload as any).statusType,
                detectionType: (stdEvent.payload as any).detectionType,
                confidence: (stdEvent.payload as any).confidence,
                zone: (stdEvent.payload as any).zone,
                originalEventType: (stdEvent.payload as any).originalEventType,
                // Add direct access to raw state value if useful
                rawStateValue: (stdEvent.payload as any).rawStateValue,
                rawStatusValue: (stdEvent.payload as any).rawStatusValue,
            } : {}),
             // Include the full payload object if needed, but nested access is harder
            // payload: stdEvent.payload 
             // Include raw payload if needed for specific use cases
            // rawPayload: stdEvent.rawEventPayload 
        },
        // Device-related tokens (based on DB lookup or fallback)
        device: {
            ...(deviceContext ?? {}), // Spread the provided device context
            // Standardize access to standardized type/subtype from event
            type: stdEvent.deviceInfo?.type,
            subtype: stdEvent.deviceInfo?.subtype
        }
    };

    // --- Token Replacement Logic --- 
    const resolved = { ...params }; // Create a copy to modify

    const replaceToken = (template: string): string => {
        if (typeof template !== 'string') return template; 
        
        return template.replace(/\{\{\s*([^}]+)\s*\}\}/g, (match, path) => {
            const keys = path.trim().split('.');
            let value: unknown = tokenContext; 
            
            try {
                for (const key of keys) {
                    // Check if value is an object and key exists before accessing
                    if (value !== null && typeof value === 'object' && key in value) {
                        value = (value as Record<string, unknown>)[key]; 
                    } else {
                        // Path is invalid or key doesn't exist at this level
                        console.warn(`[Token Resolve] Path '${path}' not found in context.`);
                        return match; // Return original token {{...}}
                    }
                }
                
                // Convert resolved value to string
                // Stringify objects/arrays, handle null/undefined, convert others
                if (value === undefined || value === null) {
                    return ''; // Replace null/undefined with empty string
                } else if (typeof value === 'object') {
                    return JSON.stringify(value); // Stringify objects/arrays
                } else {
                    return String(value); // Convert primitives to string
                }
            } catch (e) {
                console.error(`[Token Resolve] Error resolving path ${path}:`, e);
                return match; // Keep original token on error
            }
        });
    };

    // Iterate over parameters and apply token replacement
    for (const key in resolved) {
        if (Object.prototype.hasOwnProperty.call(resolved, key) && typeof resolved[key] === 'string') {
            resolved[key] = replaceToken(resolved[key] as string);
        }
        // Optionally handle nested structures or arrays within params if needed
    }
    return resolved;
}


