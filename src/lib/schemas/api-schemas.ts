import { z } from 'zod';
import { ArmedState } from '@/lib/mappings/definitions';

// Area schemas
export const createAreaSchema = z.object({
  name: z.string().min(1, "Name cannot be empty"),
  locationId: z.string().uuid("Invalid location ID format"),
});

export const updateAreaSchema = z.object({
  name: z.string().min(1, "Name cannot be empty").optional(),
  locationId: z.string().uuid("Invalid location ID format").optional(),
}).refine(data => data.name !== undefined || data.locationId !== undefined, {
  message: "Either name or locationId must be provided for update",
});

export const updateArmedStateSchema = z.object({
  armedState: z.nativeEnum(ArmedState),
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

// Device schemas
export const deviceSyncSchema = z.object({
  connectorId: z.string().min(1, "Connector ID is required"),
});

// PIN management schemas
export const setPinSchema = z.object({
  pin: z.string()
    .regex(/^\d{6}$/, "PIN must be exactly 6 digits")
    .describe("6-digit numeric PIN for keypad access"),
});

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

export const pinOperationResponseSchema = z.object({
  userId: z.string().uuid().describe("User ID"),
  message: z.string().describe("Operation result message"),
}); 