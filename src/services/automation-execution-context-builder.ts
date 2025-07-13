import 'server-only';

import type { StandardizedEvent } from '@/types/events';
import type { EventWithContext } from '@/lib/automation-types';

/**
 * Build device context for automation processing (avoid duplicate queries)
 */
export function buildEventWithContext(event: StandardizedEvent, connector: any, deviceRecord: any): EventWithContext {
  return {
    event,
    deviceContext: {
      deviceRecord: deviceRecord ? {
        id: deviceRecord.id,
        name: deviceRecord.name,
        deviceType: deviceRecord.standardizedDeviceType,
        deviceSubtype: deviceRecord.standardizedDeviceSubtype,
        vendor: deviceRecord.vendor,
        model: deviceRecord.model,
        status: deviceRecord.status,
        batteryPercentage: deviceRecord.batteryPercentage,
      } : null,
      spaceRecord: deviceRecord?.spaceDevices?.space ? {
        id: deviceRecord.spaceDevices.space.id,
        name: deviceRecord.spaceDevices.space.name,
      } : null,
      alarmZoneRecord: deviceRecord?.alarmZoneDevice?.zone ? {
        id: deviceRecord.alarmZoneDevice.zone.id,
        name: deviceRecord.alarmZoneDevice.zone.name,
        armedState: deviceRecord.alarmZoneDevice.zone.armedState,
      } : null,
      locationRecord: deviceRecord?.spaceDevices?.space?.location ? {
        id: deviceRecord.spaceDevices.space.location.id,
        name: deviceRecord.spaceDevices.space.location.name,
        timeZone: deviceRecord.spaceDevices.space.location.timeZone,
      } : null,
      connectorRecord: {
        id: connector.id,
        name: connector.name,
        category: connector.category,
      }
    }
  };
} 