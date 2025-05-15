import { NextResponse } from 'next/server';
import { db } from '@/data/db';
import { locations } from '@/data/db/schema';
import { eq, like, sql } from 'drizzle-orm';
import type { Location } from '@/types/index';
import { z } from 'zod';

// Remove unused RouteParams interface
// interface RouteParams {
//  params: {
//    id: string;
//  };
// }

// --- Validation Schema for Update ---
const updateLocationSchema = z.object({
  name: z.string().min(1, "Name cannot be empty").optional(),
  parentId: z.string().uuid("Invalid parent ID format").nullable().optional(),
  timeZone: z.string().min(1, "Timezone cannot be empty").optional(),
  externalId: z.string().nullable().optional(),
  addressStreet: z.string().min(1, "Street address cannot be empty").optional(),
  addressCity: z.string().min(1, "City cannot be empty").optional(),
  addressState: z.string().min(1, "State cannot be empty").optional(),
  addressPostalCode: z.string().min(1, "Postal code cannot be empty").optional(),
  notes: z.string().nullable().optional(),
});

// Fetch a specific location by ID - Correct Next.js 15 signature
export async function GET(
  request: Request, 
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params; // Await params

  // Basic UUID validation (optional but recommended)
  if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id)) {
    return NextResponse.json({ success: false, error: "Invalid ID format" }, { status: 400 });
  }

  try {
    const [location] = await db.select().from(locations).where(eq(locations.id, id)).limit(1);

    if (!location) {
      return NextResponse.json({ success: false, error: "Location not found" }, { status: 404 });
    }

    // TODO: Optionally fetch children or related areas here if needed

    return NextResponse.json({ success: true, data: location as Location });

  } catch (error) {
    console.error(`Error fetching location ${id}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: `Failed to fetch location: ${errorMessage}` }, { status: 500 });
  }
}

// Update an existing location
export async function PUT(
  request: Request, 
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: locationId } = await params;
    if (!locationId) {
      return NextResponse.json({ success: false, error: "Location ID is required" }, { status: 400 });
    }

    const body = await request.json();
    const validation = updateLocationSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ success: false, error: "Invalid input", details: validation.error.flatten() }, { status: 400 });
    }

    const currentValues = await db.select().from(locations).where(eq(locations.id, locationId)).limit(1);
    if (currentValues.length === 0) {
      return NextResponse.json({ success: false, error: "Location not found" }, { status: 404 });
    }

    const dataToUpdate = validation.data;
    let newPath = currentValues[0].path;

    // If parentId is explicitly being changed (even to null)
    if (dataToUpdate.parentId !== undefined) {
      if (dataToUpdate.parentId === null) { // Moving to root
        newPath = locationId;
      } else { // Moving under a new parent
        const parent = await db.select({ path: locations.path }).from(locations).where(eq(locations.id, dataToUpdate.parentId)).limit(1);
        if (!parent || parent.length === 0) {
          return NextResponse.json({ success: false, error: "New parent location not found" }, { status: 404 });
        }
        // Prevent self-parenting or circular dependencies (simple check)
        if (dataToUpdate.parentId === locationId || parent[0].path.startsWith(currentValues[0].path)) {
             return NextResponse.json({ success: false, error: "Invalid parent ID assignment creating a circular dependency." }, { status: 400 });
        }
        newPath = `${parent[0].path}.${locationId}`;
      }
      // Note: This doesn't recursively update paths of children. That's a more complex operation.
    }
    
    const updatePayload: Partial<Omit<Location, 'id' | 'createdAt' | 'updatedAt' | 'path'>> & { path?: string } = {};

    // Dynamically build the update payload to only include provided fields
    for (const key in dataToUpdate) {
        if (Object.prototype.hasOwnProperty.call(dataToUpdate, key)) {
            const typedKey = key as keyof typeof dataToUpdate;
            if (dataToUpdate[typedKey] !== undefined) {
                (updatePayload as any)[typedKey] = dataToUpdate[typedKey];
            }
        }
    }
    
    if (newPath !== currentValues[0].path) {
        updatePayload.path = newPath;
    }
    
    // Add updatedAt timestamp
    (updatePayload as any).updatedAt = new Date();


    if (Object.keys(updatePayload).length === 0 || (Object.keys(updatePayload).length === 1 && 'updatedAt' in updatePayload && newPath === currentValues[0].path)) {
      // No actual data changed other than updatedAt and path not changing
      return NextResponse.json({ success: true, data: currentValues[0] as Location, message: "No changes detected." });
    }
    
    const [updatedLocation] = await db.update(locations)
      .set(updatePayload)
      .where(eq(locations.id, locationId))
      .returning();

    if (!updatedLocation) {
      return NextResponse.json({ success: false, error: "Failed to update location or location not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: updatedLocation as Location });

  } catch (error) {
    console.error("Error updating location:", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: `Failed to update location: ${errorMessage}` }, { status: 500 });
  }
}

// Delete a location (database cascade should handle descendants) - Correct Next.js 15 signature
export async function DELETE(
  request: Request, 
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params; // Await params

  if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id)) {
    return NextResponse.json({ success: false, error: "Invalid ID format" }, { status: 400 });
  }

  try {
    // Check if location exists before attempting delete (optional, delete is idempotent)
    const [existing] = await db.select({ id: locations.id }).from(locations).where(eq(locations.id, id)).limit(1);
    if (!existing) {
       // You could return 404, but DELETE is often idempotent, so 200/204 is also fine
       // return NextResponse.json({ success: false, error: "Location not found" }, { status: 404 });
       return NextResponse.json({ success: true, data: { id } }); // Indicate success even if not found
    }
    
    // Perform the delete operation
    await db.delete(locations).where(eq(locations.id, id));

    // No body needed for successful DELETE, status 204 is conventional
    // However, returning a success body is also acceptable
    return NextResponse.json({ success: true, data: { id } });

  } catch (error) {
    console.error(`Error deleting location ${id}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    // Consider specific error handling (e.g., foreign key constraints if cascade wasn't perfect)
    return NextResponse.json({ success: false, error: `Failed to delete location: ${errorMessage}` }, { status: 500 });
  }
} 