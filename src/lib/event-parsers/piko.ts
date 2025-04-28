import { StandardizedEvent } from '@/types/events';
import { EventCategory, EventType, EventSubtype, DeviceType } from '@/lib/mappings/definitions';
import { PikoJsonRpcEventParams, PikoDeviceRaw } from '@/services/drivers/piko';
import { getDeviceTypeInfo } from '@/lib/mappings/identification';
import crypto from 'crypto';

// Define the possible EventTypes this parser can return
type ParsedPikoEventType = EventType.ANALYTICS_EVENT 
                         | EventType.LOITERING 
                         | EventType.ARMED_PERSON 
                         | EventType.TAILGATING 
                         | EventType.INTRUSION 
                         | EventType.LINE_CROSSING;

/**
 * Parses the event parameters from a Piko JSON-RPC event update message 
 * into a StandardizedEvent object for analytics.
 * 
 * @param connectorId The ID of the Piko connector instance.
 * @param rawEventParams The `eventParams` object from the Piko JSON-RPC message.
 * @param deviceGuidMap A map where keys are Piko Device GUIDs (eventResourceId) 
 *                      and values are the corresponding PikoDeviceRaw info.
 * @returns An array containing a single StandardizedEvent corresponding to the parsed Piko event type, 
 *          or an empty array if the event is ignored or unparseable.
 */
export function parsePikoEvent(
    connectorId: string, 
    rawEventParams: PikoJsonRpcEventParams | undefined | null,
    deviceGuidMap: Map<string, PikoDeviceRaw> | null // Added map parameter
): StandardizedEvent[] { 

    // --- Basic Validation ---
    if (!rawEventParams) {
        console.warn(`[Piko Parser][${connectorId}] Received null or undefined event params.`);
        return [];
    }

    // Ensure essential fields for an analytics event are present
    const deviceGuid = rawEventParams.eventResourceId;
    if (!deviceGuid || !rawEventParams.eventTimestampUsec) {
        console.warn(`[Piko Parser][${connectorId}] Received event params missing eventResourceId (GUID) or eventTimestampUsec:`, rawEventParams);
        return [];
    }

    // --- Extract Data ---
    const deviceId = deviceGuid; // Use the resource ID GUID as our standardized deviceId
    let timestamp: Date;
    try {
        // Piko timestamp is MICROSECONDS since epoch. Divide by 1000 to get ms.
        const timestampMs = BigInt(rawEventParams.eventTimestampUsec) / 1000n; 
        timestamp = new Date(Number(timestampMs));
    } catch (e) {
        console.error(`[Piko Parser][${connectorId}] Failed to parse timestamp: ${rawEventParams.eventTimestampUsec}`, e);
        timestamp = new Date(); // Fallback to now if parsing fails
    }

    // --- Get Device Info ---
    let pikoDeviceTypeString: string | undefined;
    if (deviceGuidMap) {
        const pikoDevice = deviceGuidMap.get(deviceId);
        pikoDeviceTypeString = pikoDevice?.deviceType; // e.g., "Camera", "Encoder"
    } else {
        console.warn(`[Piko Parser][${connectorId}] Device GUID map was not provided. Cannot determine specific Piko device type.`);
        // If no map, we can't determine the type string to look up
    }

    // Use the Piko deviceType string (if found) as the identifier for mapping
    const deviceInfo = getDeviceTypeInfo('piko', pikoDeviceTypeString); 
    
    // Handle cases where the Piko device type wasn't found or isn't mapped
    if (deviceInfo.type === DeviceType.Unmapped) {
        console.warn(`[Piko Parser][${connectorId}] Could not map Piko device type string '${pikoDeviceTypeString}' for GUID ${deviceId}. Event source type is unknown.`);
        // Decide if we should still create an event with Unmapped type, or return null
        // Let's proceed with Unmapped for now, the event still occurred.
    }

    // --- Construct Payload --- 
    const payload: Record<string, any> = {
        caption: rawEventParams.caption,
        description: rawEventParams.description,
        rawTimestampUsec: rawEventParams.eventTimestampUsec,
        analyticsEngineId: rawEventParams.analyticsEngineId,
        eventResourceId: rawEventParams.eventResourceId,
        objectTrackId: rawEventParams.objectTrackId,
    };

    // --- Determine Specific Event Type ---
    let specificEventType: ParsedPikoEventType = EventType.ANALYTICS_EVENT; // Default
    const inputPortId = rawEventParams.inputPortId;

    if (inputPortId === 'cvedia.rt.loitering') {
        specificEventType = EventType.LOITERING;
    } else if (inputPortId === 'cvedia.rt.armed_person') {
        specificEventType = EventType.ARMED_PERSON;
    } else if (inputPortId === 'cvedia.rt.tailgating') {
        specificEventType = EventType.TAILGATING;
    } else if (inputPortId === 'cvedia.rt.intrusion') {
        specificEventType = EventType.INTRUSION;
    } else if (inputPortId === 'cvedia.rt.crossing') {
        specificEventType = EventType.LINE_CROSSING;
    }
    // TODO: Add mapping for PERSON_DETECTED based on Piko fields
    // else if (inputPortId === 'SOME_PIKO_ID_FOR_PERSON') {
    //     specificEventType = EventType.PERSON_DETECTED;
    // }

    // --- Create Standardized Event ---
    // Use the determined specificEventType
    const standardizedEvent: StandardizedEvent = {
        eventId: crypto.randomUUID(),
        timestamp: timestamp,
        connectorId: connectorId,
        deviceId: deviceId,
        category: EventCategory.ANALYTICS,
        type: specificEventType,
        deviceInfo: deviceInfo,
        payload: payload,
        originalEvent: rawEventParams,
    };

    // console.log(`[Piko Parser][${connectorId}] Successfully parsed event:`, standardizedEvent.eventId);
    return [standardizedEvent];
} 