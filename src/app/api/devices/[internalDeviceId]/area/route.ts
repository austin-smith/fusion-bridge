import { NextResponse } from 'next/server';
import { db } from '@/data/db';
import { areaDevices, devices, areas } from '@/data/db/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';

// Validation schema for the request body
const updateDeviceAreaSchema = z.object({
  areaId: z.string().uuid("Invalid Area ID format").nullable(), // Allow null to unassign
});

// PUT handler to update the area assignment for a device
export async function PUT(
  request: Request, 
  { params }: { params: Promise<{ internalDeviceId: string }> } // Use internalDeviceId
) {
  const { internalDeviceId: deviceId } = await params; // Destructure internalDeviceId

  // Validate Device ID format
  if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(deviceId)) {
    return NextResponse.json({ success: false, error: "Invalid Device ID format" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const validation = updateDeviceAreaSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ success: false, error: "Invalid input", details: validation.error.flatten() }, { status: 400 });
    }

    const { areaId: targetAreaId } = validation.data; // This can be null

    // --- Database Transaction ---
    const result = await db.transaction(async (tx) => {
      // 1. Verify the device exists
      const [deviceExists] = await tx.select({ id: devices.id }).from(devices).where(eq(devices.id, deviceId)).limit(1);
      if (!deviceExists) {
        return { success: false, error: "Device not found", status: 404 };
      }

      // 2. Verify the target area exists (if not null)
      if (targetAreaId) {
        const [areaExists] = await tx.select({ id: areas.id }).from(areas).where(eq(areas.id, targetAreaId)).limit(1);
        if (!areaExists) {
          return { success: false, error: "Target area not found", status: 404 };
        }
      }

      // 3. Delete existing assignments for this device
      //    (A device should only be in one area at most)
      await tx.delete(areaDevices).where(eq(areaDevices.deviceId, deviceId));

      // 4. Insert new assignment if targetAreaId is provided
      if (targetAreaId) {
        await tx.insert(areaDevices).values({ 
          deviceId: deviceId, 
          areaId: targetAreaId 
        });
        console.log(`Assigned device ${deviceId} to area ${targetAreaId}`);
      } else {
        console.log(`Unassigned device ${deviceId} from any area`);
      }

      return { success: true, data: { deviceId, areaId: targetAreaId }, status: 200 };
    });
    // --- End Transaction ---

    // Return response based on transaction outcome
    if (!result.success) {
       return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    }
    return NextResponse.json({ success: true, data: result.data }, { status: result.status });

  } catch (error) {
    console.error(`Error updating area for device ${deviceId}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    // Handle potential unique constraint errors if DB schema changes or transaction fails partially
    if (errorMessage.includes('UNIQUE constraint failed')) { 
        return NextResponse.json({ success: false, error: "Device might already be in the target area (unexpected state)" }, { status: 409 }); 
    }
    return NextResponse.json({ success: false, error: `Failed to update device area: ${errorMessage}` }, { status: 500 });
  }
} 