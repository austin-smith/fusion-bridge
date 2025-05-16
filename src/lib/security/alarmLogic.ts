import type { StandardizedEvent } from '@/types/events'; // Corrected path
import { type devices } from '@/data/db/schema'; // Drizzle schema table
import type { InferSelectModel } from 'drizzle-orm'; // For inferring type
import { DeviceType, DeviceSubtype, EventType, EventSubtype, ContactState, SensorAlertState } from '@/lib/mappings/definitions';

// Infer the type for a single device from the devices table schema
type Device = InferSelectModel<typeof devices>;

/**
 * Determines if a given standardized event, in the context of a device,
 * should be considered a security risk if the area is armed.
 *
 * @param event The standardized event object.
 * @param device The device associated with the event. Can be null if device info isn't available.
 * @returns True if the event is a security risk when armed, false otherwise.
 */
export function isSecurityRiskEvent(
  event: StandardizedEvent,
  device: Partial<Device> | null 
): boolean {
  if (!event) return false;

  // Correctly access properties from the event argument
  const { type: standardizedEventType, payload: standardizedPayload, subtype: standardizedEventSubtype } = event;

  if (device && device.isSecurityDevice) {
    if (
      device.standardizedDeviceType === DeviceType.Sensor &&
      device.standardizedDeviceSubtype === DeviceSubtype.Contact &&
      standardizedEventType === EventType.STATE_CHANGED &&
      standardizedPayload?.state === ContactState.Open 
    ) {
      return true;
    }

    if (
      device.standardizedDeviceType === DeviceType.Sensor &&
      device.standardizedDeviceSubtype === DeviceSubtype.Motion &&
      standardizedEventType === EventType.STATE_CHANGED &&
      standardizedPayload?.state === SensorAlertState.Alert 
    ) {
      return true;
    }
    // TODO: Add more device-specific rules here, e.g.:
    // - Glass break sensors changing to ALERT state
    // - Shock/Vibration sensors to ALERT state
  }

  switch (standardizedEventType) {
    case EventType.DOOR_FORCED_OPEN:
      return true;
    case EventType.INTRUSION: 
      return true;
    case EventType.ARMED_PERSON:
      return true;
  }
  
  if (standardizedEventType === EventType.OBJECT_DETECTED && device && device.isSecurityDevice) {
      if (standardizedEventSubtype === EventSubtype.PERSON) {
          return true;
      }
  }

  return false;
} 