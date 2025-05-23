import { NextResponse } from 'next/server';
import { db } from '@/data/db';
import { areaDevices, areas, devices } from '@/data/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { z } from 'zod';

// --- Validation Schema ---
const bulkAssignmentSchema = z.object({
  deviceIds: z.array(z.string().uuid("Invalid Device ID format")).min(1, "At least one device ID required"),
  operation: z.enum(['assign', 'remove'], { required_error: "Operation must be 'assign' or 'remove'" })
});

// Bulk assign/remove devices to/from an area
export async function PUT(
  request: Request, 
  { params }: { params: Promise<{ id: string }> }
) {
  const areaId = (await params).id;

  // Validate area ID format
  if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(areaId)) {
    return NextResponse.json({ success: false, error: "Invalid Area ID format" }, { status: 400 });
  }

  let operation: 'assign' | 'remove' = 'assign'; // Default value for error handling

  try {
    const body = await request.json();
    const validation = bulkAssignmentSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ 
        success: false, 
        error: "Invalid input", 
        details: validation.error.flatten() 
      }, { status: 400 });
    }

    const { deviceIds, operation: validatedOperation } = validation.data;
    operation = validatedOperation; // Set the operation for error handling

    // Use transaction for consistency
    const result = await db.transaction(async (tx) => {
      // 1. Check if area exists
      const [areaExists] = await tx.select({ id: areas.id }).from(areas).where(eq(areas.id, areaId)).limit(1);
      if (!areaExists) {
        return { success: false, error: "Area not found", status: 404 };
      }

      // 2. Check if all devices exist
      const existingDevices = await tx.select({ id: devices.id })
        .from(devices)
        .where(inArray(devices.id, deviceIds));
      
      if (existingDevices.length !== deviceIds.length) {
        const foundIds = existingDevices.map(d => d.id);
        const missingIds = deviceIds.filter(id => !foundIds.includes(id));
        return { 
          success: false, 
          error: `Devices not found: ${missingIds.join(', ')}`, 
          status: 404 
        };
      }

      if (operation === 'assign') {
        // 3a. For assignment: Check which devices are already assigned
        const existingAssignments = await tx.select({ deviceId: areaDevices.deviceId })
          .from(areaDevices)
          .where(and(
            eq(areaDevices.areaId, areaId),
            inArray(areaDevices.deviceId, deviceIds)
          ));

        const alreadyAssignedIds = existingAssignments.map(a => a.deviceId);
        const newAssignments = deviceIds.filter(id => !alreadyAssignedIds.includes(id));

        // Insert new assignments (skip already assigned devices for idempotency)
        if (newAssignments.length > 0) {
          const assignmentValues = newAssignments.map(deviceId => ({
            areaId,
            deviceId
          }));
          await tx.insert(areaDevices).values(assignmentValues);
        }

        return { 
          success: true, 
          data: { 
            areaId, 
            assigned: newAssignments.length,
            skipped: alreadyAssignedIds.length,
            total: deviceIds.length
          }, 
          status: 200 
        };

      } else {
        // 3b. For removal: Delete assignments
        await tx.delete(areaDevices)
          .where(and(
            eq(areaDevices.areaId, areaId),
            inArray(areaDevices.deviceId, deviceIds)
          ));

        return { 
          success: true, 
          data: { 
            areaId, 
            removed: deviceIds.length,
            total: deviceIds.length
          }, 
          status: 200 
        };
      }
    });

    // Return response based on transaction outcome
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    }
    return NextResponse.json({ success: true, data: result.data }, { status: result.status });

  } catch (error) {
    console.error(`Error bulk ${operation} devices for area ${areaId}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ 
      success: false, 
      error: `Failed to bulk ${operation} devices: ${errorMessage}` 
    }, { status: 500 });
  }
} 