// src/lib/automation-tokens.ts

export interface AutomationToken {
    token: string; // e.g., "{{event.deviceId}}"
    description: string;
    group: string; // e.g., "Event", "Device"
}

export const AVAILABLE_AUTOMATION_TOKENS: AutomationToken[] = [
    // --- Event Data (from StandardizedEvent) ---
    { token: '{{event.id}}', description: 'Unique ID of this processed event', group: 'Event' },
    { token: '{{event.categoryId}}', description: 'Event category ID', group: 'Event' },
    { token: '{{event.category}}', description: 'Event category display name', group: 'Event' },
    { token: '{{event.typeId}}', description: 'Event type ID', group: 'Event' },
    { token: '{{event.type}}', description: 'Event type display name', group: 'Event' },
    { token: '{{event.subtypeId}}', description: 'Event subtype ID', group: 'Event' },
    { token: '{{event.subtype}}', description: 'Event subtype display name', group: 'Event' },
    { token: '{{event.displayState}}', description: 'User-friendly display state (On, Off, Open, Closed, etc.)', group: 'Event' },
    { token: '{{event.timestamp}}', description: 'Timestamp event occurred (ISO format)', group: 'Event' },
    { token: '{{event.timestampMs}}', description: 'Timestamp event occurred (Epoch milliseconds)', group: 'Event' },

    // --- Event Thumbnail Data ---
    { token: '{{event.thumbnail}}', description: 'Complete data URI with embedded thumbnail (data:image/jpeg;base64,...)', group: 'Event' },

    // --- Device Context Data ---
    { token: '{{device.id}}', description: 'Internal system ID of the triggering device', group: 'Device' },
    { token: '{{device.externalId}}', description: 'Connector-specific external ID of the triggering device', group: 'Device' },
    { token: '{{device.name}}', description: 'Name of the triggering device', group: 'Device' },
    { token: '{{device.type}}', description: 'Device type display name', group: 'Device' },
    { token: '{{device.subtype}}', description: 'Device subtype display name', group: 'Device' },

    // --- Space Context Data (Physical Location) ---
    { token: '{{space.id}}', description: 'Internal ID of the device\'s physical space', group: 'Space' },
    { token: '{{space.name}}', description: 'Name of the device\'s physical space', group: 'Space' },

    // --- Alarm Zone Context Data (Security Grouping) ---
    { token: '{{alarmZone.id}}', description: 'Internal ID of the device\'s alarm zone', group: 'Alarm Zone' },
    { token: '{{alarmZone.name}}', description: 'Name of the device\'s alarm zone', group: 'Alarm Zone' },
    { token: '{{alarmZone.armedState}}', description: 'Current armed state of the alarm zone (Armed, Disarmed, Triggered)', group: 'Alarm Zone' },

    // --- Location Context Data ---
    { token: '{{location.id}}', description: 'Internal ID of the location', group: 'Location' },
    { token: '{{location.name}}', description: 'Name of the location', group: 'Location' },

    // --- Connector Context Data ---
    { token: '{{connector.id}}', description: 'Internal ID of the connector', group: 'Connector' },
    { token: '{{connector.name}}', description: 'Name of the connector', group: 'Connector' },

    // --- Schedule Context Data (for scheduled automations) ---
    { token: '{{schedule.triggeredAtUTC}}', description: 'UTC timestamp when schedule triggered (ISO format)', group: 'Schedule' },
    { token: '{{schedule.triggeredAtLocal}}', description: 'Local timestamp when schedule triggered', group: 'Schedule' },
    { token: '{{schedule.triggeredAtMs}}', description: 'Timestamp when schedule triggered (Epoch milliseconds)', group: 'Schedule' },
]; 