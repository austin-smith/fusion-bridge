import { NextResponse, NextRequest } from 'next/server';
import { withOrganizationAuth, type OrganizationAuthContext } from '@/lib/auth/withOrganizationAuth';
import { createAlarmZonesRepository } from '@/data/repositories/alarm-zones';
import type { RouteContext } from '@/lib/auth/withApiRouteAuth';
import type { AlarmZone } from '@/types';
import { updateAlarmZoneSchema } from '@/lib/schemas/api-schemas';

// Get a specific alarm zone by ID within the active organization
export const GET = withOrganizationAuth(async (request: NextRequest, authContext: OrganizationAuthContext, context: RouteContext<{ id: string }>) => {
  if (!context?.params) {
    return NextResponse.json({ success: false, error: "Missing route parameters" }, { status: 400 });
  }
  
  const { id } = await context.params;

  if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id)) {
    return NextResponse.json({ success: false, error: "Invalid ID format" }, { status: 400 });
  }

  try {
    const alarmZonesRepo = createAlarmZonesRepository(authContext.organizationId);
    const zone = await alarmZonesRepo.findById(id);

    if (!zone) {
      return NextResponse.json({ success: false, error: "Alarm zone not found" }, { status: 404 });
    }

    const responseZone = {
      ...zone,
      triggerBehavior: zone.triggerBehavior as 'standard' | 'custom',
      createdAt: new Date(zone.createdAt).toISOString(),
      updatedAt: new Date(zone.updatedAt).toISOString(),
    };

    return NextResponse.json({ success: true, data: responseZone });

  } catch (error) {
    console.error(`Error fetching alarm zone ${id}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: `Failed to fetch alarm zone: ${errorMessage}` }, { status: 500 });
  }
});

// Update an alarm zone within the active organization
export const PUT = withOrganizationAuth(async (request: NextRequest, authContext: OrganizationAuthContext, context: RouteContext<{ id: string }>) => {
  if (!context?.params) {
    return NextResponse.json({ success: false, error: "Missing route parameters" }, { status: 400 });
  }
  
  const { id } = await context.params;

  if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id)) {
    return NextResponse.json({ success: false, error: "Invalid ID format" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const validation = updateAlarmZoneSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ success: false, error: "Invalid input", details: validation.error.flatten() }, { status: 400 });
    }

    const alarmZonesRepo = createAlarmZonesRepository(authContext.organizationId);
    const updatedZone = await alarmZonesRepo.update(id, validation.data);

    if (!updatedZone) {
      return NextResponse.json({ success: false, error: "Alarm zone not found" }, { status: 404 });
    }

    const responseZone = {
      ...updatedZone,
      triggerBehavior: updatedZone.triggerBehavior as 'standard' | 'custom',
      createdAt: new Date(updatedZone.createdAt).toISOString(),
      updatedAt: new Date(updatedZone.updatedAt).toISOString(),
    };

    return NextResponse.json({ success: true, data: responseZone });

  } catch (error) {
    console.error(`Error updating alarm zone ${id}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    if (errorMessage.includes('not found or not accessible')) {
      return NextResponse.json({ success: false, error: errorMessage }, { status: 404 });
    }
    
    return NextResponse.json({ success: false, error: `Failed to update alarm zone: ${errorMessage}` }, { status: 500 });
  }
});

// Delete an alarm zone within the active organization
export const DELETE = withOrganizationAuth(async (request: NextRequest, authContext: OrganizationAuthContext, context: RouteContext<{ id: string }>) => {
  if (!context?.params) {
    return NextResponse.json({ success: false, error: "Missing route parameters" }, { status: 400 });
  }
  
  const { id } = await context.params;

  if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id)) {
    return NextResponse.json({ success: false, error: "Invalid ID format" }, { status: 400 });
  }

  try {
    const alarmZonesRepo = createAlarmZonesRepository(authContext.organizationId);
    await alarmZonesRepo.delete(id);

    return NextResponse.json({ success: true, data: { id } });

  } catch (error) {
    console.error(`Error deleting alarm zone ${id}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: `Failed to delete alarm zone: ${errorMessage}` }, { status: 500 });
  }
}); 