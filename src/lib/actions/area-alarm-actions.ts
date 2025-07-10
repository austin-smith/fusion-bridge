import { db } from '@/data/db';
import { areas, locations, armingSchedules } from '@/data/db/schema';
import { ArmedState, ArmedStateDisplayNames } from '@/lib/mappings/definitions';
import { eq, and, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Area } from '@/types/index';
import { getRedisPubClient } from '@/lib/redis/client';
import { getEventChannelName, getEventThumbnailChannelName, type SSEArmingMessage } from '@/lib/redis/types';

// Corrected imports for date-fns and date-fns-tz based on documentation
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { 
    addDays, 
    isAfter, 
    getDay, 
    setHours, 
    setMinutes, 
    setSeconds, 
    setMilliseconds,
    parse // Using parse from date-fns, ensure it's for the right purpose or alias if needed
} from 'date-fns';

// Helper function to parse HH:MM time string
function parseHHMM(timeStr: string): { hours: number; minutes: number } | null {
    const [hoursStr, minutesStr] = timeStr.split(':');
    const hours = parseInt(hoursStr, 10);
    const minutes = parseInt(minutesStr, 10);
    if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        console.error(`Invalid time string format: ${timeStr}. Expected HH:MM.`);
        return null;
    }
    return { hours, minutes };
}

function calculateNextTransitionsUTC(
  daysOfWeek: number[], 
  armTimeLocalStr: string, 
  disarmTimeLocalStr: string, 
  timeZone: string,
  nowUtc: Date
): { nextArmUtc: Date | null; nextDisarmUtc: Date | null } {
  const armTimeParsed = parseHHMM(armTimeLocalStr);
  const disarmTimeParsed = parseHHMM(disarmTimeLocalStr);

  if (!armTimeParsed || !disarmTimeParsed) {
    console.error("Failed to parse arm or disarm time strings.");
    return { nextArmUtc: null, nextDisarmUtc: null };
  }

  let nextArmUtc: Date | null = null;
  let nextDisarmUtc: Date | null = null;

  // Convert current UTC time to the target timezone to establish a reference point in that zone
  const nowInTargetZone = toZonedTime(nowUtc, timeZone);

  for (let i = 0; i < 7; i++) {
    // Iterate by adding days to the zoned reference time
    const currentDateInIteration = addDays(nowInTargetZone, i); 
    
    // Get the day of the week for the iterated date, correctly considering the target timezone
    const dayOfWeekInTargetZone = getDay(toZonedTime(currentDateInIteration, timeZone)); 

    if (daysOfWeek.includes(dayOfWeekInTargetZone)) {
      // Calculate Arm Time for this day
      if (!nextArmUtc) { 
        let armDateTimeInTargetZone = setHours(currentDateInIteration, armTimeParsed.hours);
        armDateTimeInTargetZone = setMinutes(armDateTimeInTargetZone, armTimeParsed.minutes);
        armDateTimeInTargetZone = setSeconds(armDateTimeInTargetZone, 0);
        armDateTimeInTargetZone = setMilliseconds(armDateTimeInTargetZone, 0);
        
        // Convert this local time in the target zone to UTC
        const armDateTimeUtc = fromZonedTime(armDateTimeInTargetZone, timeZone);
        if (isAfter(armDateTimeUtc, nowUtc)) {
          nextArmUtc = armDateTimeUtc;
        }
      }

      // Calculate Disarm Time for this day
      if (!nextDisarmUtc) { 
        let disarmDateTimeInTargetZone = setHours(currentDateInIteration, disarmTimeParsed.hours);
        disarmDateTimeInTargetZone = setMinutes(disarmDateTimeInTargetZone, disarmTimeParsed.minutes);
        disarmDateTimeInTargetZone = setSeconds(disarmDateTimeInTargetZone, 0);
        disarmDateTimeInTargetZone = setMilliseconds(disarmDateTimeInTargetZone, 0);

        // Convert this local time in the target zone to UTC
        const disarmDateTimeUtc = fromZonedTime(disarmDateTimeInTargetZone, timeZone);
        if (isAfter(disarmDateTimeUtc, nowUtc)) {
          nextDisarmUtc = disarmDateTimeUtc;
        }
      }
    }
    if (nextArmUtc && nextDisarmUtc) {
      break;
    }
  }
  return { nextArmUtc, nextDisarmUtc };
}

// Schema for input validation (can be shared or internal if specific)
const internalSetArmedStateSchema = z.object({
  areaId: z.string().uuid("Invalid Area ID format"),
  armedState: z.nativeEnum(ArmedState),
  // reason: z.string().optional(), // If you want to log a reason for the change
});

