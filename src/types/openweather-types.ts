import { z } from 'zod';

// OpenWeather Service Configuration
export interface OpenWeatherConfig {
  id: string;
  type: 'openweather';
  apiKey: string;
  isEnabled: boolean;
}

// OpenWeather One Call API 3.0 Schemas
export const OpenWeatherCurrentWeatherSchema = z.object({
  dt: z.number(), // Current time, Unix, UTC
  sunrise: z.number(), // Sunrise time, Unix, UTC
  sunset: z.number(), // Sunset time, Unix, UTC
  temp: z.number(),
  feels_like: z.number(),
  pressure: z.number(),
  humidity: z.number(),
  dew_point: z.number(),
  uvi: z.number(),
  clouds: z.number(),
  visibility: z.number(),
  wind_speed: z.number(),
  wind_deg: z.number(),
  wind_gust: z.number().optional(),
  weather: z.array(z.object({
    id: z.number(),
    main: z.string(),
    description: z.string(),
    icon: z.string(),
  })),
  rain: z.object({
    '1h': z.number().optional(),
  }).optional(),
  snow: z.object({
    '1h': z.number().optional(),
  }).optional(),
});

export const OpenWeatherOneCallResponseSchema = z.object({
  lat: z.number(),
  lon: z.number(),
  timezone: z.string(), // Timezone name for the requested location
  timezone_offset: z.number(), // Shift in seconds from UTC
  current: OpenWeatherCurrentWeatherSchema,
});

// Our processed sunrise/sunset result
export interface SunriseSunsetData {
  latitude: number;
  longitude: number;
  timezone: string;
  timezoneOffset: number; // seconds from UTC
  currentTime: Date;
  sunrise: Date;
  sunset: Date;
}

// Form schema for OpenWeather configuration
export const OpenWeatherConfigSchema = z.object({
  apiKey: z.string().min(1, 'API Key is required'),
  isEnabled: z.preprocess((val) => val === 'true', z.boolean()),
});

// Test request schema - simplified for weather API testing
export const OpenWeatherTestSchema = z.object({
  latitude: z.preprocess((val) => parseFloat(String(val)), z.number().min(-90).max(90)),
  longitude: z.preprocess((val) => parseFloat(String(val)), z.number().min(-180).max(180)),
});

export type OpenWeatherConfigFormData = z.infer<typeof OpenWeatherConfigSchema>;
export type OpenWeatherTestFormData = z.infer<typeof OpenWeatherTestSchema>;
export type OpenWeatherOneCallResponse = z.infer<typeof OpenWeatherOneCallResponseSchema>; 