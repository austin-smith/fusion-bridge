// src/lib/automation-tokens.ts

export interface AutomationToken {
    token: string; // e.g., "{{event.deviceId}}"
    description: string;
    group: string; // e.g., "Event", "Device"
}

export const AVAILABLE_AUTOMATION_TOKENS: AutomationToken[] = [
    // Event Data
    { token: '{{event.deviceId}}', description: 'ID of the triggering device', group: 'Event' },
    { token: '{{event.event}}', description: 'Type of the event (e.g., DoorSensor.Report)', group: 'Event' },
    { token: '{{event.time}}', description: 'Timestamp event occurred (ISO format)', group: 'Event' },
    { token: '{{event.data.state}}', description: 'Reported state (if available, e.g., open/close, on/off)', group: 'Event' },
    { token: '{{event.data.battery}}', description: 'Reported battery level (if available)', group: 'Event' },
    // Add more specific event.data fields as needed
    
    // Device Data (Will need to be populated based on the trigger device)
    { token: '{{device.id}}', description: 'Internal system ID of the device', group: 'Device' },
    { token: '{{device.name}}', description: 'Name of the triggering device', group: 'Device' },
    { token: '{{device.type}}', description: 'Type of the triggering device (e.g., DoorSensor)', group: 'Device' },
    // Add more device fields as needed (e.g., device.vendor)
]; 