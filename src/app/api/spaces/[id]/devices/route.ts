import { NextResponse, NextRequest } from 'next/server';
import { withOrganizationAuth, type OrganizationAuthContext } from '@/lib/auth/withOrganizationAuth';
import { createSpacesRepository } from '@/data/repositories/spaces';
import type { RouteContext } from '@/lib/auth/withApiRouteAuth';
import { assignDeviceToSpaceSchema } from '@/lib/schemas/api-schemas';

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

// Assign a device to a space (enforces one device per space)
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
    const validation = assignDeviceToSpaceSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ success: false, error: "Invalid input", details: validation.error.flatten() }, { status: 400 });
    }

    const { deviceId } = validation.data;
    const spacesRepo = createSpacesRepository(authContext.organizationId);

    const assignment = await spacesRepo.assignDevice(deviceId, id);

    const responseAssignment = {
      ...assignment,
      createdAt: new Date(assignment.createdAt).toISOString(),
    };

    return NextResponse.json({ success: true, data: responseAssignment });

  } catch (error) {
    console.error(`Error assigning device to space ${id}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    if (errorMessage.includes('not found or not accessible')) {
      return NextResponse.json({ success: false, error: errorMessage }, { status: 404 });
    }
    
    return NextResponse.json({ success: false, error: `Failed to assign device to space: ${errorMessage}` }, { status: 500 });
  }
});

// Remove a device from a space
export const DELETE = withOrganizationAuth(async (request: NextRequest, authContext: OrganizationAuthContext, context: RouteContext<{ id: string }>) => {
  if (!context?.params) {
    return NextResponse.json({ success: false, error: "Missing route parameters" }, { status: 400 });
  }
  
  const { id } = await context.params;
  const { searchParams } = new URL(request.url);
  const deviceId = searchParams.get('deviceId');

  if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id)) {
    return NextResponse.json({ success: false, error: "Invalid space ID format" }, { status: 400 });
  }

  if (!deviceId || !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(deviceId)) {
    return NextResponse.json({ success: false, error: "Invalid or missing deviceId parameter" }, { status: 400 });
  }

  try {
    const spacesRepo = createSpacesRepository(authContext.organizationId);
    await spacesRepo.removeDevice(deviceId);

    return NextResponse.json({ success: true, data: { deviceId, spaceId: id } });

  } catch (error) {
    console.error(`Error removing device ${deviceId} from space ${id}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    if (errorMessage.includes('not found or not accessible')) {
      return NextResponse.json({ success: false, error: errorMessage }, { status: 404 });
    }
    
    return NextResponse.json({ success: false, error: `Failed to remove device from space: ${errorMessage}` }, { status: 500 });
  }
}); 