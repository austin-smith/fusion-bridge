import { NextResponse } from 'next/server';
import { db } from '@/data/db';
import { areas } from '@/data/db/schema';
import { eq } from 'drizzle-orm';
import type { Area } from '@/types/index';
import { ArmedState } from '@/lib/mappings/definitions';
import { z } from 'zod';
import { internalSetAreaArmedState } from '@/lib/actions/area-alarm-actions';
import { revalidateTag } from 'next/cache';

// --- Validation Schema ---
// Define the possible armed states explicitly for validation
// const armedStateEnum = z.enum(['DISARMED', 'ARMED_AWAY', 'ARMED_STAY', 'TRIGGERED']);

const updateArmedStateSchema = z.object({
  armedState: z.nativeEnum(ArmedState),
});

// Update the armed state of an area - Correct Next.js 15 signature
export async function PUT( // Restore async
  request: Request,
  { params }: { params: Promise<{ id: string }> } // Use Promise<...> for params
) {
  const { id } = await params; // Await the params Promise

  // Restore original logic
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

    // Call the internal service function
    const updatedArea = await internalSetAreaArmedState(id, armedState);

    if (!updatedArea) {
      // internalSetAreaArmedState returns null if area not found after its own check
      return NextResponse.json({ success: false, error: "Area not found or failed to update" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: updatedArea as Area });

  } catch (error) {
    console.error(`API Error updating armed state for area ${id}:`, error);
    // The internal function might throw specific errors, or a generic one
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    // Determine status code based on error type if possible, otherwise 500
    let statusCode = 500;
    if (errorMessage.startsWith("Invalid input")) statusCode = 400;
    // Add more specific error checks if internalSetAreaArmedState throws custom errors with codes

    return NextResponse.json({ success: false, error: `Failed to update armed state: ${errorMessage}` }, { status: statusCode });
  }
} 