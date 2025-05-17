import {
    DeviceType,
    TypedDeviceInfo,
    IntermediateState,
    // Import only necessary states for the known state logic
    BinaryState,
    ContactState,
    SensorAlertState,
    LockStatus,
    DeviceSubtype, // Keep subtype for mapping keys
    EventCategory, // <-- Import from definitions
    EventType,      // <-- Import from definitions
    DisplayState // <-- Import DisplayState
} from '@/lib/mappings/definitions';
import {
    StandardizedEvent,
    StateChangedPayload,
    UnknownEventPayload // Import the new payload type
} from '@/types/events';
import { getDeviceTypeInfo } from '@/lib/mappings/identification';
import { intermediateStateToDisplayString } from '@/lib/mappings/presentation';
import crypto from 'crypto'; // Import crypto for UUID generation
import { processAndPersistEvent } from '@/lib/events/eventProcessor'; // Import the central processor
import { getRawStateStringFromYoLinkData } from '@/services/drivers/yolink';

// --- BEGIN DB Imports ---
// import { db } from '@/data/db';
// import { devices } from '@/data/db/schema';
// import { eq, and } from 'drizzle-orm';
// --- END DB Imports ---

// --- YoLink Intermediate State Mapping (Internal to this parser) ---
// This map is based on the previous translation logic and is necessary
// for handling the 'state' field.

type YoLinkStateMap = Partial<Record<
  DeviceType,
  {
    [subtypeKey: string]: Record<string, IntermediateState>;
  }
>>;

const yoLinkLockStates: Record<string, LockStatus> = { 'locked': LockStatus.Locked, 'unlocked': LockStatus.Unlocked };
const yoLinkBinaryStates: Record<string, BinaryState> = { 'open': BinaryState.On, 'closed': BinaryState.Off, 'on': BinaryState.On, 'off': BinaryState.Off };
const yoLinkContactStates: Record<string, ContactState> = { 'open': ContactState.Open, 'closed': ContactState.Closed };
const yoLinkAlertStates: Record<string, SensorAlertState> = { 'normal': SensorAlertState.Normal, 'alert': SensorAlertState.Alert };

const yoLinkStateMap: YoLinkStateMap = {
  [DeviceType.Lock]: { 'null': yoLinkLockStates },
  [DeviceType.Outlet]: { [DeviceSubtype.Multi]: yoLinkBinaryStates, [DeviceSubtype.Single]: yoLinkBinaryStates },
  [DeviceType.Sensor]: { [DeviceSubtype.Contact]: yoLinkContactStates, [DeviceSubtype.Leak]: yoLinkAlertStates, [DeviceSubtype.Motion]: yoLinkAlertStates, [DeviceSubtype.Vibration]: yoLinkAlertStates },
  [DeviceType.Switch]: { [DeviceSubtype.Dimmer]: yoLinkBinaryStates, [DeviceSubtype.Toggle]: yoLinkBinaryStates },
  [DeviceType.Alarm]: { [DeviceSubtype.Siren]: yoLinkAlertStates },
  [DeviceType.GarageDoor]: { 'null': yoLinkContactStates },
};

/** Helper to translate a raw YoLink state string to an IntermediateState enum. */
function translateRawYoLinkState(deviceInfo: TypedDeviceInfo, rawState: string | undefined): IntermediateState | undefined {
    if (rawState === undefined || rawState === null) return undefined;
    const typeMap = yoLinkStateMap[deviceInfo.type];
    if (!typeMap) return undefined;
    const subtypeKey = deviceInfo.subtype ?? 'null';
    const stateMap = typeMap[subtypeKey];
    if (!stateMap) return undefined;
    const lowerCaseState = String(rawState).toLowerCase();
    return stateMap[lowerCaseState];
}

// --- YoLink Raw Event Structure (Based on Provided Example) ---
interface RawYoLinkData {
    state?: string | { lock?: string; [key: string]: any }; // Allow string or object for state
    alertType?: string;
    battery?: number; // Field may exist, but we won't process it into an event for now
    version?: string;
    loraInfo?: Record<string, any>;
    stateChangedAt?: number;
    // Allow other potential fields within data
    [key: string]: any;
}

interface RawYoLinkEventPayload {
    event: string;      // e.g., "DoorSensor.Alert"
    time: number;       // Unix timestamp in milliseconds
    msgid?: string;     // Optional message ID
    data?: RawYoLinkData; // Optional data object
    deviceId: string;
    // Allow other potential top-level fields
    [key: string]: any;
}

/**
 * Parses a raw event object received from the YoLink connector
 * into one or more StandardizedEvent objects, based on the confirmed structure.
 * Attempts to parse known state changes, otherwise returns an UNKNOWN_EXTERNAL_EVENT.
 * Updates the device status in the database if a displayable state change is parsed.
 *
 * @param connectorId The ID of the YoLink connector instance.
 * @param rawEvent The raw event object.
 * @returns A Promise resolving to an array of StandardizedEvent objects derived from the raw event.
 */
