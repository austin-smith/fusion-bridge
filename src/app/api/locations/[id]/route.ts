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

// --- Validation Schema ---
const updateLocationSchema = z.object({
  name: z.string().min(1, "Name cannot be empty").optional(),
  parentId: z.string().uuid("Invalid parent ID format").nullable().optional(),
}).refine(data => data.name !== undefined || data.parentId !== undefined, {
  message: "Either name or parentId must be provided for update",
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

// Update a location (name and/or parentId) - Correct Next.js 15 signature
export async function PUT(
  request: Request, 
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params; // Await params

  if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id)) {
    return NextResponse.json({ success: false, error: "Invalid ID format" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const validation = updateLocationSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ success: false, error: "Invalid input", details: validation.error.flatten() }, { status: 400 });
    }

    const { name, parentId } = validation.data;

    // Fetch the current location
    const [currentLocation] = await db.select().from(locations).where(eq(locations.id, id)).limit(1);

    if (!currentLocation) {
      return NextResponse.json({ success: false, error: "Location not found" }, { status: 404 });
    }

    const updates: Partial<Location> = { updatedAt: new Date() };
    if (name !== undefined) {
      updates.name = name;
    }

    let newPath = currentLocation.path;
    const oldPath = currentLocation.path;
    let parentChanged = false;

    // Check if parentId is explicitly provided in the request and different from current
    if (parentId !== undefined && parentId !== currentLocation.parentId) {
        parentChanged = true;
        updates.parentId = parentId;

        if (parentId === null) { // Moving to root
            newPath = id;
        } else {
            // Prevent making a location its own parent
            if (parentId === id) {
                return NextResponse.json({ success: false, error: "Cannot set a location as its own parent" }, { status: 400 });
            }

            // Fetch the new parent
            const [newParent] = await db.select({ path: locations.path }).from(locations).where(eq(locations.id, parentId)).limit(1);
            if (!newParent) {
                return NextResponse.json({ success: false, error: "New parent location not found" }, { status: 404 });
            }

            // Prevent creating cycles (check if new parent is a descendant of the current location)
            if (newParent.path.startsWith(`${currentLocation.path}.`)) {
                 return NextResponse.json({ success: false, error: "Cannot move location under one of its own descendants" }, { status: 400 });
            }

            newPath = `${newParent.path}.${id}`;
        }
        updates.path = newPath;
    }

    // Perform updates
    // Use transaction only if parent changed, otherwise simple update
    if (parentChanged) {
        console.log(`Parent changed for ${id}. Old path: ${oldPath}, New path: ${newPath}`);
        await db.transaction(async (tx) => {
             // 1. Update the main location's parent and path
            await tx.update(locations).set(updates).where(eq(locations.id, id));
            
            // 2. Update descendants (if the path actually changed)
            if (newPath !== oldPath) {
                 console.log(`Calling updateDescendantPaths for ${id}...`);
                 // We need to call the helper function outside the main transaction logic but pass tx
                 // Drizzle transactions work by passing the tx object
                 // Re-implementing descendant update logic here for simplicity within transaction
                 const descendants = await tx.select({ id: locations.id, path: locations.path })
                    .from(locations)
                    .where(like(locations.path, `${oldPath}.%`));

                 for (const descendant of descendants) {
                    const remainingPath = descendant.path.substring(oldPath.length);
                    const descendantNewPath = `${newPath}${remainingPath}`;
                    console.log(` TX: Updating descendant ${descendant.id} path from ${descendant.path} to ${descendantNewPath}`);
                    await tx.update(locations)
                      .set({ path: descendantNewPath, updatedAt: new Date() })
                      .where(eq(locations.id, descendant.id));
                 }
            }
        });
    } else if (Object.keys(updates).length > 1) { // Only update if there's something besides updatedAt
        await db.update(locations).set(updates).where(eq(locations.id, id));
    }

    // Fetch the final updated location to return
    const [updatedLocation] = await db.select().from(locations).where(eq(locations.id, id)).limit(1);

    return NextResponse.json({ success: true, data: updatedLocation as Location });

  } catch (error) {
    console.error(`Error updating location ${id}:`, error);
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