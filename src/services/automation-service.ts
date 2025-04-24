// import 'server-only'; // Removed for now

import { db } from '@/data/db';
import { automations, nodes, devices, cameraAssociations } from '@/data/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import type { StandardizedEvent } from '@/types/events'; // <-- Import StandardizedEvent
import { DeviceType } from '@/lib/mappings/definitions'; // <-- Import DeviceType enum
import * as piko from '@/services/drivers/piko'; // Assuming Piko driver functions are here
import { type AutomationConfig, AutomationConfigSchema, type AutomationAction } from '@/lib/automation-schemas';
import { minimatch } from 'minimatch'; // For wildcard matching
import pRetry from 'p-retry'; // Import p-retry
import type { PikoCreateBookmarkPayload } from '@/services/drivers/piko'; // Import the specific payload type
// Import other necessary drivers or services as needed
import type { SendHttpRequestActionParamsSchema } from '@/lib/automation-schemas';
import { z } from 'zod'; // Add Zod import

/**
 * Processes an incoming StandardizedEvent and triggers matching automations.
 * 
 * @param stdEvent The incoming StandardizedEvent object.
 */
export async function processEvent(stdEvent: StandardizedEvent<any>): Promise<void> { // <-- Updated Signature
    console.log(`[Automation Service] ENTERED processEvent for event: ${stdEvent.eventId}`);

    console.log(`[Automation Service] Processing event: ${stdEvent.eventType} (${stdEvent.eventCategory}) for device ${stdEvent.deviceId} from connector ${stdEvent.connectorId}`);

    try {
        // 1. Find the source node using connectorId from the event
        const sourceNodeId = stdEvent.connectorId;
        const sourceNode = await db.query.nodes.findFirst({
            where: eq(nodes.id, sourceNodeId),
            columns: { id: true, category: true } // Keep category for potential checks
        });

        // ---> ADD Log: Check if sourceNode was found <--- 
        console.log(`[Automation Service] Looked up source node for connectorId ${sourceNodeId}. Found: ${sourceNode ? sourceNode.id : 'null'}`);

        if (!sourceNode) {
            // This should ideally not happen if connectorId is valid, but good practice to check
            console.error(`[Automation Service] Could not find source node with ID ${sourceNodeId}. Skipping event processing.`);
            return;
        }
        // console.log(`[Automation Service] Identified source node: ${sourceNodeId}`); // Log less verbose now

        // 2. Fetch enabled automations linked to this source node
        const candidateAutomations = await db.query.automations.findMany({
            where: and(
                eq(automations.enabled, true),
                eq(automations.sourceNodeId, sourceNodeId)
            ),
        });

        // ---> ADD Log: Check how many candidate automations were found <--- 
        console.log(`[Automation Service] Found ${candidateAutomations.length} candidate automation(s) for node ${sourceNodeId}`);

        if (candidateAutomations.length === 0) {
            // Log exit reason
            console.log(`[Automation Service] Exiting: No enabled automations found for source node ${sourceNodeId}.`);
            return; // No rules for this source
        }
        // console.log(`[Automation Service] Found ${candidateAutomations.length} candidate automation(s) for source node.`);

        // Get standardized device type for filtering
        const deviceType = stdEvent.deviceInfo?.type ?? DeviceType.Unmapped; // Use standardized type

        // 3. Filter candidates in code based on configJson criteria
        for (const rule of candidateAutomations) {
            let ruleConfig: AutomationConfig;
            try {
                // Parse config (no change needed here)
                const parseResult = AutomationConfigSchema.safeParse(rule.configJson);
                if (!parseResult.success) {
                    // Log parsing error specifically
                    console.error(`[Automation Service] Rule ID ${rule.id}: Failed to parse configJson - ${parseResult.error.message}`);
                    continue; // Skip rule if config is invalid
                }
                ruleConfig = parseResult.data;

                // --- UPDATED FILTERING --- 
                // Check 1: Event Type Filter (Using Standardized Event Type)
                if (ruleConfig.eventTypeFilter && ruleConfig.eventTypeFilter.trim() !== '') {
                    if (!minimatch(stdEvent.eventType, ruleConfig.eventTypeFilter)) { 
                        // console.log(`[Rule ${rule.id}] Skipping: Standardized event type ${stdEvent.eventType} does not match filter ${ruleConfig.eventTypeFilter}`);
                        continue;
                    }
                     console.log(`[Automation Service] Rule ID ${rule.id}: Event type filter PASSED.`); // Log pass
                }

                // Check 2: Source Entity Types Filter (Using Standardized Device Type)
                if (ruleConfig.sourceEntityTypes && ruleConfig.sourceEntityTypes.length > 0) { 
                    if (!ruleConfig.sourceEntityTypes.includes(deviceType)) {
                        // console.log(`[Rule ${rule.id}] Skipping: Device type ${deviceType} not in allowed types [${ruleConfig.sourceEntityTypes.join(', ')}]`);
                        continue;
                    }
                    console.log(`[Automation Service] Rule ID ${rule.id}: Device type filter PASSED.`); // Log pass
                }
                // --- END UPDATED FILTERING --- 
                
                 // Check 3: Actions defined (no change needed)
                if (!ruleConfig.actions || ruleConfig.actions.length === 0) {
                     console.warn(`[Automation Service] Rule ID ${rule.id}: Skipping - No actions defined.`);
                     continue;
                }
                
                // ---> ADD LOG BEFORE ACTION EXECUTION <--- 
                console.log(`[Automation Service] Rule ID ${rule.id}: All filters PASSED. Proceeding to execute actions.`);

                console.log(`[Automation Service] Rule Matched: ${rule.name} (ID: ${rule.id}) - Processing ${ruleConfig.actions.length} action(s) for event ${stdEvent.eventId}`);
                
                // Fetch Source Device details (using standardized IDs)
                let sourceDevice = null;
                if (stdEvent.deviceId) { 
                    sourceDevice = await db.query.devices.findFirst({
                        where: and(
                            eq(devices.connectorId, sourceNodeId), // Use sourceNodeId directly
                            eq(devices.deviceId, stdEvent.deviceId) // Use deviceId from event
                        ),
                        columns: { id: true, name: true, type: true } // Keep fetching internal ID, name
                    });
                }
                // Use stdEvent fields for context if device not found in DB yet
                const deviceContext = sourceDevice ?? { 
                    id: stdEvent.deviceId, // Use connector-specific ID as fallback ID
                    name: 'Unknown Device', // Fallback name
                    type: deviceType // Use standardized type 
                }; 

                // --- Loop through and execute each action defined in the rule --- 
                for (const action of ruleConfig.actions) {
                    console.log(`[Automation Service] Attempting action type '${action.type}' for rule ${rule.id}`);
                    
                    // Define the operation that p-retry will attempt
                    const runAction = async () => {
                        // TODO: Update resolveTokens function signature and logic
                        // For now, pass stdEvent and deviceContext
                        const resolvedParams = resolveTokens(action.params, stdEvent, deviceContext) as AutomationAction['params']; 
                        
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

                                if (targetNode.category === 'piko') {
                                    // Use the fetched targetConfig for Piko details
                                    const { username, password, selectedSystem } = targetConfig as Partial<piko.PikoConfig>;
                                    if (!username || !password || !selectedSystem) { throw new Error(`Missing Piko config for target node ${targetNode.id}`); }
                                    
                                    let pikoTokenResponse: piko.PikoTokenResponse;
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
                                         console.warn(`[Rule ${rule.id}][Action createEvent] Could not get internal ID for source device ${stdEvent.deviceId}. Cannot fetch camera associations.`);
                                    }
                                    // --- END: Fetch Associated Camera Refs --- 
                                    
                                    const pikoPayload: piko.PikoCreateEventPayload = { 
                                        source: resolvedParams.sourceTemplate, 
                                        caption: resolvedParams.captionTemplate, 
                                        description: resolvedParams.descriptionTemplate, 
                                        timestamp: stdEvent.timestamp.toISOString(),
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

                                if (targetNode.category === 'piko') {
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
                                         console.warn(`[Rule ${rule.id}][Action createBookmark] Could not get internal ID for source device ${stdEvent.deviceId}. Skipping bookmark creation.`);
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
                                    let pikoTokenResponse: piko.PikoTokenResponse;
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
                                            startTimeMs: stdEvent.timestamp.getTime(), // <-- Use stdEvent.timestamp
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

                                // Parse Headers array
                                const headers = new Headers();
                                headers.set('User-Agent', 'FusionBridge Automation/1.0'); // Default User-Agent
                                
                                // Check if httpParams.headers exists and is an array before iterating
                                if (Array.isArray(httpParams.headers)) {
                                    for (const header of httpParams.headers) {
                                        // Check if keyTemplate and valueTemplate exist and are valid
                                        if (header.keyTemplate && typeof header.keyTemplate === 'string' && 
                                            typeof header.valueTemplate === 'string') { // Allow empty value
                                            
                                            const key = header.keyTemplate.trim();
                                            const value = header.valueTemplate; // Don't trim value, might be intentional
                                            
                                            if (key) { // Ensure key is not empty after trimming
                                                try {
                                                    headers.set(key, value);
                                                } catch (e) {
                                                    // Header names must be valid HTTP token characters
                                                    console.warn(`[Rule ${rule.id}][Action sendHttpRequest] Invalid header name: "${key}". Skipping.`, e);
                                                }
                                            } else {
                                                 console.warn(`[Rule ${rule.id}][Action sendHttpRequest] Empty header key detected. Skipping.`);
                                            }
                                        } else {
                                            console.warn(`[Rule ${rule.id}][Action sendHttpRequest] Invalid header object found:`, header, `. Skipping.`);
                                        }
                                    }
                                } else if (httpParams.headers) {
                                    // Log a warning if httpParams.headers exists but is not an array
                                    console.warn(`[Rule ${rule.id}][Action sendHttpRequest] Invalid format for headers parameter: Expected an array, got`, typeof httpParams.headers);
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
                                        } catch /* Removed unused 'bodyReadError' */ {
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
                                // Keeping 'as any' for runtime logging of unhandled cases
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
 * Resolves tokens in action parameter templates using StandardizedEvent data.
 */
function resolveTokens(
    params: Record<string, unknown> | null | undefined, 
    stdEvent: StandardizedEvent<any>, // <-- Updated parameter type
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
            category: stdEvent.eventCategory,
            type: stdEvent.eventType,
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


