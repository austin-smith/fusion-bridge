import { NextResponse, NextRequest } from 'next/server';
import { withApiRouteAuth, type ApiRouteAuthContext, type RouteContext } from '@/lib/auth/withApiRouteAuth';
import { db } from '@/data/db';
import { areas, locations } from '@/data/db/schema';
import { eq } from 'drizzle-orm';
import type { Area } from '@/types/index';
import { updateAreaSchema } from '@/lib/schemas/api-schemas';

// Fetch a specific area by ID
export const GET = withApiRouteAuth(async (request: NextRequest, authContext: ApiRouteAuthContext, context: RouteContext<{ id: string }>) => {
  if (!context?.params) {
    return NextResponse.json({ success: false, error: "Missing route parameters" }, { status: 400 });
  }
  
  const { id } = await context.params;

  if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id)) {
    return NextResponse.json({ success: false, error: "Invalid ID format" }, { status: 400 });
  }

  try {
    const [area] = await db.select().from(areas).where(eq(areas.id, id)).limit(1);

    if (!area) {
      return NextResponse.json({ success: false, error: "Area not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: area as Area });

  } catch (error) {
    console.error(`Error fetching area ${id}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: `Failed to fetch area: ${errorMessage}` }, { status: 500 });
  }
});

// Update an area (name, locationId)
export const PUT = withApiRouteAuth(async (request: NextRequest, authContext: ApiRouteAuthContext, context: RouteContext<{ id: string }>) => {
  if (!context?.params) {
    return NextResponse.json({ success: false, error: "Missing route parameters" }, { status: 400 });
  }
  
  const { id } = await context.params;

  if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id)) {
    return NextResponse.json({ success: false, error: "Invalid ID format" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const validation = updateAreaSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ success: false, error: "Invalid input", details: validation.error.flatten() }, { status: 400 });
    }

    const { name, locationId } = validation.data;

    // Check if area exists
    const [currentArea] = await db.select({ id: areas.id }).from(areas).where(eq(areas.id, id)).limit(1);
    if (!currentArea) {
      return NextResponse.json({ success: false, error: "Area not found" }, { status: 404 });
    }

    // Use a more specific type for updates, excluding non-updatable fields
    const updates: Partial<Pick<Area, 'name' | 'locationId'>> & { updatedAt: Date } = { updatedAt: new Date() }; 

    if (name !== undefined) {
      updates.name = name;
    }

    // If locationId is provided in the request, validate it
    if (locationId !== undefined) {
       // Validate the target location exists
        const [targetLocation] = await db.select({ id: locations.id }).from(locations).where(eq(locations.id, locationId)).limit(1);
        if (!targetLocation) {
            return NextResponse.json({ success: false, error: "Target location not found" }, { status: 404 });
        }
        // Assign the non-null, validated ID
        updates.locationId = locationId; 
    }

    // Perform the update if there are changes besides updatedAt
    if (Object.keys(updates).length > 1) {
      const [updatedArea] = await db.update(areas)
        .set(updates)
        .where(eq(areas.id, id))
        .returning();
       return NextResponse.json({ success: true, data: updatedArea as Area });
    } else {
      const [areaData] = await db.select().from(areas).where(eq(areas.id, id)).limit(1);
      return NextResponse.json({ success: true, data: areaData as Area }); 
    }

  } catch (error) {
    console.error(`Error updating area ${id}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: `Failed to update area: ${errorMessage}` }, { status: 500 });
  }
});

// Delete an area (database cascade should handle areaDevices)
export const DELETE = withApiRouteAuth(async (request: NextRequest, authContext: ApiRouteAuthContext, context: RouteContext<{ id: string }>) => {
  if (!context?.params) {
    return NextResponse.json({ success: false, error: "Missing route parameters" }, { status: 400 });
  }
  
  const { id } = await context.params;

  if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id)) {
    return NextResponse.json({ success: false, error: "Invalid ID format" }, { status: 400 });
  }

  try {
    // Optional: Check if area exists first
    const [existing] = await db.select({ id: areas.id }).from(areas).where(eq(areas.id, id)).limit(1);
    if (!existing) {
       return NextResponse.json({ success: true, data: { id } }); // Idempotent success
    }

    // Perform the delete
    await db.delete(areas).where(eq(areas.id, id));

    return NextResponse.json({ success: true, data: { id } });

  } catch (error) {
    console.error(`Error deleting area ${id}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: `Failed to delete area: ${errorMessage}` }, { status: 500 });
  }
}); 