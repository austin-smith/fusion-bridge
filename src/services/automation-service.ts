// import 'server-only'; // Removed for now

import { db } from '@/data/db';
import { automations, nodes, devices, cameraAssociations } from '@/data/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import type { YolinkEvent } from '@/services/mqtt-service'; // Assuming event type is here
import * as piko from '@/services/drivers/piko'; // Assuming Piko driver functions are here
import { type AutomationConfig, AutomationConfigSchema, type AutomationAction } from '@/lib/automation-schemas';
import { minimatch } from 'minimatch'; // For wildcard matching
import pRetry from 'p-retry'; // Import p-retry
import type { PikoCreateBookmarkPayload } from '@/services/drivers/piko'; // Import the specific payload type
// Import other necessary drivers or services as needed
import type { SendHttpRequestActionParamsSchema } from '@/lib/automation-schemas';
import { z } from 'zod'; // Add Zod import

/**
 * Processes an incoming event and triggers matching automations.
 * 
 * @param event The incoming event object (e.g., from YoLink MQTT).
 * @param homeId The YoLink Home ID associated with the MQTT connection where the event originated.
 */
export async function processEvent(event: YolinkEvent, homeId: string): Promise<void> {
    console.log(`[Automation Service] Processing event: ${event.event} for device ${event.deviceId} from home ${homeId}`);

    try {
        // 1. Find the source node using homeId
        const sourceNode = await db.query.nodes.findFirst({
            where: eq(nodes.yolinkHomeId, homeId),
            // Select ID and category (needed for action type check)
            columns: { id: true, category: true }
        });

        if (!sourceNode) {
            console.error(`[Automation Service] Could not find source node for homeId ${homeId}. Skipping event processing.`);
            return;
        }
        const sourceNodeId = sourceNode.id;
        console.log(`[Automation Service] Identified source node: ${sourceNodeId}`);

        // 2. Fetch enabled automations linked to this source node
        const candidateAutomations = await db.query.automations.findMany({
            where: and(
                eq(automations.enabled, true),
                eq(automations.sourceNodeId, sourceNodeId)
            ),
        });

        if (candidateAutomations.length === 0) {
            // console.log(`[Automation Service] No enabled automations found for source node ${sourceNodeId}.`);
            return;
        }
        console.log(`[Automation Service] Found ${candidateAutomations.length} candidate automation(s) for source node.`);

        const eventDeviceType = event.event.split('.')[0] || ''; // e.g., "DoorSensor"

        // 3. Filter candidates in code based on configJson criteria
        for (const rule of candidateAutomations) {
            let ruleConfig: AutomationConfig;
            try {
                // Parse config
                if (rule.configJson && typeof rule.configJson === 'object') {
                    // Use safeParse with the correct schema
                    const parseResult = AutomationConfigSchema.safeParse(rule.configJson);
                    if (!parseResult.success) {
                        throw new Error(`Invalid config structure: ${parseResult.error.message}`);
                    }
                    ruleConfig = parseResult.data;
                } else {
                    throw new Error('Automation configJson is missing or not an object');
                }

                // Check 1: Event Type Filter
                if (ruleConfig.eventTypeFilter && ruleConfig.eventTypeFilter.trim() !== '') {
                    if (!minimatch(event.event, ruleConfig.eventTypeFilter)) {
                        // console.log(`[Rule ${rule.id}] Skipping: Event type ${event.event} does not match filter ${ruleConfig.eventTypeFilter}`);
                        continue;
                    }
                }

                // Check 2: Source Entity Types Filter
                if (!ruleConfig.sourceEntityTypes?.includes(eventDeviceType)) {
                    // console.log(`[Rule ${rule.id}] Skipping: Device type ${eventDeviceType} not in allowed types [${ruleConfig.sourceEntityTypes?.join(', ')}]`);
                    continue;
                }
                
                 // Check 3: Actions defined
                if (!ruleConfig.actions || ruleConfig.actions.length === 0) {
                     console.warn(`[Automation Service] No actions defined for rule ${rule.id}. Skipping.`);
                     continue;
                }

                console.log(`[Automation Service] Rule Matched: ${rule.name} (ID: ${rule.id}) - Processing ${ruleConfig.actions.length} action(s)`);
                
                // Fetch Source Device details
                let sourceDevice = null;
                if (event.deviceId) { 
                    sourceDevice = await db.query.devices.findFirst({
                        where: and(
                            eq(devices.connectorId, sourceNodeId),
                            eq(devices.deviceId, event.deviceId)
                        ),
                        columns: { id: true, name: true, type: true }
                    });
                }
                const deviceContext = sourceDevice ?? { id: event.deviceId, name: 'Unknown Device', type: eventDeviceType };
                // --- End Fetch common details --- 

                // --- Loop through and execute each action defined in the rule --- 
                for (const action of ruleConfig.actions) {
                    console.log(`[Automation Service] Attempting action type '${action.type}' for rule ${rule.id}`);
                    
                    // Define the operation that p-retry will attempt
                    const runAction = async () => {
                        // Resolve tokens *before* the switch, as most actions will need them
                        // Note: We cast params here because resolveTokens currently returns 'any'
                        const resolvedParams = resolveTokens(action.params, event, deviceContext) as AutomationAction['params']; 
                        
                        switch (action.type) {
                            case 'createEvent': {
                                // Type assertion and validation for this action's params
                                if (!('sourceTemplate' in resolvedParams && 'captionTemplate' in resolvedParams && 'descriptionTemplate' in resolvedParams && 'targetNodeId' in resolvedParams)) {
                                    throw new Error(`Invalid/missing parameters for createEvent action.`);
                                }

                                // --- Fetch Target Node specific to this action --- 
                                const targetNode = await db.query.nodes.findFirst({
                                    where: eq(nodes.id, resolvedParams.targetNodeId!),
                                    // Need category and config for Piko logic
                                    columns: { id: true, category: true, cfg_enc: true }
                                });
                                if (!targetNode || !targetNode.cfg_enc || !targetNode.category) {
                                    throw new Error(`Target node ${resolvedParams.targetNodeId} not found or has no config/category for createEvent action.`);
                                }
                                // TODO: Decrypt cfg_enc if needed
                                const targetConfig = JSON.parse(targetNode.cfg_enc);
                                // --- End Fetch Target Node --- 

                                if (sourceNode.category === 'piko') {
                                    // Use the fetched targetConfig for Piko details
                                    const { username, password, selectedSystem } = targetConfig as Partial<piko.PikoConfig>;
                                    if (!username || !password || !selectedSystem) { throw new Error(`Missing Piko config for target node ${targetNode.id}`); }
                                    
                                    let pikoTokenResponse: piko.PikoSystemScopedTokenResponse;
                                    try {
                                        pikoTokenResponse = await piko.getSystemScopedAccessToken(username, password, selectedSystem);
                                    } catch (tokenError) {
                                        throw new Error(`Piko token fetch failed: ${tokenError instanceof Error ? tokenError.message : tokenError}`); 
                                    }

                                    // --- START: Fetch Associated Camera Refs --- 
                                    let associatedPikoCameraExternalIds: string[] = [];
                                    const sourceDeviceInternalId = sourceDevice?.id;
                                    if (sourceDeviceInternalId) {
                                        try {
                                            const associations = await db
                                                .select({ pikoCameraInternalId: cameraAssociations.pikoCameraId })
                                                .from(cameraAssociations)
                                                .where(eq(cameraAssociations.deviceId, sourceDeviceInternalId));
                                            const internalCameraIds = associations.map(a => a.pikoCameraInternalId);
                                            if (internalCameraIds.length > 0) {
                                                const cameraDevices = await db
                                                    .select({ externalId: devices.deviceId })
                                                    .from(devices)
                                                    .where(inArray(devices.id, internalCameraIds)); 
                                                
                                                associatedPikoCameraExternalIds = cameraDevices.map(d => d.externalId);
                                                console.log(`[Rule ${rule.id}][Action createEvent] Found associated Piko camera external IDs: [${associatedPikoCameraExternalIds.join(', ')}]`);
                                            } else {
                                                console.log(`[Rule ${rule.id}][Action createEvent] No Piko cameras associated with source device ${sourceDeviceInternalId}`);
                                            }
                                        } catch (assocError) {
                                            console.error(`[Rule ${rule.id}][Action createEvent] Error fetching camera associations:`, assocError);
                                        }
                                    } else {
                                         console.warn(`[Rule ${rule.id}][Action createEvent] Could not get internal ID for source device ${event.deviceId}. Cannot fetch camera associations.`);
                                    }
                                    // --- END: Fetch Associated Camera Refs --- 
                                    
                                    const pikoPayload: piko.PikoCreateEventPayload = { 
                                        source: resolvedParams.sourceTemplate, 
                                        caption: resolvedParams.captionTemplate, 
                                        description: resolvedParams.descriptionTemplate, 
                                        timestamp: new Date(event.time).toISOString(),
                                        ...(associatedPikoCameraExternalIds.length > 0 && {
                                            metadata: { cameraRefs: associatedPikoCameraExternalIds }
                                        })
                                    };
                                    
                                    try {
                                        await piko.createPikoEvent(selectedSystem, pikoTokenResponse.accessToken, pikoPayload);
                                        console.log(`[Rule ${rule.id}][Action createEvent] Piko event created.`); // Simplified log on success
                                    } catch (apiError) {
                                        throw new Error(`Piko createEvent API call failed: ${apiError instanceof Error ? apiError.message : apiError}`); 
                                    }
                                } else {
                                    // Log based on the fetched target node's category
                                    console.warn(`[Rule ${rule.id}][Action createEvent] Unsupported target node category ${targetNode.category}`);
                                }
                                break;
                            } // End case 'createEvent'
                            
                            case 'createBookmark': { // Added block scope
                                // Type assertion and validation for this action's params
                                if (!('nameTemplate' in resolvedParams && 'durationMsTemplate' in resolvedParams && 'targetNodeId' in resolvedParams)) {
                                    throw new Error(`Invalid/missing parameters for createBookmark action.`);
                                }

                                // --- Fetch Target Node specific to this action --- 
                                const targetNode = await db.query.nodes.findFirst({
                                    where: eq(nodes.id, resolvedParams.targetNodeId!),
                                    // Need category and config for Piko logic
                                    columns: { id: true, category: true, cfg_enc: true }
                                });
                                if (!targetNode || !targetNode.cfg_enc || !targetNode.category) {
                                    throw new Error(`Target node ${resolvedParams.targetNodeId} not found or has no config/category for createBookmark action.`);
                                }
                                // TODO: Decrypt cfg_enc if needed
                                const targetConfig = JSON.parse(targetNode.cfg_enc);
                                // --- End Fetch Target Node --- 

                                if (sourceNode.category === 'piko') {
                                    // Use the fetched targetConfig for Piko details
                                    const { username, password, selectedSystem } = targetConfig as Partial<piko.PikoConfig>;
                                    if (!username || !password || !selectedSystem) { throw new Error(`Missing Piko config for target node ${targetNode.id}`); }

                                     // --- START: Fetch Associated Camera Refs (Reused Logic) --- 
                                    let associatedPikoCameraExternalIds: string[] = [];
                                    const sourceDeviceInternalId = sourceDevice?.id;
                                    if (sourceDeviceInternalId) {
                                        try {
                                            const associations = await db
                                                .select({ pikoCameraInternalId: cameraAssociations.pikoCameraId })
                                                .from(cameraAssociations)
                                                .where(eq(cameraAssociations.deviceId, sourceDeviceInternalId));
                                            const internalCameraIds = associations.map(a => a.pikoCameraInternalId);

                                            if (internalCameraIds.length > 0) {
                                                const cameraDevices = await db
                                                    .select({ externalId: devices.deviceId })
                                                    .from(devices)
                                                    .where(inArray(devices.id, internalCameraIds)); 
                                                
                                                associatedPikoCameraExternalIds = cameraDevices.map(d => d.externalId);
                                                console.log(`[Rule ${rule.id}][Action createBookmark] Found associated Piko camera external IDs: [${associatedPikoCameraExternalIds.join(', ')}]`);
                                            } else {
                                                // If no cameras are associated, we can't create a bookmark. Log and stop this action.
                                                console.warn(`[Rule ${rule.id}][Action createBookmark] No Piko cameras associated with source device ${sourceDeviceInternalId}. Skipping bookmark creation.`);
                                                break; // Exit the switch case for this action
                                            }
                                        } catch (assocError) {
                                            // Log the error and re-throw to let pRetry handle it
                                            console.error(`[Rule ${rule.id}][Action createBookmark] Error fetching camera associations:`, assocError);
                                            throw new Error(`Failed to fetch camera associations: ${assocError instanceof Error ? assocError.message : assocError}`);
                                        }
                                    } else {
                                         console.warn(`[Rule ${rule.id}][Action createBookmark] Could not get internal ID for source device ${event.deviceId}. Skipping bookmark creation.`);
                                         break; // Exit the switch case for this action
                                    }
                                    // --- END: Fetch Associated Camera Refs --- 

                                    // Parse Duration
                                    let durationMs = 5000; // Default duration
                                    try {
                                        const parsedDuration = parseInt(resolvedParams.durationMsTemplate, 10);
                                        if (!isNaN(parsedDuration) && parsedDuration > 0) {
                                            durationMs = parsedDuration;
                                        } else {
                                            console.warn(`[Rule ${rule.id}][Action createBookmark] Invalid duration template value "${resolvedParams.durationMsTemplate}". Using default ${durationMs}ms.`);
                                        }
                                    } catch (parseError) {
                                        console.warn(`[Rule ${rule.id}][Action createBookmark] Error parsing duration template "${resolvedParams.durationMsTemplate}". Using default ${durationMs}ms. Error: ${parseError}`);
                                    }

                                    // Parse Tags
                                    let tags: string[] = [];
                                    if (resolvedParams.tagsTemplate && resolvedParams.tagsTemplate.trim() !== '') {
                                        try {
                                            tags = resolvedParams.tagsTemplate.split(',')
                                                .map(tag => tag.trim())
                                                .filter(tag => tag !== '');
                                        } catch (parseError) {
                                             console.warn(`[Rule ${rule.id}][Action createBookmark] Error parsing tags template "${resolvedParams.tagsTemplate}". No tags will be added. Error: ${parseError}`);
                                        }
                                    }

                                    // Get Token (inside runAction to benefit from retry)
                                    let pikoTokenResponse: piko.PikoSystemScopedTokenResponse;
                                    try {
                                        pikoTokenResponse = await piko.getSystemScopedAccessToken(username, password, selectedSystem);
                                    } catch (tokenError) {
                                        throw new Error(`Piko token fetch failed: ${tokenError instanceof Error ? tokenError.message : tokenError}`); 
                                    }

                                    // Loop through associated cameras and create bookmark for each
                                    for (const pikoCameraDeviceId of associatedPikoCameraExternalIds) {
                                        const pikoPayload: PikoCreateBookmarkPayload = {
                                            name: resolvedParams.nameTemplate,
                                            description: resolvedParams.descriptionTemplate || undefined, // Use undefined if empty/null
                                            startTimeMs: event.time, // Use original event timestamp (already in ms)
                                            durationMs: durationMs,
                                            tags: tags.length > 0 ? tags : undefined // Use undefined if no tags
                                        };

                                        try {
                                            await piko.createPikoBookmark(selectedSystem, pikoTokenResponse.accessToken, pikoCameraDeviceId, pikoPayload);
                                            console.log(`[Rule ${rule.id}][Action createBookmark] Piko bookmark created for camera ${pikoCameraDeviceId}.`);
                                        } catch (apiError) {
                                            // Log specific camera error and re-throw to trigger retry for the whole action if needed
                                            console.error(`[Rule ${rule.id}][Action createBookmark] Piko createBookmark API call failed for camera ${pikoCameraDeviceId}:`, apiError);
                                            throw new Error(`Piko createBookmark API call failed for camera ${pikoCameraDeviceId}: ${apiError instanceof Error ? apiError.message : apiError}`); 
                                        }
                                    } // End loop through cameras

                                } else {
                                    // Log based on the fetched target node's category
                                    console.warn(`[Rule ${rule.id}][Action createBookmark] Unsupported target node category ${targetNode.category}`);
                                }
                                break;
                            } // End case 'createBookmark'

                            case 'sendHttpRequest': { // --- Add case for sendHttpRequest ---
                                // Type assertion for parameters
                                const httpParams = resolvedParams as z.infer<typeof SendHttpRequestActionParamsSchema>; 

                                // Parse Headers Template
                                const headers = new Headers();
                                headers.set('User-Agent', 'FusionBridge Automation/1.0'); // Default User-Agent
                                if (httpParams.headersTemplate) {
                                    try {
                                        const lines = httpParams.headersTemplate.split('\n');
                                        for (const line of lines) {
                                            const separatorIndex = line.indexOf(':');
                                            if (separatorIndex > 0) {
                                                const key = line.substring(0, separatorIndex).trim();
                                                const value = line.substring(separatorIndex + 1).trim();
                                                if (key && value) {
                                                    headers.set(key, value);
                                                }
                                            } else if (line.trim()) { // Handle lines without separator if needed, or log warning
                                                console.warn(`[Rule ${rule.id}][Action sendHttpRequest] Malformed header line: ${line}. Skipping.`);
                                            }
                                        }
                                    } catch (headerParseError) {
                                        throw new Error(`Failed to parse headers template: ${headerParseError instanceof Error ? headerParseError.message : headerParseError}`);
                                    }
                                }

                                // Prepare Fetch options
                                const fetchOptions: RequestInit = {
                                    method: httpParams.method,
                                    headers: headers,
                                };

                                // Add body only for relevant methods
                                if (['POST', 'PUT', 'PATCH'].includes(httpParams.method) && httpParams.bodyTemplate) {
                                    // Automatically set Content-Type if not provided and body is JSON-like
                                    if (!headers.has('Content-Type') && httpParams.bodyTemplate.trim().startsWith('{')) {
                                        headers.set('Content-Type', 'application/json');
                                    }
                                    fetchOptions.body = httpParams.bodyTemplate;
                                }

                                // Make the HTTP request using fetch
                                try {
                                    console.log(`[Rule ${rule.id}][Action sendHttpRequest] Sending ${httpParams.method} request to ${httpParams.urlTemplate}`);
                                    const response = await fetch(httpParams.urlTemplate, fetchOptions);

                                    // Log response status
                                    console.log(`[Rule ${rule.id}][Action sendHttpRequest] Received response status: ${response.status} ${response.statusText}`);

                                    // Check if the response was successful (status code 2xx)
                                    if (!response.ok) {
                                        let responseBody = '';
                                        try {
                                            // Try to read response body for more context on failure
                                            responseBody = await response.text();
                                            console.error(`[Rule ${rule.id}][Action sendHttpRequest] Response body (error): ${responseBody.substring(0, 500)}...`); // Log first 500 chars
                                        } catch (bodyReadError) {
                                             console.error(`[Rule ${rule.id}][Action sendHttpRequest] Could not read response body on error.`);
                                        }
                                        // Throw an error to trigger retry or final failure
                                        throw new Error(`HTTP request failed with status ${response.status}: ${response.statusText}`);
                                    }
                                    
                                    // Optional: Log successful response body if needed (consider size)
                                    // const responseBody = await response.text();
                                    // console.log(`[Rule ${rule.id}][Action sendHttpRequest] Response body (success): ${responseBody.substring(0, 200)}...`);

                                } catch (requestError) {
                                    // Log the specific error and re-throw to let pRetry handle it
                                    console.error(`[Rule ${rule.id}][Action sendHttpRequest] HTTP request failed:`, requestError);
                                    throw new Error(`HTTP request failed: ${requestError instanceof Error ? requestError.message : requestError}`);
                                }
                                break;
                            } // --- End case sendHttpRequest ---

                            default:
                                // Use type assertion for exhaustiveness check
                                const _exhaustiveCheck: never = action;
                                console.warn(`[Rule ${rule.id}] Unknown or unhandled action type: ${(_exhaustiveCheck as any)?.type}`);
                        }
                    }; // End runAction definition

                    // Execute the action using p-retry
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
                    } catch (finalError) {
                        console.error(`[Rule ${rule.id}][Action ${action.type}] Failed permanently after all retries:`, finalError instanceof Error ? finalError.message : finalError);
                    }
                } // --- End loop through actions --- 

            } catch (parseOrFilterError) {
                console.error(`[Automation Service] Error parsing/filtering rule ${rule.id}:`, parseOrFilterError);
                continue;
            }
        } // End rules loop
    } catch (error) {
        console.error('[Automation Service] Top-level error processing event:', error);
    }
}

/**
 * Resolves tokens in action parameter templates.
 */
function resolveTokens(params: any, event: YolinkEvent, device: any): any {
    const resolved = { ...params };
    const tokenContext = {
        event: {
            ...event,
            time: new Date(event.time).toISOString(),
            data: event.data || {},
        },
        device: device || {},
    };

    const replaceToken = (template: string): string => {
        if (typeof template !== 'string') return template; // Handle non-string inputs
        return template.replace(/\{\{\s*([^}]+)\s*\}\}/g, (match, path) => {
            const keys = path.trim().split('.');
            let value: any = tokenContext;
            try {
                for (const key of keys) {
                    if (value && typeof value === 'object' && key in value) {
                        value = value[key];
                    } else {
                        return match; // Keep original token if path invalid
                    }
                }
                return (typeof value === 'object' && value !== null) ? JSON.stringify(value) : String(value);
            } catch (e) {
                console.error(`[Token Resolve] Error resolving path ${path}:`, e);
                return match; // Keep original token on error
            }
        });
    };

    for (const key in resolved) {
        if (typeof resolved[key] === 'string') {
            resolved[key] = replaceToken(resolved[key]);
        }
    }
    return resolved;
}
