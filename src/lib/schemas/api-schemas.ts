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