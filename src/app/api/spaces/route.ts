import { NextResponse } from 'next/server';
import { withOrganizationAuth, type OrganizationAuthContext } from '@/lib/auth/withOrganizationAuth';
import { createSpacesRepository } from '@/data/repositories/spaces';
import { createSpaceSchema } from '@/lib/schemas/api-schemas';
import type { Space } from '@/types';

// Define extended Space type for API response
interface SpaceWithDetails extends Omit<Space, 'createdAt' | 'updatedAt'> {
  locationName: string;
  deviceIds: string[]; // Explicitly include deviceIds
  createdAt: string;
  updatedAt: string;
}

// Get all spaces for the active organization
export const GET = withOrganizationAuth(async (request, authContext: OrganizationAuthContext) => {
  const { searchParams } = new URL(request.url);
  const locationId = searchParams.get('locationId');

  try {
    const spacesRepo = createSpacesRepository(authContext.organizationId);
    
    let spacesResult;
    if (locationId) {
      if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(locationId)) {
        return NextResponse.json({ success: false, error: "Invalid locationId format" }, { status: 400 });
      }
      spacesResult = await spacesRepo.findByLocationWithDevices(locationId);
    } else {
      spacesResult = await spacesRepo.findAllWithDevices();
    }

    const spacesWithDetails: SpaceWithDetails[] = spacesResult.map(spaceRow => ({
      id: spaceRow.id,
      name: spaceRow.name,
      locationId: spaceRow.locationId,
      description: spaceRow.description,
      locationName: spaceRow.location.name,
      createdAt: new Date(spaceRow.createdAt).toISOString(),
      updatedAt: new Date(spaceRow.updatedAt).toISOString(),
      deviceIds: spaceRow.deviceIds || [], // Now properly populated from repository
      devices: undefined,
      location: undefined,
    }));

    return NextResponse.json({ success: true, data: spacesWithDetails });

  } catch (error) {
    console.error("Error fetching spaces:", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: `Failed to fetch spaces: ${errorMessage}` }, { status: 500 });
  }
});

// Create a space in the active organization
export const POST = withOrganizationAuth(async (request, authContext: OrganizationAuthContext) => {
  try {
    const body = await request.json();
    const validation = createSpaceSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ success: false, error: "Invalid input", details: validation.error.flatten() }, { status: 400 });
    }

    const { name, locationId, description } = validation.data;
    const spacesRepo = createSpacesRepository(authContext.organizationId);

    const newSpace = await spacesRepo.create({
      name,
      locationId,
      description,
    });
    
    const responseSpace: SpaceWithDetails = {
      id: newSpace.id,
      name: newSpace.name,
      locationId: newSpace.locationId,
      description: newSpace.description,
      locationName: newSpace.location.name,
      deviceIds: [], // Empty for newly created spaces
      createdAt: new Date(newSpace.createdAt).toISOString(),
      updatedAt: new Date(newSpace.updatedAt).toISOString(),
    };

    return NextResponse.json({ success: true, data: responseSpace });

  } catch (error) {
    console.error("Error creating space:", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    if (errorMessage.includes('not found or not accessible')) {
      return NextResponse.json({ success: false, error: errorMessage }, { status: 404 });
    }
    
    return NextResponse.json({ success: false, error: `Failed to create space: ${errorMessage}` }, { status: 500 });
  }
}); 