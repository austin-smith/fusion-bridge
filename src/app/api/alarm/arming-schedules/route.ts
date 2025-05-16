import { NextResponse } from 'next/server';
import { db } from '@/data/db';
import { armingSchedules } from '@/data/db/schema';
import { z } from 'zod';
// import type { ArmingSchedule } from '@/types'; // Assuming ArmingSchedule type is defined in @/types

// Define ArmingSchedule type locally for now if not available in @/types
interface ArmingSchedule {
  id: string;
  name: string;
  daysOfWeek: number[];
  armTimeLocal: string;
  disarmTimeLocal: string;
  isEnabled: boolean;
  createdAt: Date; // Drizzle timestamp mode converts to Date
  updatedAt: Date; // Drizzle timestamp mode converts to Date
}

// Define a generic API response structure (if not already globally defined)
interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  details?: any; // For validation errors
}

// Zod schema for validating the request body for creating a new schedule
// HH:mm format for times, array of numbers (0-6 for Sun-Sat) for daysOfWeek
const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/; // HH:MM format
const daysOfWeekSchema = z.array(z.number().min(0).max(6)).min(1, "At least one day must be selected");

const newArmingSchedulePayloadSchema = z.object({
  name: z.string().min(1, "Name is required"),
  daysOfWeek: daysOfWeekSchema,
  armTimeLocal: z.string().regex(timeRegex, "Invalid arm time format. Use HH:MM"),
  disarmTimeLocal: z.string().regex(timeRegex, "Invalid disarm time format. Use HH:MM"),
  isEnabled: z.boolean().optional().default(true),
});

type NewArmingSchedulePayload = z.infer<typeof newArmingSchedulePayloadSchema>;

/**
 * GET /api/alarm/arming-schedules
 * Fetches all arming schedules.
 */
export async function GET() {
  try {
    const schedules = await db.select().from(armingSchedules).orderBy(armingSchedules.name);
    return NextResponse.json<ApiResponse<ArmingSchedule[]>>({ success: true, data: schedules });
  } catch (error) {
    console.error('[API GET /arming-schedules]', error);
    return NextResponse.json<ApiResponse>({ success: false, error: 'Failed to fetch arming schedules.' }, { status: 500 });
  }
}

/**
 * POST /api/alarm/arming-schedules
 * Creates a new arming schedule.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validationResult = newArmingSchedulePayloadSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Invalid request payload.',
        details: validationResult.error.flatten(),
      }, { status: 400 });
    }

    const { name, daysOfWeek, armTimeLocal, disarmTimeLocal, isEnabled } = validationResult.data;

    // Additional validation: armTimeLocal should be before disarmTimeLocal if they are on the same day,
    // but this logic can get complex with schedules spanning midnight. For now, keep it simple.
    // Consider if daysOfWeek needs to be stored as JSON string or Drizzle handles the array directly.
    // Drizzle's $type<number[]>() for json mode should handle it.

    const [newSchedule] = await db.insert(armingSchedules).values({
      name,
      daysOfWeek, // Drizzle should serialize this array to JSON string if column is TEXT JSON
      armTimeLocal,
      disarmTimeLocal,
      isEnabled,
      // createdAt and updatedAt have default values in the schema
    }).returning();

    if (!newSchedule) {
      return NextResponse.json<ApiResponse>({ success: false, error: 'Failed to create arming schedule.' }, { status: 500 });
    }

    return NextResponse.json<ApiResponse<ArmingSchedule>>({ success: true, data: newSchedule }, { status: 201 });
  } catch (error) {
    console.error('[API POST /arming-schedules]', error);
    if (error instanceof z.ZodError) { // Should be caught by safeParse, but as a fallback
      return NextResponse.json<ApiResponse>({ success: false, error: 'Validation failed', details: error.flatten() }, { status: 400 });
    }
    return NextResponse.json<ApiResponse>({ success: false, error: 'Failed to create arming schedule.' }, { status: 500 });
  }
} 