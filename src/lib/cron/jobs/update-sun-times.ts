import 'server-only';

import { db } from '@/data/db';
import { locations } from '@/data/db/schema';
import { getCurrentWeatherData } from '@/services/drivers/openweather';
import { getOpenWeatherConfiguration } from '@/data/repositories/service-configurations';
import { isNotNull, and, eq } from 'drizzle-orm';
import { formatInTimeZone } from 'date-fns-tz';

/**
 * Statistics returned by the sun times update job
 */
export interface SunTimesUpdateStats {
  totalLocations: number;
  successfulUpdates: number;
  failedUpdates: number;
  executionTimeMs: number;
}

/**
 * Updates sunrise/sunset times for all locations with coordinates
 * This job should run daily in the early morning (e.g., 2:00 AM UTC)
 */
export async function updateSunTimes(): Promise<SunTimesUpdateStats> {
  const logPrefix = '[Sun Times Updater]';
  const startTime = Date.now();
  console.log(`${logPrefix} Starting sun times update job`);

  try {
    // Get OpenWeather configuration
    const openWeatherConfig = await getOpenWeatherConfiguration();
    
    if (!openWeatherConfig || !openWeatherConfig.isEnabled || !openWeatherConfig.apiKey) {
      console.warn(`${logPrefix} OpenWeather service is not configured or disabled, skipping sun times update`);
      return {
        totalLocations: 0,
        successfulUpdates: 0,
        failedUpdates: 0,
        executionTimeMs: Date.now() - startTime
      };
    }

    // Get all locations with coordinates
    const locationsWithCoords = await db.select()
      .from(locations)
      .where(and(
        isNotNull(locations.latitude),
        isNotNull(locations.longitude)
      ));

    console.log(`${logPrefix} Found ${locationsWithCoords.length} locations with coordinates`);

    if (locationsWithCoords.length === 0) {
      console.log(`${logPrefix} No locations with coordinates found, job completed`);
      return {
        totalLocations: 0,
        successfulUpdates: 0,
        failedUpdates: 0,
        executionTimeMs: Date.now() - startTime
      };
    }

    let successCount = 0;
    let errorCount = 0;

    // Process locations in batches to improve performance while respecting rate limits
    const BATCH_SIZE = 5; // Process 5 locations concurrently
    const BATCH_DELAY = 500; // 500ms delay between batches
    
    for (let i = 0; i < locationsWithCoords.length; i += BATCH_SIZE) {
      const batch = locationsWithCoords.slice(i, i + BATCH_SIZE);
      
      // Process batch concurrently
      const batchResults = await Promise.allSettled(
        batch.map(async (location) => {
          const latitude = parseFloat(location.latitude!);
          const longitude = parseFloat(location.longitude!);

          if (isNaN(latitude) || isNaN(longitude)) {
            throw new Error(`Invalid coordinates for location ${location.name} (${location.id})`);
          }

          // Get weather data including sunrise/sunset
          const weatherData = await getCurrentWeatherData(
            openWeatherConfig.apiKey,
            latitude,
            longitude
          );

          if (!weatherData) {
            throw new Error(`Failed to get weather data for location ${location.name} (${location.id})`);
          }

          // Format sunrise/sunset times in the location's timezone
          const sunriseLocal = formatInTimeZone(weatherData.sunrise, location.timeZone, 'HH:mm');
          const sunsetLocal = formatInTimeZone(weatherData.sunset, location.timeZone, 'HH:mm');

          // Update the location record
          await db.update(locations)
            .set({
              sunriseTime: sunriseLocal,
              sunsetTime: sunsetLocal,
              sunTimesUpdatedAt: new Date(),
              updatedAt: new Date()
            })
            .where(eq(locations.id, location.id));

          return { location, sunriseLocal, sunsetLocal };
        })
      );

      // Process batch results
      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        const location = batch[j];
        
        if (result.status === 'fulfilled') {
          console.log(`${logPrefix} Updated sun times for ${location.name}: sunrise ${result.value.sunriseLocal}, sunset ${result.value.sunsetLocal}`);
          successCount++;
        } else {
          console.warn(`${logPrefix} ${result.reason}`);
          errorCount++;
        }
      }

      // Add delay between batches to respect rate limits (except for last batch)
      if (i + BATCH_SIZE < locationsWithCoords.length) {
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
      }
    }

    console.log(`${logPrefix} Sun times update completed: ${successCount} successful, ${errorCount} errors`);

    return {
      totalLocations: locationsWithCoords.length,
      successfulUpdates: successCount,
      failedUpdates: errorCount,
      executionTimeMs: Date.now() - startTime
    };

  } catch (error) {
    console.error(`${logPrefix} Fatal error during sun times update:`, error);
    throw error;
  }
} 