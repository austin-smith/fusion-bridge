import 'server-only';

import { db } from '@/data/db';
import { locations, automations } from '@/data/db/schema';
import { eq, and, isNotNull } from 'drizzle-orm';
import type { TimeOfDayFilter } from '@/lib/automation-schemas';
import { parse, isAfter, isBefore, isEqual } from 'date-fns';
import { formatInTimeZone, toZonedTime, fromZonedTime } from 'date-fns-tz';
import { getOrganizationDefaultTimezone } from '@/lib/organization-utils';

/**
 * Timezone context for evaluation
 */
export interface TimezoneContext {
  timezone: string;
  locationId?: string;
  organizationId?: string;
}

/**
 * Sun times data for a location
 */
export interface SunTimesData {
  sunrise: string;  // "HH:mm" format in local timezone
  sunset: string;   // "HH:mm" format in local timezone
  updatedAt: Date | null;
}

// Simple in-memory cache for timezone context (cleared on module reload)
// This helps avoid repeated DB queries for the same location/org within a request
const timezoneContextCache = new Map<string, TimezoneContext>();
const sunTimesCache = new Map<string, { data: SunTimesData | null; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache TTL
const MAX_CACHE_SIZE = 100; // Limit cache size to prevent memory issues

/**
 * Gets the timezone context for an automation evaluation
 * Follows priority: Event Device Location > Automation Location Scope > Organization Default
 */
export async function getTimezoneContext(
  eventDeviceLocationId?: string,
  automationLocationScopeId?: string,
  organizationId?: string
): Promise<TimezoneContext> {
  // Create cache key
  const cacheKey = `${eventDeviceLocationId || 'null'}-${automationLocationScopeId || 'null'}-${organizationId || 'null'}`;
  
  // Check cache first
  const cached = timezoneContextCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    // Try to get timezone from location sources first (device location or automation scope)
    const locationId = eventDeviceLocationId || automationLocationScopeId;
    
    if (locationId) {
      const location = await db.query.locations.findFirst({
        where: eq(locations.id, locationId),
        columns: { timeZone: true, id: true, organizationId: true }
      });
      
      if (location) {
        const result = {
          timezone: location.timeZone,
          locationId: location.id,
          organizationId: location.organizationId || undefined
        };
        
        // Enforce cache size limit
        if (timezoneContextCache.size >= MAX_CACHE_SIZE) {
          const firstKey = timezoneContextCache.keys().next().value;
          if (firstKey) timezoneContextCache.delete(firstKey);
        }
        
        timezoneContextCache.set(cacheKey, result);
        return result;
      }
    }
    
    // Fallback to organization default timezone
    if (organizationId) {
      const org = await db.query.organization.findFirst({
        where: (org, { eq }) => eq(org.id, organizationId),
        columns: { metadata: true }
      });
      
      if (org) {
        const defaultTimezone = getOrganizationDefaultTimezone(org.metadata);
        const result = {
          timezone: defaultTimezone,
          organizationId
        };
        
        // Enforce cache size limit
        if (timezoneContextCache.size >= MAX_CACHE_SIZE) {
          const firstKey = timezoneContextCache.keys().next().value;
          if (firstKey) timezoneContextCache.delete(firstKey);
        }
        
        timezoneContextCache.set(cacheKey, result);
        return result;
      }
    }
    
    // Final fallback: UTC
    const result = { timezone: 'UTC' };
    
    // Enforce cache size limit
    if (timezoneContextCache.size >= MAX_CACHE_SIZE) {
      const firstKey = timezoneContextCache.keys().next().value;
      if (firstKey) timezoneContextCache.delete(firstKey);
    }
    
    timezoneContextCache.set(cacheKey, result);
    return result;
    
  } catch (error) {
    console.error('[Time Evaluator] Error resolving timezone context:', error);
    const result = { timezone: 'UTC' }; // Fail safely
    timezoneContextCache.set(cacheKey, result);
    return result;
  }
}

/**
 * Gets cached sun times for a location
 */
