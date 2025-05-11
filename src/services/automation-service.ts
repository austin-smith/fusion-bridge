import 'server-only';

import { db } from '@/data/db';
import { automations, connectors, devices, cameraAssociations, areas, areaDevices, locations } from '@/data/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import type { StandardizedEvent } from '@/types/events'; // <-- Import StandardizedEvent
import { DeviceType } from '@/lib/mappings/definitions'; // <-- Import DeviceType enum
import * as piko from '@/services/drivers/piko'; // Assuming Piko driver functions are here
import { type AutomationConfig, AutomationConfigSchema, type AutomationAction, type TemporalCondition, SetDeviceStateActionParamsSchema } from '@/lib/automation-schemas';
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
import { ActionableState } from '@/lib/mappings/definitions';

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

        // --- Fetch Source Device details (including area and location) ---
        let sourceDeviceContext: SourceDeviceContext | null = null; // Define outside try block

        if (stdEvent.deviceId && stdEvent.connectorId) {
            try {
                const deviceRecord = await db.query.devices.findFirst({
                    where: and(
                        eq(devices.connectorId, stdEvent.connectorId),
                        eq(devices.deviceId, stdEvent.deviceId)
                    ),
                    columns: { id: true, name: true, standardizedDeviceType: true, standardizedDeviceSubtype: true },
                    // --- Eager load area and its location --- 
                    with: {
                        areaDevices: {
                            with: {
                                area: {
                                    with: {
                                        location: true, // Include location data
                                    }
                                }
                            }
                        }
                    }
                });
                
                if (deviceRecord && deviceRecord.areaDevices.length > 0) {
                     // Assuming one area per device based on previous decision
                    const areaInfo = deviceRecord.areaDevices[0].area;
                    sourceDeviceContext = {
                        id: deviceRecord.id,
                        name: deviceRecord.name,
                        standardizedDeviceType: deviceRecord.standardizedDeviceType,
                        standardizedDeviceSubtype: deviceRecord.standardizedDeviceSubtype,
                        area: areaInfo, // Includes location nested inside
                    };
                } else if (deviceRecord) {
                     // Device found, but no area assigned
                     sourceDeviceContext = { 
                        id: deviceRecord.id, 
                        name: deviceRecord.name, 
                        standardizedDeviceType: deviceRecord.standardizedDeviceType,
                        standardizedDeviceSubtype: deviceRecord.standardizedDeviceSubtype,
                        area: null 
                    }; 
                } else {
                    console.warn(`[Automation Service] Could not find internal device record for external device ${stdEvent.deviceId}`);
                }
            } catch (deviceFetchError) {
                 console.error(`[Automation Service] Error fetching device details for ${stdEvent.deviceId}:`, deviceFetchError);
            }
        }
        // --- End Fetch Source Device ---

        for (const rule of allEnabledAutomations) {
            let ruleConfig: AutomationConfig;
            try {
                // Parse the config using the UPDATED schema
                const parseResult = AutomationConfigSchema.safeParse(rule.configJson);
                if (!parseResult.success) {
                    console.error(`[Automation Service] Rule ID ${rule.id} (${rule.name}): Failed to parse configJson - ${parseResult.error.message}. Skipping.`);
                    continue;
                }
                ruleConfig = parseResult.data;

                // --- Construct Facts for State Conditions ---
                const payload = stdEvent.payload as any; // Cast once for easier access
                const fullFacts: Record<string, any> = { // Keep the fully populated object for logging/tokens
                    event: {
                        category: stdEvent.category ?? null,
                        type: stdEvent.type ?? null,
                        subtype: stdEvent.subtype ?? null,
                        displayState: payload?.displayState ?? null,
                        statusType: payload?.statusType ?? null,
                        rawStateValue: payload?.rawStateValue ?? null,
                        originalEventType: payload?.originalEventType ?? null,
                    },
                    device: {
                        id: sourceDeviceContext?.id ?? null,
                        externalId: stdEvent.deviceId ?? null,
                        name: sourceDeviceContext?.name ?? null,
                        type: sourceDeviceContext?.standardizedDeviceType ?? null,
                        subtype: sourceDeviceContext?.standardizedDeviceSubtype ?? null,
                    },
                    connector: {
                        id: stdEvent.connectorId ?? null
                    },
                    area: null,
                    location: null,
                };

                if (sourceDeviceContext?.area) {
                    fullFacts.area = {
                        id: sourceDeviceContext.area.id ?? null,
                        name: sourceDeviceContext.area.name ?? null,
                        armedState: sourceDeviceContext.area.armedState ?? null,
                    };
                    if (sourceDeviceContext.area.location) {
                        fullFacts.location = {
                            id: sourceDeviceContext.area.location.id ?? null,
                            name: sourceDeviceContext.area.location.name ?? null,
                        };
                    }
                }
                
                // --- Filter facts ONLY for the engine.run call ---
                const factsForEngine: Record<string, any> = {
                    event: fullFacts.event,
                    device: fullFacts.device,
                    connector: fullFacts.connector,
                };
                 if (fullFacts.area !== null) {
                     factsForEngine.area = fullFacts.area;
                 }
                 if (fullFacts.location !== null) {
                     factsForEngine.location = fullFacts.location;
                 }

                 // --- NEW: Flatten facts for engine --- 
                 const requiredPaths = extractReferencedFactPaths(ruleConfig.conditions);
                 const minimalFactsForEngine: Record<string, any> = {};
                 requiredPaths.forEach(path => {
                     const value = resolvePath(fullFacts, path);
                     // Always add the path, setting value to null if lookup failed
                     minimalFactsForEngine[path] = (value === undefined ? null : value);
                 });
                 // --- End NEW --- 

                // --- Evaluate State Conditions (json-rules-engine) ---
                const engine = new Engine();
                
                engine.addRule({
                    conditions: ruleConfig.conditions as any, 
                    event: { type: 'ruleMatched' }
                });

                let stateConditionsMet = false;
                try {
                     // --- Pass the MINIMAL facts object ---
                     const { events: engineEvents } = await engine.run(minimalFactsForEngine);
                     if (engineEvents.length > 0) {
                         stateConditionsMet = true;
                         console.log(`[Automation Service] Rule ID ${rule.id} (${rule.name}): State conditions MET.`);
                     } else {
                         console.log(`[Automation Service] Rule ID ${rule.id} (${rule.name}): State conditions NOT MET.`);
                     }
                } catch (engineError) {
                     console.error(`[Automation Service] Rule ID ${rule.id} (${rule.name}): Error running json-rules-engine:`, engineError);
                     continue; // Skip rule on engine error
                }

                // --- Evaluate Temporal Conditions (Only if State Conditions Passed) ---
                let temporalConditionsMet = true; // Default to true if no temporal conditions exist
                if (stateConditionsMet && ruleConfig.temporalConditions && ruleConfig.temporalConditions.length > 0) {
                    console.log(`[Rule ${rule.id}] Evaluating ${ruleConfig.temporalConditions.length} temporal condition(s)...`);
                    temporalConditionsMet = false; // Assume false until proven true by ALL conditions passing
                    
                    let allTemporalPassed = true; // Flag to track if all temporal checks pass
                    for (const condition of ruleConfig.temporalConditions) {
                        // --- Pass trigger device context to evaluation function ---
                        const conditionMet = await evaluateTemporalCondition(stdEvent, condition, sourceDeviceContext);
                        if (!conditionMet) {
                            console.log(`[Rule ${rule.id}] Temporal condition ID ${condition.id} (Type: ${condition.type}) NOT MET.`);
                            allTemporalPassed = false;
                            break; // Stop checking temporal conditions for this rule
                        } else {
                            console.log(`[Rule ${rule.id}] Temporal condition ID ${condition.id} (Type: ${condition.type}) MET.`);
                        }
                    } 
                    temporalConditionsMet = allTemporalPassed; // Final result of temporal checks
                } else if (stateConditionsMet) {
                    console.log(`[Rule ${rule.id}] No temporal conditions to evaluate.`);
                }

                // --- Action Execution (Only if BOTH State and Temporal Conditions Passed) ---
                if (stateConditionsMet && temporalConditionsMet) {
                    console.log(`[Automation Service] Rule ID ${rule.id} (${rule.name}): ALL conditions passed. Proceeding to execute ${ruleConfig.actions.length} action(s).`);

                    if (!ruleConfig.actions || ruleConfig.actions.length === 0) {
                        console.warn(`[Automation Service] Rule ID ${rule.id}: Skipping action execution - No actions defined despite passing conditions.`);
                        continue;
                    }

                    // --- Use the original fullFacts for token replacement context ---
                    for (const action of ruleConfig.actions) {
                        await executeActionWithRetry(rule, action, stdEvent, fullFacts);
                    }
                } else {
                     // Log why actions weren't executed
                     if (!stateConditionsMet) {
                         // Already logged above
                     } else if (!temporalConditionsMet) {
                          console.log(`[Automation Service] Rule ID ${rule.id} (${rule.name}): Did not execute actions because not all temporal conditions were met.`);
                     }
                } 
                // --- End Action Execution ---

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
 * Executes a single automation action with retry logic.
 */
async function executeActionWithRetry(
    rule: { id: string; name: string },
    action: AutomationAction,
    stdEvent: StandardizedEvent,
    // Use the full facts object (which might include null area/location) for tokens
    tokenFactContext: Record<string, any> 
) {
    console.log(`[Automation Service] Attempting action type '${action.type}' for rule ${rule.id} (${rule.name})`);
    
    const runAction = async () => {
        // Token resolution is generally for string templates.
        // For setDeviceState, targetDeviceInternalId is a direct UUID, targetState is an enum.
        // So, we use action.params directly for setDeviceState after type casting.
        // For other actions that use templates, resolveTokens is still needed.
        
        switch (action.type) {
            case 'createEvent': {
                const resolvedParams = resolveTokens(action.params, stdEvent, tokenFactContext) as z.infer<typeof import('@/lib/automation-schemas').CreateEventActionParamsSchema>;
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
                    
                    let associatedPikoCameraExternalIds: string[] = [];
                    const sourceDeviceInternalId = tokenFactContext.device?.id;
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
                    await piko.createPikoEvent(targetConnector.id, pikoPayload);
                } else { console.warn(`[Rule ${rule.id}][Action createEvent] Unsupported target connector category ${targetConnector.category}`); }
                break;
            }
            case 'createBookmark': {
                const resolvedParams = resolveTokens(action.params, stdEvent, tokenFactContext) as z.infer<typeof import('@/lib/automation-schemas').CreateBookmarkParamsSchema>;
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
                    const sourceDeviceInternalId = tokenFactContext.device?.id;
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
                    
                    for (const pikoCameraDeviceId of associatedPikoCameraExternalIds) {
                        const pikoPayload: PikoCreateBookmarkPayload = {
                            name: resolvedParams.nameTemplate,
                            description: resolvedParams.descriptionTemplate || undefined,
                            startTimeMs: stdEvent.timestamp.getTime(),
                            durationMs: durationMs,
                            tags: tags.length > 0 ? tags : undefined
                        };
                        await piko.createPikoBookmark(targetConnector.id, pikoCameraDeviceId, pikoPayload);
                    }
                } else { console.warn(`[Rule ${rule.id}][Action createBookmark] Unsupported target connector category ${targetConnector.category}`); }
                break;
            }
            case 'sendHttpRequest': {
                const resolvedParams = resolveTokens(action.params, stdEvent, tokenFactContext) as z.infer<typeof SendHttpRequestActionParamsSchema>;
                const headers = new Headers({ 'User-Agent': 'FusionBridge Automation/1.0' });
                if (Array.isArray(resolvedParams.headers)) {
                    for (const header of resolvedParams.headers) {
                        if (header.keyTemplate && typeof header.keyTemplate === 'string' && typeof header.valueTemplate === 'string') {
                            const key = header.keyTemplate.trim();
                            if (key) {
                                try { 
                                    headers.set(key, header.valueTemplate); 
                                } catch (e) { 
                                    console.warn(`[Rule ${rule.id}][Action sendHttpRequest] Invalid header name: \"${key}\". Skipping.`, e); 
                                }
                            }
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
            case 'setDeviceState': {
                const params = action.params as z.infer<typeof SetDeviceStateActionParamsSchema>;

                // Basic validation (Zod handles schema validation, this is an extra check)
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
    tokenFactContext: Record<string, any> | null | undefined
): Record<string, unknown> | null | undefined {

    if (params === null || params === undefined) {
        return params;
    }

    // --- Build the context for token replacement ---
    const tokenContext = {
        // Ensure event data is sourced correctly, potentially overriding if already in facts
        event: {
            ...(tokenFactContext?.event ?? {}), // Use event from facts if available
            id: stdEvent.eventId, // Always use the current event ID
            category: stdEvent.category,
            type: stdEvent.type,
            subtype: stdEvent.subtype,
            timestamp: stdEvent.timestamp.toISOString(),
            timestampMs: stdEvent.timestamp.getTime(),
            deviceId: stdEvent.deviceId, // External device ID from event
            connectorId: stdEvent.connectorId,
            // Flatten relevant payload fields from event payload
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
        },
        // Use device, area, location directly from the facts context
        device: tokenFactContext?.device ?? null,
        area: tokenFactContext?.area ?? null,
        location: tokenFactContext?.location ?? null,
        // Add connector if needed, though it's also under event
        connector: tokenFactContext?.connector ?? { id: stdEvent.connectorId },
    };

    // --- Token Replacement Logic (Keep as is) ---
    const resolved = { ...params }; // Create a copy to modify

    const replaceToken = (template: string): string => {
        if (typeof template !== 'string') return template;

        // Add check for null/undefined context before proceeding
        if (!tokenContext) return template;

        return template.replace(/\{\{\s*([^}]+)\s*\}\}/g, (match, path) => {
            const keys = path.trim().split('.');
            let value: unknown = tokenContext;

            try {
                for (const key of keys) {
                    // Important: Check if value is null or not an object before indexing
                    if (value === null || value === undefined || typeof value !== 'object') {
                        console.warn(`[Token Resolve] Cannot access key '${key}' in path '${path}'. Parent is not an object or is null/undefined.`);
                        return match; // Return original token
                    }
                    if (key in value) {
                        value = (value as Record<string, unknown>)[key];
                    } else {
                        console.warn(`[Token Resolve] Path '${path}' not found in context (key '${key}' missing).`);
                        return match; // Return original token {{...}}
                    }
                }

                if (value === undefined || value === null) {
                    // Decide if null should be empty string or kept as null/undefined marker
                    // Returning '' for templates is usually safer.
                    return '';
                } else if (typeof value === 'object') {
                    // Check for excessively large objects before stringifying (optional)
                    try {
                        return JSON.stringify(value); // Stringify objects/arrays
                    } catch (stringifyError) {
                         console.error(`[Token Resolve] Error stringifying object for path ${path}:`, stringifyError);
                         return '[Object]'; // Placeholder for unstringifiable objects
                    }
                } else {
                    return String(value); // Convert primitives to string
                }
            } catch (e) {
                console.error(`[Token Resolve] Error resolving path ${path}:`, e);
                return match; // Keep original token on error
            }
        });
    };

    // Iterate over parameters (Keep as is)
    for (const key in resolved) {
        if (Object.prototype.hasOwnProperty.call(resolved, key)) {
             const paramValue = resolved[key];
             if (typeof paramValue === 'string') {
                 resolved[key] = replaceToken(paramValue);
             } else if (Array.isArray(paramValue) && key === 'headers') {
                  // Specifically handle headers array for sendHttpRequest
                  resolved[key] = paramValue.map(header => {
                      if (typeof header === 'object' && header !== null && 'keyTemplate' in header && 'valueTemplate' in header) {
                          return {
                              keyTemplate: typeof header.keyTemplate === 'string' ? replaceToken(header.keyTemplate) : header.keyTemplate,
                              valueTemplate: typeof header.valueTemplate === 'string' ? replaceToken(header.valueTemplate) : header.valueTemplate,
                          };
                      }
                      return header; // Return unchanged if not the expected header object format
                  });
             }
             // Add handling for other nested structures if needed
        }
    }
    return resolved;
}

// --- REVISED Temporal Condition Evaluation Logic --- 
async function evaluateTemporalCondition(
    triggerEvent: StandardizedEvent, 
    condition: TemporalCondition, 
    triggerDeviceContext: SourceDeviceContext | null // Context of the *triggering* device
): Promise<boolean> {
    // Note: Top-level removeNulls function is available
    const triggerTime = triggerEvent.timestamp.getTime();

    // Calculate time window bounds
    const startTimeMs = condition.timeWindowSecondsBefore
        ? triggerTime - (condition.timeWindowSecondsBefore * 1000)
        : triggerTime; // If only checking after, start time is trigger time
    const endTimeMs = condition.timeWindowSecondsAfter
        ? triggerTime + (condition.timeWindowSecondsAfter * 1000)
        : triggerTime; // If only checking before, end time is trigger time

    // Ensure start is before end, even if only one window side is defined
    const finalStartTime = new Date(Math.min(startTimeMs, endTimeMs));
    const finalEndTime = new Date(Math.max(startTimeMs, endTimeMs));
    
    // --- Determine Device Scope Based on Condition --- 
    let targetDeviceExternalIds: string[] | undefined = undefined; // Undefined means check all

    if (condition.scoping === 'sameArea' || condition.scoping === 'sameLocation') {
        const scopeId = condition.scoping === 'sameArea' 
                        ? triggerDeviceContext?.area?.id
                        : triggerDeviceContext?.area?.location?.id;
        
        if (!scopeId) {
            console.warn(`[evaluateTemporalCondition] Cannot scope by ${condition.scoping}: Trigger device has no associated ${condition.scoping === 'sameArea' ? 'area' : 'location'}. Condition type ${condition.type} will likely fail.`);
            // If no scope, cannot find matching events unless type is noEventOccurred
            return condition.type === 'noEventOccurred'; 
        }

        try {
            // --- Simplified Query: Only filter by area/location ID --- 
            const scopedDeviceQuery = db.select({ 
                                            // Select only external ID needed for event query filter
                                            externalId: devices.deviceId, 
                                            // Keep internal ID if needed for other logic later (optional)
                                            // internalId: devices.id, 
                                            // No longer need stdType for pre-filtering here
                                            // stdType: devices.standardizedDeviceType 
                                        })
                                        .from(devices)
                                        .leftJoin(areaDevices, eq(devices.id, areaDevices.deviceId))
                                        .leftJoin(areas, eq(areaDevices.areaId, areas.id))
                                        .where(condition.scoping === 'sameArea' 
                                                ? eq(areaDevices.areaId, scopeId)
                                                : eq(areas.locationId, scopeId)); 
            
            const targetDevices = await scopedDeviceQuery;

            // --- REMOVED entityTypeFilter pre-filtering logic --- 
            // let preFilteredDevices = targetDevices;
            // if (condition.entityTypeFilter && condition.entityTypeFilter.length > 0) { ... }

            // Use the directly fetched devices
            if (targetDevices.length === 0) {
                 console.log(`[evaluateTemporalCondition] No devices found matching scope '${condition.scoping}' (ID: ${scopeId}).`);
                 return condition.type === 'noEventOccurred';
            }

            targetDeviceExternalIds = targetDevices.map(d => d.externalId);
            console.log(`[evaluateTemporalCondition] Scoping check to devices: [${targetDeviceExternalIds.join(',')}]`);

        } catch (dbError) {
            console.error(`[evaluateTemporalCondition] Error fetching devices for ${condition.scoping} scope (ID: ${scopeId}):`, dbError);
            return false; // Error fetching scope -> condition fails
        }
    } 
    // Else: scoping is 'anywhere', targetDeviceExternalIds remains undefined
    
    // --- Query Events Within Window and Scope --- 
    const repoFilter: eventsRepository.FindEventsFilter = {
        startTime: finalStartTime,
        endTime: finalEndTime,
        specificDeviceIds: targetDeviceExternalIds, // Pass the scoped device IDs
        // --- REMOVED standardizedDeviceTypes filter from here too ---
        // standardizedDeviceTypes: condition.entityTypeFilter?.length ? condition.entityTypeFilter : undefined, 
    };
    
    let candidateEvents: StandardizedEvent[] = [];
    try {
        // Modify findEvents to return full events, not just boolean
        // console.log(`[evaluateTemporalCondition] ABOUT TO CALL findEventsInWindow. Filter:`, JSON.stringify(repoFilter)); // Log before the await
        candidateEvents = await findEventsInWindow(repoFilter); // Call the directly imported function
        // console.log(`[evaluateTemporalCondition] Found ${candidateEvents.length} candidate events within time window and scope.`); // Debug log
    } catch (error) {
        // This catch is for errors *calling* findEventsInWindow (e.g., module load issues)
        console.error(`[evaluateTemporalCondition] Error calling findEventsInWindow. Filter: ${JSON.stringify(repoFilter)}`, error);
        return false; // Treat errors as condition not met
    }

    if (candidateEvents.length === 0) {
        // No events found in the window/scope
        return condition.type === 'noEventOccurred';
    }

    // --- Evaluate Event Filter using json-rules-engine --- 
    const engine = new Engine();
    engine.addRule({ conditions: condition.eventFilter as any, event: { type: 'eventFilterMatch' } });

    let matchFound = false;
    for (const event of candidateEvents) {
        // Construct facts for *this specific candidate event*
        const eventPayload = event.payload as any;
        const eventFacts: Record<string, any> = {
             event: {
                 category: event.category ?? null,
                 type: event.type ?? null,
                 subtype: event.subtype ?? null,
                 displayState: eventPayload?.displayState ?? null,
                 statusType: eventPayload?.statusType ?? null,
                 rawStateValue: eventPayload?.rawStateValue ?? null,
                 originalEventType: eventPayload?.originalEventType ?? null,
             },
             device: { // We might not have full context here easily, use what event provides
                 externalId: event.deviceId ?? null,
                 type: event.deviceInfo?.type ?? null,
                 subtype: event.deviceInfo?.subtype ?? null
             },
             connector: { id: event.connectorId ?? null },
             // Initialize area/location as null, cannot easily get this context for past events
             area: null,
             location: null,
        };
        // TODO: Consider fetching minimal context (area/location id/name) for candidate events if needed by common eventFilter rules.
        // This would require another DB query within the loop, potentially impacting performance.

        // --- Flatten facts specifically for the temporal eventFilter engine --- 
        const temporalRequiredPaths = extractReferencedFactPaths(condition.eventFilter);
        const minimalTemporalFacts: Record<string, any> = {};
        temporalRequiredPaths.forEach(path => {
            const value = resolvePath(eventFacts, path); // Resolve against the constructed eventFacts
            minimalTemporalFacts[path] = (value === undefined ? null : value);
        });
        // console.log(`[evaluateTemporalCondition] Evaluating event filter for event ${event.eventId} with MINIMAL facts:`, minimalTemporalFacts); // Debug log
        // --- End flatten --- 
        
        try {
            // --- REVERTED: Instantiate temporal engine without allowUndefinedFacts --- 
            const engine = new Engine();
            engine.addRule({ conditions: condition.eventFilter as any, event: { type: 'eventFilterMatch' } });

            const { events: filterMatchEvents } = await engine.run(minimalTemporalFacts);
            // TEMP: Assume no match for now
            // const filterMatchEvents: any[] = [];
            if (filterMatchEvents.length > 0) {
                console.log(`[evaluateTemporalCondition] Event ${event.eventId} matched eventFilter.`);
                matchFound = true;
                break; // Found a matching event, no need to check others
            }
        } catch (engineError) {
            console.error(`[evaluateTemporalCondition] Error running engine for event filter on event ${event.eventId}:`, engineError);
            // Optionally continue to next event or treat as failure? Let's continue for now.
        }
    }

    // --- Determine Final Result --- 
    // Re-evaluate each event against the filter to get the count
    // Note: This re-runs the engine. Could be optimized if performance becomes an issue.
    let finalMatchCount = 0;
    for (const event of candidateEvents) {
        // Construct facts for *this specific candidate event*
        const eventPayload = event.payload as any;
        const eventFacts: Record<string, any> = {
             event: {
                 category: event.category ?? null,
                 type: event.type ?? null,
                 subtype: event.subtype ?? null,
                 displayState: eventPayload?.displayState ?? null,
                 statusType: eventPayload?.statusType ?? null,
                 rawStateValue: eventPayload?.rawStateValue ?? null,
                 originalEventType: eventPayload?.originalEventType ?? null,
             },
             device: { 
                 externalId: event.deviceId ?? null,
                 type: event.deviceInfo?.type ?? null,
                 subtype: event.deviceInfo?.subtype ?? null
             },
             connector: { id: event.connectorId ?? null },
             area: null,
             location: null,
        };
        const temporalRequiredPaths = extractReferencedFactPaths(condition.eventFilter);
        const minimalTemporalFacts: Record<string, any> = {};
        temporalRequiredPaths.forEach(path => {
            const value = resolvePath(eventFacts, path);
            minimalTemporalFacts[path] = (value === undefined ? null : value);
        });
        try {
            // Create a fresh engine instance for each check
            const filterEngine = new Engine();
            filterEngine.addRule({ conditions: condition.eventFilter as any, event: { type: 'eventFilterMatch' } });
            const { events: filterMatchEvents } = await filterEngine.run(minimalTemporalFacts);
            if (filterMatchEvents.length > 0) {
                finalMatchCount++;
            }
        } catch (engineError) {
            console.error(`[evaluateTemporalCondition] Error running engine for event filter count check on event ${event.eventId}:`, engineError);
            // Decide how to handle errors during count - skip event or fail condition?
            // Skipping the event for now.
        }
    }

    console.log(`[evaluateTemporalCondition] Condition ID ${condition.id}: Found ${finalMatchCount} events matching filter.`);

    switch (condition.type) {
        case 'eventOccurred':
            return finalMatchCount > 0;
        case 'noEventOccurred':
            return finalMatchCount === 0;
        case 'eventCountEquals':
            if (condition.expectedEventCount === undefined) {
                console.warn(`[evaluateTemporalCondition] Condition ID ${condition.id}: Missing expectedEventCount for type 'eventCountEquals'.`);
                return false;
            }
            return finalMatchCount === condition.expectedEventCount;
        case 'eventCountLessThan':
            if (condition.expectedEventCount === undefined) {
                console.warn(`[evaluateTemporalCondition] Condition ID ${condition.id}: Missing expectedEventCount for type 'eventCountLessThan'.`);
                return false;
            }
            return finalMatchCount < condition.expectedEventCount;
        case 'eventCountGreaterThan':
            if (condition.expectedEventCount === undefined) {
                console.warn(`[evaluateTemporalCondition] Condition ID ${condition.id}: Missing expectedEventCount for type 'eventCountGreaterThan'.`);
                return false;
            }
            return finalMatchCount > condition.expectedEventCount;
        case 'eventCountLessThanOrEqual':
             if (condition.expectedEventCount === undefined) {
                console.warn(`[evaluateTemporalCondition] Condition ID ${condition.id}: Missing expectedEventCount for type 'eventCountLessThanOrEqual'.`);
                return false;
             }
             return finalMatchCount <= condition.expectedEventCount;
        case 'eventCountGreaterThanOrEqual':
            if (condition.expectedEventCount === undefined) {
                console.warn(`[evaluateTemporalCondition] Condition ID ${condition.id}: Missing expectedEventCount for type 'eventCountGreaterThanOrEqual'.`);
                return false;
            }
            return finalMatchCount >= condition.expectedEventCount;
        default:
            // Ensure exhaustive check with 'never' if using TS
            // const _exhaustiveCheck: never = condition.type;
            console.warn(`[evaluateTemporalCondition] Condition ID ${condition.id}: Unknown condition type '${(condition as any).type}'.`);
            return false;
    }
}


