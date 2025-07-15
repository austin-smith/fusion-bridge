import { z } from 'zod';
import { 
  OpenWeatherOneCallResponseSchema,
  type SunriseSunsetData,
  type WeatherData,
} from '@/types/openweather-types';

// Base URL for OpenWeather One Call API 3.0
const OPENWEATHER_ONECALL_URL = 'https://api.openweathermap.org/data/3.0/onecall';

/**
 * Gets complete weather data including current conditions, sunrise/sunset using OpenWeather's One Call API 3.0
 * 
 * @param apiKey OpenWeather API key
 * @param latitude Latitude coordinate
 * @param longitude Longitude coordinate
 * @returns Promise resolving to complete weather data or null if failed
 */
export async function getWeatherData(
  apiKey: string,
  latitude: number,
  longitude: number
): Promise<WeatherData | null> {
  const logPrefix = '[OpenWeather One Call API]';
  
  if (!apiKey) {
    console.error(`${logPrefix} API key is required`);
    return null;
  }

  if (latitude < -90 || latitude > 90) {
    console.error(`${logPrefix} Invalid latitude: ${latitude}. Must be between -90 and 90`);
    return null;
  }

  if (longitude < -180 || longitude > 180) {
    console.error(`${logPrefix} Invalid longitude: ${longitude}. Must be between -180 and 180`);
    return null;
  }

  const url = new URL(OPENWEATHER_ONECALL_URL);
  url.searchParams.set('lat', latitude.toString());
  url.searchParams.set('lon', longitude.toString());
  url.searchParams.set('exclude', 'minutely,hourly,daily'); // Only get current data with sunrise/sunset
  url.searchParams.set('units', 'imperial'); // Get temperature in Fahrenheit
  url.searchParams.set('appid', apiKey);

  console.log(`${logPrefix} Getting weather data for: ${latitude}, ${longitude}`);
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
    const parseResult = OpenWeatherOneCallResponseSchema.safeParse(data);
    if (!parseResult.success) {
      console.error(`${logPrefix} Invalid response format:`, parseResult.error.flatten());
      console.error(`${logPrefix} Raw data that failed validation:`, data);
      return null;
    }

    const weatherData = parseResult.data;

    // Convert Unix timestamps to Date objects and extract weather information
    const result: WeatherData = {
      latitude: weatherData.lat,
      longitude: weatherData.lon,
      timezone: weatherData.timezone,
      timezoneOffset: weatherData.timezone_offset,
      currentTime: new Date(weatherData.current.dt * 1000),
      sunrise: new Date(weatherData.current.sunrise * 1000),
      sunset: new Date(weatherData.current.sunset * 1000),
      temperature: weatherData.current.temp,
      feelsLike: weatherData.current.feels_like,
      humidity: weatherData.current.humidity,
      pressure: weatherData.current.pressure,
      weather: weatherData.current.weather.map(w => ({
        id: w.id,
        main: w.main,
        description: w.description,
        icon: w.icon,
      })),
    };

    console.log(`${logPrefix} Successfully processed weather data:`);
    console.log(`${logPrefix} Timezone: ${result.timezone}`);
    console.log(`${logPrefix} Sunrise: ${result.sunrise.toISOString()}`);
    console.log(`${logPrefix} Sunset: ${result.sunset.toISOString()}`);
    console.log(`${logPrefix} Weather: ${result.weather[0]?.main} (${result.weather[0]?.description})`);

    return result;

  } catch (error) {
    console.error(`${logPrefix} Network or parsing error:`, error);
    return null;
  }
}

/**
 * Gets current weather data including sunrise/sunset using OpenWeather's One Call API 3.0
 * 
 * @param apiKey OpenWeather API key
 * @param latitude Latitude coordinate
 * @param longitude Longitude coordinate
 * @returns Promise resolving to sunrise/sunset data or null if failed
 * @deprecated Use getWeatherData instead for complete weather information
 */
export async function getCurrentWeatherData(
  apiKey: string,
  latitude: number,
  longitude: number
): Promise<SunriseSunsetData | null> {
  const weatherData = await getWeatherData(apiKey, latitude, longitude);
  
  if (!weatherData) {
    return null;
  }
  
  // Convert to legacy format
  return {
    latitude: weatherData.latitude,
    longitude: weatherData.longitude,
    timezone: weatherData.timezone,
    timezoneOffset: weatherData.timezoneOffset,
    currentTime: weatherData.currentTime,
    sunrise: weatherData.sunrise,
    sunset: weatherData.sunset,
  };
}

/**
 * Tests the OpenWeather API key by getting weather data for the specified location
 * 
 * @param apiKey OpenWeather API key to test
 * @param latitude Latitude coordinate to test with
 * @param longitude Longitude coordinate to test with
 * @returns Promise resolving to test result
 */
export async function testApiKey(
  apiKey: string,
  latitude: number,
  longitude: number
): Promise<{
  success: boolean;
  message: string;
  result?: SunriseSunsetData;
}> {
  const logPrefix = '[OpenWeather API Test]';
  
  if (!apiKey) {
    return {
      success: false,
      message: 'API key is required for testing'
    };
  }

  console.log(`${logPrefix} Testing API key with coordinates: ${latitude}, ${longitude}`);

  try {
    const result = await getWeatherData(apiKey, latitude, longitude);

    if (result) {
      return {
        success: true,
        message: `Successfully retrieved data from OpenWeather!`,
        result
      };
    } else {
      return {
        success: false,
        message: 'API key may be invalid or the weather service is temporarily unavailable. Check your API key and try again.'
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