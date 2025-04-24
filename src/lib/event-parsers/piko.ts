import { StandardizedEvent, EventCategory, EventType, AnalyticsEventPayload } from '@/types/events';
import { PikoJsonRpcEventParams, PikoDeviceRaw } from '@/services/drivers/piko';
import { getDeviceTypeInfo } from '@/lib/mappings/identification';
import { DeviceType } from '../mappings/definitions';

/**
 * Parses the event parameters from a Piko JSON-RPC event update message 
 * into a StandardizedEvent object for analytics.
 * 
 * @param connectorId The ID of the Piko connector instance.
 * @param rawEventParams The `eventParams` object from the Piko JSON-RPC message.
 * @param deviceGuidMap A map where keys are Piko Device GUIDs (eventResourceId) 
 *                      and values are the corresponding PikoDeviceRaw info.
 * @returns An array containing a single ANALYTICS_EVENT or LOITERING StandardizedEvent, 
 *          or an empty array if the event is ignored or unparseable.
 */
export function parsePikoEvent(
    connectorId: string, 
    rawEventParams: PikoJsonRpcEventParams | undefined | null,
    deviceGuidMap: Map<string, PikoDeviceRaw> | null // Added map parameter
): StandardizedEvent<EventType.ANALYTICS_EVENT | EventType.LOITERING>[] { 

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
        // Decide if we should still create an event with Unmapped type, or return []
        // Let's proceed with Unmapped for now, the event still occurred.
    }

    // --- Construct Payload --- 
    const payload: AnalyticsEventPayload = {
        caption: rawEventParams.caption,
        description: rawEventParams.description,
        rawTimestampUsec: rawEventParams.eventTimestampUsec,
        analyticsEngineId: rawEventParams.analyticsEngineId,
        eventResourceId: rawEventParams.eventResourceId, // Keep original GUID here too
        objectTrackId: rawEventParams.objectTrackId,
        // Store the original params object for full details
        rawPikoEventParams: rawEventParams, 
    };

    // --- Determine Specific Event Type ---
    let specificEventType: EventType.ANALYTICS_EVENT | EventType.LOITERING = EventType.ANALYTICS_EVENT; // Default

    if (rawEventParams.inputPortId === 'cvedia.rt.loitering') {
        specificEventType = EventType.LOITERING;
    }
    // TODO: Add mappings for PERSON_DETECTED and LINE_CROSSING based on Piko fields

    // --- Create Standardized Event ---
    // Use the determined specificEventType
    const standardizedEvent: StandardizedEvent<typeof specificEventType> = {
        eventId: crypto.randomUUID(),
        timestamp: timestamp,
        connectorId: connectorId,
        deviceId: deviceId, // The GUID
        deviceInfo: deviceInfo, // Mapped type (or Unmapped)
        eventCategory: EventCategory.ANALYTICS,
        eventType: specificEventType, // Use the determined type
        payload: payload,
        rawEventType: rawEventParams?.inputPortId, // Extract inputPortId here
        rawEventPayload: rawEventParams, // Assign original params here!
    };

    // console.log(`[Piko Parser][${connectorId}] Successfully parsed event:`, standardizedEvent.eventId);
    return [standardizedEvent];
} 