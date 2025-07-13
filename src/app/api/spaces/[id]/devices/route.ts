import { NextResponse, NextRequest } from 'next/server';
import { withOrganizationAuth, type OrganizationAuthContext } from '@/lib/auth/withOrganizationAuth';
import { createSpacesRepository } from '@/data/repositories/spaces';
import type { RouteContext } from '@/lib/auth/withApiRouteAuth';
import { assignDevicesToSpaceSchema, removeDevicesFromSpaceSchema } from '@/lib/schemas/api-schemas';

// Get devices in a space
export const GET = withOrganizationAuth(async (request: NextRequest, authContext: OrganizationAuthContext, context: RouteContext<{ id: string }>) => {
  if (!context?.params) {
    return NextResponse.json({ success: false, error: "Missing route parameters" }, { status: 400 });
  }
  
  const { id } = await context.params;

  if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id)) {
    return NextResponse.json({ success: false, error: "Invalid ID format" }, { status: 400 });
  }

  try {
    const spacesRepo = createSpacesRepository(authContext.organizationId);
    const devices = await spacesRepo.getSpaceDevices(id);

    const devicesWithTimestamps = devices.map(device => ({
      ...device,
      createdAt: new Date(device.createdAt).toISOString(),
      updatedAt: new Date(device.updatedAt).toISOString(),
    }));

    return NextResponse.json({ success: true, data: devicesWithTimestamps });

  } catch (error) {
    console.error(`Error fetching devices for space ${id}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    if (errorMessage.includes('not found or not accessible')) {
      return NextResponse.json({ success: false, error: errorMessage }, { status: 404 });
    }
    
    return NextResponse.json({ success: false, error: `Failed to fetch space devices: ${errorMessage}` }, { status: 500 });
  }
});

// Assign devices to a space (bulk assignment only)
export const POST = withOrganizationAuth(async (request: NextRequest, authContext: OrganizationAuthContext, context: RouteContext<{ id: string }>) => {
  if (!context?.params) {
    return NextResponse.json({ success: false, error: "Missing route parameters" }, { status: 400 });
  }
  
  const { id } = await context.params;

  if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id)) {
    return NextResponse.json({ success: false, error: "Invalid ID format" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const validation = assignDevicesToSpaceSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ success: false, error: "Invalid input", details: validation.error.flatten() }, { status: 400 });
    }

    const { deviceIds } = validation.data;
    const spacesRepo = createSpacesRepository(authContext.organizationId);
    const assignments = [];

    // Assign each device to the space
    for (const deviceId of deviceIds) {
      const assignment = await spacesRepo.assignDevice(deviceId, id);
      assignments.push({
        ...assignment,
        createdAt: new Date(assignment.createdAt).toISOString(),
      });
    }

    return NextResponse.json({ success: true, data: { spaceId: id, deviceIds, assignments } });

  } catch (error) {
    console.error(`Error assigning devices to space ${id}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    if (errorMessage.includes('not found or not accessible')) {
      return NextResponse.json({ success: false, error: errorMessage }, { status: 404 });
    }
    
    return NextResponse.json({ success: false, error: `Failed to assign devices to space: ${errorMessage}` }, { status: 500 });
  }
});

// Remove devices from a space (bulk removal only)
export const DELETE = withOrganizationAuth(async (request: NextRequest, authContext: OrganizationAuthContext, context: RouteContext<{ id: string }>) => {
  if (!context?.params) {
    return NextResponse.json({ success: false, error: "Missing route parameters" }, { status: 400 });
  }
  
  const { id } = await context.params;

  if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id)) {
    return NextResponse.json({ success: false, error: "Invalid space ID format" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const validation = removeDevicesFromSpaceSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ success: false, error: "Invalid input", details: validation.error.flatten() }, { status: 400 });
    }

    const { deviceIds } = validation.data;
    const spacesRepo = createSpacesRepository(authContext.organizationId);
    
    // Remove each device from any space (spaces enforce one device per space)
    for (const deviceId of deviceIds) {
      await spacesRepo.removeDevice(deviceId);
    }

    return NextResponse.json({ success: true, data: { spaceId: id, deviceIds } });

  } catch (error) {
    console.error(`Error removing devices from space ${id}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    if (errorMessage.includes('not found or not accessible')) {
      return NextResponse.json({ success: false, error: errorMessage }, { status: 404 });
    }
    
    return NextResponse.json({ success: false, error: `Failed to remove devices from space: ${errorMessage}` }, { status: 500 });
  }
}); 