async function getCachedSunTimes(locationId: string): Promise<SunTimesData | null> {
  // Check cache first
  const cached = sunTimesCache.get(locationId);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const location = await db.query.locations.findFirst({
      where: eq(locations.id, locationId),
      columns: { 
        sunriseTime: true, 
        sunsetTime: true, 
        sunTimesUpdatedAt: true,
        timeZone: true 
      }
    });
    
    if (!location) {
      const result = null;
      sunTimesCache.set(locationId, { data: result, timestamp: Date.now() });
      return result;
    }
    
    const result: SunTimesData = {
      sunrise: location.sunriseTime || '',
      sunset: location.sunsetTime || '',
      updatedAt: location.sunTimesUpdatedAt
    };
    
    // Enforce cache size limit
    if (sunTimesCache.size >= MAX_CACHE_SIZE) {
      const firstKey = sunTimesCache.keys().next().value;
      if (firstKey) sunTimesCache.delete(firstKey);
    }
    
    sunTimesCache.set(locationId, { data: result, timestamp: Date.now() });
    return result;
    
  } catch (error) {
    console.error('[Time Evaluator] Error fetching sun times:', error);
    const result = null;
    sunTimesCache.set(locationId, { data: result, timestamp: Date.now() });
    return result;
  }
}

/**
 * Checks if current time falls within a specific time range
 */
export function isTimeInRange(
  currentTime: Date,
  startTime: string,  // "HH:mm" format
  endTime: string,    // "HH:mm" format
  timezone: string
): boolean {
  try {
    // Convert current time to the target timezone
    const currentLocal = toZonedTime(currentTime, timezone);
    
    // Parse the time strings for today in the target timezone
    const todayStr = formatInTimeZone(currentLocal, timezone, 'yyyy-MM-dd');
    const startDateTime = fromZonedTime(`${todayStr} ${startTime}:00`, timezone);
    const endDateTime = fromZonedTime(`${todayStr} ${endTime}:00`, timezone);
    
    // Handle overnight ranges (e.g., 22:00 to 06:00)
    if (isAfter(startDateTime, endDateTime)) {
      // If start > end, it's an overnight range
      // Current time should be after start OR before end (next day)
      const nextDayEndDateTime = new Date(endDateTime.getTime() + 24 * 60 * 60 * 1000);
      return isAfter(currentTime, startDateTime) || isBefore(currentTime, nextDayEndDateTime);
    } else {
      // Normal range within the same day
      return (isAfter(currentTime, startDateTime) || isEqual(currentTime, startDateTime)) &&
             (isBefore(currentTime, endDateTime) || isEqual(currentTime, endDateTime));
    }
  } catch (error) {
    console.error(`[Time Evaluator] Error checking time range:`, error);
    return false;
  }
}

/**
 * Checks if current time falls within sunrise/sunset range with offsets
 */
export function isTimeInSunRange(
  currentTime: Date,
  sunTimes: SunTimesData,
  sunriseOffsetMinutes: number,
  sunsetOffsetMinutes: number,
  timezone: string,
  isDayTime: boolean = true
): boolean {
  try {
    // Calculate adjusted times
    const sunriseDate = parse(sunTimes.sunrise, 'HH:mm', new Date());
    const sunsetDate = parse(sunTimes.sunset, 'HH:mm', new Date());
    
    const adjustedSunrise = new Date(sunriseDate.getTime() + (sunriseOffsetMinutes * 60 * 1000));
    const adjustedSunset = new Date(sunsetDate.getTime() + (sunsetOffsetMinutes * 60 * 1000));
    
    const adjustedSunriseStr = formatInTimeZone(adjustedSunrise, 'UTC', 'HH:mm');
    const adjustedSunsetStr = formatInTimeZone(adjustedSunset, 'UTC', 'HH:mm');
    
    if (isDayTime) {
      // During day: between adjusted sunrise and adjusted sunset
      return isTimeInRange(currentTime, adjustedSunriseStr, adjustedSunsetStr, timezone);
    } else {
      // At night: between adjusted sunset and adjusted sunrise (next day)
      return isTimeInRange(currentTime, adjustedSunsetStr, adjustedSunriseStr, timezone);
    }
  } catch (error) {
    console.error(`[Time Evaluator] Error checking sun range:`, error);
    return false;
  }
}

