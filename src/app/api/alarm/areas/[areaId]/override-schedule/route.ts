import { NextResponse, NextRequest } from 'next/server';
import { db } from '@/data/db';
import { areas, armingSchedules } from '@/data/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { ArmedState } from '@/lib/mappings/definitions'; // Assuming ArmedState is here

// Define Area type locally if not available in @/types
// This should match the structure returned by your DB queries for areas
interface Area {
  id: string;
  locationId: string;
  name: string;
  armedState: ArmedState;
  lastArmedStateChangeReason: string | null;
  nextScheduledArmTime: Date | null;
  nextScheduledDisarmTime: Date | null;
  isArmingSkippedUntil: Date | null;
  overrideArmingScheduleId: string | null;
  createdAt: Date;
  updatedAt: Date;
  // Potentially other fields like 'devices' if you expand relations in queries
}

// Define a generic API response structure (consistent with other route files)
interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  details?: any; // For validation errors
}

const linkSchedulePayloadSchema = z.object({
  scheduleId: z.string().nullable(), // Allow string or null
});

type LinkSchedulePayload = z.infer<typeof linkSchedulePayloadSchema>;

/**
 * PUT /api/alarm/areas/[areaId]/override-schedule
 * Sets or clears the override arming schedule for an area.
 */
export async function PUT(
  request: NextRequest,
  routeContext: { params: Promise<{ areaId: string }> }
) {
  const { areaId } = await routeContext.params;

  if (!areaId) {
    return NextResponse.json<ApiResponse>({ success: false, error: 'Area ID is required.' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const validationResult = linkSchedulePayloadSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Invalid request payload.',
        details: validationResult.error.flatten(),
      }, { status: 400 });
    }

    const { scheduleId } = validationResult.data;

    // Verify area exists
    const existingArea = await db.select({ id: areas.id }).from(areas).where(eq(areas.id, areaId)).limit(1);
    if (existingArea.length === 0) {
      return NextResponse.json<ApiResponse>({ success: false, error: 'Area not found.' }, { status: 404 });
    }

    // If scheduleId is provided, verify it exists
    if (scheduleId) {
      const scheduleExists = await db.select({ id: armingSchedules.id }).from(armingSchedules).where(eq(armingSchedules.id, scheduleId)).limit(1);
      if (scheduleExists.length === 0) {
        return NextResponse.json<ApiResponse>({ success: false, error: 'Arming schedule not found.' }, { status: 404 });
      }
    }

    const [updatedArea] = await db.update(areas)
      .set({
        overrideArmingScheduleId: scheduleId,
        updatedAt: new Date(), // Manually update updatedAt
      })
      .where(eq(areas.id, areaId))
      .returning(); // Returns all columns of the updated area

    if (!updatedArea) {
      // Should not happen if area existence was checked, but as a safeguard
      return NextResponse.json<ApiResponse>({ success: false, error: 'Failed to update area or area not found.' }, { status: 404 });
    }

    return NextResponse.json<ApiResponse<Area>>({ success: true, data: updatedArea });

  } catch (error) {
    console.error(`[API PUT /areas/${areaId}/override-schedule]`, error);
    return NextResponse.json<ApiResponse>({ success: false, error: 'Failed to set override schedule for area.' }, { status: 500 });
  }
} 