/**
 * Internally sets the armed state of an area and allows for additional field updates.
 * This function is intended for server-side use.
 * 
 * @param areaId The UUID of the area.
 * @param armedState The new armed state.
 * @param additionalUpdates Optional fields to update on the area record.
 * @returns The updated area object or null if not found or error.
 * @throws Error if validation fails or database update fails.
 */
export async function internalSetAreaArmedState(
  areaId: string,
  armedState: ArmedState,
  additionalUpdates?: Partial<Omit<typeof areas.$inferInsert, 'id' | 'armedState' | 'createdAt' | 'updatedAt'>>
): Promise<Area | null> {
  // Validate input
  const validation = internalSetArmedStateSchema.safeParse({ areaId, armedState });
  if (!validation.success) {
    console.error("[AreaAlarmActions] Invalid input for internalSetAreaArmedState:", validation.error.flatten());
    throw new Error(`Invalid input for setting armed state: ${validation.error.format()}`);
  }

  const { areaId: validatedAreaId, armedState: validatedArmedState } = validation.data;

  try {
    // Fetch current area state with location for context
    const [currentArea] = await db.select({
      id: areas.id,
      armedState: areas.armedState,
      locationId: areas.locationId
    })
      .from(areas)
      .where(eq(areas.id, validatedAreaId))
      .limit(1);

    if (!currentArea) {
      console.warn(`[AreaAlarmActions] Area not found: ${validatedAreaId}`);
      return null; 
    }

    // Store previous state for the message
    const previousState = currentArea.armedState;

    const updateData: Partial<typeof areas.$inferInsert> = {
      armedState: validatedArmedState,
      updatedAt: new Date(),
      ...additionalUpdates,
    };

    const updatedResult = await db.update(areas)
      .set(updateData)
      .where(eq(areas.id, validatedAreaId))
      .returning();

    if (updatedResult.length === 0) {
        console.warn(`[AreaAlarmActions] Failed to update area (not found after initial check or no rows affected): ${validatedAreaId}`);
        return null;
    }
    
    const updatedArea = updatedResult[0];

    // Fetch full area context for the arming message
    const areaWithContext = await db.query.areas.findFirst({
      where: eq(areas.id, validatedAreaId),
      with: {
        location: {
          columns: {
            id: true,
            name: true,
            organizationId: true
          }
        }
      }
    });

    if (!areaWithContext || !areaWithContext.location) {
      console.error(`[AreaAlarmActions] Failed to fetch area context for arming message: ${validatedAreaId}`);
      return updatedArea as Area; // Still return the updated area even if we can't publish the message
    }

    // Publish arming message to Redis
    if (areaWithContext.location.organizationId) {
      try {
        const armingMessage: SSEArmingMessage = {
          type: 'arming',
          organizationId: areaWithContext.location.organizationId,
          timestamp: new Date().toISOString(),
          area: {
            id: updatedArea.id,
            name: updatedArea.name,
            locationId: updatedArea.locationId,
            locationName: areaWithContext.location.name,
            previousState: previousState,
            previousStateDisplayName: ArmedStateDisplayNames[previousState],
            currentState: validatedArmedState,
            currentStateDisplayName: ArmedStateDisplayNames[validatedArmedState]
          }
        };

        const channel = getEventChannelName(areaWithContext.location.organizationId);
        const thumbnailChannel = getEventThumbnailChannelName(areaWithContext.location.organizationId);
        const pubClient = getRedisPubClient();
        
        // Always publish to regular channel
        await pubClient.publish(channel, JSON.stringify(armingMessage));
        
        // Also publish to thumbnail channel if there are subscribers
        const [, thumbnailSubscriberCount] = await pubClient.pubsub('NUMSUB', thumbnailChannel) as [string, number];
        if (thumbnailSubscriberCount > 0) {
          await pubClient.publish(thumbnailChannel, JSON.stringify(armingMessage));
        }
        
        const channelsPublished = thumbnailSubscriberCount > 0 ? `${channel} and ${thumbnailChannel}` : channel;
        console.log(`[AreaAlarmActions] Published arming message for area ${validatedAreaId}: ${previousState} -> ${validatedArmedState} to channel(s): ${channelsPublished}`);
      } catch (redisError) {
        // Don't fail the operation if Redis publish fails
        console.error(`[AreaAlarmActions] Failed to publish arming message for area ${validatedAreaId}:`, redisError);
      }
    }
    
    return updatedArea as Area;

  } catch (error) {
    console.error(`[AreaAlarmActions] Error in internalSetAreaArmedState for area ${validatedAreaId}:`, error);
    if (error instanceof Error) {
      throw error;
    } else {
      throw new Error('An unknown error occurred while setting area armed state.');
    }
  }
}

