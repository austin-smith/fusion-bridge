import { EventType, DisplayState } from '@/lib/mappings/definitions';
import { shouldTriggerAlarm } from '@/lib/alarm-event-types';
import { createAlarmZonesRepository } from '@/data/repositories/alarm-zones';
import type { StandardizedEvent } from '@/types/events';

/**
 * Interface for device zone information required for alarm evaluation
 */
export interface DeviceZoneInfo {
  id: string;
  triggerBehavior: 'standard' | 'custom';
}

/**
 * Interface for event data required for alarm evaluation
 */
export interface AlarmEventData {
  type: EventType | string;
  subtype?: string | null;
  payload?: Record<string, any> | null;
}

/**
 * Determines if an event should trigger an alarm based on the zone's specific rules
 * This is the shared logic used for both alarm triggering and isAlarmEvent determination
 */
export async function shouldEventTriggerAlarmInZone(
  eventData: AlarmEventData,
  deviceZone: DeviceZoneInfo,
  organizationId: string
): Promise<boolean> {
  if (deviceZone.triggerBehavior === 'standard') {
    // Use standard trigger logic from alarm-event-types.ts
    const displayState = eventData.payload?.displayState;
    return shouldTriggerAlarm(eventData.type as EventType, eventData.subtype, displayState);
  } else if (deviceZone.triggerBehavior === 'custom') {
    // Check trigger overrides first, fallback to standard behavior
    const alarmZonesRepo = createAlarmZonesRepository(organizationId);
    const overrides = await alarmZonesRepo.getTriggerOverrides(deviceZone.id);
    const override = overrides.find(o => o.eventType === eventData.type);
    
    if (override) {
      // Use custom override
      return override.shouldTrigger;
    } else {
      // Fallback to standard behavior
      const displayState = eventData.payload?.displayState;
      return shouldTriggerAlarm(eventData.type as EventType, eventData.subtype, displayState);
    }
  }
  
  return false;
}

/**
 * Determines if an event from a StandardizedEvent should trigger an alarm
 * Convenience wrapper for the main function
 */
export async function shouldStandardizedEventTriggerAlarmInZone(
  event: StandardizedEvent,
  deviceZone: DeviceZoneInfo,
  organizationId: string
): Promise<boolean> {
  return shouldEventTriggerAlarmInZone(
    {
      type: event.type,
      subtype: event.subtype,
      payload: event.payload as Record<string, any> | null
    },
    deviceZone,
    organizationId
  );
}

/**
 * Determines if an event from API enriched event data should trigger an alarm
 * Convenience wrapper for API usage
 */
export async function shouldApiEventTriggerAlarmInZone(
  eventType: string,
  eventSubtype: string | null | undefined,
  eventPayload: Record<string, any> | null,
  deviceZone: DeviceZoneInfo,
  organizationId: string
): Promise<boolean> {
  return shouldEventTriggerAlarmInZone(
    {
      type: eventType,
      subtype: eventSubtype,
      payload: eventPayload
    },
    deviceZone,
    organizationId
  );
} 