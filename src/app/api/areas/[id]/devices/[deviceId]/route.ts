import { NextResponse } from 'next/server';
import { db } from '@/data/db';
import { areaDevices } from '@/data/db/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';

// Remove unused RouteParams interface
// interface RouteParams {
//  params: {
//    id: string; // Area ID
//    deviceId: string; // Device ID (our internal UUID)
//  };
// }

// Remove a device assignment from an area - Correct Next.js 15 signature
export async function DELETE(
  request: Request, 
  { params }: { params: Promise<{ id: string; deviceId: string }> } 
) {
  const { id: areaId, deviceId } = await params; // Await the params Promise

  // Validate IDs
  const idSchema = z.string().uuid("Invalid ID format");
  const areaIdValidation = idSchema.safeParse(areaId);
  const deviceIdValidation = idSchema.safeParse(deviceId);

  if (!areaIdValidation.success || !deviceIdValidation.success) {
      const errors = {
        ...(!areaIdValidation.success && {areaId: areaIdValidation.error.flatten().formErrors}),
        ...(!deviceIdValidation.success && {deviceId: deviceIdValidation.error.flatten().formErrors})
      };
      return NextResponse.json({ success: false, error: "Invalid ID format(s)", details: errors }, { status: 400 });
  }

  try {
    // Perform the delete operation
    // No need to check existence first, DELETE is idempotent
    await db.delete(areaDevices)
            .where(and(eq(areaDevices.areaId, areaId), eq(areaDevices.deviceId, deviceId)));

    // Return success - 204 No Content is conventional, but 200 with body is fine too
    return NextResponse.json({ success: true, data: { areaId, deviceId } });

  } catch (error) {
    console.error(`Error removing device ${deviceId} from area ${areaId}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: `Failed to remove device assignment: ${errorMessage}` }, { status: 500 });
  }
} 