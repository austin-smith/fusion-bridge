import { NextRequest, NextResponse } from 'next/server';
import { createOrgScopedDb } from '@/lib/db/org-scoped-db';
import { withOrganizationAuth, type OrganizationAuthContext } from '@/lib/auth/withOrganizationAuth';
import type { Location } from '@/types/index';
import { geocodeAddress, type CensusAddressComponents } from '@/services/drivers/census-geocoding';

// Fetch all locations for the active organization
export const GET = withOrganizationAuth(async (req: NextRequest, authContext: OrganizationAuthContext) => {
  try {
    // Clean organization-scoped database with explicit joins
    const orgDb = createOrgScopedDb(authContext.organizationId);
    const locations = await orgDb.locations.findAll();
    
    return NextResponse.json({
      success: true,
      data: locations
    });
  } catch (error) {
    console.error('Error fetching locations:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch locations' },
      { status: 500 }
    );
  }
});

// Create a new location in the active organization
export const POST = withOrganizationAuth(async (req: NextRequest, authContext: OrganizationAuthContext) => {
  try {
    const body = await req.json();
    const { name, parentId, timeZone, addressStreet, addressCity, addressState, addressPostalCode, notes, externalId, latitude, longitude } = body;

    if (!name || !timeZone || !addressStreet || !addressCity || !addressState || !addressPostalCode) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Attempt to geocode the address if coordinates weren't provided manually
    let finalLatitude = latitude;
    let finalLongitude = longitude;
    
    if (!latitude || !longitude) {
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
        console.warn('Geocoding error (continuing without coordinates):', geocodingError);
      }
    }

    // Clean organization-scoped database - organization automatically injected
    const orgDb = createOrgScopedDb(authContext.organizationId);
    const newLocations = await orgDb.locations.create({
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
      path: parentId ? `${parentId}/${name}` : name // Simplified path logic
    });

    return NextResponse.json({
      success: true,
      data: newLocations[0]
    });
  } catch (error) {
    console.error('Error creating location:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create location' },
      { status: 500 }
    );
  }
}); 