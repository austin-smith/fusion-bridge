import { NextResponse, NextRequest } from 'next/server';
import { withOrganizationAuth, type OrganizationAuthContext } from '@/lib/auth/withOrganizationAuth';
import { createSpacesRepository } from '@/data/repositories/spaces';
import type { RouteContext } from '@/lib/auth/withApiRouteAuth';
import type { Space } from '@/types';
import { updateSpaceSchema } from '@/lib/schemas/api-schemas';

// Get a specific space by ID within the active organization
export const GET = withOrganizationAuth(async (request: NextRequest, authContext: OrganizationAuthContext, context: RouteContext<{ id: string }>) => {
  if (!context?.params) {
    return NextResponse.json({ success: false, error: "Missing route parameters" }, { status: 400 });
  }
  
  const { id } = await context.params;

  if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id)) {
    return NextResponse.json({ success: false, error: "Invalid ID format" }, { status: 400 });
  }

  try {
    const spacesRepo = createSpacesRepository(authContext.organizationId);
    const space = await spacesRepo.findById(id);

    if (!space) {
      return NextResponse.json({ success: false, error: "Space not found" }, { status: 404 });
    }

    const responseSpace = {
      ...space,
      createdAt: new Date(space.createdAt).toISOString(),
      updatedAt: new Date(space.updatedAt).toISOString(),
    };

    return NextResponse.json({ success: true, data: responseSpace });

  } catch (error) {
    console.error(`Error fetching space ${id}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: `Failed to fetch space: ${errorMessage}` }, { status: 500 });
  }
});

// Update a space within the active organization
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
    const validation = updateSpaceSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ success: false, error: "Invalid input", details: validation.error.flatten() }, { status: 400 });
    }

    const spacesRepo = createSpacesRepository(authContext.organizationId);
    const updatedSpace = await spacesRepo.update(id, validation.data);

    if (!updatedSpace) {
      return NextResponse.json({ success: false, error: "Space not found" }, { status: 404 });
    }

    const responseSpace = {
      ...updatedSpace,
      createdAt: new Date(updatedSpace.createdAt).toISOString(),
      updatedAt: new Date(updatedSpace.updatedAt).toISOString(),
    };

    return NextResponse.json({ success: true, data: responseSpace });

  } catch (error) {
    console.error(`Error updating space ${id}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    if (errorMessage.includes('not found or not accessible')) {
      return NextResponse.json({ success: false, error: errorMessage }, { status: 404 });
    }
    
    return NextResponse.json({ success: false, error: `Failed to update space: ${errorMessage}` }, { status: 500 });
  }
});

// Delete a space within the active organization
export const DELETE = withOrganizationAuth(async (request: NextRequest, authContext: OrganizationAuthContext, context: RouteContext<{ id: string }>) => {
  if (!context?.params) {
    return NextResponse.json({ success: false, error: "Missing route parameters" }, { status: 400 });
  }
  
  const { id } = await context.params;

  if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id)) {
    return NextResponse.json({ success: false, error: "Invalid ID format" }, { status: 400 });
  }

  try {
    const spacesRepo = createSpacesRepository(authContext.organizationId);
    await spacesRepo.delete(id);

    return NextResponse.json({ success: true, data: { id } });

  } catch (error) {
    console.error(`Error deleting space ${id}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: `Failed to delete space: ${errorMessage}` }, { status: 500 });
  }
}); 