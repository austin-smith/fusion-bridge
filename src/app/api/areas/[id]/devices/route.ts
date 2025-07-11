import { NextResponse } from 'next/server';
import { withOrganizationAuth, type OrganizationAuthContext } from '@/lib/auth/withOrganizationAuth';
import { createOrgScopedDb } from '@/lib/db/org-scoped-db';
import { db } from '@/data/db';
import { areaDevices, devices } from '@/data/db/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import type { DeviceWithConnector } from '@/types/index';
import type { RouteContext } from '@/lib/auth/withApiRouteAuth';

// Remove unused RouteParams interface
// interface RouteParams {
//  params: {
//    id: string; // Area ID
//  };
// }

// --- Validation Schema ---
const assignDeviceSchema = z.object({
  deviceId: z.string().uuid("Invalid Device ID format"),
});

// Fetch device IDs assigned to an area within the active organization
export const GET = withOrganizationAuth(async (
  request: Request, 
  authContext: OrganizationAuthContext,
  context: RouteContext<{ id: string }>
) => {
  const { id: areaId } = await context.params;

  if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(areaId)) {
    return NextResponse.json({ success: false, error: "Invalid Area ID format" }, { status: 400 });
  }

  try {
    const orgDb = createOrgScopedDb(authContext.organizationId);
    
    // Check if area exists and belongs to organization
    if (!(await orgDb.areas.exists(areaId))) {
      return NextResponse.json({ success: false, error: "Area not found" }, { status: 404 });
    }

    // Fetch associated device IDs
    const assignedDevices = await db.select({ deviceId: areaDevices.deviceId })
                                   .from(areaDevices)
                                   .where(eq(areaDevices.areaId, areaId));
    
    const deviceIds = assignedDevices.map(d => d.deviceId);

    return NextResponse.json({ success: true, data: deviceIds });

  } catch (error) {
    console.error(`Error fetching devices for area ${areaId}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: `Failed to fetch area devices: ${errorMessage}` }, { status: 500 });
  }
});

// Assign a device to an area within the active organization
export const POST = withOrganizationAuth(async (
  request: Request, 
  authContext: OrganizationAuthContext,
  context: RouteContext<{ id: string }>
) => {
  const { id: areaId } = await context.params;

  if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(areaId)) {
    return NextResponse.json({ success: false, error: "Invalid Area ID format" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const validation = assignDeviceSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ success: false, error: "Invalid input", details: validation.error.flatten() }, { status: 400 });
    }

    const { deviceId } = validation.data;
    const orgDb = createOrgScopedDb(authContext.organizationId);

    // Use transaction to check existence and insert
    const result = await db.transaction(async (tx) => {
      // 1. Check if Area exists and belongs to organization
      if (!(await orgDb.areas.exists(areaId))) {
        return { success: false, error: "Area not found or not accessible", status: 404 };
      }

      // 2. Check if Device exists (using our internal devices.id)
      const [deviceExists] = await tx.select({ id: devices.id }).from(devices).where(eq(devices.id, deviceId)).limit(1);
      if (!deviceExists) {
        return { success: false, error: "Device not found", status: 404 };
      }

      // 3. Check if association already exists
      const [existingAssociation] = await tx.select({ areaId: areaDevices.areaId })
                                          .from(areaDevices)
                                          .where(and(eq(areaDevices.areaId, areaId), eq(areaDevices.deviceId, deviceId)))
                                          .limit(1);
      if (existingAssociation) {
        // Already exists, consider it success (idempotent)
        return { success: true, data: { areaId, deviceId }, status: 200 };
      }

      // 4. Create the association
      await tx.insert(areaDevices).values({ areaId, deviceId });
      
      return { success: true, data: { areaId, deviceId }, status: 201 }; // 201 Created
    });

    // Return response based on transaction outcome
    if (!result.success) {
       return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    }
    return NextResponse.json({ success: true, data: result.data }, { status: result.status });

  } catch (error) {
    console.error(`Error assigning device to area ${areaId}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    // Handle potential unique constraint errors if not checked explicitly
    if (errorMessage.includes('UNIQUE constraint failed')) { // Basic check
        return NextResponse.json({ success: false, error: "Association already exists" }, { status: 409 }); // Conflict
    }
    return NextResponse.json({ success: false, error: `Failed to assign device: ${errorMessage}` }, { status: 500 });
  }
}); 