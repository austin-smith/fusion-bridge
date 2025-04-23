import { z } from 'zod';

// Schema for the parameters of the 'createEvent' action
export const CreateEventActionParamsSchema = z.object({
  sourceTemplate: z.string().min(1, { message: "Source is required" }),
  captionTemplate: z.string().min(1, { message: "Caption is required" }),
  descriptionTemplate: z.string().min(1, { message: "Description is required" }),
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
});

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
  targetNodeId: string;
  config: AutomationConfig; // Embeds the config schema
  enabled: boolean;
  createdAt: Date; // Added from DB schema
  updatedAt: Date; // Added from DB schema
} 