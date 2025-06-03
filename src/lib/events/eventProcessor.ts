import { db } from '@/data/db';
import {
  events as eventsTableSchema, // Alias to avoid naming conflict with the 'events' variable
  devices as devicesTableSchema,
  areas as areasTableSchema,
  areaDevices as areaDevicesTableSchema,
} from '@/data/db/schema';
import type { StandardizedEvent } from '@/types/events';
import { eq, and, InferSelectModel } from 'drizzle-orm';
import { ArmedState, EventType } from '@/lib/mappings/definitions';
import { isSecurityRiskEvent } from '@/lib/security/alarmLogic';
import { processEvent as processEventForAutomations } from '@/services/automation-service'; // Import automation service

// Infer types from schemas
type Device = InferSelectModel<typeof devicesTableSchema>;
type Area = InferSelectModel<typeof areasTableSchema>;

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

    // 2. Fetch Device Information for further processing
    const internalDeviceRecord: Partial<Device> | undefined = await db.query.devices.findFirst({
      where: and(
        eq(devicesTableSchema.connectorId, event.connectorId),
        eq(devicesTableSchema.deviceId, event.deviceId) // Matching external device ID
      ),
      // Select all columns needed for isSecurityRiskEvent and status update
      columns: {
        id: true, 
        isSecurityDevice: true, 
        standardizedDeviceType: true,
        standardizedDeviceSubtype: true,
        // any other fields required by isSecurityRiskEvent if it evolves
      }
    });

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

      // 4. Alarm Logic Integration (if device found)
      try {
        const areaDeviceLink = await db.query.areaDevices.findFirst({
          where: eq(areaDevicesTableSchema.deviceId, internalDeviceRecord.id),
          columns: { areaId: true },
        });

        if (areaDeviceLink && areaDeviceLink.areaId) {
          const area: Area | undefined = await db.query.areas.findFirst({
            where: eq(areasTableSchema.id, areaDeviceLink.areaId),
          });

          if (area) {
            if (area.armedState === ArmedState.ARMED_AWAY || area.armedState === ArmedState.ARMED_STAY) {
              // Pass the Partial<Device> we fetched. isSecurityRiskEvent is designed to handle this.
              const isRisk = isSecurityRiskEvent(event, internalDeviceRecord as Partial<Device>); 

              if (isRisk) {
                // If area is armed (AWAY or STAY) and a risk event occurs, always set to TRIGGERED.
                // The previous check `area.armedState !== ArmedState.TRIGGERED` was redundant here.
                await db.update(areasTableSchema)
                  .set({
                    armedState: ArmedState.TRIGGERED,
                    lastArmedStateChangeReason: 'security_event_trigger',
                    updatedAt: new Date(),
                  })
                  .where(eq(areasTableSchema.id, area.id));
                console.log(`[EventProcessor] Area ${area.id} set to TRIGGERED due to event ${event.eventId} from device ${internalDeviceRecord.id}.`);
                // TODO: Trigger notifications here (e.g., send email, push notification)
              }
            }
          } else {
            console.warn(`[EventProcessor] Area ${areaDeviceLink.areaId} not found for device ${internalDeviceRecord.id}. Skipping alarm logic for this path.`);
          }
        } else {
          // console.log(`[EventProcessor] Device ${internalDeviceRecord.id} is not associated with an area. Skipping alarm logic for this path.`);
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