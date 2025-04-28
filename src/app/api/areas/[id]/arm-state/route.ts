import { NextResponse } from 'next/server';
import { db } from '@/data/db';
import { areas } from '@/data/db/schema';
import { eq } from 'drizzle-orm';
import type { Area } from '@/types/index';
import { ArmedState } from '@/lib/mappings/definitions';
import { z } from 'zod';

interface RouteParams {
  params: {
    id: string; // Area ID
  };
}

// --- Validation Schema ---
// Define the possible armed states explicitly for validation
// const armedStateEnum = z.enum(['DISARMED', 'ARMED_AWAY', 'ARMED_STAY', 'TRIGGERED']);

const updateArmedStateSchema = z.object({
  armedState: z.nativeEnum(ArmedState),
});

// Update the armed state of an area
export async function PUT(request: Request, { params }: RouteParams) {
  // Revert id access back to destructuring
  const { id } = params;

  if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id)) {
    return NextResponse.json({ success: false, error: "Invalid ID format" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const validation = updateArmedStateSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ success: false, error: "Invalid input", details: validation.error.flatten() }, { status: 400 });
    }

    const { armedState } = validation.data;

    // Check if area exists
    const [currentArea] = await db.select({ id: areas.id }).from(areas).where(eq(areas.id, id)).limit(1);
    if (!currentArea) {
      return NextResponse.json({ success: false, error: "Area not found" }, { status: 404 });
    }

    // Perform the update
    const [updatedArea] = await db.update(areas)
      .set({ armedState: armedState, updatedAt: new Date() })
      .where(eq(areas.id, id))
      .returning();

    return NextResponse.json({ success: true, data: updatedArea as Area });

  } catch (error) {
    console.error(`Error updating armed state for area ${id}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: `Failed to update armed state: ${errorMessage}` }, { status: 500 });
  }
} 