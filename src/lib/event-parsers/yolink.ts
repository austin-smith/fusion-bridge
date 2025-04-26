import {
    DeviceType,
    TypedDeviceInfo,
    IntermediateState,
    // Import only necessary states for the known state logic
    BinaryState,
    ContactState,
    SensorAlertState,
    LockStatus,
    DeviceSubtype // Keep subtype for mapping keys
} from '@/lib/mappings/definitions';
import {
    StandardizedEvent,
    EventCategory,
    EventType, // Need this for UNKNOWN_EXTERNAL_EVENT
    StateChangedPayload,
    UnknownEventPayload // Import the new payload type
} from '@/types/events';
import { getDeviceTypeInfo } from '@/lib/mappings/identification';
import { intermediateStateToDisplayString } from '@/lib/mappings/presentation';

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
    state?: string;
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
 *
 * @param connectorId The ID of the YoLink connector instance.
 * @param rawEvent The raw event object.
 * @returns An array of StandardizedEvent objects derived from the raw event.
 */
export function parseYoLinkEvent(
    connectorId: string, 
    rawEvent: unknown
): StandardizedEvent<EventType>[] {

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

    // We process UNKNOWN events even for unmapped devices, 
    // as the event itself occurred and might be relevant.
    // If you want to completely ignore unmapped devices, move the check here.
    // if (deviceInfo.type === DeviceType.Unmapped) {
    //     return [];
    // }

    // --- Attempt to Parse Specific Known Event Types ---

    let successfullyParsed = false;

    // 1. Check for State Change
    if (event.data?.state !== undefined && deviceInfo.type !== DeviceType.Unmapped) {
        const rawState = event.data.state;
        const intermediateState = translateRawYoLinkState(deviceInfo, rawState);

        if (intermediateState) {
            const displayState = intermediateStateToDisplayString(intermediateState, deviceInfo);
            if (displayState) {
                const payload: StateChangedPayload = {
                    newState: intermediateState,
                    displayState: displayState,
                    rawStateValue: rawState,
                    rawEventPayload: event.data || {}
                };
                // If state parsed correctly, return ONLY the STATE_CHANGED event
                successfullyParsed = true;
                return [{
                    eventId: crypto.randomUUID(),
                    timestamp: timestamp, // Use primary event time
                    connectorId: connectorId,
                    deviceId: event.deviceId,
                    deviceInfo: deviceInfo,
                    eventCategory: EventCategory.DEVICE_STATE,
                    eventType: EventType.STATE_CHANGED,
                    payload: payload,
                    rawEventType: event.event,
                    rawEventPayload: event, // Store the full original event
                }];
            } else {
                console.warn(`[YoLink Parser][${connectorId}] Could not map intermediate state '${intermediateState}' to display state for device ${event.deviceId}`);
            }
        } else {
             console.warn(`[YoLink Parser] State Change: Could not translate raw YoLink state '${rawState}' for ${event.deviceId}.`);
        }
    }

    // --- BATTERY HANDLING REMOVED ---

    // TODO: Add other specific handlers here (e.g., for battery, online status etc.)
    // If another handler succeeds, set successfullyParsed = true and return its event(s).


    // --- Catch-all for Unknown/Unhandled Events --- 
    // If no specific handler succeeded above, create an UNKNOWN event.
    if (!successfullyParsed) {
        console.warn(`[YoLink Parser] Creating UNKNOWN_EXTERNAL_EVENT for unhandled event type or structure. Device: ${event.deviceId}, Original Event Type: ${event.event}`);
        const payload: UnknownEventPayload = {
            originalEventType: event.event,
            message: `Unknown or unhandled YoLink event: ${event.event}`,
            rawEventPayload: event, // Store the original event here
        };
        return [{
            eventId: crypto.randomUUID(),
            timestamp: timestamp,
            connectorId: connectorId,
            deviceId: event.deviceId, 
            deviceInfo: deviceInfo, // Include deviceInfo even if unknown, might be helpful
            eventCategory: EventCategory.UNKNOWN, // Use the dedicated UNKNOWN category
            eventType: EventType.UNKNOWN_EXTERNAL_EVENT,
            payload: payload,
            rawEventPayload: event,
        }];
    }

    // Should not be reached if logic is correct, but satisfy TypeScript return paths
    return []; 
} 