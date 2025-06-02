import { NextResponse, NextRequest } from 'next/server';
import { withOrganizationAuth, type OrganizationAuthContext } from '@/lib/auth/withOrganizationAuth';
import { createOrgScopedDb } from '@/lib/db/org-scoped-db';
import type { RouteContext } from '@/lib/auth/withApiRouteAuth';
import type { Area } from '@/types/index';
import { updateAreaSchema } from '@/lib/schemas/api-schemas';

// Fetch a specific area by ID within the active organization
export const GET = withOrganizationAuth(async (request: NextRequest, authContext: OrganizationAuthContext, context: RouteContext<{ id: string }>) => {
  if (!context?.params) {
    return NextResponse.json({ success: false, error: "Missing route parameters" }, { status: 400 });
  }
  
  const { id } = await context.params;

  if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id)) {
    return NextResponse.json({ success: false, error: "Invalid ID format" }, { status: 400 });
  }

  try {
    const orgDb = createOrgScopedDb(authContext.organizationId);
    const areas = await orgDb.areas.findById(id);

    if (areas.length === 0) {
      return NextResponse.json({ success: false, error: "Area not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: areas[0] as Area });

  } catch (error) {
    console.error(`Error fetching area ${id}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: `Failed to fetch area: ${errorMessage}` }, { status: 500 });
  }
});

// Update an area within the active organization
export const PUT = withOrganizationAuth(async (request: NextRequest, authContext: OrganizationAuthContext, context: RouteContext<{ id: string }>) => {
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
    const orgDb = createOrgScopedDb(authContext.organizationId);

    // Check if area exists (automatically scoped to organization)
    if (!(await orgDb.areas.exists(id))) {
      return NextResponse.json({ success: false, error: "Area not found" }, { status: 404 });
    }

    // Build update object
    const updates: any = { updatedAt: new Date() };
    if (name !== undefined) {
      updates.name = name;
    }
    if (locationId !== undefined) {
      // Verify location belongs to organization
      if (!(await orgDb.locations.exists(locationId))) {
        return NextResponse.json({ success: false, error: "Target location not found or not accessible" }, { status: 404 });
      }
      updates.locationId = locationId;
    }

    // Perform the update if there are changes besides updatedAt
    if (Object.keys(updates).length > 1) {
      const updatedAreas = await orgDb.areas.update(id, updates);
      return NextResponse.json({ success: true, data: updatedAreas[0] as Area });
    } else {
      const areas = await orgDb.areas.findById(id);
      return NextResponse.json({ success: true, data: areas[0] as Area });
    }

  } catch (error) {
    console.error(`Error updating area ${id}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: `Failed to update area: ${errorMessage}` }, { status: 500 });
  }
});

// Delete an area within the active organization
export const DELETE = withOrganizationAuth(async (request: NextRequest, authContext: OrganizationAuthContext, context: RouteContext<{ id: string }>) => {
  if (!context?.params) {
    return NextResponse.json({ success: false, error: "Missing route parameters" }, { status: 400 });
  }
  
  const { id } = await context.params;

  if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id)) {
    return NextResponse.json({ success: false, error: "Invalid ID format" }, { status: 400 });
  }

  try {
    const orgDb = createOrgScopedDb(authContext.organizationId);
    
    // Check if area exists (automatically scoped to organization)
    if (!(await orgDb.areas.exists(id))) {
      return NextResponse.json({ success: true, data: { id } }); // Idempotent success
    }

    // Perform the delete
    await orgDb.areas.delete(id);

    return NextResponse.json({ success: true, data: { id } });

  } catch (error) {
    console.error(`Error deleting area ${id}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: `Failed to delete area: ${errorMessage}` }, { status: 500 });
  }
}); 