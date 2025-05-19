import { db } from '@/data/db';
import { areas } from '@/data/db/schema';
import { eq } from 'drizzle-orm';
import type { Area } from '@/types/index';
import { ArmedState } from '@/lib/mappings/definitions';
import { z } from 'zod';

// Schema for input validation (can be shared or internal if specific)
const internalSetArmedStateSchema = z.object({
  areaId: z.string().uuid("Invalid Area ID format"),
  armedState: z.nativeEnum(ArmedState),
  // reason: z.string().optional(), // If you want to log a reason for the change
});

/**
 * Internally sets the armed state of an area.
 * This function is intended for server-side use.
 * 
 * @param areaId The UUID of the area.
 * @param armedState The new armed state.
 * @returns The updated area object or null if not found or error.
 * @throws Error if validation fails or database update fails.
 */
export async function internalSetAreaArmedState(
  areaId: string,
  armedState: ArmedState
): Promise<Area | null> {
  // Validate input
  const validation = internalSetArmedStateSchema.safeParse({ areaId, armedState });
  if (!validation.success) {
    console.error("[InternalAreaService] Invalid input for internalSetAreaArmedState:", validation.error.flatten());
    // Throw an error or return null, depending on desired handling for internal calls
    throw new Error(`Invalid input for setting armed state: ${validation.error.format()}`);
  }

  const { areaId: validatedAreaId, armedState: validatedArmedState } = validation.data;

  try {
    // Check if area exists (optional, update will fail anyway but good for specific error)
    const [currentArea] = await db.select({ id: areas.id })
      .from(areas)
      .where(eq(areas.id, validatedAreaId))
      .limit(1);

    if (!currentArea) {
      console.warn(`[InternalAreaService] Area not found: ${validatedAreaId}`);
      return null; // Or throw new Error('Area not found');
    }

    // Perform the update
    const updatedResult = await db.update(areas)
      .set({ armedState: validatedArmedState, updatedAt: new Date() })
      .where(eq(areas.id, validatedAreaId))
      .returning();

    if (updatedResult.length === 0) {
        // This case should ideally not happen if currentArea was found, 
        // but good to handle for robustness (e.g., race condition on delete)
        console.warn(`[InternalAreaService] Failed to update area (not found after initial check or no rows affected): ${validatedAreaId}`);
        return null;
    }
    
    console.log(`[InternalAreaService] Successfully set armed state for area ${validatedAreaId} to ${validatedArmedState}`);
    return updatedResult[0] as Area; // Drizzle returns an array

  } catch (error) {
    console.error(`[InternalAreaService] Error setting armed state for area ${validatedAreaId}:`, error);
    // Re-throw to be handled by the caller (e.g., automation service)
    if (error instanceof Error) {
      throw error;
    } else {
      throw new Error('An unknown error occurred while setting area armed state.');
    }
  }
} 