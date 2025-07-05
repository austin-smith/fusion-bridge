import { NextRequest, NextResponse } from 'next/server';
import type { Location } from '@/types/index';
import { z } from 'zod';
import { withOrganizationAuth, type OrganizationAuthContext } from '@/lib/auth/withOrganizationAuth';
import { createOrgScopedDb } from '@/lib/db/org-scoped-db';
import type { RouteContext } from '@/lib/auth/withApiRouteAuth';
import { geocodeAddress, type CensusAddressComponents } from '@/services/drivers/census-geocoding';

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
  latitude: z.string().nullable().optional(),
  longitude: z.string().nullable().optional(),
});

// Fetch a specific location by ID within the active organization
export const GET = withOrganizationAuth(async (req: NextRequest, authContext: OrganizationAuthContext, context: RouteContext<{ id: string }>) => {
  try {
    const { id } = await context.params;
    
    // Clean organization-scoped query with explicit join
    const orgDb = createOrgScopedDb(authContext.organizationId);
    const locations = await orgDb.locations.findById(id);
    
    if (locations.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Location not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: locations[0]
    });
  } catch (error) {
    console.error('Error fetching location:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch location' },
      { status: 500 }
    );
  }
});

// Update an existing location within the active organization
export const PUT = withOrganizationAuth(async (req: NextRequest, authContext: OrganizationAuthContext, context: RouteContext<{ id: string }>) => {
  try {
    const { id } = await context.params;
    const body = await req.json();
    const { name, parentId, timeZone, addressStreet, addressCity, addressState, addressPostalCode, notes, externalId, latitude, longitude } = body;

    // Clean organization-scoped database with explicit joins
    const orgDb = createOrgScopedDb(authContext.organizationId);
    
    // Check if location exists (automatically scoped to organization)
    if (!(await orgDb.locations.exists(id))) {
      return NextResponse.json(
        { success: false, error: 'Location not found' },
        { status: 404 }
      );
    }

    // Attempt to geocode if address fields changed and coordinates weren't provided manually
    let finalLatitude = latitude;
    let finalLongitude = longitude;
    
    // Only geocode if we have address data and no coordinates were provided
    if (addressStreet && addressCity && addressState && addressPostalCode && (!latitude || !longitude)) {
      try {
        const addressComponents: CensusAddressComponents = {
          street: addressStreet,
          city: addressCity,
          state: addressState,
          zip: addressPostalCode,
        };
        
        const geocodingResult = await geocodeAddress(addressComponents);
        
        if (geocodingResult) {
          finalLatitude = geocodingResult.latitude.toString();
          finalLongitude = geocodingResult.longitude.toString();
        }
      } catch (geocodingError) {
        console.warn('Geocoding error during update (continuing):', geocodingError);
      }
    }

    // Update location - organization filtering enforced by WHERE clause
    const updatedLocations = await orgDb.locations.update(id, {
      name,
      parentId,
      timeZone,
      addressStreet,
      addressCity,
      addressState,
      addressPostalCode,
      notes,
      externalId,
      latitude: finalLatitude || null,
      longitude: finalLongitude || null,
      path: name // Simplified path for demo
    });

    return NextResponse.json({
      success: true,
      data: updatedLocations[0]
    });
  } catch (error) {
    console.error('Error updating location:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update location' },
      { status: 500 }
    );
  }
});

// Delete a location within the active organization
export const DELETE = withOrganizationAuth(async (req: NextRequest, authContext: OrganizationAuthContext, context: RouteContext<{ id: string }>) => {
  try {
    const { id } = await context.params;
    
    // Clean organization-scoped database with explicit joins
    const orgDb = createOrgScopedDb(authContext.organizationId);
    
    // Check if location exists (automatically scoped to organization)
    if (!(await orgDb.locations.exists(id))) {
      return NextResponse.json(
        { success: false, error: 'Location not found' },
        { status: 404 }
      );
    }

    // Delete location - organization filtering enforced by WHERE clause
    await orgDb.locations.delete(id);

    return NextResponse.json({
      success: true,
      data: { id }
    });
  } catch (error) {
    console.error('Error deleting location:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete location' },
      { status: 500 }
    );
  }
}); 