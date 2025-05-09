import { z } from 'zod';
// --- Add import for ActionableState ---
import { ActionableState } from '@/lib/mappings/definitions';

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
    // Body is only relevant for certain methods
    if (!['POST', 'PUT', 'PATCH'].includes(data.method)) {
        return true; // No body validation needed for GET, DELETE etc.
    }
    // If content type is JSON, body must be provided and be valid JSON (or empty/whitespace)
    if (data.contentType === 'application/json') {
        if (!data.bodyTemplate || data.bodyTemplate.trim() === '') return true; // Allow empty body
        try {
            JSON.parse(data.bodyTemplate);
            return true;
        } catch {
            return false; // Invalid JSON
        }
    }
    return true; // No specific validation for other content types yet
}, {
    // Custom error message for JSON validation
    message: "Body must be valid JSON if Content-Type is application/json",
    path: ["bodyTemplate"], // Apply error to bodyTemplate field
    // Only apply this refinement logic when method requires a body and content type is JSON
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
  // Add future action types here, e.g.:
  // z.object({ type: z.literal("sendNotification"), params: SendNotificationParamsSchema }),
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

// Schema for the overall automation configuration (already includes temporalConditions array)
export const AutomationConfigSchema = z.object({
  conditions: JsonRuleGroupSchema, 
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