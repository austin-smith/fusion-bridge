import { db } from '@/data/db';
import { alarmZones, locations } from '@/data/db/schema';
import { ArmedState, ArmedStateDisplayNames } from '@/lib/mappings/definitions';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import type { AlarmZone } from '@/types/index';
import { getRedisPubClient } from '@/lib/redis/client';
import { getEventChannelName, getEventThumbnailChannelName, type SSEArmingMessage } from '@/lib/redis/types';
import { createAlarmZonesRepository } from '@/data/repositories/alarm-zones';

// Zod schemas for validation
const zUUID = z.string().uuid();
const zArmedState = z.nativeEnum(ArmedState);

/**
 * Internal function to set alarm zone armed state with audit logging and Redis publishing
 * This is the core function for all manual zone state changes
 */
export async function internalSetAlarmZoneArmedState(
  zoneId: string,
  armedState: ArmedState,
  userId?: string,
  reason?: string,
  triggerEventId?: string
): Promise<AlarmZone | null> {
  // Validate inputs
  const validatedZoneId = zUUID.parse(zoneId);
  const validatedArmedState = zArmedState.parse(armedState);

  try {
    // Fetch current zone state with location for context
    const [currentZone] = await db.select({
      id: alarmZones.id,
      armedState: alarmZones.armedState,
      locationId: alarmZones.locationId,
      name: alarmZones.name
    })
      .from(alarmZones)
      .where(eq(alarmZones.id, validatedZoneId))
      .limit(1);

    if (!currentZone) {
      console.warn(`[AlarmZoneActions] Alarm zone not found: ${validatedZoneId}`);
      return null;
    }

    // Store previous state for the message
    const previousState = currentZone.armedState;

    // Use repository to set armed state (includes audit logging)
    const zoneWithLocation = await db.query.alarmZones.findFirst({
      where: eq(alarmZones.id, validatedZoneId),
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

    if (!zoneWithLocation || !zoneWithLocation.location) {
      console.error(`[AlarmZoneActions] Failed to fetch zone context: ${validatedZoneId}`);
      return null;
    }

    // Use repository for state change with audit logging
    if (!zoneWithLocation.location.organizationId) {
      throw new Error('Location organizationId is required but was null');
    }
    
    const alarmZonesRepo = createAlarmZonesRepository(zoneWithLocation.location.organizationId);
    const updatedZone = await alarmZonesRepo.setArmedState(
      validatedZoneId,
      validatedArmedState,
      userId,
      reason || 'manual',
      triggerEventId
    );

    if (!updatedZone) {
      console.warn(`[AlarmZoneActions] Failed to update alarm zone: ${validatedZoneId}`);
      return null;
    }

    // Publish alarm zone state change message to Redis
    if (zoneWithLocation.location.organizationId) {
      try {
        const alarmZoneMessage: SSEArmingMessage = {
          type: 'arming',
          organizationId: zoneWithLocation.location.organizationId,
          timestamp: new Date().toISOString(),
          alarmZone: {
            id: updatedZone.id,
            name: updatedZone.name,
            locationId: updatedZone.locationId,
            locationName: zoneWithLocation.location.name,
            previousState: previousState,
            previousStateDisplayName: ArmedStateDisplayNames[previousState],
            currentState: validatedArmedState,
            currentStateDisplayName: ArmedStateDisplayNames[validatedArmedState]
          }
        };

        const channel = getEventChannelName(zoneWithLocation.location.organizationId);
        const thumbnailChannel = getEventThumbnailChannelName(zoneWithLocation.location.organizationId);
        const pubClient = getRedisPubClient();
        
        // Always publish to regular channel
        await pubClient.publish(channel, JSON.stringify(alarmZoneMessage));
        
        // Also publish to thumbnail channel if there are subscribers
        const [, thumbnailSubscriberCount] = await pubClient.pubsub('NUMSUB', thumbnailChannel) as [string, number];
        if (thumbnailSubscriberCount > 0) {
          await pubClient.publish(thumbnailChannel, JSON.stringify(alarmZoneMessage));
        }
        
        const channelsPublished = thumbnailSubscriberCount > 0 ? `${channel} and ${thumbnailChannel}` : channel;
        console.log(`[AlarmZoneActions] Published alarm zone message for zone ${validatedZoneId}: ${previousState} -> ${validatedArmedState} to channel(s): ${channelsPublished}`);
      } catch (redisError) {
        // Don't fail the operation if Redis publish fails
        console.error(`[AlarmZoneActions] Failed to publish alarm zone message for zone ${validatedZoneId}:`, redisError);
      }
    }
    
    return updatedZone as AlarmZone;

  } catch (error) {
    console.error(`[AlarmZoneActions] Error setting alarm zone armed state for ${validatedZoneId}:`, error);
    throw error;
  }
}

/**
 * Manually arm an alarm zone
 */
export async function armAlarmZone(
  zoneId: string,
  userId?: string
): Promise<AlarmZone | null> {
  return internalSetAlarmZoneArmedState(
    zoneId,
    ArmedState.ARMED,
    userId,
    'manual'
  );
}

/**
 * Manually disarm an alarm zone
 */
export async function disarmAlarmZone(
  zoneId: string,
  userId?: string
): Promise<AlarmZone | null> {
  return internalSetAlarmZoneArmedState(
    zoneId,
    ArmedState.DISARMED,
    userId,
    'manual'
  );
}

/**
 * Acknowledge and disarm a triggered alarm zone
 */
export async function acknowledgeAlarmZone(
  zoneId: string,
  userId?: string
): Promise<AlarmZone | null> {
  return internalSetAlarmZoneArmedState(
    zoneId,
    ArmedState.DISARMED,
    userId,
    'manual'
  );
} 