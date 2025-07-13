import { NextResponse } from 'next/server';
import { withOrganizationAuth, type OrganizationAuthContext } from '@/lib/auth/withOrganizationAuth';
import { createAlarmZonesRepository } from '@/data/repositories/alarm-zones';
import { createAlarmZoneSchema } from '@/lib/schemas/api-schemas';
import type { AlarmZone } from '@/types';

// Define extended AlarmZone type for API response
interface AlarmZoneWithDetails extends Omit<AlarmZone, 'createdAt' | 'updatedAt'> {
  locationName: string;
  deviceIds: string[]; // Explicitly include deviceIds
  createdAt: string;
  updatedAt: string;
}

// Get all alarm zones for the active organization
export const GET = withOrganizationAuth(async (request, authContext: OrganizationAuthContext) => {
  const { searchParams } = new URL(request.url);
  const locationId = searchParams.get('locationId');

  try {
    const alarmZonesRepo = createAlarmZonesRepository(authContext.organizationId);
    
    let zonesResult;
    if (locationId) {
      if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(locationId)) {
        return NextResponse.json({ success: false, error: "Invalid locationId format" }, { status: 400 });
      }
      zonesResult = await alarmZonesRepo.findByLocationWithDevices(locationId);
    } else {
      zonesResult = await alarmZonesRepo.findAllWithDevices();
    }

    const zonesWithDetails: AlarmZoneWithDetails[] = zonesResult.map(zoneRow => ({
      id: zoneRow.id,
      name: zoneRow.name,
      locationId: zoneRow.locationId,
      description: zoneRow.description,
      armedState: zoneRow.armedState,
      lastArmedStateChangeReason: zoneRow.lastArmedStateChangeReason,
      triggerBehavior: zoneRow.triggerBehavior as 'standard' | 'custom',
      locationName: zoneRow.location.name,
      createdAt: new Date(zoneRow.createdAt).toISOString(),
      updatedAt: new Date(zoneRow.updatedAt).toISOString(),
      deviceIds: zoneRow.deviceIds || [], // Now properly populated from repository
      devices: undefined,
      location: undefined,
      triggerOverrides: undefined,
    }));

    return NextResponse.json({ success: true, data: zonesWithDetails });

  } catch (error) {
    console.error("Error fetching alarm zones:", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: `Failed to fetch alarm zones: ${errorMessage}` }, { status: 500 });
  }
});

// Create an alarm zone in the active organization
export const POST = withOrganizationAuth(async (request, authContext: OrganizationAuthContext) => {
  try {
    const body = await request.json();
    const validation = createAlarmZoneSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ success: false, error: "Invalid input", details: validation.error.flatten() }, { status: 400 });
    }

    const { name, locationId, description, triggerBehavior } = validation.data;
    const alarmZonesRepo = createAlarmZonesRepository(authContext.organizationId);

    const newZone = await alarmZonesRepo.create({
      name,
      locationId,
      description,
      triggerBehavior,
    });
    
    const responseZone: AlarmZoneWithDetails = {
      id: newZone.id,
      name: newZone.name,
      locationId: newZone.locationId,
      description: newZone.description,
      armedState: newZone.armedState,
      lastArmedStateChangeReason: newZone.lastArmedStateChangeReason,
      triggerBehavior: newZone.triggerBehavior as 'standard' | 'custom',
      locationName: newZone.location.name,
      deviceIds: [], // Empty for newly created zones
      createdAt: new Date(newZone.createdAt).toISOString(),
      updatedAt: new Date(newZone.updatedAt).toISOString(),
    };

    return NextResponse.json({ success: true, data: responseZone });

  } catch (error) {
    console.error("Error creating alarm zone:", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    if (errorMessage.includes('not found or not accessible')) {
      return NextResponse.json({ success: false, error: errorMessage }, { status: 404 });
    }
    
    return NextResponse.json({ success: false, error: `Failed to create alarm zone: ${errorMessage}` }, { status: 500 });
  }
}); 