import { NextRequest, NextResponse } from 'next/server';
import { withOrganizationAuth, type OrganizationAuthContext } from '@/lib/auth/withOrganizationAuth';
import { createOrgScopedDb } from '@/lib/db/org-scoped-db';
import type { RouteContext } from '@/lib/auth/withApiRouteAuth';
import { geocodeAddress, type CensusAddressComponents } from '@/services/drivers/census-geocoding';

// Manual geocoding endpoint for refreshing coordinates
export const POST = withOrganizationAuth(async (req: NextRequest, authContext: OrganizationAuthContext, context: RouteContext<{ id: string }>) => {
  try {
    const { id } = await context.params;
    const body = await req.json();

    // Clean organization-scoped database with explicit joins
    const orgDb = createOrgScopedDb(authContext.organizationId);
    
    // Get current location data (for validation and updating)
    const locations = await orgDb.locations.findById(id);
    if (locations.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Location not found' },
        { status: 404 }
      );
    }

    const location = locations[0];

    // Use address data from request body if provided, otherwise fall back to saved data
    const addressToGeocode: CensusAddressComponents = {
      street: body.addressStreet || location.addressStreet,
      city: body.addressCity || location.addressCity,
      state: body.addressState || location.addressState,
      zip: body.addressPostalCode || location.addressPostalCode,
    };

    // Ensure we have address data for geocoding
    if (!addressToGeocode.street || !addressToGeocode.city || !addressToGeocode.state || !addressToGeocode.zip) {
      return NextResponse.json(
        { success: false, error: 'Missing required address components for geocoding' },
        { status: 400 }
      );
    }

    // Attempt geocoding
    try {
      const geocodingResult = await geocodeAddress(addressToGeocode);

      if (!geocodingResult) {
        return NextResponse.json({
          success: false,
          error: 'Could not geocode address. The address may not be found in the Census database.'
        });
      }

      // Update location with new coordinates
      const updatedLocations = await orgDb.locations.update(id, {
        latitude: geocodingResult.latitude.toString(),
        longitude: geocodingResult.longitude.toString(),
      });

      return NextResponse.json({
        success: true,
        data: {
          latitude: geocodingResult.latitude,
          longitude: geocodingResult.longitude,
          formattedAddress: geocodingResult.formattedAddress,
          location: updatedLocations[0]
        }
      });

    } catch (geocodingError) {
      console.error('Geocoding error:', geocodingError);
      return NextResponse.json({
        success: false,
        error: 'Geocoding service temporarily unavailable. Please try again later.'
      });
    }

  } catch (error) {
    console.error('Error during manual geocoding:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to geocode location' },
      { status: 500 }
    );
  }
}); 