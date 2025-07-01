import { z } from 'zod';
// --- Add import for ActionableState ---
import { ActionableState } from '@/lib/mappings/definitions';
import { AutomationActionType, AutomationTriggerType } from './automation-types'; 
import { ArmedState } from '@/lib/mappings/definitions'; // Import ArmedState

// --- START: json-rules-engine Schemas ---

// Define supported operators
// (Expand this list based on desired capabilities)
export const JsonRulesEngineOperatorsSchema = z.enum([
  'equal', 
  'notEqual',
  'lessThan', 
  'lessThanInclusive',
  'greaterThan', 
  'greaterThanInclusive',
  'in', 
  'notIn',
  'contains', 
  'doesNotContain',
]);

// Base schema for a single condition
export const JsonRuleConditionSchema = z.object({
  fact: z.string().min(1, "Fact cannot be empty"),
  operator: JsonRulesEngineOperatorsSchema,
  value: z.any(), // Value type depends on the fact/operator
  // Optional path for nested facts (e.g., '$.user.address.zipCode')
  path: z.string().optional(), 
});

// --- EXPORT ADDED --- 
export type JsonRuleCondition = z.infer<typeof JsonRuleConditionSchema>;

// Base schema for a group (all/any conditions)
// We use z.lazy() for recursion
// --- Use exported type --- 
type JsonRule = JsonRuleCondition | JsonRuleGroup;
export interface JsonRuleGroup {
    all?: JsonRule[];
    any?: JsonRule[];
    // Can add priority or name if needed later
    // priority?: number;
    // name?: string;
}

// Define the recursive group schema using z.lazy
export const JsonRuleGroupSchema: z.ZodType<JsonRuleGroup> = z.lazy(() => 
    z.object({
        all: z.array(z.union([JsonRuleConditionSchema, JsonRuleGroupSchema])).optional(),
        any: z.array(z.union([JsonRuleConditionSchema, JsonRuleGroupSchema])).optional(),
        // priority: z.number().int().optional(),
        // name: z.string().optional(),
    }).refine(data => data.all !== undefined || data.any !== undefined, {
        message: 'Rule group must contain either "all" or "any"',
    })
);

// --- END: json-rules-engine Schemas ---

// Schema for the parameters of the 'createEvent' action
export const CreateEventActionParamsSchema = z.object({
  sourceTemplate: z.string().min(1, { message: "Source is required" }),
  captionTemplate: z.string().min(1, { message: "Caption is required" }),
  descriptionTemplate: z.string().min(1, { message: "Description is required" }),
  targetConnectorId: z.string().uuid("Target Connector is required and must be a valid UUID"),
  // Future enhancement: Add target entity selection (e.g., Piko camera GUIDs)
  // targetCameraRefs: z.array(z.string()).optional(), 
});

// Schema for the parameters of the 'createBookmark' action
export const CreateBookmarkParamsSchema = z.object({
    nameTemplate: z.string().min(1, "Name is required"),
    descriptionTemplate: z.string().optional(),
    // Duration in milliseconds, provided as a string template initially
    durationMsTemplate: z.string().min(1, "Duration is required"), 
    // Tags provided as a comma-separated string template initially
    tagsTemplate: z.string().optional(), 
    targetConnectorId: z.string().uuid("Target Connector is required and must be a valid UUID"),
});

// --- START: Add Schema for Send HTTP Request action ---
// Define allowed HTTP methods
const HttpMethodSchema = z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]);

// --- Re-add Export for HttpMethodSchema ---
export { HttpMethodSchema };
// --- End Export ---

// Define allowed content types for HTTP requests
export const HttpContentTypeSchema = z.enum([
  'application/json',
  'text/plain',
  'application/x-www-form-urlencoded'
]);

export const SendHttpRequestActionParamsSchema = z.object({
  urlTemplate: z.string().url({ message: "Invalid URL format" }).min(1, "URL is required"),
  method: HttpMethodSchema,
  headers: z.array(z.object({
    keyTemplate: z.string().min(1, 'Header key cannot be empty'),
    valueTemplate: z.string()
  })).optional(),
  // Add contentType selection
  contentType: HttpContentTypeSchema.optional(), // Optional for methods like GET/DELETE
  // Body template: Relevant for POST, PUT, PATCH
  bodyTemplate: z.string().optional(),
}).refine(data => {
    // Body is only relevant for POST, PUT, PATCH methods
    if (!['POST', 'PUT', 'PATCH'].includes(data.method)) {
        return true; // No body validation needed for other methods like GET, DELETE
    }

    // If method is POST, PUT, or PATCH:
    if (data.contentType === 'application/json') {
        if (data.bodyTemplate === undefined || data.bodyTemplate === null) {
            // If bodyTemplate is undefined or null, it's a valid optional body
            return true;
        }
        // If bodyTemplate is a string (even an empty one), it must be parseable as JSON
        try {
            JSON.parse(data.bodyTemplate);
            return true;
        } catch {
            return false; // Invalid JSON (includes empty string, whitespace-only, or malformed JSON)
        }
    }
    // For other content types (e.g., text/plain) or if contentType is not application/json,
    // and method is POST/PUT/PATCH, any string bodyTemplate (including empty) is considered valid by this refine. 
    // Specific validation for those types could be added if needed.
    return true; 
}, {
    message: "Body must be valid JSON if Content-Type is application/json. For other types, it must be a string.",
    path: ["bodyTemplate"],
    params: { dependsOn: ["method", "contentType"] }
});
// --- END: Add Schema for Send HTTP Request action ---

