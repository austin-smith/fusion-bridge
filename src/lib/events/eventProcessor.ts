import { db } from '@/data/db';
import {
  events as eventsTableSchema, // Alias to avoid naming conflict with the 'events' variable
  devices as devicesTableSchema,
  alarmZones as alarmZonesTableSchema,
  alarmZoneDevices as alarmZoneDevicesTableSchema,
  alarmZoneTriggerOverrides as alarmZoneTriggerOverridesTableSchema,
  alarmZoneAuditLog as alarmZoneAuditLogTableSchema,
  connectors as connectorsTableSchema,
  automations as automationsTableSchema,
  spaceDevices as spaceDevicesTableSchema,
  spaces,
} from '@/data/db/schema';
import type { StandardizedEvent } from '@/types/events';
import { eq, and, InferSelectModel } from 'drizzle-orm';
import { ArmedState, EventType, EVENT_CATEGORY_DISPLAY_MAP, EVENT_TYPE_DISPLAY_MAP, EVENT_SUBTYPE_DISPLAY_MAP, DeviceType } from '@/lib/mappings/definitions';
import { shouldTriggerAlarm } from '@/lib/alarm-event-types';
import { createAlarmZonesRepository } from '@/data/repositories/alarm-zones';
import { processEvent as processEventForAutomations } from '@/services/automation-service'; // Import automation service
import { getRedisPubClient } from '@/lib/redis/client';
import { getEventChannelName, getEventThumbnailChannelName, type RedisEventMessage } from '@/lib/redis/types';
import { shouldFetchThumbnail, fetchEventThumbnail, type EventThumbnailData } from '@/services/event-thumbnail-fetcher';
import { getDeviceTypeInfo } from '@/lib/mappings/identification';
import { findSpaceCameras } from '@/services/event-thumbnail-resolver';
import { AutomationThumbnailAnalyzer } from '@/services/automation-thumbnail-analyzer';
import { createThumbnailContext } from '@/types/automation-thumbnails';
import { getThumbnailSource } from '@/services/event-thumbnail-resolver';

// Infer types from schemas
type Device = InferSelectModel<typeof devicesTableSchema>;

/**
 * Creates an enriched Redis message with location and space information
 * Gracefully handles missing device info by publishing event without enrichment
 */
