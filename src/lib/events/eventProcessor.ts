import { db } from '@/data/db';
import {
  events as eventsTableSchema, // Alias to avoid naming conflict with the 'events' variable
  devices as devicesTableSchema,
  areas as areasTableSchema,
  areaDevices as areaDevicesTableSchema,
  connectors as connectorsTableSchema,
  automations as automationsTableSchema,
} from '@/data/db/schema';
import type { StandardizedEvent } from '@/types/events';
import { eq, and, InferSelectModel } from 'drizzle-orm';
import { ArmedState, EventType, EVENT_CATEGORY_DISPLAY_MAP, EVENT_TYPE_DISPLAY_MAP, EVENT_SUBTYPE_DISPLAY_MAP, DeviceType } from '@/lib/mappings/definitions';
import { isSecurityRiskEvent } from '@/lib/security/alarmLogic';
import { processEvent as processEventForAutomations } from '@/services/automation-service'; // Import automation service
import { getRedisPubClient } from '@/lib/redis/client';
import { getEventChannelName, getEventThumbnailChannelName, type RedisEventMessage } from '@/lib/redis/types';
import { shouldFetchThumbnail, fetchEventThumbnail, type EventThumbnailData } from '@/services/event-thumbnail-fetcher';
import { getDeviceTypeInfo } from '@/lib/mappings/identification';
import { findAreaCameras } from '@/services/event-thumbnail-resolver';
import { AutomationThumbnailAnalyzer } from '@/services/automation-thumbnail-analyzer';
import { createThumbnailContext } from '@/types/automation-thumbnails';
import { getThumbnailSource } from '@/services/event-thumbnail-resolver';

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
  deviceInfo: any,
  thumbnailData?: EventThumbnailData | null
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
    deviceId: event.deviceId,
    deviceName: deviceInfo?.name, // Will be undefined if device not found - that's ok
    connectorId: event.connectorId,
    connectorName: connector.name,
    locationId,
    locationName,
    areaId,
    areaName,
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
    thumbnailData: thumbnailData || undefined
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

    // 3. Check thumbnail requirements from both SSE and automations
    let thumbnailData: EventThumbnailData | null = null;
    
    // Get area cameras if event has an area association
    const areaId = internalDeviceRecord?.areaDevices?.[0]?.area?.id;
    let areaCameras: any[] = [];
    
    if (areaId && connector?.organizationId) {
      try {
        // Fetch all devices to find area cameras
        const allDevices = await db.query.devices.findMany({
          with: {
            connector: true,
            areaDevices: {
              with: {
                area: true
              }
            }
          }
        });
        
        // Map to the format expected by shared service
        const devicesWithArea = allDevices.map(device => ({
          ...device,
          areaId: device.areaDevices?.[0]?.areaId,
          connectorCategory: device.connector?.category || 'unknown',
          deviceTypeInfo: getDeviceTypeInfo(device.connector?.category || 'unknown', device.type)
        }));
        
        // Use shared service to find area cameras
        areaCameras = findAreaCameras(areaId, devicesWithArea);
        
        if (areaCameras.length > 0) {
          console.log(`[EventProcessor] Found ${areaCameras.length} Piko camera(s) in area ${areaId} for event ${event.eventId}`);
        } else {
          console.log(`[EventProcessor] No Piko cameras found in area ${areaId} for event ${event.eventId}`);
        }
      } catch (cameraFetchError) {
        console.warn(`[EventProcessor] Failed to fetch area cameras for event ${event.eventId}:`, cameraFetchError);
        // Continue without area cameras
      }
    }

    // Check if thumbnail is needed
    let thumbnailNeeded = false;
    let sseSubscriberCount = 0;
    let automationRequiresThumbnail = false;

    if (connector?.organizationId) {
      const pubClient = getRedisPubClient();
      
      // Check SSE subscribers
      if (shouldFetchThumbnail(event, areaCameras)) {
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
        
        // Convert area cameras to the format expected by thumbnail fetcher
        const areaCameraDevices = areaCameras.map(cam => ({
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
        
        thumbnailData = await fetchEventThumbnail(event, areaCameraDevices);
        
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
        
        const areaName = baseMessage.areaName;
        const locationName = baseMessage.locationName;
        const thumbnailStatus = thumbnailData ? `with thumbnail (${thumbnailData.size} bytes)` : 'no thumbnail';
        console.log(`[EventProcessor] Event ${event.eventId} published to channel(s): ${baseChannel}${sseSubscriberCount > 0 ? ` and ${thumbnailChannel} (${thumbnailStatus})` : ''} (area: ${areaName || 'none'}, location: ${locationName || 'none'})`);
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

      // 5. Alarm Logic Integration (reuse area info from device lookup)
      try {
        const areaDevice = internalDeviceRecord.areaDevices?.[0];
        if (areaDevice?.area) {
          const area = areaDevice.area;
          
          if (area.armedState === ArmedState.ARMED) {
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

    // 6. Process event for automations with thumbnail context
    try {
      console.log(`[EventProcessor] Sending event ${event.eventId} to AutomationService${thumbnailData ? ' with thumbnail' : ''}.`);
      
      // Create thumbnail context for automation service
      const thumbnailContext = thumbnailData ? 
        createThumbnailContext(thumbnailData, getThumbnailSource(event, areaCameras) ?? undefined) : 
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