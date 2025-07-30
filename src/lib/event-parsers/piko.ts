import { StandardizedEvent } from '@/types/events';
import { EventCategory, EventType, EventSubtype, DeviceType } from '@/lib/mappings/definitions';
import { PikoJsonRpcEventParams, PikoDeviceRaw } from '@/services/drivers/piko';
import { getDeviceTypeInfo } from '@/lib/mappings/identification';
import { 
  ALLOWED_PIKO_EVENT_TYPES, 
  classifyPikoEvent 
} from '@/lib/mappings/event-maps/piko';
import { EventClassification } from '@/lib/mappings/event-hierarchy';
import crypto from 'crypto';
import { processAndPersistEvent } from '@/lib/events/eventProcessor';



/**
 * Parses the event parameters from a Piko JSON-RPC event update message 
 * into a StandardizedEvent object for analytics.
 * 
 * @param connectorId The ID of the Piko connector instance.
 * @param rawEventParams The `eventParams` object from the Piko JSON-RPC message.
 * @param deviceGuidMap A map where keys are Piko Device GUIDs (eventResourceId) 
 *                      and values are the corresponding PikoDeviceRaw info.
 * @returns A Promise resolving to void, as events are processed centrally.
 */
export async function parsePikoEvent(
    connectorId: string, 
    rawEventParams: PikoJsonRpcEventParams | undefined | null,
    deviceGuidMap: Map<string, PikoDeviceRaw> | null 
): Promise<StandardizedEvent[]> {

    if (!rawEventParams) {
        console.warn(`[Piko Parser][${connectorId}] Received null or undefined event params.`);
        return [];
    }

    const deviceGuid = rawEventParams.eventResourceId;
    if (!deviceGuid || !rawEventParams.eventTimestampUsec) {
        console.warn(`[Piko Parser][${connectorId}] Received event params missing eventResourceId (GUID) or eventTimestampUsec:`, rawEventParams);
        return [];
    }

    const deviceId = deviceGuid; 
    let timestamp: Date;
    try {
        const timestampMs = BigInt(rawEventParams.eventTimestampUsec) / 1000n; 
        timestamp = new Date(Number(timestampMs));
    } catch (e) {
        console.error(`[Piko Parser][${connectorId}] Failed to parse timestamp: ${rawEventParams.eventTimestampUsec}`, e);
        timestamp = new Date(); 
    }

    let pikoDeviceTypeString: string | undefined;
    if (deviceGuidMap) {
        const pikoDevice = deviceGuidMap.get(deviceId);
        pikoDeviceTypeString = pikoDevice?.deviceType;
    } else {
        console.warn(`[Piko Parser][${connectorId}] Device GUID map was not provided. Cannot determine specific Piko device type.`);
    }

    const deviceInfo = getDeviceTypeInfo('piko', pikoDeviceTypeString); 
    
    if (deviceInfo.type === DeviceType.Unmapped) {
        console.warn(`[Piko Parser][${connectorId}] Could not map Piko device type string '${pikoDeviceTypeString}' for GUID ${deviceId}. Event source type is unknown.`);
    }

    const payload: Record<string, any> = {
        caption: rawEventParams.caption,
        description: rawEventParams.description,
        rawTimestampUsec: rawEventParams.eventTimestampUsec,
        analyticsEngineId: rawEventParams.analyticsEngineId,
        eventResourceId: rawEventParams.eventResourceId,
        objectTrackId: rawEventParams.objectTrackId,
    };

    const inputPortId = rawEventParams.inputPortId?.toLowerCase(); 
    const pikoEventType = rawEventParams.eventType;

    // Validate event type
    if (!pikoEventType || !ALLOWED_PIKO_EVENT_TYPES.includes(pikoEventType as any)) {
        console.warn(`[Piko Parser][${connectorId}] Received Piko event with eventType '${pikoEventType || 'undefined'}'. Not an allowed type. Event discarded.`);
        return [];
    }

    // Centralized event classification
    const eventClassification = classifyPikoEvent(inputPortId, pikoEventType);

    const standardizedEvent: StandardizedEvent = {
        eventId: crypto.randomUUID(),
        timestamp: timestamp,
        connectorId: connectorId,
        deviceId: deviceId,
        category: eventClassification.category,
        type: eventClassification.type,
        subtype: eventClassification.subtype, 
        deviceInfo: deviceInfo,
        payload: payload,
        originalEvent: rawEventParams,
    };

    return [standardizedEvent];
} 