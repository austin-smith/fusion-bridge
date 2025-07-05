import { z } from 'zod';

// Base URL for Census Geocoding API
const CENSUS_GEOCODING_URL = 'https://geocoding.geo.census.gov/geocoder';

// Input interface for address components
export interface CensusAddressComponents {
  street: string;
  city: string;
  state: string;
  zip: string;
}

// Response interface for geocoding results
export interface CensusGeocodingResult {
  latitude: number;
  longitude: number;
  formattedAddress: string;
}

// Schema for Census API response validation
const CensusAddressMatchSchema = z.object({
  coordinates: z.object({
    x: z.number(), // longitude
    y: z.number(), // latitude
  }),
  matchedAddress: z.string(),
  addressComponents: z.object({
    streetName: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zip: z.string().optional(),
  }).optional(),
});

const CensusApiResponseSchema = z.object({
  result: z.object({
    addressMatches: z.array(CensusAddressMatchSchema),
  }),
});

/**
 * Geocodes an address using the US Census Bureau Geocoding API
 * 
 * @param address Address components to geocode
 * @returns Promise resolving to geocoding result or null if failed
 */
export async function geocodeAddress(
  address: CensusAddressComponents
): Promise<CensusGeocodingResult | null> {
  const logPrefix = '[Census Geocoding]';
  
  // Build address string: "street, city, state zip"
  const addressString = `${address.street}, ${address.city}, ${address.state} ${address.zip}`;
  
  const url = new URL(`${CENSUS_GEOCODING_URL}/locations/onelineaddress`);
  url.searchParams.set('address', addressString);
  url.searchParams.set('benchmark', 'Public_AR_Current');
  url.searchParams.set('format', 'json');

  console.log(`${logPrefix} Geocoding address: ${addressString}`);
  console.log(`${logPrefix} Request URL: ${url.toString()}`);

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
    console.log(`${logPrefix} Raw Census API response:`, JSON.stringify(data, null, 2));

    // Validate response structure
    const parseResult = CensusApiResponseSchema.safeParse(data);
    if (!parseResult.success) {
      console.error(`${logPrefix} Invalid response format:`, parseResult.error.flatten());
      console.error(`${logPrefix} Raw data that failed validation:`, data);
      return null;
    }

    const addressMatches = parseResult.data.result.addressMatches;
    
    if (addressMatches.length === 0) {
      console.log(`${logPrefix} No address matches found for: ${addressString}`);
      return null;
    }

    const match = addressMatches[0]; // Take the first (best) match
    
    const result: CensusGeocodingResult = {
      latitude: match.coordinates.y,
      longitude: match.coordinates.x,
      formattedAddress: match.matchedAddress,
    };

    console.log(`${logPrefix} Successfully geocoded to: ${result.latitude}, ${result.longitude}`);
    console.log(`${logPrefix} Matched address: ${result.formattedAddress}`);

    return result;

  } catch (error) {
    console.error(`${logPrefix} Network or parsing error:`, error);
    return null;
  }
} 