import { NextRequest, NextResponse } from 'next/server';
import { withOrganizationAuth, type OrganizationAuthContext } from '@/lib/auth/withOrganizationAuth';
import { createOrgScopedDb } from '@/lib/db/org-scoped-db';
import type { RouteContext } from '@/lib/auth/withApiRouteAuth';
import { getWeatherData } from '@/services/drivers/openweather';
import { getOpenWeatherConfiguration } from '@/data/repositories/service-configurations';

export const GET = withOrganizationAuth(async (req: NextRequest, authContext: OrganizationAuthContext, context: RouteContext<{ id: string }>) => {
  try {
    const { id } = await context.params;
    
    // Get OpenWeather configuration
    const openWeatherConfig = await getOpenWeatherConfiguration();
    
    if (!openWeatherConfig) {
      return NextResponse.json(
        { success: false, error: 'OpenWeather service is not configured' },
        { status: 400 }
      );
    }

    if (!openWeatherConfig.isEnabled) {
      return NextResponse.json(
        { success: false, error: 'OpenWeather service is disabled' },
        { status: 400 }
      );
    }

    if (!openWeatherConfig.apiKey) {
      return NextResponse.json(
        { success: false, error: 'OpenWeather API key is not configured' },
        { status: 400 }
      );
    }

    // Get location data
    const orgDb = createOrgScopedDb(authContext.organizationId);
    const locations = await orgDb.locations.findById(id);
    
    if (locations.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Location not found' },
        { status: 404 }
      );
    }

    const location = locations[0];

    // Check if location has coordinates
    if (!location.latitude || !location.longitude) {
      return NextResponse.json(
        { success: false, error: 'Location does not have coordinates for weather data' },
        { status: 400 }
      );
    }

    // Convert string coordinates to numbers
    const latitude = parseFloat(location.latitude);
    const longitude = parseFloat(location.longitude);

    if (isNaN(latitude) || isNaN(longitude)) {
      return NextResponse.json(
        { success: false, error: 'Invalid coordinates format' },
        { status: 400 }
      );
    }

    // Get weather data
    const weatherData = await getWeatherData(
      openWeatherConfig.apiKey,
      latitude,
      longitude
    );

    if (!weatherData) {
      return NextResponse.json(
        { success: false, error: 'Failed to fetch weather data' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        locationId: id,
        locationName: location.name,
        weather: weatherData,
      }
    });

  } catch (error) {
    console.error('Error fetching weather data for location:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}); 