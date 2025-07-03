import { db } from '@/data/db';
import {
  events as eventsTableSchema, // Alias to avoid naming conflict with the 'events' variable
  devices as devicesTableSchema,
  areas as areasTableSchema,
  areaDevices as areaDevicesTableSchema,
  connectors as connectorsTableSchema,
} from '@/data/db/schema';
import type { StandardizedEvent } from '@/types/events';
import { eq, and, InferSelectModel } from 'drizzle-orm';
import { ArmedState, EventType, EVENT_CATEGORY_DISPLAY_MAP, EVENT_TYPE_DISPLAY_MAP, EVENT_SUBTYPE_DISPLAY_MAP } from '@/lib/mappings/definitions';
import { isSecurityRiskEvent } from '@/lib/security/alarmLogic';
import { processEvent as processEventForAutomations } from '@/services/automation-service'; // Import automation service
import { getRedisPubClient } from '@/lib/redis/client';
import { getEventChannelName, type RedisEventMessage } from '@/lib/redis/types';

// Infer types from schemas
type Device = InferSelectModel<typeof devicesTableSchema>;
type Area = InferSelectModel<typeof areasTableSchema>;

/**
 * Creates an enriched Redis message with location and area information
 * Gracefully handles missing device info by publishing event without enrichment
 */
async function createEnrichedRedisMessage(
  event: StandardizedEvent, 
  connector: any, 
  deviceInfo: any
): Promise<RedisEventMessage> {
  // Extract location and area information if device is associated
  let locationId: string | undefined;
  let locationName: string | undefined;
  let areaId: string | undefined;
  let areaName: string | undefined;

  if (deviceInfo?.areaDevices?.[0]) {
    const areaDevice = deviceInfo.areaDevices[0];
    if (areaDevice.area) {
      areaId = areaDevice.area.id;
      areaName = areaDevice.area.name;
      
      if (areaDevice.area.location) {
        locationId = areaDevice.area.location.id;
        locationName = areaDevice.area.location.name;
      }
    }
  }

  return {
    eventUuid: event.eventId,
    timestamp: event.timestamp.toISOString(),
    organizationId: connector.organizationId,
    eventCategory: event.category,
    eventCategoryDisplayName: EVENT_CATEGORY_DISPLAY_MAP[event.category] || event.category,
    eventType: event.type,
    eventTypeDisplayName: EVENT_TYPE_DISPLAY_MAP[event.type] || event.type,
    eventSubtype: event.subtype,
    eventSubtypeDisplayName: event.subtype ? (EVENT_SUBTYPE_DISPLAY_MAP[event.subtype] || event.subtype) : undefined,
    deviceId: event.deviceId,
    deviceName: deviceInfo?.name, // Will be undefined if device not found - that's ok
    connectorId: event.connectorId,
    connectorName: connector.name,
    locationId,
    locationName,
    areaId,
    areaName,
    payload: event.payload,
    rawPayload: event.originalEvent
  };
}

/**
 * Processes a standardized event: persists it, updates device status,
 * and triggers alarm logic if necessary.
 * @param event The StandardizedEvent object.
 */
