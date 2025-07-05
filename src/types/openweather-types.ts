import { z } from 'zod';

// OpenWeather Service Configuration
export interface OpenWeatherConfig {
  id: string;
  type: 'openweather';
  apiKey: string;
  isEnabled: boolean;
}

// OpenWeather API Schemas
export const OpenWeatherGeocodingResponseSchema = z.array(z.object({
  name: z.string(),
  lat: z.number(),
  lon: z.number(),
  country: z.string(),
  state: z.string().optional(),
  local_names: z.record(z.string()).optional(),
}));

export const OpenWeatherZipGeocodingResponseSchema = z.object({
  zip: z.string(),
  name: z.string(),
  lat: z.number(),
  lon: z.number(),
  country: z.string(),
});

// Our standardized geocoding result
export interface OpenWeatherGeocodingResult {
  latitude: number;
  longitude: number;
  formattedAddress: string;
  country: string;
  state?: string;
}

// API request interface for geocoding
export interface OpenWeatherAddressComponents {
  street: string;
  city: string;
  state: string;
  country?: string; // Default to US if not provided
}

// Form schema for OpenWeather configuration
export const OpenWeatherConfigSchema = z.object({
  apiKey: z.string().min(1, 'API Key is required'),
  isEnabled: z.preprocess((val) => val === 'true', z.boolean()),
});

// Test request schema
export const OpenWeatherTestSchema = z.object({
  address: z.string().min(1, 'Address is required'),
});

export type OpenWeatherConfigFormData = z.infer<typeof OpenWeatherConfigSchema>;
export type OpenWeatherTestFormData = z.infer<typeof OpenWeatherTestSchema>; 