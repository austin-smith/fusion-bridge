import { z } from 'zod';
import { 
  OpenWeatherGeocodingResponseSchema, 
  type OpenWeatherGeocodingResult, 
  type OpenWeatherAddressComponents 
} from '@/types/openweather-types';

// Base URL for OpenWeather Geocoding API
const OPENWEATHER_GEOCODING_URL = 'http://api.openweathermap.org/geo/1.0';

/**
 * Geocodes an address using OpenWeather's Direct Geocoding API
 * 
 * @param apiKey OpenWeather API key
 * @param address Address components to geocode
 * @returns Promise resolving to geocoding result or null if failed
 */
export async function geocodeAddress(
  apiKey: string,
  address: OpenWeatherAddressComponents
): Promise<OpenWeatherGeocodingResult | null> {
  const logPrefix = '[OpenWeather Geocoding]';
  
  if (!apiKey) {
    console.error(`${logPrefix} API key is required`);
    return null;
  }

  // Build query string: "street, city, state, country"
  const queryParts = [
    address.street,
    address.city,
    address.state,
    address.country || 'US'
  ].filter(Boolean);
  
  const query = queryParts.join(', ');
  
  const url = new URL(`${OPENWEATHER_GEOCODING_URL}/direct`);
  url.searchParams.set('q', query);
  url.searchParams.set('limit', '1'); // We only want the best match
  url.searchParams.set('appid', apiKey);

  console.log(`${logPrefix} Geocoding address: ${query}`);
  console.log(`${logPrefix} Request URL: ${url.toString().replace(apiKey, 'API_KEY_HIDDEN')}`);

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Fusion-Bridge/1.0',
      },
    });

    if (!response.ok) {
      console.error(`${logPrefix} HTTP error: ${response.status} - ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    console.log(`${logPrefix} Raw OpenWeather API response:`, JSON.stringify(data, null, 2));

    // Validate response structure
    const parseResult = OpenWeatherGeocodingResponseSchema.safeParse(data);
    if (!parseResult.success) {
      console.error(`${logPrefix} Invalid response format:`, parseResult.error.flatten());
      console.error(`${logPrefix} Raw data that failed validation:`, data);
      return null;
    }

    const locations = parseResult.data;
    
    if (locations.length === 0) {
      console.log(`${logPrefix} No locations found for query: ${query}`);
      return null;
    }

    const location = locations[0]; // Take the first (best) result
    
    // Build formatted address
    const addressParts = [
      location.name,
      location.state,
      location.country
    ].filter(Boolean);
    
    const formattedAddress = addressParts.join(', ');

    const result: OpenWeatherGeocodingResult = {
      latitude: location.lat,
      longitude: location.lon,
      formattedAddress,
      country: location.country,
      state: location.state,
    };

    console.log(`${logPrefix} Successfully geocoded to: ${result.latitude}, ${result.longitude}`);
    console.log(`${logPrefix} Formatted address: ${result.formattedAddress}`);

    return result;

  } catch (error) {
    console.error(`${logPrefix} Network or parsing error:`, error);
    return null;
  }
}

/**
 * Tests the OpenWeather API key by geocoding a known address
 * 
 * @param apiKey OpenWeather API key to test
 * @returns Promise resolving to test result
 */
export async function testApiKey(
  apiKey: string,
  testAddress?: string
): Promise<{
  success: boolean;
  message: string;
  result?: OpenWeatherGeocodingResult;
}> {
  const logPrefix = '[OpenWeather API Test]';
  
  if (!apiKey) {
    return {
      success: false,
      message: 'API key is required for testing'
    };
  }

  // Use provided test address or default to White House
  const defaultAddress = '1600 Pennsylvania Avenue, Washington, DC, US';
  const addressToTest = testAddress || defaultAddress;

  console.log(`${logPrefix} Testing API key with address: ${addressToTest}`);

  try {
    // For testing, we'll parse the address string into components
    // This is a simple parser - for production use we might want something more robust
    const parts = addressToTest.split(',').map(part => part.trim());
    
    if (parts.length < 3) {
      return {
        success: false,
        message: 'Test address must be in format: "Street, City, State, Country"'
      };
    }

    const addressComponents: OpenWeatherAddressComponents = {
      street: parts[0],
      city: parts[1],
      state: parts[2],
      country: parts[3] || 'US'
    };

    const result = await geocodeAddress(apiKey, addressComponents);

    if (result) {
      return {
        success: true,
        message: `API key is valid. Test address geocoded successfully.`,
        result
      };
    } else {
      return {
        success: false,
        message: 'API key may be invalid or the test address could not be geocoded. Check your API key and try again.'
      };
    }

  } catch (error) {
    console.error(`${logPrefix} Error during API key test:`, error);
    return {
      success: false,
      message: 'Failed to test API key due to network error or invalid response'
    };
  }
} 