export async function parseYoLinkEvent(
    connectorId: string, 
    rawEvent: unknown
): Promise<StandardizedEvent[]> {

    // --- Basic Validation ---
    if (
        typeof rawEvent !== 'object' || rawEvent === null ||
        !('event' in rawEvent && typeof (rawEvent as any).event === 'string') ||
        !('time' in rawEvent && typeof (rawEvent as any).time === 'number') ||
        !('deviceId' in rawEvent && typeof (rawEvent as any).deviceId === 'string')
    ) {
        console.warn('[YoLink Parser] Received event missing essential fields (event, time, deviceId):', rawEvent);
        // Cannot even create an UNKNOWN event without basic fields, return empty.
        return [];
    }

    // Type assertion after validation
    const event = rawEvent as RawYoLinkEventPayload;
    const timestamp = new Date(event.time);

    // --- Get Device Info ---
    const identifier = event.event.split('.')[0]; // e.g., "DoorSensor"
    const deviceInfo = getDeviceTypeInfo('yolink', identifier);

    const standardizedEvents: StandardizedEvent[] = [];

    // --- BEGIN Add Power Report Handling ---
    if (event.event.endsWith('.powerReport')) {
        console.log(`[YoLink Parser] Detected Power Report: ${event.event} for device ${event.deviceId}`);
        const payload: UnknownEventPayload = { 
            originalEventType: event.event,
            message: `YoLink Power Report: ${event.event}`,
            rawEventPayload: event.data
        };
        standardizedEvents.push({
            eventId: crypto.randomUUID(),
            timestamp: timestamp,
            connectorId: connectorId,
            deviceId: event.deviceId,
            deviceInfo: deviceInfo, 
            category: EventCategory.DIAGNOSTICS,
            type: EventType.POWER_CHECK_IN,    
            payload: payload,
            originalEvent: event,
        });
    }
    // --- END Add Power Report Handling ---

    // --- BEGIN State Change Events (.Alert, .StatusChange) ---
    else if (event.event.endsWith('.Alert') || event.event.endsWith('.StatusChange') || event.event.endsWith('.setState')) {
        if (deviceInfo.type !== DeviceType.Unmapped && event.data?.state !== undefined) {
            const rawState = getRawStateStringFromYoLinkData(deviceInfo, event.data?.state);

            const intermediateState = translateRawYoLinkState(deviceInfo, rawState);

            if (intermediateState) {
                const displayState = intermediateStateToDisplayString(intermediateState, deviceInfo);
                if (displayState) {
                    const payload: StateChangedPayload = {
                        intermediateState: intermediateState,
                        displayState: displayState,
                    };
                    standardizedEvents.push({
                        eventId: crypto.randomUUID(),
                        timestamp: timestamp,
                        connectorId: connectorId,
                        deviceId: event.deviceId,
                        deviceInfo: deviceInfo,
                        category: EventCategory.DEVICE_STATE,
                        type: EventType.STATE_CHANGED,
                        payload: payload,
                        originalEvent: event,
                    });
                } else {
                    console.warn(`[YoLink Parser][${connectorId}] Could not map intermediate state '${intermediateState}' to display state for device ${event.deviceId} during ${event.event}`);
                }
            } else {
                 console.warn(`[YoLink Parser] State Change for ${event.event}: Could not translate raw YoLink state '${String(rawState)}' for ${event.deviceId}.`);
            }
        } else if (deviceInfo.type === DeviceType.Unmapped) {
            console.warn(`[YoLink Parser] State Change event '${event.event}' for unmapped device ${event.deviceId}. Cannot process state.`);
        } else { // event.data?.state is undefined
             console.warn(`[YoLink Parser] State Change event '${event.event}' for device ${event.deviceId} is missing 'data.state'. Cannot determine state.`);
        }
    }
    // --- END State Change Events ---

    // --- BEGIN Check for Generic Diagnostic Report --- 
    else if (event.event.endsWith('.Report')) { // This catches other '.Report' types not covered by '.powerReport'
        console.log(`[YoLink Parser] Detected Diagnostic Report: ${event.event} for device ${event.deviceId}`);
        const payload: UnknownEventPayload = { 
            originalEventType: event.event,
            message: `YoLink Diagnostic Report: ${event.event}`,
            rawEventPayload: event.data
        };
        standardizedEvents.push({
            eventId: crypto.randomUUID(),
            timestamp: timestamp,
            connectorId: connectorId,
            deviceId: event.deviceId,
            deviceInfo: deviceInfo, 
            category: EventCategory.DIAGNOSTICS,
            type: EventType.DEVICE_CHECK_IN,    
            payload: payload,
            originalEvent: event,
        });
    }
    // --- END Check for Generic Diagnostic Report ---

    // --- BATTERY HANDLING REMOVED ---

    // TODO: Add other specific handlers here (e.g., for battery, online status etc.)
    // If another handler succeeds, set successfullyParsed = true and return its event(s).


    // --- Catch-all for Unknown/Unhandled Events --- 
    // If no specific handler created an event above, create an UNKNOWN event.
    if (standardizedEvents.length === 0) {
        console.warn(`[YoLink Parser] Creating UNKNOWN_EXTERNAL_EVENT for unhandled/unparseable event. Device: ${event.deviceId}, Original Event Type: ${event.event}`);
        const payload: UnknownEventPayload = {
            originalEventType: event.event,
            message: `Unknown or unhandled YoLink event: ${event.event}`,
            rawEventPayload: event.data
        };
        standardizedEvents.push({
            eventId: crypto.randomUUID(),
            timestamp: timestamp,
            connectorId: connectorId,
            deviceId: event.deviceId, 
            deviceInfo: deviceInfo,
            category: EventCategory.UNKNOWN,
            type: EventType.UNKNOWN_EXTERNAL_EVENT,
            payload: payload,
            originalEvent: event,
        });
    }

    return standardizedEvents;
} 