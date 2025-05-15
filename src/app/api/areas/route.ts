import { NextResponse } from 'next/server';
import { db } from '@/data/db';
import { areas, locations, areaDevices } from '@/data/db/schema';
import type { Area as ApiAreaResponse } from '@/types/index';
import { z } from 'zod';
import { eq, inArray, asc } from 'drizzle-orm';

// --- Validation Schema ---
const createAreaSchema = z.object({
  name: z.string().min(1, "Name cannot be empty"),
  locationId: z.string().uuid("Invalid location ID format"),
});

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

// Fetch areas, optionally filtering by locationId
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const locationId = searchParams.get('locationId');

  try {
    let queryBuilder = db
      .select({
        id: areas.id,
        name: areas.name,
        locationId: areas.locationId,
        armedState: areas.armedState,
        nextScheduledArmTime: areas.nextScheduledArmTime,
        nextScheduledDisarmTime: areas.nextScheduledDisarmTime,
        lastArmedStateChangeReason: areas.lastArmedStateChangeReason,
        isArmingSkippedUntil: areas.isArmingSkippedUntil,
        createdAt: areas.createdAt,
        updatedAt: areas.updatedAt,
        locationName: locations.name, 
      })
      .from(areas)
      .innerJoin(locations, eq(areas.locationId, locations.id));

    if (locationId) {
      if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(locationId)) {
        queryBuilder = queryBuilder.where(eq(areas.locationId, locationId)) as any; 
      } else {
         return NextResponse.json({ success: false, error: "Invalid locationId format" }, { status: 400 });
      }
    } 

    const allAreasResult = await queryBuilder.orderBy(asc(areas.name));

    const areasWithDetails: AreaWithDetails[] = allAreasResult.map(area => ({
        ...area,
        nextScheduledArmTime: area.nextScheduledArmTime ? new Date(area.nextScheduledArmTime).toISOString() : null,
        nextScheduledDisarmTime: area.nextScheduledDisarmTime ? new Date(area.nextScheduledDisarmTime).toISOString() : null,
        isArmingSkippedUntil: area.isArmingSkippedUntil ? new Date(area.isArmingSkippedUntil).toISOString() : null,
        createdAt: new Date(area.createdAt).toISOString(),
        updatedAt: new Date(area.updatedAt).toISOString(),
        deviceIds: [] 
    }));

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
}

// Create a new area
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validation = createAreaSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ success: false, error: "Invalid input", details: validation.error.flatten() }, { status: 400 });
    }

    const { name, locationId } = validation.data;

    const parentLocation = await db.query.locations.findFirst({where: eq(locations.id, locationId), columns: {id: true, name: true}});
    if (!parentLocation) {
        return NextResponse.json({ success: false, error: "Specified location not found" }, { status: 404 });
    }
    
    const [newAreaFromDb] = await db.insert(areas).values({
      name,
      locationId,
    }).returning(); 
    
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
} 