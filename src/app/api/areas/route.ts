import { NextResponse } from 'next/server';
import { db } from '@/data/db';
import { areas, locations } from '@/data/db/schema';
import type { Area } from '@/types/index';
import { z } from 'zod';
import { eq } from 'drizzle-orm';

// --- Validation Schema ---
const createAreaSchema = z.object({
  name: z.string().min(1, "Name cannot be empty"),
  locationId: z.string().uuid("Invalid location ID format"),
});

// Fetch areas, optionally filtering by locationId
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const locationId = searchParams.get('locationId');

  try {
    let query = db.select().from(areas).$dynamic();

    if (locationId) {
      if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(locationId)) {
         query = query.where(eq(areas.locationId, locationId));
      } else {
         return NextResponse.json({ success: false, error: "Invalid locationId format" }, { status: 400 });
      }
    } 

    const allAreas: Area[] = await query.orderBy(areas.name);
    return NextResponse.json({ success: true, data: allAreas });

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

    // Validate that the locationId exists
    const [parentLocation] = await db.select({ id: locations.id }).from(locations).where(eq(locations.id, locationId)).limit(1);
    if (!parentLocation) {
        return NextResponse.json({ success: false, error: "Specified location not found" }, { status: 404 });
    }
    
    // Insert the new area
    const [newArea] = await db.insert(areas).values({
      name,
      locationId,
      // armedState defaults to 'DISARMED' in schema
      // createdAt and updatedAt have default values
    }).returning();

    return NextResponse.json({ success: true, data: newArea as Area });

  } catch (error) {
    console.error("Error creating area:", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: `Failed to create area: ${errorMessage}` }, { status: 500 });
  }
} 