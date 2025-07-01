import { z } from 'zod';

// Define the structure for parameters after token resolution and type conversion
export interface ResolvedPushoverMessageParams {
  message: string;
  title?: string;
  device?: string;      // Specific device name(s), comma-separated for multiple
  sound?: string;       // Name of a supported sound
  timestamp?: number;   // Unix timestamp
  url?: string;         // Supplementary URL
  urlTitle?: string;    // Title for the supplementary URL
  ttl?: number;         // Time To Live in seconds
  html?: 0 | 1;         // 0 or 1
  monospace?: 0 | 1;    // 0 or 1
  priority?: -2 | -1 | 0 | 1 | 2; // Pushover priority levels
  // Fields for emergency priority (priority: 2)
  retry?: number;       // Retry interval in seconds (min 30)
  expire?: number;      // Expire time in seconds (max 10800)
  // Attachment fields (using Base64)
  attachment_base64?: string; // Base64-encoded image data
  attachment_type?: string;   // MIME type of the attachment (e.g., image/jpeg)
}

// Zod schema for Pushover API message parameters
export const ResolvedPushoverMessageParamsSchema = z.object({
  message: z.string().min(1, "Message is required"),
  title: z.string().optional(),
  device: z.string().optional(),
  sound: z.string().optional(),
  timestamp: z.number().int().optional(),
  url: z.string().url().optional(),
  urlTitle: z.string().optional(),
  ttl: z.number().int().optional(),
  html: z.union([z.literal(0), z.literal(1)]).optional(),
  monospace: z.union([z.literal(0), z.literal(1)]).optional(),
  priority: z.union([
    z.literal(-2),
    z.literal(-1),
    z.literal(0),
    z.literal(1),
    z.literal(2)
  ]).optional(),
  retry: z.number().int().optional(),
  expire: z.number().int().optional(),
  attachment_base64: z.string().optional(),
  attachment_type: z.string().optional(), // e.g., 'image/jpeg', 'image/png'
});

export interface PushoverApiResponse {
  status: number;
  request: string; // Unique request ID
  errors?: string[];
  receipt?: string; // For emergency priority
  // ... any other fields Pushover might return
}

// Zod schema for base API response
export const PushoverApiResponseSchema = z.object({
  status: z.number().int(),
  request: z.string(),
  errors: z.array(z.string()).optional(),
  receipt: z.string().optional(),
});

// Interface for group information response
export interface PushoverGroupInfo {
  status: number;
  request: string;
  name: string;
  users: PushoverGroupUser[];
}

// Interface for group users
export interface PushoverGroupUser {
  user: string;
  device: string | null;
  memo: string;
  disabled: boolean;
  name?: string; // Only present for Team-owned groups
  email?: string; // Only present for Team-owned groups
}

// Zod schema for group users
export const PushoverGroupUserSchema = z.object({
  user: z.string(),
  device: z.string().nullable(),
  memo: z.string(),
  disabled: z.boolean(),
  name: z.string().optional(),
  email: z.string().optional(),
});

// Zod schema for group information response
export const PushoverGroupInfoSchema = z.object({
  status: z.number().int(),
  request: z.string(),
  name: z.string(),
  users: z.array(PushoverGroupUserSchema),
});

// Schema for adding a user to a group
export const AddUserToGroupParamsSchema = z.object({
  user: z.string().min(1, "User key is required."),
  device: z.string().optional(),
  memo: z.string().max(200, "Memo cannot exceed 200 characters.").optional(),
});

export type AddUserToGroupParams = z.infer<typeof AddUserToGroupParamsSchema>;

// Schema for removing a user from a group
export const RemoveUserFromGroupParamsSchema = z.object({
  user: z.string().min(1, "User key is required."),
  device: z.string().optional(), // If provided, only remove this specific device subscription
});

export type RemoveUserFromGroupParams = z.infer<typeof RemoveUserFromGroupParamsSchema>;

// Schema for validating a user/group key
export const ValidateUserParamsSchema = z.object({
  user: z.string().min(1, "User/Group key is required."),
  device: z.string().optional(), // Optional device name to validate
});

export type ValidateUserParams = z.infer<typeof ValidateUserParamsSchema>;

// Interface for the validation response
export interface PushoverValidationResponse {
  status: number;
  request: string;
  devices?: string[]; // Present if user is valid
  licenses?: string[]; // Present if user is valid
  errors?: string[];   // Present if user is invalid
}

// Zod schema for the validation response
export const PushoverValidationResponseSchema = z.object({
  status: z.number().int(),
  request: z.string(),
  devices: z.array(z.string()).optional(),
  licenses: z.array(z.string()).optional(),
  errors: z.array(z.string()).optional(),
}); 