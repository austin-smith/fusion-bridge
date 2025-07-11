import { NextResponse, NextRequest } from 'next/server';
import { withOrganizationAuth, type OrganizationAuthContext } from '@/lib/auth/withOrganizationAuth';
import { createAlarmZonesRepository } from '@/data/repositories/alarm-zones';
import type { RouteContext } from '@/lib/auth/withApiRouteAuth';
import { setZoneArmedStateSchema } from '@/lib/schemas/api-schemas';

// Set armed state for an alarm zone (with audit logging)
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
    const validation = setZoneArmedStateSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ success: false, error: "Invalid input", details: validation.error.flatten() }, { status: 400 });
    }

    const { armedState, reason, metadata } = validation.data;
    const alarmZonesRepo = createAlarmZonesRepository(authContext.organizationId);

    // Set armed state with audit logging
    const updatedZone = await alarmZonesRepo.setArmedState(
      id,
      armedState,
      authContext.userId,
      reason,
      metadata
    );

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
    console.error(`Error setting armed state for alarm zone ${id}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    if (errorMessage.includes('not found or not accessible')) {
      return NextResponse.json({ success: false, error: errorMessage }, { status: 404 });
    }
    
    return NextResponse.json({ success: false, error: `Failed to set alarm zone armed state: ${errorMessage}` }, { status: 500 });
  }
}); 