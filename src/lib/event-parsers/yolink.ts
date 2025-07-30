import {
    DeviceType,
    TypedDeviceInfo,
    IntermediateState,
    // Import only necessary states for the known state logic
    BinaryState,
    ContactState,
    SensorAlertState,
    LockStatus,
    ErrorState,
    DeviceSubtype, // Keep subtype for mapping keys
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
import { 
    YOLINK_EVENT_SUFFIX_MAP, 
    YOLINK_IPCAMERA_EVENT_MAP, 
    YOLINK_SMARTFOB_PRESS_MAP, 
    YOLINK_UNKNOWN_EVENT 
} from '@/lib/mappings/event-maps/yolink';

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

const yoLinkLockStates: Record<string, LockStatus | ErrorState> = { 'locked': LockStatus.Locked, 'unlocked': LockStatus.Unlocked, 'error': ErrorState.Error };
const yoLinkBinaryStates: Record<string, BinaryState | ErrorState> = { 'open': BinaryState.On, 'closed': BinaryState.Off, 'on': BinaryState.On, 'off': BinaryState.Off, 'error': ErrorState.Error };
const yoLinkContactStates: Record<string, ContactState | ErrorState> = { 'open': ContactState.Open, 'closed': ContactState.Closed, 'error': ErrorState.Error };
const yoLinkAlertStates: Record<string, SensorAlertState | ErrorState> = { 'normal': SensorAlertState.Normal, 'alert': SensorAlertState.Alert, 'error': ErrorState.Error };

const yoLinkStateMap: YoLinkStateMap = {
  [DeviceType.Lock]: { 'null': yoLinkLockStates },
  [DeviceType.Outlet]: { [DeviceSubtype.Multi]: yoLinkBinaryStates, [DeviceSubtype.Single]: yoLinkBinaryStates },
  [DeviceType.Sensor]: { [DeviceSubtype.Contact]: yoLinkContactStates, [DeviceSubtype.Leak]: yoLinkAlertStates, [DeviceSubtype.Motion]: yoLinkAlertStates, [DeviceSubtype.Vibration]: yoLinkAlertStates },
  [DeviceType.Switch]: { [DeviceSubtype.Dimmer]: yoLinkBinaryStates, [DeviceSubtype.Toggle]: yoLinkBinaryStates },
  [DeviceType.Alarm]: { [DeviceSubtype.Siren]: yoLinkAlertStates },
  [DeviceType.GarageDoor]: { 'null': yoLinkContactStates },
  [DeviceType.WaterValveController]: { 'null': yoLinkContactStates },
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
    state?: string | { 
        lock?: string; 
        event?: { // For other device types that might use this structure
            keyMask?: number;
            type?: string; // "Press" or "LongPress"
        };
        [key: string]: any; 
    }; // Allow string or object for state
    event?: { // For SmartRemoter button events (StatusChange structure)
        keyMask?: number;
        type?: string; // "Press" or "LongPress"
    };
    alertType?: string;
    battery?: number; // YoLink battery level 0-4 (0=empty, 4=full)
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

    // --- Process event through handler registry ---
    const eventContext = { event, timestamp, connectorId, deviceInfo };
    
    for (const handler of EVENT_HANDLERS) {
        if (handler.condition(eventContext)) {
            const result = handler.handler(eventContext);
            if (result.length > 0) {
                return result; // Return first successful handler result
            }
        }
    }

    // --- Fallback: Create unknown event ---
    return createUnknownEvent(eventContext);
}

// --- Event Handler Types ---
interface EventContext {
    event: RawYoLinkEventPayload;
    timestamp: Date;
    connectorId: string;
    deviceInfo: TypedDeviceInfo;
}

interface EventHandler {
    condition: (context: EventContext) => boolean;
    handler: (context: EventContext) => StandardizedEvent[];
}

// --- Individual Event Handlers ---

function handlePowerReport({ event, timestamp, connectorId, deviceInfo }: EventContext): StandardizedEvent[] {
    console.log(`[YoLink Parser] Detected Power Report: ${event.event} for device ${event.deviceId}`);
    const payload: UnknownEventPayload = { 
        originalEventType: event.event,
        message: `YoLink Power Report: ${event.event}`,
        rawEventPayload: event.data
    };
    
    // Add battery percentage if available
    const batteryPercentage = extractBatteryPercentage(event.data);
    if (batteryPercentage !== undefined) {
        (payload as any).batteryPercentage = batteryPercentage;
    }
    
    const classification = YOLINK_EVENT_SUFFIX_MAP['.powerReport'];
    
    return [{
        eventId: crypto.randomUUID(),
        timestamp: timestamp,
        connectorId: connectorId,
        deviceId: event.deviceId,
        deviceInfo: deviceInfo, 
        ...classification,
        payload: payload,
        originalEvent: event,
    }];
}

function handleSmartFobButtonPress({ event, timestamp, connectorId, deviceInfo }: EventContext): StandardizedEvent[] {
    // SmartRemoter button presses are always StatusChange events with data.event structure
    const buttonEvent = event.data?.event;
    const keyMask = buttonEvent?.keyMask;
    const pressType = buttonEvent?.type;
    
    // Enhanced validation for button event data
    if (typeof keyMask !== 'number' || keyMask < 0 || keyMask > 255) {
        console.warn(`[YoLink Parser] SmartFob event '${event.event}' for device ${event.deviceId} has invalid keyMask: ${keyMask}. Expected number 0-255.`);
        return [];
    }
    
    if (typeof pressType !== 'string' || !['Press', 'LongPress'].includes(pressType)) {
        console.warn(`[YoLink Parser] SmartFob event '${event.event}' for device ${event.deviceId} has invalid pressType: ${pressType}. Expected 'Press' or 'LongPress'.`);
        return [];
    }

    console.log(`[YoLink Parser] Detected SmartFob button event: keyMask=${keyMask}, type=${pressType} for device ${event.deviceId}`);
    
    const standardizedEvents: StandardizedEvent[] = [];
    
    // Extract battery percentage if available
    const batteryPercentage = extractBatteryPercentage(event.data);
    
    // Parse keyMask to identify which buttons were pressed (bits 0-7 = buttons 1-8)
    for (let buttonNumber = 0; buttonNumber < 8; buttonNumber++) {
        if (keyMask & (1 << buttonNumber)) {
            const payload = {
                buttonNumber: buttonNumber + 1, // Convert from 0-7 to 1-8 for user-friendly numbering
                pressType: pressType as 'Press' | 'LongPress',
                keyMask: keyMask
            };
            
            // Add battery percentage if available
            if (batteryPercentage !== undefined) {
                (payload as any).batteryPercentage = batteryPercentage;
            }
            
            const classification = YOLINK_SMARTFOB_PRESS_MAP[pressType as keyof typeof YOLINK_SMARTFOB_PRESS_MAP];
            
            standardizedEvents.push({
                eventId: crypto.randomUUID(),
                timestamp: timestamp,
                connectorId: connectorId,
                deviceId: event.deviceId,
                deviceInfo: deviceInfo,
                ...classification,
                payload: payload,
                originalEvent: event,
            });
            
            console.log(`[YoLink Parser] Created ${classification.type} event for button ${buttonNumber + 1} on device ${event.deviceId}`);
        }
    }
    
    return standardizedEvents;
}

function handleIPCameraEvents({ event, timestamp, connectorId, deviceInfo }: EventContext): StandardizedEvent[] {
    const eventString = event.data!.event as string;
    const classification = YOLINK_IPCAMERA_EVENT_MAP[eventString as keyof typeof YOLINK_IPCAMERA_EVENT_MAP];
    
    if (!classification) {
        console.warn(`[YoLink Parser] Unknown IPCamera event: ${eventString}`);
        return [];
    }
    
    const payload = {
        rawEventData: event.data
    };
    
    return [{
        eventId: crypto.randomUUID(),
        timestamp: new Date(event.data!.time!),
        connectorId: connectorId,
        deviceId: event.deviceId,
        deviceInfo: deviceInfo,
        ...classification,
        payload: payload,
        originalEvent: event,
    }];
}

function handleGenericStateChange({ event, timestamp, connectorId, deviceInfo }: EventContext): StandardizedEvent[] {
    if (deviceInfo.type === DeviceType.Unmapped) {
        console.warn(`[YoLink Parser] State Change event '${event.event}' for unmapped device ${event.deviceId}. Cannot process state.`);
        return [];
    }
    
    if (event.data?.state === undefined) {
        console.warn(`[YoLink Parser] State Change event '${event.event}' for device ${event.deviceId} is missing 'data.state'. Cannot determine state.`);
        return [];
    }

    const rawState = getRawStateStringFromYoLinkData(deviceInfo, event.data?.state);
    const intermediateState = translateRawYoLinkState(deviceInfo, rawState);

    if (!intermediateState) {
        console.warn(`[YoLink Parser] State Change for ${event.event}: Could not translate raw YoLink state '${String(rawState)}' for ${event.deviceId}.`);
        return [];
    }

    const displayState = intermediateStateToDisplayString(intermediateState, deviceInfo);
    if (!displayState) {
        console.warn(`[YoLink Parser][${connectorId}] Could not map intermediate state '${intermediateState}' to display state for device ${event.deviceId} during ${event.event}`);
        return [];
    }

    const payload: StateChangedPayload = {
        intermediateState: intermediateState,
        displayState: displayState,
    };
    
    // Add battery percentage if available
    const batteryPercentage = extractBatteryPercentage(event.data);
    if (batteryPercentage !== undefined) {
        (payload as any).batteryPercentage = batteryPercentage;
    }
    
    // Determine event suffix to get classification
    let suffix: string;
    if (event.event.endsWith('.Alert')) {
        suffix = '.Alert';
    } else if (event.event.endsWith('.StatusChange')) {
        suffix = '.StatusChange';
    } else if (event.event.endsWith('.setState')) {
        suffix = '.setState';
    } else {
        // Fallback - should not happen given handler conditions
        suffix = '.Alert';
    }
    
    const classification = YOLINK_EVENT_SUFFIX_MAP[suffix as keyof typeof YOLINK_EVENT_SUFFIX_MAP];
    
    return [{
        eventId: crypto.randomUUID(),
        timestamp: timestamp,
        connectorId: connectorId,
        deviceId: event.deviceId,
        deviceInfo: deviceInfo,
        ...classification,
        payload: payload,
        originalEvent: event,
    }];
}

function handleGenericDiagnosticReport({ event, timestamp, connectorId, deviceInfo }: EventContext): StandardizedEvent[] {
    console.log(`[YoLink Parser] Detected Diagnostic Report: ${event.event} for device ${event.deviceId}`);
    const payload: UnknownEventPayload = { 
        originalEventType: event.event,
        message: `YoLink Diagnostic Report: ${event.event}`,
        rawEventPayload: event.data
    };
    
    // Add battery percentage if available
    const batteryPercentage = extractBatteryPercentage(event.data);
    if (batteryPercentage !== undefined) {
        (payload as any).batteryPercentage = batteryPercentage;
    }
    
    const classification = YOLINK_EVENT_SUFFIX_MAP['.Report'];
    
    return [{
        eventId: crypto.randomUUID(),
        timestamp: timestamp,
        connectorId: connectorId,
        deviceId: event.deviceId,
        deviceInfo: deviceInfo, 
        ...classification,
        payload: payload,
        originalEvent: event,
    }];
}

function createUnknownEvent({ event, timestamp, connectorId, deviceInfo }: EventContext): StandardizedEvent[] {
    console.warn(`[YoLink Parser] Creating UNKNOWN_EXTERNAL_EVENT for unhandled/unparseable event. Device: ${event.deviceId}, Original Event Type: ${event.event}`);
    const payload: UnknownEventPayload = {
        originalEventType: event.event,
        message: `Unknown or unhandled YoLink event: ${event.event}`,
        rawEventPayload: event.data
    };
    
    // Add battery percentage if available
    const batteryPercentage = extractBatteryPercentage(event.data);
    if (batteryPercentage !== undefined) {
        (payload as any).batteryPercentage = batteryPercentage;
    }
    
    return [{
        eventId: crypto.randomUUID(),
        timestamp: timestamp,
        connectorId: connectorId,
        deviceId: event.deviceId, 
        deviceInfo: deviceInfo,
        ...YOLINK_UNKNOWN_EVENT,
        payload: payload,
        originalEvent: event,
    }];
}

// --- Event Handler Registry (processed in order - most specific first) ---
const EVENT_HANDLERS: EventHandler[] = [
    // Power reports (most specific)
    {
        condition: ({ event }) => event.event.endsWith('.powerReport'),
        handler: handlePowerReport
    },
    
    // YoLink camera analytics (sound/motion detection)
    {
        condition: ({ event, deviceInfo }) => {
            return deviceInfo.type === DeviceType.Camera && 
                   event.event === 'IPCamera.Alert' && 
                   typeof event.data?.event === 'string' &&
                   (event.data.event === 'sound_detected' || event.data.event === 'motion_detected');
        },
        handler: handleIPCameraEvents
    },
    
    // SmartFob button presses (specific device type + StatusChange events only)
    {
        condition: ({ event, deviceInfo }) => {
            if (deviceInfo.type !== DeviceType.SmartFob) return false;
            
            // Button presses are always StatusChange events, never Alert events
            if (!event.event.endsWith('.StatusChange')) return false;
            
            // Check for button data in data.event structure
            const buttonEvent = event.data?.event;
            
            return buttonEvent !== undefined && 
                   typeof buttonEvent === 'object' && 
                   'keyMask' in buttonEvent && 
                   'type' in buttonEvent;
        },
        handler: handleSmartFobButtonPress
    },
    
    // Generic state changes (broader match)
    {
        condition: ({ event }) => 
            event.event.endsWith('.Alert') || 
            event.event.endsWith('.StatusChange') || 
            event.event.endsWith('.setState'),
        handler: handleGenericStateChange
    },
    
    // Generic diagnostic reports (broader match)
    {
        condition: ({ event }) => event.event.endsWith('.Report'),
        handler: handleGenericDiagnosticReport
    }
]; 

// --- Battery Data Extraction ---
/**
 * Extracts battery percentage from YoLink event data.
 * Converts YoLink's 0-4 scale to 0-100 percentage.
 * @param eventData The event data object
 * @returns Battery percentage (0-100) or undefined if no battery data
 */
function extractBatteryPercentage(eventData?: RawYoLinkData): number | undefined {
    if (!eventData?.battery || typeof eventData.battery !== 'number') {
        return undefined;
    }
    
    // Validate YoLink battery range (0-4)
    if (eventData.battery < 0 || eventData.battery > 4) {
        console.warn(`[YoLink Parser] Invalid battery level: ${eventData.battery}. Expected 0-4.`);
        return undefined;
    }
    
    // Convert YoLink 0-4 scale to 0-100 percentage
    return Math.round((eventData.battery / 4) * 100);
} 