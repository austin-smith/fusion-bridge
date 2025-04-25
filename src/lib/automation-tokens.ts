// src/lib/automation-tokens.ts

export interface AutomationToken {
    token: string; // e.g., "{{event.deviceId}}"
    description: string;
    group: string; // e.g., "Event", "Device"
}

export const AVAILABLE_AUTOMATION_TOKENS: AutomationToken[] = [
    // --- Event Data (from StandardizedEvent) ---
    { token: '{{event.id}}', description: 'Unique ID of this processed event', group: 'Event' },
    { token: '{{event.category}}', description: 'Standardized category (DEVICE_STATE, DEVICE_STATUS, etc.)', group: 'Event' },
    { token: '{{event.type}}', description: 'Standardized type (STATE_CHANGED, ONLINE, etc.)', group: 'Event' },
    { token: '{{event.timestamp}}', description: 'Timestamp event occurred (ISO format)', group: 'Event' },
    { token: '{{event.timestampMs}}', description: 'Timestamp event occurred (Epoch milliseconds)', group: 'Event' },
    { token: '{{event.deviceId}}', description: 'Connector-specific ID of the triggering device', group: 'Event' },
    { token: '{{event.connectorId}}', description: 'Internal ID of the connector', group: 'Event' },

    // --- Flattened Payload Data (Common fields) ---
    { token: '{{event.newState}}', description: 'Standardized state (ON, OFF, OPEN, CLOSED, ALERT, NORMAL, etc.)', group: 'Event Payload' },
    { token: '{{event.displayState}}', description: 'User-friendly display state (On, Off, Open, Closed, etc.)', group: 'Event Payload' },
    { token: '{{event.rawStateValue}}', description: 'Original raw state value from the source device', group: 'Event Payload' },
    { token: '{{event.statusType}}', description: 'Specific status (ONLINE, OFFLINE, UNAUTHORIZED)', group: 'Event Payload' },
    { token: '{{event.rawStatusValue}}', description: 'Original raw status value from the source device', group: 'Event Payload' },
    { token: '{{event.originalEventType}}', description: 'The raw event type string from the source system', group: 'Event Payload' },
    // Add more flattened payload fields here if needed

    // --- Device Context Data ---
    { token: '{{device.id}}', description: 'Internal system ID of the device record (if found)', group: 'Device' },
    { token: '{{device.name}}', description: 'Name of the triggering device (from DB or fallback)', group: 'Device' },
    { token: '{{device.type}}', description: 'Standardized device type (Sensor, Lock, etc.)', group: 'Device' },
    { token: '{{device.subtype}}', description: 'Standardized device subtype (Contact, Leak, etc.)', group: 'Device' },
    // Add more device fields if they are reliably populated in the context (e.g., model, vendor)
]; 