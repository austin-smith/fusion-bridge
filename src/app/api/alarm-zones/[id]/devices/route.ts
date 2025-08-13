import { NextResponse, NextRequest } from 'next/server';
import { withOrganizationAuth, type OrganizationAuthContext } from '@/lib/auth/withOrganizationAuth';
import { createAlarmZonesRepository } from '@/data/repositories/alarm-zones';
import type { RouteContext } from '@/lib/auth/withApiRouteAuth';
import { assignDevicesToZoneSchema, removeDevicesFromZoneSchema } from '@/lib/schemas/api-schemas';
import { SUPPORTED_ALARM_DEVICE_TYPES } from '@/lib/mappings/definitions';
import type { DeviceType } from '@/lib/mappings/definitions';

// Get devices in an alarm zone
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
    const devices = await alarmZonesRepo.getZoneDevices(id);

    const devicesWithTimestamps = devices.map(device => ({
      ...device,
      createdAt: new Date(device.createdAt).toISOString(),
      updatedAt: new Date(device.updatedAt).toISOString(),
    }));

    return NextResponse.json({ success: true, data: devicesWithTimestamps });

  } catch (error) {
    console.error(`Error fetching devices for alarm zone ${id}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    if (errorMessage.includes('not found or not accessible')) {
      return NextResponse.json({ success: false, error: errorMessage }, { status: 404 });
    }
    
    return NextResponse.json({ success: false, error: `Failed to fetch alarm zone devices: ${errorMessage}` }, { status: 500 });
  }
});

// Assign devices to an alarm zone (bulk assignment)
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
    const validation = assignDevicesToZoneSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ success: false, error: "Invalid input", details: validation.error.flatten() }, { status: 400 });
    }

    const { deviceIds } = validation.data;
    const alarmZonesRepo = createAlarmZonesRepository(authContext.organizationId);

    // Validate device types before assignment
    const devicesInfo = await alarmZonesRepo.getDevicesInfo(deviceIds);
    
    if (devicesInfo.length !== deviceIds.length) {
      const foundDeviceIds = devicesInfo.map(d => d.id);
      const missingDeviceIds = deviceIds.filter((deviceId: string) => !foundDeviceIds.includes(deviceId));
      return NextResponse.json({ 
        success: false, 
        error: `One or more devices not found or not accessible: ${missingDeviceIds.join(', ')}` 
      }, { status: 404 });
    }

    // Check that all devices have supported device types
    const unsupportedDevices = devicesInfo.filter(device => {
      const deviceType = device.standardizedDeviceType as DeviceType;
      return !deviceType || !SUPPORTED_ALARM_DEVICE_TYPES.includes(deviceType);
    });

    if (unsupportedDevices.length > 0) {
      const unsupportedDeviceNames = unsupportedDevices.map(d => `${d.name} (${d.standardizedDeviceType || 'Unknown'})`);
      return NextResponse.json({ 
        success: false, 
        error: `The following devices are not supported for alarm zones: ${unsupportedDeviceNames.join(', ')}. Supported types: ${SUPPORTED_ALARM_DEVICE_TYPES.join(', ')}` 
      }, { status: 400 });
    }

    const assignments = await alarmZonesRepo.assignDevices(id, deviceIds);

    const responseAssignments = assignments.map(assignment => ({
      ...assignment,
      createdAt: new Date(assignment.createdAt).toISOString(),
    }));

    return NextResponse.json({ success: true, data: responseAssignments });

  } catch (error) {
    console.error(`Error assigning devices to alarm zone ${id}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    if (errorMessage.includes('not found or not accessible')) {
      return NextResponse.json({ success: false, error: errorMessage }, { status: 404 });
    }
    
    return NextResponse.json({ success: false, error: `Failed to assign devices to alarm zone: ${errorMessage}` }, { status: 500 });
  }
});

// Remove devices from an alarm zone (bulk removal)
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
    const validation = removeDevicesFromZoneSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ success: false, error: "Invalid input", details: validation.error.flatten() }, { status: 400 });
    }

    const { deviceIds } = validation.data;
    const alarmZonesRepo = createAlarmZonesRepository(authContext.organizationId);

    await alarmZonesRepo.removeDevices(id, deviceIds);

    return NextResponse.json({ success: true, data: { zoneId: id, deviceIds } });

  } catch (error) {
    console.error(`Error removing devices from alarm zone ${id}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    if (errorMessage.includes('not found or not accessible')) {
      return NextResponse.json({ success: false, error: errorMessage }, { status: 404 });
    }
    
    return NextResponse.json({ success: false, error: `Failed to remove devices from alarm zone: ${errorMessage}` }, { status: 500 });
  }
}); 