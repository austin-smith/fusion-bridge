import { z } from 'zod';

// Schema for the Pushcut API Key stored in configuration
export const PushcutApiKeySchema = z.object({
  apiKey: z.string().min(1, 'API Key is required.'),
});

// Interface for Pushcut configuration (how it's stored/retrieved)
export interface PushcutConfig {
  id: string; // Internal ID in our system
  type: 'pushcut';
  isEnabled: boolean;
  apiKey: string;
}

// Enum for predefined Pushcut notification sounds
// Allowing any string for "<your-custom-sound>"
export const PushcutSoundEnum = z.enum([
  "none", "vibrateOnly", "system", "subtle", "question", 
  "jobDone", "problem", "loud", "lasers"
]);
export type PushcutSound = z.infer<typeof PushcutSoundEnum> | string; // To allow custom sound strings

// Schema for a single action (used in defaultAction and actions array)
// This is a flexible interpretation of "BaseNotificationAction" and "NotificationAction"
export const PushcutActionPayloadSchema = z.object({
  name: z.string().optional(),        // Name of the action
  input: z.string().optional(),       // Input for the action/shortcut
  url: z.string().url().optional(),   // URL to open
  shortcut: z.string().optional(),    // Name of a Shortcut to run
  homekit: z.string().optional(),     // HomeKit scene or action
  // Add other potential fields based on Pushcut's capabilities if discovered
});
export type PushcutActionPayload = z.infer<typeof PushcutActionPayloadSchema>;

// Schema for the main notification parameters (request body)
// notificationName is a path parameter, so it's not part of this schema
export const PushcutNotificationParamsSchema = z.object({
  id: z.string().optional().describe('NotificationId to replace an existing notification'),
  text: z.string().optional(),
  title: z.string().optional(),
  input: z.string().optional().describe('Input passed to the notification action'),
  defaultAction: PushcutActionPayloadSchema.optional(),
  image: z.string().url().or(z.string()).optional().describe('Name of imported image or URL'),
  imageData: z.string().optional().describe('Base64-encoded image data, overrides image property'),
  sound: PushcutSoundEnum.or(z.string()).optional().describe('Notification sound'),
  actions: z.array(PushcutActionPayloadSchema).optional().describe('List of dynamic actions'),
  devices: z.array(z.string()).optional().describe('List of device names to target (default is all)'),
  isTimeSensitive: z.boolean().optional(),
  threadId: z.string().optional().describe('Thread ID for grouping notifications'),
  delay: z.string().regex(/^\d+(s|m|h)$/, 'Delay must be like "10s", "15m", "6h"').optional().describe('Duration to delay execution (e.g., "10s", "15m", "6h")'),
});
export type PushcutNotificationParams = z.infer<typeof PushcutNotificationParamsSchema>;

// Schema for the API response when sending a notification
// Based on typical API responses; adjust if Pushcut provides specific details
// According to Pushcut docs, a successful response is usually a 200 OK with no body, or a JSON error.
// For simplicity, we'll define a structure that can capture success or error details.
export const PushcutApiResponseSchema = z.object({
  status: z.number(), // HTTP status code
  ok: z.boolean(), // True if status is 2xx
  message: z.string().optional(), // General message, e.g., "Notification sent" or error summary
  errors: z.array(z.string()).optional(), // Detailed errors from Pushcut API if any
  requestId: z.string().optional(), // Pushcut might return a request ID in headers or body
});
export type PushcutApiResponse = z.infer<typeof PushcutApiResponseSchema>;

// --- New types for GET /notifications endpoint ---

// Schema for a single defined notification from Pushcut
export const PushcutDefinedNotificationSchema = z.object({
  id: z.string().describe("The name/identifier of the notification"),
  title: z.string().optional().describe("The user-defined title of the notification in the Pushcut app"),
  // The API sample only shows id and title, add other fields if they exist
});
export type PushcutDefinedNotification = z.infer<typeof PushcutDefinedNotificationSchema>;

// Schema for the response when getting all defined notifications (array of them)
export const PushcutGetNotificationsApiResponseSchema = z.array(PushcutDefinedNotificationSchema);
export type PushcutGetNotificationsApiResponse = z.infer<typeof PushcutGetNotificationsApiResponseSchema>;

// Schema for a single active device from Pushcut
export const PushcutDeviceSchema = z.object({
  id: z.string().describe("The name/identifier of the active device"),
  // The API sample only shows id, add other fields if they exist (e.g., type, model)
});
export type PushcutDevice = z.infer<typeof PushcutDeviceSchema>;

// Schema for the response when getting all active devices (array of them)
export const PushcutGetDevicesApiResponseSchema = z.array(PushcutDeviceSchema);
export type PushcutGetDevicesApiResponse = z.infer<typeof PushcutGetDevicesApiResponseSchema>;

// Helper type for parameters sent to the driver function
// This includes the notificationName which is a path parameter for the API call
export interface PushcutSendParams extends PushcutNotificationParams {
  notificationName: string;
}

// Type for storing the service configuration in the database (encrypted part)
export interface PushcutStoredConfig {
    apiKey: string;
} 