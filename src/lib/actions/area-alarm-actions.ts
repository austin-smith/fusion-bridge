import { db } from '@/data/db';
import { areas, locations, armingSchedules } from '@/data/db/schema';
import { ArmedState } from '@/lib/mappings/definitions';
import { eq, and, or, sql } from 'drizzle-orm';

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
            armedState: ArmedState.ARMED_AWAY, 
            lastArmedStateChangeReason: 'scheduled_arm',
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
          lastArmedStateChangeReason: 'scheduled_disarm',
        }).where(eq(areas.id, areaStateBeforeDisarmCheck.id));
        console.log(`CRON: Area ${areaStateBeforeDisarmCheck.id} DISARMED by schedule at ${nowUtc.toISOString()}.`);
      }

    } catch (error) {
      console.error(`CRON: Error processing area ${area.id}:`, error);
    }
  }
  console.log(`CRON: processAreaArmingSchedules finished at ${new Date().toISOString()}`);
}

export async function armAreaNow(areaId: string) {
  if (!areaId) throw new Error("Area ID is required.");
  try {
    const result = await db.update(areas)
      .set({
        armedState: ArmedState.ARMED_AWAY,
        lastArmedStateChangeReason: 'manual_arm',
        isArmingSkippedUntil: null, 
        nextScheduledArmTime: null, 
        nextScheduledDisarmTime: null, 
      })
      .where(eq(areas.id, areaId))
      .returning();
    if (result.length === 0) throw new Error("Area not found or update failed.");
    console.log(`ACTION: Area ${areaId} ARMED manually.`);
    return { success: true, area: result[0] };
  } catch (error) {
    console.error(`ACTION_ERROR: armAreaNow for ${areaId}:`, error);
    return { success: false, error: (error as Error).message };
  }
}

export async function disarmAreaNow(areaId: string) {
  if (!areaId) throw new Error("Area ID is required.");
  try {
    const result = await db.update(areas)
      .set({
        armedState: ArmedState.DISARMED,
        lastArmedStateChangeReason: 'manual_disarm',
        isArmingSkippedUntil: null, 
        nextScheduledArmTime: null, 
        nextScheduledDisarmTime: null, 
      })
      .where(eq(areas.id, areaId))
      .returning();
    if (result.length === 0) throw new Error("Area not found or update failed.");
    console.log(`ACTION: Area ${areaId} DISARMED manually.`);
    return { success: true, area: result[0] };
  } catch (error) {
    console.error(`ACTION_ERROR: disarmAreaNow for ${areaId}:`, error);
    return { success: false, error: (error as Error).message };
  }
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
        lastArmedStateChangeReason: 'skip_scheduled_arm_request',
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
        lastArmedStateChangeReason: area.lastArmedStateChangeReason,
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