// --- BEGIN Add SetDeviceStateActionParamsSchema ---
export const SetDeviceStateActionParamsSchema = z.object({
  targetDeviceInternalId: z.string().uuid("Target device ID must be a valid UUID"),
  targetState: z.nativeEnum(ActionableState, {
    errorMap: () => ({ message: "Invalid target state selected" })
  }),
});
// --- END Add SetDeviceStateActionParamsSchema ---

// --- BEGIN Add SendPushNotificationActionParamsSchema ---
export const SendPushNotificationActionParamsSchema = z.object({
  // No targetConnectorId needed
  titleTemplate: z.string().optional(),
  messageTemplate: z.string().min(1, { message: "Message is required" }),
  // Optional target user key - if not provided, notification goes to all users in group
  targetUserKeyTemplate: z.string().optional(),
  priority: z.union([
    z.literal(-2),
    z.literal(-1),
    z.literal(0),
    z.literal(1),
    z.literal(2)
  ]).default(0),
});
// --- END Add SendPushNotificationActionParamsSchema ---

// --- Enums & Schemas for new Arm/Disarm Actions ---
export const AreaScopingSchema = z.enum([
    'SPECIFIC_AREAS', 
    'ALL_AREAS_IN_SCOPE'
]);

export const ArmAreaActionParamsSchema = z.object({
    scoping: AreaScopingSchema,
    targetAreaIds: z.array(z.string().uuid()).optional(), // UUIDs of areas
    armMode: z.enum([ArmedState.ARMED_AWAY, ArmedState.ARMED_STAY]), // Required arm mode
}).refine(data => {
    if (data.scoping === 'SPECIFIC_AREAS') {
        return Array.isArray(data.targetAreaIds) && data.targetAreaIds.length > 0;
    }
    return true;
}, {
    message: "targetAreaIds must be provided and non-empty when scoping is SPECIFIC_AREAS",
    path: ['targetAreaIds'], // Path of the error
});

export const DisarmAreaActionParamsSchema = z.object({
    scoping: AreaScopingSchema,
    targetAreaIds: z.array(z.string().uuid()).optional(), // UUIDs of areas
}).refine(data => {
    if (data.scoping === 'SPECIFIC_AREAS') {
        return Array.isArray(data.targetAreaIds) && data.targetAreaIds.length > 0;
    }
    return true;
}, {
    message: "targetAreaIds must be provided and non-empty when scoping is SPECIFIC_AREAS",
    path: ['targetAreaIds'], // Path of the error
});
// --- End Enums & Schemas ---

// Schema for a single action within an automation
// Using discriminatedUnion allows easy extension with new action types later
export const AutomationActionSchema = z.discriminatedUnion("type", [
  z.object({ 
    type: z.literal("createEvent"), 
    params: CreateEventActionParamsSchema 
  }),
  z.object({
    type: z.literal("createBookmark"),
    params: CreateBookmarkParamsSchema
  }),
  z.object({
    type: z.literal("sendHttpRequest"),
    params: SendHttpRequestActionParamsSchema
  }),
  // --- Add new setDeviceState action type ---
  z.object({
    type: z.literal("setDeviceState"),
    params: SetDeviceStateActionParamsSchema
  }),
  // --- Add new sendPushNotification action type ---
  z.object({
    type: z.literal("sendPushNotification"),
    params: SendPushNotificationActionParamsSchema
  }),
  // Add future action types here, e.g.:
  // z.object({ type: z.literal("sendNotification"), params: SendNotificationParamsSchema }),
  z.object({ type: z.literal(AutomationActionType.ARM_AREA), params: ArmAreaActionParamsSchema }).strict(),
  z.object({ type: z.literal(AutomationActionType.DISARM_AREA), params: DisarmAreaActionParamsSchema }).strict(),
]);

// Type helper for a single action
export type AutomationAction = z.infer<typeof AutomationActionSchema>;