async function createEnrichedRedisMessage(
  event: StandardizedEvent, 
  connector: any, 
  deviceInfo: any,
  thumbnailData?: EventThumbnailData | null
): Promise<RedisEventMessage> {
  // Extract location and space information if device is associated
  let locationId: string | undefined;
  let locationName: string | undefined;
  let spaceId: string | undefined;
  let spaceName: string | undefined;
  let alarmZoneId: string | undefined;
  let alarmZoneName: string | undefined;

  if (deviceInfo?.spaceDevices) {
    const spaceDevice = deviceInfo.spaceDevices;
    if (spaceDevice.space) {
      spaceId = spaceDevice.space.id;
      spaceName = spaceDevice.space.name;
      
      if (spaceDevice.space.location) {
        locationId = spaceDevice.space.location.id;
        locationName = spaceDevice.space.location.name;
      }
    }
  }

  // Get alarm zone for this device if we have device info (one zone per device)
  if (deviceInfo?.id) {
    try {
      const deviceAlarmZone = await db.query.alarmZoneDevices.findFirst({
        where: eq(alarmZoneDevicesTableSchema.deviceId, deviceInfo.id),
        with: {
          zone: {
            columns: {
              id: true,
              name: true
            }
          }
        }
      });
      
      if (deviceAlarmZone) {
        alarmZoneId = deviceAlarmZone.zone.id;
        alarmZoneName = deviceAlarmZone.zone.name;
      }
    } catch (alarmZoneError) {
      console.warn(`[EventProcessor] Failed to fetch alarm zone for device ${deviceInfo.id}:`, alarmZoneError);
    }
  }

  return {
    eventUuid: event.eventId,
    timestamp: event.timestamp.toISOString(),
    organizationId: connector.organizationId,
    deviceId: event.deviceId,
    deviceName: deviceInfo?.name, // Will be undefined if device not found - that's ok
    connectorId: event.connectorId,
    connectorName: connector.name,
    locationId,
    locationName,
    spaceId,
    spaceName,
    alarmZoneId,
    alarmZoneName,
    event: {
      ...event.payload, // Spread the standardized payload data into the event object first
      categoryId: event.category,
      category: EVENT_CATEGORY_DISPLAY_MAP[event.category] || event.category,
      typeId: event.type,
      type: EVENT_TYPE_DISPLAY_MAP[event.type] || event.type,
      subTypeId: event.subtype,
      subType: event.subtype ? (EVENT_SUBTYPE_DISPLAY_MAP[event.subtype] || event.subtype) : undefined,
    },
    rawEvent: event.originalEvent,
    thumbnailUri: thumbnailData ? `data:${thumbnailData.contentType};base64,${thumbnailData.data}` : undefined
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
            spaceDevices: {
              with: {
                space: {
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

    // 3. Check thumbnail requirements from both SSE and automations
    let thumbnailData: EventThumbnailData | null = null;
    
    // Get space cameras if event has a space association
    const spaceDeviceAssociation = internalDeviceRecord?.spaceDevices;
    const spaceId = spaceDeviceAssociation?.space?.id;
    let spaceCameras: any[] = [];
    
    if (spaceId && connector?.organizationId) {
      try {
        // Fetch all devices to find space cameras
        const allDevices = await db.query.devices.findMany({
          with: {
            connector: true,
            spaceDevices: {
              with: {
                space: true
              }
            }
          }
        });
        
        // Map to the format expected by shared service
        const devicesWithSpace = allDevices.map(device => {
          const spaceAssociation = device.spaceDevices;
          return {
            ...device,
            spaceId: spaceAssociation?.space?.id,
            connectorCategory: device.connector?.category || 'unknown',
            deviceTypeInfo: getDeviceTypeInfo(device.connector?.category || 'unknown', device.type)
          };
        });
        
        // Use space-based camera lookup
        spaceCameras = findSpaceCameras(spaceId, devicesWithSpace);
        
        if (spaceCameras.length > 0) {
          console.log(`[EventProcessor] Found ${spaceCameras.length} Piko camera(s) in space ${spaceId} for event ${event.eventId}`);
        } else {
          console.log(`[EventProcessor] No Piko cameras found in space ${spaceId} for event ${event.eventId}`);
        }
      } catch (cameraFetchError) {
        console.warn(`[EventProcessor] Failed to fetch space cameras for event ${event.eventId}:`, cameraFetchError);
        // Continue without space cameras
      }
    }

    // Check if thumbnail is needed
    let thumbnailNeeded = false;
    let sseSubscriberCount = 0;
    let automationRequiresThumbnail = false;

    if (connector?.organizationId) {
      const pubClient = getRedisPubClient();
      
      // Check SSE subscribers
      if (shouldFetchThumbnail(event, spaceCameras)) {
        try {
          const thumbnailChannel = getEventThumbnailChannelName(connector.organizationId);
          const [, subscriberCount] = await pubClient.pubsub('NUMSUB', thumbnailChannel) as [string, number];
          sseSubscriberCount = subscriberCount;
          
          if (subscriberCount > 0) {
            console.log(`[EventProcessor] Event ${event.eventId} has ${subscriberCount} SSE thumbnail subscribers`);
            thumbnailNeeded = true;
          }
        } catch (sseError) {
          console.warn(`[EventProcessor] Failed to check SSE subscribers for event ${event.eventId}:`, sseError);
        }
      }

      // Check automation thumbnail requirements
      try {
        // Get enabled automations for this organization
        const orgAutomations = await db.query.automations.findMany({
          where: and(
            eq(automationsTableSchema.organizationId, connector.organizationId),
            eq(automationsTableSchema.enabled, true)
          ),
          columns: {
            id: true,
            configJson: true,
          }
        });

        if (orgAutomations.length > 0) {
          // Check if any automation needs thumbnails
          const automationConfigs = orgAutomations.map(automation => ({
            id: automation.id,
            config: automation.configJson
          }));

          automationRequiresThumbnail = await AutomationThumbnailAnalyzer.organizationRequiresThumbnails(
            connector.organizationId,
            automationConfigs
          );

          if (automationRequiresThumbnail) {
            console.log(`[EventProcessor] Event ${event.eventId} - automations in organization ${connector.organizationId} require thumbnails`);
            thumbnailNeeded = true;
          }
        }
      } catch (automationError) {
        console.warn(`[EventProcessor] Failed to check automation thumbnail requirements for event ${event.eventId}:`, automationError);
      }
    }

    // Fetch thumbnail if needed by either SSE or automations
    if (thumbnailNeeded && connector?.organizationId) {
      try {
        console.log(`[EventProcessor] Fetching thumbnail for event ${event.eventId} (SSE: ${sseSubscriberCount > 0}, Automations: ${automationRequiresThumbnail})`);
        
        // Convert space cameras to the format expected by thumbnail fetcher
        const spaceCameraDevices = spaceCameras.map((cam: any) => ({
          id: cam.id,
          deviceId: cam.deviceId,
          connectorId: cam.connectorId,
          connectorCategory: cam.connector?.category || 'piko',
          deviceTypeInfo: getDeviceTypeInfo(cam.connector?.category || 'piko', cam.type),
          name: cam.name,
          type: cam.type,
          status: cam.status,
          batteryPercentage: cam.batteryPercentage,
          vendor: cam.vendor,
          model: cam.model,
          url: cam.url,
          createdAt: cam.createdAt,
          updatedAt: cam.updatedAt
        }));
        
        thumbnailData = await fetchEventThumbnail(event, spaceCameraDevices);
        
        if (thumbnailData) {
          console.log(`[EventProcessor] Thumbnail fetched successfully for event ${event.eventId} (${thumbnailData.size} bytes)`);
        } else {
          console.log(`[EventProcessor] No thumbnail available for event ${event.eventId}`);
        }
      } catch (thumbnailError) {
        console.error(`[EventProcessor] Error fetching thumbnail for event ${event.eventId}:`, thumbnailError);
        // Continue without thumbnail - this should not fail event processing
      }
    }

    // Publish event to Redis for real-time distribution
    try {
      if (connector?.organizationId) {
        const baseChannel = getEventChannelName(connector.organizationId);
        const thumbnailChannel = getEventThumbnailChannelName(connector.organizationId);
        const pubClient = getRedisPubClient();
        
        // Always create and publish base message (without thumbnail)
        const baseMessage = await createEnrichedRedisMessage(event, connector, internalDeviceRecord);
        await pubClient.publish(baseChannel, JSON.stringify(baseMessage));
        
        // Check if thumbnail channel has subscribers and always publish if they exist
        if (sseSubscriberCount > 0) {
          // Always publish to thumbnail channel when there are subscribers
          // Include thumbnail data if available, null if not
          const messageForThumbnailChannel = await createEnrichedRedisMessage(event, connector, internalDeviceRecord, thumbnailData);
          await pubClient.publish(thumbnailChannel, JSON.stringify(messageForThumbnailChannel));
        }
        
        const spaceName = baseMessage.spaceName;
        const locationName = baseMessage.locationName;
        const thumbnailStatus = thumbnailData ? `with thumbnail (${thumbnailData.size} bytes)` : 'no thumbnail';
        console.log(`[EventProcessor] Event ${event.eventId} published to channel(s): ${baseChannel}${sseSubscriberCount > 0 ? ` and ${thumbnailChannel} (${thumbnailStatus})` : ''} (space: ${spaceName || 'none'}, location: ${locationName || 'none'})`);
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
      // 4. Device Status and Battery Update (if applicable and device found)
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

      // 5. Alarm Zone Logic Integration
      try {
        if (connector?.organizationId) {
          const alarmZonesRepo = createAlarmZonesRepository(connector.organizationId);
          
          // Get the alarm zone for this device (one device per zone)
          const deviceZone = await alarmZonesRepo.getDeviceZone(internalDeviceRecord.id);
          
          if (deviceZone) {
            // Only process alarm triggers for ARMED zones
            if (deviceZone.armedState === ArmedState.ARMED) {
              let shouldTrigger = false;
              
              // Determine if event should trigger based on zone's trigger behavior
              if (deviceZone.triggerBehavior === 'standard') {
                // Use standard trigger logic from alarm-event-types.ts
                const displayState = (event.payload as any)?.displayState;
                shouldTrigger = shouldTriggerAlarm(event.type, event.subtype, displayState);
              } else if (deviceZone.triggerBehavior === 'custom') {
                // Check trigger overrides first, fallback to standard behavior
                const overrides = await alarmZonesRepo.getTriggerOverrides(deviceZone.id);
                const override = overrides.find(o => o.eventType === event.type);
                
                if (override) {
                  // Use custom override
                  shouldTrigger = override.shouldTrigger;
                } else {
                  // Fallback to standard behavior
                  const displayState = (event.payload as any)?.displayState;
                  shouldTrigger = shouldTriggerAlarm(event.type, event.subtype, displayState);
                }
              }
              
              if (shouldTrigger) {
                // Trigger the alarm zone with audit logging
                await alarmZonesRepo.setArmedState(
                  deviceZone.id,
                  ArmedState.TRIGGERED,
                  undefined, // No user ID for system-triggered events
                  'alarm_event_trigger',
                  event.eventId
                );
                console.log(`[EventProcessor] Alarm zone ${deviceZone.id} set to TRIGGERED due to event ${event.eventId} from device ${event.deviceId}.`);
                // TODO: Trigger notifications here (e.g., send email, push notification)
              }
            } else {
              // Zone is DISARMED or already TRIGGERED - no action needed
              console.log(`[EventProcessor] Device ${event.deviceId} in zone ${deviceZone.id} (state: ${deviceZone.armedState}) - no alarm processing needed.`);
            }
          } else {
            // Device not assigned to any alarm zone
            console.log(`[EventProcessor] Device ${event.deviceId} not assigned to any alarm zone - no alarm processing.`);
          }
        }
      } catch (alarmError) {
        console.error(`[EventProcessor] Error during alarm zone logic for event ${event.eventId} (device ${event.deviceId}):`, alarmError);
      }
    } // End of if(internalDeviceRecord)

    // 6. Process event for automations with thumbnail context
    try {
      console.log(`[EventProcessor] Sending event ${event.eventId} to AutomationService${thumbnailData ? ' with thumbnail' : ''}.`);
      
      // Create thumbnail context for automation service
      const thumbnailContext = thumbnailData ? 
        createThumbnailContext(thumbnailData, getThumbnailSource(event, spaceCameras) ?? undefined) : 
        null;
      
      // Store thumbnail context on the event for the automation service to access
      if (thumbnailContext) {
        (event as any)._thumbnailContext = thumbnailContext;
      }
      
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