/**
 * Main function to evaluate time-of-day filter
 */
export async function evaluateTimeOfDayFilter(
  filter: TimeOfDayFilter,
  currentTime: Date,
  timezoneContext: TimezoneContext
): Promise<boolean> {
  const logPrefix = '[Time Evaluator]';
  
  try {
    switch (filter.type) {
      case 'any_time':
        return true;
        
      case 'during_day':
      case 'at_night': {
        if (!timezoneContext.locationId) {
          console.warn(`${logPrefix} ${filter.type} filter requires location context, but none provided. Allowing execution.`);
          return true; // Fail open - don't block automation
        }
        
        const sunTimes = await getCachedSunTimes(timezoneContext.locationId);
        if (!sunTimes) {
          console.warn(`${logPrefix} No sun times data for location ${timezoneContext.locationId}. Allowing execution.`);
          return true; // Fail open - don't block automation
        }
        
        // Check if sun times data is reasonably fresh (updated within last 7 days)
        if (sunTimes.updatedAt && (Date.now() - sunTimes.updatedAt.getTime()) > 7 * 24 * 60 * 60 * 1000) {
          console.warn(`${logPrefix} Sun times data for location ${timezoneContext.locationId} is stale (last updated: ${sunTimes.updatedAt.toISOString()}). Allowing execution.`);
          return true; // Fail open with stale data
        }
        
        const isDayTime = filter.type === 'during_day';
        return isTimeInSunRange(
          currentTime,
          sunTimes,
          filter.sunriseOffsetMinutes || 0,
          filter.sunsetOffsetMinutes || 0,
          timezoneContext.timezone,
          isDayTime
        );
      }
      
      case 'specific_times': {
        if (!filter.startTime || !filter.endTime) {
          console.warn(`${logPrefix} specific_times filter missing startTime or endTime. Blocking execution.`);
          return false; // Fail closed for invalid configuration
        }
        
        // Check if current time falls within the specified range
        return isTimeInRange(currentTime, filter.startTime, filter.endTime, timezoneContext.timezone);
      }
      
      default:
        console.warn(`${logPrefix} Unknown time filter type: ${(filter as any).type}. Allowing execution.`);
        return true; // Fail open
    }
  } catch (error) {
    console.error(`${logPrefix} Error evaluating time filter:`, error);
    return true; // Fail open on unexpected errors
  }
}

/**
 * Convenience function to evaluate time-of-day filter for an automation
 * Automatically resolves timezone context
 */
export async function evaluateAutomationTimeFilter(
  automationId: string,
  filter: TimeOfDayFilter,
  currentTime: Date = new Date(),
  eventDeviceLocationId?: string
): Promise<boolean> {
  try {
    // Get automation details for location scope and organization
    const automation = await db.query.automations.findFirst({
      where: eq(automations.id, automationId),
      columns: { locationScopeId: true, organizationId: true }
    });
    
    if (!automation) {
      console.warn(`[Time Evaluator] Automation ${automationId} not found. Allowing execution.`);
      return true;
    }
    
    // Resolve timezone context
    const timezoneContext = await getTimezoneContext(
      eventDeviceLocationId,
      automation.locationScopeId || undefined,
      automation.organizationId || undefined
    );
    
    // Evaluate the filter
    return evaluateTimeOfDayFilter(filter, currentTime, timezoneContext);
    
  } catch (error) {
    console.error(`[Time Evaluator] Error evaluating time filter for automation ${automationId}:`, error);
    return true; // Fail open - don't block automation
  }
}

/**
 * Clears the in-memory caches (useful for testing or memory management)
 */
export function clearTimeEvaluatorCaches(): void {
  timezoneContextCache.clear();
  sunTimesCache.clear();
} 