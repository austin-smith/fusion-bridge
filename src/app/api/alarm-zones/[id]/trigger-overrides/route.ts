import { NextResponse, NextRequest } from 'next/server';
import { withOrganizationAuth, type OrganizationAuthContext } from '@/lib/auth/withOrganizationAuth';
import { createAlarmZonesRepository } from '@/data/repositories/alarm-zones';
import type { RouteContext } from '@/lib/auth/withApiRouteAuth';
import { addTriggerOverrideSchema, removeTriggerOverrideSchema } from '@/lib/schemas/api-schemas';

// Get trigger overrides for an alarm zone
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
    const overrides = await alarmZonesRepo.getTriggerOverrides(id);

    const overridesWithTimestamps = overrides.map(override => ({
      ...override,
      createdAt: new Date(override.createdAt).toISOString(),
    }));

    return NextResponse.json({ success: true, data: overridesWithTimestamps });

  } catch (error) {
    console.error(`Error fetching trigger overrides for alarm zone ${id}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    if (errorMessage.includes('not found or not accessible')) {
      return NextResponse.json({ success: false, error: errorMessage }, { status: 404 });
    }
    
    return NextResponse.json({ success: false, error: `Failed to fetch trigger overrides: ${errorMessage}` }, { status: 500 });
  }
});

// Add or update a trigger override for an alarm zone
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
    const validation = addTriggerOverrideSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ success: false, error: "Invalid input", details: validation.error.flatten() }, { status: 400 });
    }

    const { eventType, shouldTrigger } = validation.data;
    const alarmZonesRepo = createAlarmZonesRepository(authContext.organizationId);

    const override = await alarmZonesRepo.addTriggerOverride(id, eventType, shouldTrigger);

    const responseOverride = {
      ...override,
      createdAt: new Date(override.createdAt).toISOString(),
    };

    return NextResponse.json({ success: true, data: responseOverride });

  } catch (error) {
    console.error(`Error adding trigger override for alarm zone ${id}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    if (errorMessage.includes('not found or not accessible')) {
      return NextResponse.json({ success: false, error: errorMessage }, { status: 404 });
    }
    
    return NextResponse.json({ success: false, error: `Failed to add trigger override: ${errorMessage}` }, { status: 500 });
  }
});

// Remove a trigger override from an alarm zone
export const DELETE = withOrganizationAuth(async (request: NextRequest, authContext: OrganizationAuthContext, context: RouteContext<{ id: string }>) => {
  if (!context?.params) {
    return NextResponse.json({ success: false, error: "Missing route parameters" }, { status: 400 });
  }
  
  const { id } = await context.params;

  if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id)) {
    return NextResponse.json({ success: false, error: "Invalid ID format" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const validation = removeTriggerOverrideSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ success: false, error: "Invalid input", details: validation.error.flatten() }, { status: 400 });
    }

    const { eventType } = validation.data;
    const alarmZonesRepo = createAlarmZonesRepository(authContext.organizationId);

    await alarmZonesRepo.removeTriggerOverride(id, eventType);

    return NextResponse.json({ success: true, data: { zoneId: id, eventType } });

  } catch (error) {
    console.error(`Error removing trigger override for alarm zone ${id}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    if (errorMessage.includes('not found or not accessible')) {
      return NextResponse.json({ success: false, error: errorMessage }, { status: 404 });
    }
    
    return NextResponse.json({ success: false, error: `Failed to remove trigger override: ${errorMessage}` }, { status: 500 });
  }
}); 