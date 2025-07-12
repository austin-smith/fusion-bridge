import { NextResponse } from 'next/server';
import { db } from '@/data/db';
import { armingSchedules, locations } from '@/data/db/schema';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';

// Define ArmingSchedule type locally (consistent with the other route file)
interface ArmingSchedule {
  id: string;
  name: string;
  daysOfWeek: number[];
  armTimeLocal: string;
  disarmTimeLocal: string;
  isEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Define a generic API response structure (consistent with the other route file)
interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  details?: any; // For validation errors
}

// Zod schema for validating the request body for updating an arming schedule
// All fields are optional for PUT requests.
const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/; // HH:MM format
const daysOfWeekSchema = z.array(z.number().min(0).max(6)).min(1, "At least one day must be selected");

const updateArmingSchedulePayloadSchema = z.object({
  name: z.string().min(1, "Name cannot be empty if provided").optional(),
  daysOfWeek: daysOfWeekSchema.optional(),
  armTimeLocal: z.string().regex(timeRegex, "Invalid arm time format. Use HH:MM").optional(),
  disarmTimeLocal: z.string().regex(timeRegex, "Invalid disarm time format. Use HH:MM").optional(),
  isEnabled: z.boolean().optional(),
});

type UpdateArmingSchedulePayload = z.infer<typeof updateArmingSchedulePayloadSchema>;

/**
 * PUT /api/alarm/arming-schedules/[scheduleId]
 * Updates an existing arming schedule.
 */
export async function PUT(
  request: Request, 
  { params }: { params: Promise<{ scheduleId: string }> }
) {
  const { scheduleId } = await params;

  if (!scheduleId) {
    return NextResponse.json<ApiResponse>({ success: false, error: 'Schedule ID is required.' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const validationResult = updateArmingSchedulePayloadSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Invalid request payload.',
        details: validationResult.error.flatten(),
      }, { status: 400 });
    }

    const dataToUpdate = validationResult.data;

    if (Object.keys(dataToUpdate).length === 0) {
      return NextResponse.json<ApiResponse>({ 
        success: false, 
        error: 'No fields provided for update.' 
      }, { status: 400 });
    }

    // Add updatedAt manually as $defaultFn only works on insert
    const finalDataToUpdate = {
        ...dataToUpdate,
        updatedAt: new Date(),
    };

    const [updatedSchedule] = await db.update(armingSchedules)
      .set(finalDataToUpdate)
      .where(eq(armingSchedules.id, scheduleId))
      .returning();

    if (!updatedSchedule) {
      return NextResponse.json<ApiResponse>({ success: false, error: 'Arming schedule not found or no changes made.' }, { status: 404 });
    }

    return NextResponse.json<ApiResponse<ArmingSchedule>>({ success: true, data: updatedSchedule });
  } catch (error) {
    console.error(`[API PUT /arming-schedules/${scheduleId}]`, error);
    return NextResponse.json<ApiResponse>({ success: false, error: 'Failed to update arming schedule.' }, { status: 500 });
  }
}

/**
 * DELETE /api/alarm/arming-schedules/[scheduleId]
 * Deletes an arming schedule.
 * The schema's `onDelete: 'set null'` for FKs in locations table
 * will handle unlinking automatically.
 */
export async function DELETE(
  request: Request, 
  { params }: { params: Promise<{ scheduleId: string }> }
) {
  const { scheduleId } = await params;

  if (!scheduleId) {
    return NextResponse.json<ApiResponse>({ success: false, error: 'Schedule ID is required.' }, { status: 400 });
  }

  try {
    // First, verify the schedule exists (optional, but good practice for a clear 404)
    const existingSchedule = await db.select({ id: armingSchedules.id }).from(armingSchedules).where(eq(armingSchedules.id, scheduleId)).limit(1);
    if (existingSchedule.length === 0) {
        return NextResponse.json<ApiResponse>({ success: false, error: 'Arming schedule not found.' }, { status: 404 });
    }

    // Drizzle's .returning() for delete returns the deleted rows
    const [deletedScheduleData] = await db.delete(armingSchedules)
      .where(eq(armingSchedules.id, scheduleId))
      .returning({ id: armingSchedules.id }); // Only need to confirm deletion by returning id

    if (!deletedScheduleData || !deletedScheduleData.id) {
      // This case should ideally be caught by the check above, but as a safeguard:
      return NextResponse.json<ApiResponse>({ success: false, error: 'Arming schedule not found or failed to delete.' }, { status: 404 });
    }

    return NextResponse.json<ApiResponse<{ id: string }>>({ success: true, data: { id: scheduleId } });
  } catch (error) {
    console.error(`[API DELETE /arming-schedules/${scheduleId}]`, error);
    // Handle potential foreign key constraint errors if `onDelete: 'set null'` wasn't effective or if other constraints exist
    // However, with SQLite and `onDelete: 'set null'`, direct FK errors during delete are less common if the feature is supported.
    return NextResponse.json<ApiResponse>({ success: false, error: 'Failed to delete arming schedule. It might be in use or another error occurred.' }, { status: 500 });
  }
} 