import { NextResponse } from 'next/server';
import { withApiRouteAuth } from '@/lib/auth/withApiRouteAuth';
import { db } from '@/data/db';
import { locations } from '@/data/db/schema';
import { eq } from 'drizzle-orm';
import type { Location } from '@/types/index';
import { createLocationSchema } from '@/lib/schemas/api-schemas';

// Fetch all locations
export const GET = withApiRouteAuth(async (request, authContext) => {
  try {
    const allLocations: Location[] = await db.select().from(locations).orderBy(locations.path); // Order by path

    // TODO: Potentially reconstruct hierarchy here if needed, or leave for client

    return NextResponse.json({ success: true, data: allLocations });

  } catch (error) {
    console.error("Error fetching locations:", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: `Failed to fetch locations: ${errorMessage}` }, { status: 500 });
  }
});

// Create a new location
export const POST = withApiRouteAuth(async (request, authContext) => {
  try {
    const body = await request.json();
    const validation = createLocationSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ success: false, error: "Invalid input", details: validation.error.flatten() }, { status: 400 });
    }

    const { name, parentId, timeZone, externalId, addressStreet, addressCity, addressState, addressPostalCode, notes } = validation.data;
    let path = crypto.randomUUID(); // Default path for root locations

    if (parentId) {
      // Fetch parent to construct the path
      const parent = await db.select({ path: locations.path }).from(locations).where(eq(locations.id, parentId)).limit(1);
      if (!parent || parent.length === 0) {
        return NextResponse.json({ success: false, error: "Parent location not found" }, { status: 404 });
      }
      const newId = crypto.randomUUID();
      path = `${parent[0].path}.${newId}`;
    }

    // Insert the new location
    const [newLocation] = await db.insert(locations).values({
      name,
      parentId: parentId || null,
      path,
      timeZone,
      externalId: externalId || null,
      addressStreet,
      addressCity,
      addressState,
      addressPostalCode,
      notes: notes || null,
      // createdAt and updatedAt have default values in schema
    }).returning(); // Return the created object

    return NextResponse.json({ success: true, data: newLocation as Location });

  } catch (error) {
    console.error("Error creating location:", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    // Check for specific DB errors if needed (e.g., unique constraint)
    return NextResponse.json({ success: false, error: `Failed to create location: ${errorMessage}` }, { status: 500 });
  }
}); 