// --- NEW: Schema for Temporal Conditions --- 
export const TemporalConditionSchema = z.object({
    id: z.string().uuid().default(() => crypto.randomUUID()), // Internal ID for the condition in the UI list
    type: z.enum([
        'eventOccurred', 
        'noEventOccurred',
        'eventCountEquals',
        'eventCountLessThan',
        'eventCountGreaterThan',
        'eventCountLessThanOrEqual',
        'eventCountGreaterThanOrEqual'
    ]), 
    
    // --- NEW: Add expected count ---
    expectedEventCount: z.number().int().min(0).optional(), // Required for count-based types
    
    // --- NEW: Scoping definition --- 
    scoping: z.enum(['anywhere', 'sameArea', 'sameLocation']).default('anywhere'),
    eventFilter: JsonRuleGroupSchema, // Use the same rule builder structure
    
    // Time window relative to the primary trigger event
    timeWindowSecondsBefore: z.number().int().positive().optional(),
    timeWindowSecondsAfter: z.number().int().positive().optional(),

}).refine(data => {
    // Require expectedEventCount if a count-based type is selected
    if ([
        'eventCountEquals',
        'eventCountLessThan',
        'eventCountGreaterThan',
        'eventCountLessThanOrEqual',
        'eventCountGreaterThanOrEqual'
    ].includes(data.type)) {
        return data.expectedEventCount !== undefined && data.expectedEventCount !== null;
    }
    return true; // Not a count-based type, no requirement
}, {
    message: "Expected event count must be specified for count-based temporal conditions.",
    path: ["expectedEventCount"], // Apply error to the count field
});

// Type helper for a single temporal condition (automatically updated)
export type TemporalCondition = z.infer<typeof TemporalConditionSchema>;

// --- NEW: Automation Trigger Schema (Discriminated Union) ---
// Inserted BEFORE the original AutomationConfigSchema
export const AutomationTriggerSchema = z.discriminatedUnion("type", [
  z.object({ 
    type: z.literal(AutomationTriggerType.EVENT), 
    conditions: JsonRuleGroupSchema, // This is the primary event trigger conditions
  }),
  z.object({ 
    type: z.literal(AutomationTriggerType.SCHEDULED), 
    cronExpression: z.string().min(1, "CRON expression cannot be empty."),
    timeZone: z.string().optional(), // IANA timezone name, e.g., "America/New_York"
  })
]);

export type AutomationTrigger = z.infer<typeof AutomationTriggerSchema>;

// Schema for the overall automation configuration (already includes temporalConditions array)
export const AutomationConfigSchema = z.object({
  // conditions: JsonRuleGroupSchema, // OLD field
  trigger: AutomationTriggerSchema, // NEW field, replacing 'conditions'
  temporalConditions: z.array(TemporalConditionSchema).optional(), 
  actions: z.array(AutomationActionSchema).min(1, { message: "At least one action must be configured" }),
});

// Type helper for the automation configuration (already updated)
export type AutomationConfig = z.infer<typeof AutomationConfigSchema>;

// Combined type representing the full automation record from the database/API
// NOTE: This is manually defined and might need adjustment based on actual API/DB shape.
// It currently includes fields no longer directly on the 'automations' table.
export interface AutomationRecord {
  id: string;
  name: string;
  description?: string | null; 
  config: AutomationConfig; 
  enabled: boolean;
  createdAt: Date; 
  updatedAt: Date; 
}

// Main schema for a single automation action
export type AutomationActionParams =
    | z.infer<typeof CreateEventActionParamsSchema>
    | z.infer<typeof CreateBookmarkParamsSchema>
    | z.infer<typeof SendHttpRequestActionParamsSchema>
    | z.infer<typeof SetDeviceStateActionParamsSchema>
    | z.infer<typeof SendPushNotificationActionParamsSchema>
    | z.infer<typeof ArmAreaActionParamsSchema> 
    | z.infer<typeof DisarmAreaActionParamsSchema>;

// The file should end here, removing any subsequent erroneous definitions. 

// --- Added Schema for full Automation Rule with conditional Timezone validation ---
export const AutomationRuleSchema = z.object({
    id: z.string().uuid().optional(), 
    name: z.string().min(1, "Automation name cannot be empty."),
    enabled: z.boolean().default(true),
    configJson: AutomationConfigSchema, 
    locationScopeId: z.string().uuid().nullable().optional(),
    createdAt: z.date().optional(), 
    updatedAt: z.date().optional(),
}).superRefine((data, ctx) => {
    const trigger = data.configJson.trigger; // Correctly access trigger from configJson

    if (trigger.type === AutomationTriggerType.SCHEDULED) {
        if (!data.locationScopeId) {
            // After checking trigger.type, TS knows 'trigger' is the scheduled variant
            // So, trigger.timeZone is available if type is SCHEDULED.
            if (!trigger.timeZone || trigger.timeZone.trim() === "") {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["configJson", "trigger", "timeZone"], 
                    message: "Timezone is required for scheduled triggers if no location scope is selected.",
                });
            }
        }
    }
});

export type AutomationRule = z.infer<typeof AutomationRuleSchema>; 