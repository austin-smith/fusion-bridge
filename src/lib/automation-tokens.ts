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

    // --- Device Context Data ---
    { token: '{{device.id}}', description: 'Internal system ID of the triggering device', group: 'Device' },
    { token: '{{device.externalId}}', description: 'Connector-specific external ID of the triggering device', group: 'Device' },
    { token: '{{device.name}}', description: 'Name of the triggering device', group: 'Device' },
    { token: '{{device.type}}', description: 'Device type display name', group: 'Device' },
    { token: '{{device.subtype}}', description: 'Device subtype display name', group: 'Device' },
]; 