// --- Core CRON Job Logic ---
export async function processAreaArmingSchedules() {
  console.log(`CRON: processAreaArmingSchedules started at ${new Date().toISOString()}`);
  const allDbAreas = await db.query.areas.findMany({
    with: {
      location: {
        columns: {
          id: true,
          timeZone: true,
          activeArmingScheduleId: true,
        },
      },
    },
  });

  for (const area of allDbAreas) {
    try {
      let scheduleDetails = null;
      const location = area.location;

      if (!location || !location.timeZone) {
        console.error(`CRON: Area ${area.id} is missing location data or location timezone. Skipping.`);
        continue;
      }
      const timeZone = location.timeZone;

      if (area.overrideArmingScheduleId) {
        scheduleDetails = await db.query.armingSchedules.findFirst({
          where: and(
            eq(armingSchedules.id, area.overrideArmingScheduleId),
            eq(armingSchedules.isEnabled, true)
          ),
        });
        if (scheduleDetails) console.log(`CRON: Area ${area.id} using override schedule ${scheduleDetails.id}`);
      }

      if (!scheduleDetails && location.activeArmingScheduleId) {
        scheduleDetails = await db.query.armingSchedules.findFirst({
          where: and(
            eq(armingSchedules.id, location.activeArmingScheduleId),
            eq(armingSchedules.isEnabled, true)
          ),
        });
        if (scheduleDetails) console.log(`CRON: Area ${area.id} using location default schedule ${scheduleDetails.id}`);
      }

      const nowUtc = new Date();

      if (!scheduleDetails) {
        if (area.nextScheduledArmTime || area.nextScheduledDisarmTime) {
          await db.update(areas).set({
            nextScheduledArmTime: null,
            nextScheduledDisarmTime: null,
          }).where(eq(areas.id, area.id));
          console.log(`CRON: Area ${area.id} has no active schedule. Cleared next transition times.`);
        }
        continue;
      }

      const { nextArmUtc, nextDisarmUtc } = calculateNextTransitionsUTC(
        scheduleDetails.daysOfWeek, 
        scheduleDetails.armTimeLocal, 
        scheduleDetails.disarmTimeLocal,
        timeZone,
        nowUtc
      );

      if (
        (area.nextScheduledArmTime?.getTime() !== nextArmUtc?.getTime()) ||
        (area.nextScheduledDisarmTime?.getTime() !== nextDisarmUtc?.getTime())
      ) {
          await db.update(areas).set({
            nextScheduledArmTime: nextArmUtc,
            nextScheduledDisarmTime: nextDisarmUtc,
          }).where(eq(areas.id, area.id));
          console.log(`CRON: Area ${area.id} next transitions updated: Arm at ${nextArmUtc?.toISOString()}, Disarm at ${nextDisarmUtc?.toISOString()}`);
      }
      
      const currentAreaState = await db.query.areas.findFirst({ where: eq(areas.id, area.id) });
      if (!currentAreaState) {
          console.error(`CRON: Failed to refetch area ${area.id} state. Skipping state change.`);
          continue;
      }

      if (
        currentAreaState.armedState === ArmedState.DISARMED &&
        currentAreaState.nextScheduledArmTime &&
        nowUtc >= currentAreaState.nextScheduledArmTime 
      ) {
        if (currentAreaState.isArmingSkippedUntil && nowUtc < currentAreaState.isArmingSkippedUntil) { 
          console.log(`CRON: Area ${currentAreaState.id} arming is skipped until ${currentAreaState.isArmingSkippedUntil.toISOString()}. Current time: ${nowUtc.toISOString()}`);
        } else {
          await db.update(areas).set({
            armedState: ArmedState.ARMED, 
            isArmingSkippedUntil: null,
          }).where(eq(areas.id, currentAreaState.id));
          console.log(`CRON: Area ${currentAreaState.id} ARMED by schedule at ${nowUtc.toISOString()}.`);
        }
      }
      
      const areaStateBeforeDisarmCheck = await db.query.areas.findFirst({ where: eq(areas.id, area.id) });
      if (!areaStateBeforeDisarmCheck) continue;

      if (
        areaStateBeforeDisarmCheck.armedState !== ArmedState.DISARMED &&
        areaStateBeforeDisarmCheck.nextScheduledDisarmTime &&
        nowUtc >= areaStateBeforeDisarmCheck.nextScheduledDisarmTime 
      ) {
        await db.update(areas).set({
          armedState: ArmedState.DISARMED,
        }).where(eq(areas.id, areaStateBeforeDisarmCheck.id));
        console.log(`CRON: Area ${areaStateBeforeDisarmCheck.id} DISARMED by schedule at ${nowUtc.toISOString()}.`);
      }

    } catch (error) {
      console.error(`CRON: Error processing area ${area.id}:`, error);
    }
  }
  console.log(`CRON: processAreaArmingSchedules finished at ${new Date().toISOString()}`);
}

