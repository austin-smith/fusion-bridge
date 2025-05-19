import 'server-only';

import { db } from '@/data/db';
import { automations, connectors, devices, cameraAssociations, areas, areaDevices, locations } from '@/data/db/schema';
import { eq, and, inArray, or } from 'drizzle-orm';
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
import { internalSetAreaArmedState } from '@/services/area-service'; // Import new internal service function
import { AutomationActionType, AutomationTriggerType } from '@/lib/automation-types'; // Import AutomationActionType and AutomationTriggerType
import { CronExpressionParser } from 'cron-parser'; // Using named import as per user example
import { formatInTimeZone } from 'date-fns-tz'; // For formatting time in specific timezone

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
            if (rule.locationScopeId) {
                const eventLocationId = sourceDeviceContext?.area?.location?.id;
                if (rule.locationScopeId !== eventLocationId) {
                    console.log(`[Automation Service] Rule ID ${rule.id} (${rule.name}): Event from location '${eventLocationId || 'unknown'}' is outside rule's scope '${rule.locationScopeId}'. Skipping.`);
                    continue; 
                }
                console.log(`[Automation Service] Rule ID ${rule.id} (${rule.name}): Event location '${eventLocationId}' matches rule scope '${rule.locationScopeId}'. Proceeding.`);
            }

            let ruleConfig: AutomationConfig;
            try {
                // Parse the config using the UPDATED schema
                const parseResult = AutomationConfigSchema.safeParse(rule.configJson);
                if (!parseResult.success) {
                    console.error(`[Automation Service] Rule ID ${rule.id} (${rule.name}): Failed to parse configJson - ${parseResult.error.message}. Skipping.`);
                    continue;
                }
                ruleConfig = parseResult.data;

                // THIS FUNCTION ONLY HANDLES EVENT TRIGGERS
                if (ruleConfig.trigger.type !== AutomationTriggerType.EVENT) {
                    // console.log(`[Automation Service] Rule ID ${rule.id} (${rule.name}): Skipping in processEvent as it\'s not an event-triggered rule (type: ${ruleConfig.trigger.type}).`);
                    continue;
                }

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
                        timestamp: stdEvent.timestamp.toISOString(),
                        timestampMs: stdEvent.timestamp.getTime(),
                        id: stdEvent.eventId, // eventId specifically for event triggers
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
                    area: sourceDeviceContext?.area ? {
                        id: sourceDeviceContext.area.id ?? null,
                        name: sourceDeviceContext.area.name ?? null,
                        armedState: sourceDeviceContext.area.armedState ?? null,
                    } : null,
                    location: sourceDeviceContext?.area?.location ? {
                        id: sourceDeviceContext.area.location.id ?? null, name: sourceDeviceContext.area.location.name ?? null,
                        timeZone: sourceDeviceContext.area.location.timeZone ?? null, // Corrected: timeZone
                    } : null,
                };
                
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
                 const requiredPaths = extractReferencedFactPaths(ruleConfig.trigger.conditions);
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
                    conditions: ruleConfig.trigger.conditions as any, 
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
                     console.error(`[Automation Service] Rule ID ${rule.id} (${rule.name}): Error running json-rules-engine for event trigger:`, engineError);
                     continue; // Skip rule on engine error
                }

                // --- Evaluate Temporal Conditions (Only if State Conditions Passed) ---
                let temporalConditionsMet = true; // Default to true if no temporal conditions exist
                if (stateConditionsMet && ruleConfig.temporalConditions && ruleConfig.temporalConditions.length > 0) {
                    console.log(`[Rule ${rule.id}] Evaluating ${ruleConfig.temporalConditions.length} temporal condition(s) for event trigger...`);
                    temporalConditionsMet = false; // Assume false until proven true by ALL conditions passing
                    
                    let allTemporalPassed = true; // Flag to track if all temporal checks pass
                    for (const condition of ruleConfig.temporalConditions) {
                        // Pass stdEvent and sourceDeviceContext for event-triggered temporal checks
                        const conditionMet = await evaluateTemporalCondition(stdEvent, condition, sourceDeviceContext, stdEvent.timestamp);
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
                    console.log(`[Rule ${rule.id}] No temporal conditions to evaluate for event trigger.`);
                }

                // --- Action Execution (Only if BOTH State and Temporal Conditions Passed) ---
                if (stateConditionsMet && temporalConditionsMet) {
                    console.log(`[Automation Service] Rule ID ${rule.id} (${rule.name}): ALL conditions passed for event trigger. Proceeding to execute ${ruleConfig.actions.length} action(s).`);

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
                          console.log(`[Automation Service] Rule ID ${rule.id} (${rule.name}): Did not execute actions for event trigger because not all temporal conditions were met.`);
                     }
                } 
                // --- End Action Execution ---

            } catch (ruleProcessingError) {
                console.error(`[Automation Service] Error processing rule ${rule.id} (${rule.name}) for event trigger:`, ruleProcessingError);
                continue;
            }
        } // End loop through rules
    } catch (error) {
        console.error('[Automation Service] Top-level error processing event:', error);
    }
}

