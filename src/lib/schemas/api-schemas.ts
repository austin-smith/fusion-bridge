import { z } from 'zod';
import { ArmedState } from '@/lib/mappings/definitions';

// Device schemas
export const deviceSyncSchema = z.object({
  connectorId: z.string().min(1, "Connector ID is required"),
});

// Location schemas
export const createLocationSchema = z.object({
  name: z.string().min(1, "Name cannot be empty"),
  parentId: z.string().uuid("Invalid parent ID format").optional(),
  timeZone: z.string().min(1, "Time zone cannot be empty"),
  externalId: z.string().optional(),
  addressStreet: z.string().min(1, "Street address cannot be empty"),
  addressCity: z.string().min(1, "City cannot be empty"),
  addressState: z.string().min(1, "State cannot be empty"),
  addressPostalCode: z.string().min(1, "Postal code cannot be empty"),
  notes: z.string().optional(),
});

// PIN management schemas
export const validatePinSchema = z.object({
  pin: z.string()
    .regex(/^\d{6}$/, "PIN must be exactly 6 digits")
    .describe("6-digit numeric PIN to validate"),
});

export const pinValidationResponseSchema = z.discriminatedUnion("valid", [
  z.object({
    valid: z.literal(false).describe("PIN is not valid"),
  }),
  z.object({
    valid: z.literal(true).describe("PIN is valid"),
    userId: z.string().uuid().describe("User ID associated with the valid PIN"),
    userName: z.string().describe("User name associated with the valid PIN"),
  }),
]);

// Space schemas
export const createSpaceSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  locationId: z.string().uuid("Invalid location ID"),
  metadata: z.record(z.any()).optional(),
});

export const updateSpaceSchema = z.object({
  name: z.string().min(1, "Name is required").optional(),
  description: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

export const assignDeviceToSpaceSchema = z.object({
  deviceId: z.string().uuid("Invalid device ID format"),
});

// Alarm Zone schemas
export const createAlarmZoneSchema = z.object({
  name: z.string().min(1, "Name cannot be empty"),
  locationId: z.string().uuid("Invalid location ID format"),
  description: z.string().optional(),
  triggerBehavior: z.enum(['standard', 'custom']).optional().default('standard'),
});

export const updateAlarmZoneSchema = z.object({
  name: z.string().min(1, "Name cannot be empty").optional(),
  locationId: z.string().uuid("Invalid location ID format").optional(),
  description: z.string().optional(),
  triggerBehavior: z.enum(['standard', 'custom']).optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: "At least one field must be provided for update",
});

export const assignDevicesToZoneSchema = z.object({
  deviceIds: z.array(z.string().uuid("Invalid device ID format")).min(1, "At least one device ID required"),
});

export const removeDevicesFromZoneSchema = z.object({
  deviceIds: z.array(z.string().uuid("Invalid device ID format")).min(1, "At least one device ID required"),
});

export const setZoneArmedStateSchema = z.object({
  armedState: z.nativeEnum(ArmedState),
  reason: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

export const addTriggerOverrideSchema = z.object({
  eventType: z.string().min(1, "Event type cannot be empty"),
  shouldTrigger: z.boolean(),
});

export const removeTriggerOverrideSchema = z.object({
  eventType: z.string().min(1, "Event type cannot be empty"),
}); 