export async function skipNextScheduledArm(areaId: string) {
  if (!areaId) throw new Error("Area ID is required.");
  try {
    const area = await db.query.areas.findFirst({
      where: eq(areas.id, areaId),
      columns: { nextScheduledArmTime: true, id: true }
    });

    if (!area) throw new Error("Area not found.");
    const nextArmTime = area.nextScheduledArmTime ? new Date(area.nextScheduledArmTime) : null;

    if (!nextArmTime || nextArmTime <= new Date()) {
      return { success: false, error: "No future scheduled arm event to skip for this area." };
    }

    const skipUntilTimestamp = new Date(nextArmTime.getTime() + 5 * 60000); 

    const result = await db.update(areas)
      .set({
        isArmingSkippedUntil: skipUntilTimestamp,
      })
      .where(eq(areas.id, areaId))
      .returning();
    
    if (result.length === 0) throw new Error("Failed to update area for skipping.");
    console.log(`ACTION: Area ${areaId} next arming event (at ${nextArmTime.toISOString()}) will be skipped until ${skipUntilTimestamp.toISOString()}.`);
    return { success: true, area: result[0] };

  } catch (error) {
    console.error(`ACTION_ERROR: skipNextScheduledArm for ${areaId}:`, error);
    return { success: false, error: (error as Error).message };
  }
}

export async function getAreaSecurityStatus(areaId: string) {
  if (!areaId) throw new Error("Area ID is required.");
  try {
    const area = await db.query.areas.findFirst({
      where: eq(areas.id, areaId),
      with: {
        overrideArmingSchedule: true, 
        location: { 
          with: {
            activeArmingSchedule: true
          }
        }
      }
    });

    if (!area) {
      return { success: false, error: "Area not found." };
    }

    const nowUtc = new Date();
    let countdownToNextArmMs: number | null = null;
    let countdownToNextDisarmMs: number | null = null;
    let nextTransitionType: 'arm' | 'disarm' | null = null;
    let nextTransitionTimeUTC: Date | null = null;

    const nextArmTime = area.nextScheduledArmTime ? new Date(area.nextScheduledArmTime) : null;
    const nextDisarmTime = area.nextScheduledDisarmTime ? new Date(area.nextScheduledDisarmTime) : null;

    if (nextArmTime && nextArmTime > nowUtc) {
      countdownToNextArmMs = nextArmTime.getTime() - nowUtc.getTime();
      if (nextTransitionTimeUTC === null || nextArmTime < (nextTransitionTimeUTC as Date)) {
        nextTransitionTimeUTC = nextArmTime;
        nextTransitionType = 'arm';
      }
    }
    if (nextDisarmTime && nextDisarmTime > nowUtc) {
      countdownToNextDisarmMs = nextDisarmTime.getTime() - nowUtc.getTime();
      if (nextTransitionTimeUTC === null || nextDisarmTime < (nextTransitionTimeUTC as Date)) { 
        nextTransitionTimeUTC = nextDisarmTime;
        nextTransitionType = 'disarm';
      }
    }
    
    /*
    if (nextArmTime && nextArmTime > nowUtc && nextDisarmTime && nextDisarmTime > nowUtc) {
        if (nextArmTime < nextDisarmTime) {
            nextTransitionType = 'arm';
            nextTransitionTimeUTC = nextArmTime;
        } else {
            nextTransitionType = 'disarm';
            nextTransitionTimeUTC = nextDisarmTime;
        }
    } else if (nextArmTime && nextArmTime > nowUtc) {
        nextTransitionType = 'arm';
        nextTransitionTimeUTC = nextArmTime;
    } else if (nextDisarmTime && nextDisarmTime > nowUtc) {
        nextTransitionType = 'disarm
        nextTransitionTimeUTC = nextDisarmTime;
    }
    */

    return {
      success: true,
      status: {
        areaId: area.id,
        currentArmedState: area.armedState,
        nextScheduledArmTimeUTC: nextArmTime?.toISOString() || null,
        nextScheduledDisarmTimeUTC: nextDisarmTime?.toISOString() || null,
        isArmingSkippedUntilUTC: area.isArmingSkippedUntil ? new Date(area.isArmingSkippedUntil).toISOString() : null,
        countdownToNextArmMs,
        countdownToNextDisarmMs,
        nextTransitionType,
        nextTransitionTimeUTC: nextTransitionTimeUTC?.toISOString() || null,
        activeScheduleId: area.overrideArmingScheduleId || area.location?.activeArmingScheduleId || null,
        activeScheduleName: area.overrideArmingSchedule?.name || area.location?.activeArmingSchedule?.name || 'None',
        isOverrideScheduleActive: !!area.overrideArmingScheduleId,
      }
    };

  } catch (error) {
    console.error(`ACTION_ERROR: getAreaSecurityStatus for ${areaId}:`, error);
    return { success: false, error: (error as Error).message };
  }
} 