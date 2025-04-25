import { z } from 'zod';

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
  // Add future action types here, e.g.:
  // z.object({ type: z.literal("sendNotification"), params: SendNotificationParamsSchema }),
]);

// Type helper for a single action
export type AutomationAction = z.infer<typeof AutomationActionSchema>;

// Schema for the overall automation configuration
export const AutomationConfigSchema = z.object({
  sourceEntityTypes: z.array(z.string()).min(1, { message: "At least one source entity type must be selected" }),
  eventTypeFilter: z.string().optional(),
  actions: z.array(AutomationActionSchema).min(1, { message: "At least one action must be configured" }),
});

// Type helper for the automation configuration
export type AutomationConfig = z.infer<typeof AutomationConfigSchema>;

// Combined type representing the full automation record from the database/API
// We'll manually define this for now, aligning with the DB schema and expected API response
export interface AutomationRecord {
  id: string;
  name: string;
  description?: string | null; // Optional in DB
  triggerSource: string;
  triggerEvent: string;
  triggerDeviceId?: string | null; // Optional in DB
  actionType: string;
  config: AutomationConfig; // Embeds the config schema
  enabled: boolean;
  createdAt: Date; // Added from DB schema
  updatedAt: Date; // Added from DB schema
} 