export async function processAndPersistEvent(event: StandardizedEvent): Promise<void> {
  console.log(`[EventProcessor] Received event: ${event.eventId}, Type: ${event.type}, DeviceID: ${event.deviceId}`);

  try {
    // 1. Persist the Standardized Event
    let rawEventType: string | null = null;
    if (typeof event.originalEvent === 'object' && event.originalEvent !== null && 'event' in event.originalEvent && typeof event.originalEvent.event === 'string') {
      rawEventType = event.originalEvent.event;
    } else if (typeof event.originalEvent === 'object' && event.originalEvent !== null && 'Descname' in event.originalEvent && typeof event.originalEvent.Descname === 'string') {
      // Handling for Netbox-like structures where Descname might be the raw type
      rawEventType = event.originalEvent.Descname;
    }
    // Add more conditions if other raw event structures are common

    await db.insert(eventsTableSchema).values({
      eventUuid: event.eventId,
      timestamp: event.timestamp,
      connectorId: event.connectorId,
      deviceId: event.deviceId, // This is the external device ID from the connector
      standardizedEventCategory: event.category,
      standardizedEventType: event.type,
      standardizedEventSubtype: event.subtype || null,
      rawEventType: rawEventType,
      standardizedPayload: event.payload as any, // Drizzle expects specific JSON type or string, cast for now
      rawPayload: event.originalEvent as any,    // Drizzle expects specific JSON type or string, cast for now
    });
    console.log(`[EventProcessor] Event ${event.eventId} persisted to database.`);

    // 2. Get comprehensive device and connector information for all processing
    const deviceLookup = await db.query.connectors.findFirst({
      where: eq(connectorsTableSchema.id, event.connectorId),
      with: {
        devices: {
          where: and(
            eq(devicesTableSchema.connectorId, event.connectorId),
            eq(devicesTableSchema.deviceId, event.deviceId)
          ),
          limit: 1,
          with: {
            areaDevices: {
              with: {
                area: {
                  with: {
                    location: true
                  }
                }
              }
            }
          }
        }
      }
    });

    const connector = deviceLookup;
    const internalDeviceRecord = connector?.devices?.[0];

    // Publish event to Redis for real-time distribution
    try {
      if (connector?.organizationId) {
        const enrichedMessage = await createEnrichedRedisMessage(event, connector, internalDeviceRecord);
        
        const channel = getEventChannelName(connector.organizationId);
        const pubClient = getRedisPubClient();
        await pubClient.publish(channel, JSON.stringify(enrichedMessage));
        
        const areaName = enrichedMessage.areaName;
        const locationName = enrichedMessage.locationName;
        console.log(`[EventProcessor] Event ${event.eventId} published to Redis channel: ${channel} (area: ${areaName || 'none'}, location: ${locationName || 'none'})`);
      } else {
        console.warn(`[EventProcessor] Could not publish event ${event.eventId} to Redis: missing organizationId`);
      }
    } catch (redisError) {
      // Don't fail the entire event processing if Redis publish fails
      console.error(`[EventProcessor] Failed to publish event ${event.eventId} to Redis:`, redisError);
    }

    if (!internalDeviceRecord || !internalDeviceRecord.id) {
      console.warn(`[EventProcessor] Device not found in DB for connectorId: ${event.connectorId}, deviceId: ${event.deviceId}. Skipping status update and alarm logic for this event path.`);
      // We might still want to process for automations if the event is not device-specific or if automations can handle events without full device context
      // For now, let's proceed to automations even if device context is limited.
    } else {
      // 3. Device Status and Battery Update (if applicable and device found)
      const updateData: { status?: string; batteryPercentage?: number; updatedAt: Date } = {
        updatedAt: new Date()
      };

      // Check for status update (STATE_CHANGED events)
      if (event.type === EventType.STATE_CHANGED && event.payload?.displayState && typeof event.payload.displayState === 'string') {
        updateData.status = event.payload.displayState;
      }

      // Check for battery update (any event with battery data)
      if (event.payload?.batteryPercentage !== undefined && typeof event.payload.batteryPercentage === 'number') {
        const batteryPercentage = event.payload.batteryPercentage;
        if (batteryPercentage >= 0 && batteryPercentage <= 100) {
          updateData.batteryPercentage = batteryPercentage;
        } else {
          console.warn(`[EventProcessor] Invalid battery percentage ${batteryPercentage} for device ${event.deviceId}. Expected 0-100.`);
        }
      }

      // Perform single database update if there's anything to update
      if (updateData.status !== undefined || updateData.batteryPercentage !== undefined) {
        try {
          await db.update(devicesTableSchema)
            .set(updateData)
            .where(eq(devicesTableSchema.id, internalDeviceRecord.id));
          
          const updates: string[] = [];
          if (updateData.status) updates.push(`status to '${updateData.status}'`);
          if (updateData.batteryPercentage !== undefined) updates.push(`battery to ${updateData.batteryPercentage}%`);
          console.log(`[EventProcessor] Device ${internalDeviceRecord.id} updated: ${updates.join(', ')}.`);
        } catch (dbError) {
          console.error(`[EventProcessor] Failed to update device ${internalDeviceRecord.id}:`, dbError);
        }
      }

      // 4. Alarm Logic Integration (reuse area info from device lookup)
      try {
        const areaDevice = internalDeviceRecord.areaDevices?.[0];
        if (areaDevice?.area) {
          const area = areaDevice.area;
          
          if (area.armedState === ArmedState.ARMED_AWAY || area.armedState === ArmedState.ARMED_STAY) {
            // Pass the Partial<Device> we fetched. isSecurityRiskEvent is designed to handle this.
            const isRisk = isSecurityRiskEvent(event, internalDeviceRecord as Partial<Device>); 

            if (isRisk) {
              // If area is armed (AWAY or STAY) and a risk event occurs, always set to TRIGGERED.
              await db.update(areasTableSchema)
                .set({
                  armedState: ArmedState.TRIGGERED,
                  updatedAt: new Date(),
                })
                .where(eq(areasTableSchema.id, area.id));
              console.log(`[EventProcessor] Area ${area.id} set to TRIGGERED due to event ${event.eventId} from device ${internalDeviceRecord.id}.`);
              // TODO: Trigger notifications here (e.g., send email, push notification)
            }
          }
        }
      } catch (alarmError) {
        console.error(`[EventProcessor] Error during alarm logic for event ${event.eventId} (device ${internalDeviceRecord.id}):`, alarmError);
      }
    } // End of if(internalDeviceRecord)

    // 5. Process event for automations
    try {
      console.log(`[EventProcessor] Sending event ${event.eventId} to AutomationService.`);
      await processEventForAutomations(event);
    } catch (automationError) {
      console.error(`[EventProcessor] Error during automation processing for event ${event.eventId}:`, automationError);
    }
    
    console.log(`[EventProcessor] Event ${event.eventId} fully processed.`);

  } catch (error) {
    console.error(`[EventProcessor] Failed to process or persist event ${event.eventId}:`, error);
    // Depending on requirements, you might want to re-throw or handle specific errors differently
  }
} 