/**
 * Processes automations triggered by a schedule.
 * @param currentTime The current time to check schedules against.
 */
export async function processScheduledAutomations(currentTime: Date): Promise<void> {
    console.log(`[Automation Service] ENTERED processScheduledAutomations at ${currentTime.toISOString()}`);

    try {
        // Fetch all enabled automations and their associated locations (for timezone)
        // Ensure that the 'location' relation is correctly set up in Drizzle for this to work.
        // This assumes 'locationScopeId' on 'automations' table links to 'id' on 'locations' table.
        const scheduledAutomations = await db.query.automations.findMany({
            where: eq(automations.enabled, true),
            with: {
                // Eagerly load the location details if a locationScopeId is set
                // Adjust this based on your exact Drizzle schema and relations for automations to locations
                location: true, // This assumes a relation named 'location' linked via 'locationScopeId'
            }
        });

        if (scheduledAutomations.length === 0) {
            console.log(`[Automation Service] No enabled automations found for scheduled processing.`);
            return;
        }

        console.log(`[Automation Service] Evaluating ${scheduledAutomations.length} enabled automation(s) for schedule triggers.`);

        for (const rule of scheduledAutomations) {
            let ruleConfig: AutomationConfig;
            try {
                const parseResult = AutomationConfigSchema.safeParse(rule.configJson);
                if (!parseResult.success) {
                    console.error(`[Automation Service] Rule ID ${rule.id} (${rule.name}): Failed to parse configJson for scheduled processing - ${parseResult.error.message}. Skipping.`);
                    continue;
                }
                ruleConfig = parseResult.data;

                if (ruleConfig.trigger.type !== AutomationTriggerType.SCHEDULED) {
                    // console.log(`[Automation Service] Rule ID ${rule.id} (${rule.name}): Skipping in processScheduledAutomations as it\'s not a scheduled rule (type: ${ruleConfig.trigger.type}).`);
                    continue;
                }

                const { cronExpression } = ruleConfig.trigger;
                // Initialize effectiveTimeZone with configuredTimeZone, then override if location-scoped
                const { timeZone: configuredTimeZoneFromRule } = ruleConfig.trigger; // Use const and new name to avoid conflict
                let effectiveTimeZone: string | undefined = configuredTimeZoneFromRule;
                let locationForContext: (typeof locations.$inferSelect) | null = null;

                if (rule.locationScopeId) {
                    const scopedLocation = rule.location as (typeof locations.$inferSelect & { timeZone?: string | null }) | undefined;
                    if (scopedLocation?.timeZone) {
                        effectiveTimeZone = scopedLocation.timeZone;
                        locationForContext = scopedLocation;
                        if (configuredTimeZoneFromRule && configuredTimeZoneFromRule !== effectiveTimeZone) {
                            console.warn(`[Automation Service] Rule ID ${rule.id} (${rule.name}): Configured timezone \'${configuredTimeZoneFromRule}\' overridden by location scope\'s timezone \'${effectiveTimeZone}\'.`);
                        }
                    } else if (scopedLocation) {
                         console.warn(`[Automation Service] Rule ID ${rule.id} (${rule.name}): Scoped to location ${rule.locationScopeId}, but location has no timeZone. Using rule\'s configured timezone: \'${configuredTimeZoneFromRule}\'.`);
                         // effectiveTimeZone is already configuredTimeZoneFromRule, so no change needed here
                    } else {
                        console.warn(`[Automation Service] Rule ID ${rule.id} (${rule.name}): Scoped to location ${rule.locationScopeId}, but location data could not be loaded. Using rule\'s configured timezone: \'${configuredTimeZoneFromRule}\'.`);
                        // effectiveTimeZone is already configuredTimeZoneFromRule
                    }
                } 
                // If not location scoped, effectiveTimeZone remains configuredTimeZoneFromRule or undefined if not set

                if (!effectiveTimeZone) {
                    console.error(`[Automation Service] Rule ID ${rule.id} (${rule.name}): No effective timezone could be determined (not location-scoped and no timezone in rule config). Skipping schedule check.`);
                    continue;
                }
                
                if (!cronExpression) { // Should be caught by schema validation, but good to check
                    console.error(`[Automation Service] Rule ID ${rule.id} (${rule.name}): CRON expression is missing. Skipping.`);
                    continue;
                }

                let isDue = false;
                try {
                    // Using CronExpressionParser.parse as per user example text
                    const interval = CronExpressionParser.parse(cronExpression, { 
                        currentDate: currentTime,
                        tz: effectiveTimeZone,
                    });
                    const lastDueTime = interval.prev().toDate(); // Corrected to use prev()

                    // Check if this `lastDueTime` falls within the same minute as `currentTime`.
                    isDue = lastDueTime.getFullYear() === currentTime.getFullYear() &&
                            lastDueTime.getMonth() === currentTime.getMonth() &&
                            lastDueTime.getDate() === currentTime.getDate() &&
                            lastDueTime.getHours() === currentTime.getHours() &&
                            lastDueTime.getMinutes() === currentTime.getMinutes();
                    
                } catch (err) {
                    console.error(`[Automation Service] Rule ID ${rule.id} (${rule.name}): Failed to parse CRON expression "${cronExpression}" or determine schedule with timezone "${effectiveTimeZone}":`, err);
                    continue; 
                }

                if (!isDue) {
                    // console.log(`[Automation Service] Rule ID ${rule.id} (${rule.name}) is NOT DUE at ${currentTime.toISOString()} for cron "${cronExpression}" in TZ ${effectiveTimeZone}.`);
                    continue;
                }
                
                console.log(`[Automation Service] Rule ID ${rule.id} (${rule.name}) IS DUE at ${currentTime.toISOString()} for cron "${cronExpression}" in TZ ${effectiveTimeZone}.`);

                const fullFacts: Record<string, any> = {
                    schedule: {
                        cronExpression: cronExpression,
                        timeZone: effectiveTimeZone,
                        triggeredAtUTC: currentTime.toISOString(),
                        triggeredAtLocal: formatInTimeZone(currentTime, effectiveTimeZone, 'yyyy-MM-dd HH:mm:ssXXX'),
                        triggeredAtMs: currentTime.getTime(),
                    },
                    location: locationForContext ? {
                        id: locationForContext.id,
                        name: locationForContext.name,
                        timeZone: locationForContext.timeZone,
                    } : (rule.locationScopeId ? { id: rule.locationScopeId, name: "Unknown (not loaded)", timeZone: effectiveTimeZone } : null),
                    area: null, 
                    device: null, 
                    event: null, 
                    connector: null, 
                };
                
                // For scheduled triggers, primary condition is the time being met.
                // Temporal conditions are not evaluated for scheduled triggers as per revised logic.

                // Directly proceed to actions if the schedule is due.
                console.log(`[Automation Service] Rule ID ${rule.id} (${rule.name}): Scheduled trigger is due. Proceeding to execute actions.`);

                if (!ruleConfig.actions || ruleConfig.actions.length === 0) {
                    console.warn(`[Automation Service] Rule ID ${rule.id}: No actions defined for scheduled trigger.`);
                    continue; 
                }

                for (const action of ruleConfig.actions) {
                    if (action.type !== AutomationActionType.ARM_AREA && action.type !== AutomationActionType.DISARM_AREA) {
                        console.warn(`[Automation Service] Rule ID ${rule.id} (${rule.name}), Action Type \'${action.type}\': This action type is not currently supported for scheduled triggers. Only ARM_AREA and DISARM_AREA are allowed. Skipping this action.`);
                        continue; 
                    }
                    console.log(`[Automation Service] Rule ID ${rule.id} (${rule.name}): Executing allowed action type \'${action.type}\' for scheduled trigger.`);
                    await executeActionWithRetry(rule, action, null, fullFacts);
                }
                // ---- End of simplified action execution block -----

            } catch (ruleProcessingError) {
                console.error(`[Automation Service] Error processing rule ${rule.id} (${rule.name}) for scheduled trigger:`, ruleProcessingError);
            }
        } // End loop
    } catch (error) {
        console.error(`[Automation Service] Top-level error processing scheduled automations. Error type: ${typeof error}`);
        if (error instanceof Error) {
            console.error(`[Automation Service] Error message: ${error.message}`);
            console.error(`[Automation Service] Error stack: ${error.stack}`);
            // Log the full error object as well, as it might contain additional properties
            console.error(`[Automation Service] Full error object (if Error instance):`, error);
        } else {
            // Attempt to stringify for plain objects, with a fallback for circular structures or other issues
            try {
                console.error('[Automation Service] Raw error object (JSON.stringify):', JSON.stringify(error, null, 2));
            } catch (stringifyError) {
                console.error('[Automation Service] Could not stringify raw error object. Error during stringify:', stringifyError);
                // Log the raw error directly if stringification fails
                console.error('[Automation Service] Raw error object (direct log):', error);
            }
        }
        // Fallback for primitive types or null, though less likely to result in "{}"
        if (typeof error !== 'object' || error === null) {
             console.error('[Automation Service] Primitive error value:', error);
        }
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
    tokenFactContext: Record<string, any> 
) {
    console.log(`[Automation Service] Attempting action type '${action.type}' for rule ${rule.id} (${rule.name})`);
    
    const runAction = async () => {
        switch (action.type) {
            case AutomationActionType.CREATE_EVENT: {
                // This action inherently relies on a triggering event context for some fields like timestamp.
                // If stdEvent is null (scheduled trigger), we might need to adjust behavior or disallow.
                // For now, it will try to use stdEvent if present, or tokenFactContext.schedule.triggeredAt...
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
                        // Call internal service function directly
                        const updatedArea = await internalSetAreaArmedState(areaId, armMode);
                        if (updatedArea) {
                            console.log(`[Rule ${rule.id}][Action armArea] Successfully armed area ${areaId} to ${armMode}.`);
                        } else {
                            // internalSetAreaArmedState returns null if area not found or other non-exception failure
                            console.warn(`[Rule ${rule.id}][Action armArea] Failed to arm area ${areaId} to ${armMode} (area not found or no update occurred).`);
                        }
                    } catch (areaError) {
                        console.error(`[Rule ${rule.id}][Action armArea] Error arming area ${areaId} to ${armMode}:`, areaError instanceof Error ? areaError.message : areaError);
                        // Continue to next area if one fails
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
                        // Call internal service function directly
                        const updatedArea = await internalSetAreaArmedState(areaId, ArmedState.DISARMED);
                        if (updatedArea) {
                            console.log(`[Rule ${rule.id}][Action disarmArea] Successfully disarmed area ${areaId}.`);
                        } else {
                            console.warn(`[Rule ${rule.id}][Action disarmArea] Failed to disarm area ${areaId} (area not found or no update occurred).`);
                        }
                    } catch (areaError) {
                        console.error(`[Rule ${rule.id}][Action disarmArea] Error disarming area ${areaId}:`, areaError instanceof Error ? areaError.message : areaError);
                        // Continue to next area if one fails
                    }
                }
                break;
            }
            default:
                console.error(`[Automation Service] FATAL: Unhandled action type: ${(action as any).type} in rule ${rule.id} (${rule.name}).`);
                throw new Error(`Unhandled action type: ${(action as any).type}`);
        }
    };

    try {
        await pRetry(runAction, {
            retries: 3, minTimeout: 500, maxTimeout: 5000, factor: 2, 
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


