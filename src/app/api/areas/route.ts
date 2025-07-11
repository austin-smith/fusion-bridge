import { NextResponse } from 'next/server';
import { withOrganizationAuth, type OrganizationAuthContext } from '@/lib/auth/withOrganizationAuth';
import { createOrgScopedDb } from '@/lib/db/org-scoped-db';
import { db } from '@/data/db';
import { areaDevices } from '@/data/db/schema';
import type { Area as ApiAreaResponse } from '@/types/index';
import { createAreaSchema } from '@/lib/schemas/api-schemas';
import { inArray } from 'drizzle-orm';

// Define an extended Area type for the API response to include locationName and new fields
interface AreaWithDetails extends Omit<ApiAreaResponse, 'createdAt' | 'updatedAt'> {
  locationName: string;
  nextScheduledArmTime?: string | null;
  nextScheduledDisarmTime?: string | null;
  lastArmedStateChangeReason?: string | null;
  isArmingSkippedUntil?: string | null;
  createdAt: string;
  updatedAt: string;
}

// Fetch areas for the active organization, optionally filtering by locationId
export const GET = withOrganizationAuth(async (request, authContext: OrganizationAuthContext) => {
  const { searchParams } = new URL(request.url);
  const locationId = searchParams.get('locationId');

  try {
    const orgDb = createOrgScopedDb(authContext.organizationId);
    
    let areasResult;
    if (locationId) {
      if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(locationId)) {
        return NextResponse.json({ success: false, error: "Invalid locationId format" }, { status: 400 });
      }
      areasResult = await orgDb.areas.findByLocation(locationId);
    } else {
      areasResult = await orgDb.areas.findAll();
    }

    const areasWithDetails: AreaWithDetails[] = areasResult.map(areaRow => {
      // OrgScopedDb spreads area columns directly, location is nested
      return {
        id: areaRow.id,
        name: areaRow.name,
        locationId: areaRow.locationId,
        armedState: areaRow.armedState,
        locationName: areaRow.location.name,
        nextScheduledArmTime: areaRow.nextScheduledArmTime ? new Date(areaRow.nextScheduledArmTime).toISOString() : null,
        nextScheduledDisarmTime: areaRow.nextScheduledDisarmTime ? new Date(areaRow.nextScheduledDisarmTime).toISOString() : null,
        lastArmedStateChangeReason: areaRow.lastArmedStateChangeReason || null,
        isArmingSkippedUntil: areaRow.isArmingSkippedUntil ? new Date(areaRow.isArmingSkippedUntil).toISOString() : null,
        createdAt: new Date(areaRow.createdAt).toISOString(),
        updatedAt: new Date(areaRow.updatedAt).toISOString(),
        deviceIds: []
      };
    });

    // Fetch device assignments for all areas
    if (areasWithDetails.length > 0) {
      const areaIds = areasWithDetails.map(a => a.id);
      const deviceAssignments = await db
        .select({
          areaId: areaDevices.areaId,
          deviceId: areaDevices.deviceId,
        })
        .from(areaDevices)
        .where(inArray(areaDevices.areaId, areaIds));

      const devicesByArea = deviceAssignments.reduce<Record<string, string[]>>((acc, assignment) => {
        if (!acc[assignment.areaId]) {
          acc[assignment.areaId] = [];
        }
        acc[assignment.areaId].push(assignment.deviceId);
        return acc;
      }, {});

      areasWithDetails.forEach(area => {
        area.deviceIds = devicesByArea[area.id] || [];
      });
    }

    return NextResponse.json({ success: true, data: areasWithDetails });

  } catch (error) {
    console.error("Error fetching areas:", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: `Failed to fetch areas: ${errorMessage}` }, { status: 500 });
  }
});

// Create a new area in the active organization
export const POST = withOrganizationAuth(async (request, authContext: OrganizationAuthContext) => {
  try {
    const body = await request.json();
    const validation = createAreaSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ success: false, error: "Invalid input", details: validation.error.flatten() }, { status: 400 });
    }

    const { name, locationId } = validation.data;
    const orgDb = createOrgScopedDb(authContext.organizationId);

    // Verify location belongs to organization and get its name
    const locationResult = await orgDb.locations.findById(locationId);
    if (locationResult.length === 0) {
      return NextResponse.json({ success: false, error: "Specified location not found or not accessible" }, { status: 404 });
    }
    const parentLocation = locationResult[0];
    
    const [newAreaFromDb] = await orgDb.areas.create({
      name,
      locationId,
    });
    
    const responseArea: AreaWithDetails = {
      id: newAreaFromDb.id,
      name: newAreaFromDb.name,
      locationId: newAreaFromDb.locationId,
      armedState: newAreaFromDb.armedState,
      locationName: parentLocation.name,
      deviceIds: [], 
      nextScheduledArmTime: newAreaFromDb.nextScheduledArmTime ? new Date(newAreaFromDb.nextScheduledArmTime).toISOString() : null,
      nextScheduledDisarmTime: newAreaFromDb.nextScheduledDisarmTime ? new Date(newAreaFromDb.nextScheduledDisarmTime).toISOString() : null,
      lastArmedStateChangeReason: newAreaFromDb.lastArmedStateChangeReason || null,
      isArmingSkippedUntil: newAreaFromDb.isArmingSkippedUntil ? new Date(newAreaFromDb.isArmingSkippedUntil).toISOString() : null,
      createdAt: new Date(newAreaFromDb.createdAt).toISOString(),
      updatedAt: new Date(newAreaFromDb.updatedAt).toISOString(),
    };

    return NextResponse.json({ success: true, data: responseArea });

  } catch (error) {
    console.error("Error creating area:", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: `Failed to create area: ${errorMessage}` }, { status: 500 });
  }
}); 