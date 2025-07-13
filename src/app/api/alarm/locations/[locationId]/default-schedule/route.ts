import { NextResponse } from 'next/server';
import { db } from '@/data/db';
import { locations, armingSchedules } from '@/data/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

// Define Location type locally if not available in @/types
// This should match the structure returned by your DB queries for locations
interface Location {
  id: string;
  parentId: string | null;
  name: string;
  path: string;
  timeZone: string;
  activeArmingScheduleId: string | null;
  createdAt: Date;
  updatedAt: Date;
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
 * PUT /api/alarm/locations/[locationId]/default-schedule
 * Sets or clears the default arming schedule for a location.
 */
export async function PUT(
  request: Request, 
  { params }: { params: Promise<{ locationId: string }> }
) {
  const { locationId } = await params;

  if (!locationId) {
    return NextResponse.json<ApiResponse>({ success: false, error: 'Location ID is required.' }, { status: 400 });
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

    // Verify location exists
    const existingLocation = await db.select({ id: locations.id }).from(locations).where(eq(locations.id, locationId)).limit(1);
    if (existingLocation.length === 0) {
      return NextResponse.json<ApiResponse>({ success: false, error: 'Location not found.' }, { status: 404 });
    }

    // If scheduleId is provided, verify it exists
    if (scheduleId) {
      const scheduleExists = await db.select({ id: armingSchedules.id }).from(armingSchedules).where(eq(armingSchedules.id, scheduleId)).limit(1);
      if (scheduleExists.length === 0) {
        return NextResponse.json<ApiResponse>({ success: false, error: 'Arming schedule not found.' }, { status: 404 });
      }
    }

    const [updatedLocation] = await db.update(locations)
      .set({
        activeArmingScheduleId: scheduleId,
        updatedAt: new Date(), // Manually update updatedAt
      })
      .where(eq(locations.id, locationId))
      .returning(); // Returns all columns of the updated location

    if (!updatedLocation) {
      // Should not happen if location existence was checked, but as a safeguard
      return NextResponse.json<ApiResponse>({ success: false, error: 'Failed to update location or location not found.' }, { status: 404 });
    }

    return NextResponse.json<ApiResponse<Location>>({ success: true, data: updatedLocation });

  } catch (error) {
    console.error(`[API PUT /locations/${locationId}/default-schedule]`, error);
    return NextResponse.json<ApiResponse>({ success: false, error: 'Failed to set default schedule for location.' }, { status: 500 });
  }
} 