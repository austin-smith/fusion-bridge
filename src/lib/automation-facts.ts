import { 
    EventType, 
    EVENT_TYPE_DISPLAY_MAP,
    EventCategory, 
    EVENT_CATEGORY_DISPLAY_MAP,
    EventSubtype, 
    EVENT_SUBTYPE_DISPLAY_MAP,
    DeviceType, 
    DeviceSubtype, // We might need a combined DeviceType/Subtype map later
    ArmedState,
    ArmedStateDisplayNames,
} from './mappings/definitions';
import type { JsonRulesEngineOperatorsSchema } from './automation-schemas';
import { z } from 'zod';

// Define available operator types based on data type
// --- Sort operator arrays and cast type --- 
const enumOperators = ['equal', 'in', 'notEqual', 'notIn'].sort() as z.infer<typeof JsonRulesEngineOperatorsSchema>[];
const stringOperators = ['contains', 'doesNotContain', 'equal', 'in', 'notEqual', 'notIn'].sort() as z.infer<typeof JsonRulesEngineOperatorsSchema>[];
const numberOperators = ['equal', 'greaterThan', 'greaterThanInclusive', 'lessThan', 'lessThanInclusive', 'notEqual'].sort() as z.infer<typeof JsonRulesEngineOperatorsSchema>[];
// Add boolean operators if needed

// --- Operator Display Mapping ---
export const OPERATOR_DISPLAY_MAP: Record<z.infer<typeof JsonRulesEngineOperatorsSchema>, string> = {
    equal: '=',
    notEqual: '≠',
    lessThan: '<',
    lessThanInclusive: '≤',
    greaterThan: '>',
    greaterThanInclusive: '≥',
    in: 'in',
    notIn: 'not in',
    contains: 'contains',
    doesNotContain: 'does not contain',
};

// Define Fact Value Input Types for the UI
type FactValueInputType = 'select' | 'text' | 'number' | 'multiselect';

// Define structure for providing options for 'select' or 'multiselect' inputs
export interface FactValueOption {
    value: string | number;
    label: string;
}

// Define the structure for a single Fact available in the rule builder
export interface AutomationFact {
    id: string; // Unique identifier for the fact (e.g., 'event.type') - Used as the 'fact' key in json-rules-engine
    label: string; // User-friendly name (e.g., "Event Type")
    group: string; // Grouping for the UI dropdown (e.g., "Event", "Device", "Space")
    dataType: 'enum' | 'string' | 'number' | 'boolean'; // Data type to determine operators/input
    operators: z.infer<typeof JsonRulesEngineOperatorsSchema>[]; // List of compatible operators
    valueInputType: FactValueInputType; // How the user provides the value
    valueOptions?: FactValueOption[]; // Options for 'select' or 'multiselect'
    
    // Simplified property for dynamic select options from entity lists
    selectableEntityType?: 'Device' | 'Space' | 'AlarmZone' | 'Location' | 'Connector';
}

// Helper function to convert enum/map to FactValueOption[]
const mapToOptions = (map: Record<string, string>): FactValueOption[] => {
    return Object.entries(map)
        .map(([value, label]) => ({ value, label }))
        // --- Sort options by label ---
        .sort((a, b) => a.label.localeCompare(b.label));
};

// --- Define the available facts ---
export const AVAILABLE_AUTOMATION_FACTS: AutomationFact[] = [
    // --- Event Facts ---
    {
        id: 'event.category',
        label: 'Event Category',
        group: 'Event',
        dataType: 'enum',
        operators: enumOperators,
        valueInputType: 'select',
        valueOptions: mapToOptions(EVENT_CATEGORY_DISPLAY_MAP),
    },
    {
        id: 'event.type',
        label: 'Event Type',
        group: 'Event',
        dataType: 'enum',
        operators: enumOperators,
        valueInputType: 'select',
        valueOptions: mapToOptions(EVENT_TYPE_DISPLAY_MAP),
    },
    {
        id: 'event.subtype',
        label: 'Event Subtype',
        group: 'Event',
        dataType: 'enum',
        operators: enumOperators,
        valueInputType: 'select',
        valueOptions: mapToOptions(EVENT_SUBTYPE_DISPLAY_MAP),
    },
    {
        id: 'event.displayState',
        label: 'Event Display State',
        group: 'Event',
        dataType: 'string', // Display states are strings
        operators: stringOperators,
        valueInputType: 'text', // Or maybe 'select' if we define all possible display states?
    },
    {
        id: 'event.buttonNumber',
        label: 'Button Number',
        group: 'Event',
        dataType: 'number',
        operators: numberOperators,
        valueInputType: 'number',
    },
    {
        id: 'event.buttonPressType',
        label: 'Button Press Type',
        group: 'Event',
        dataType: 'enum',
        operators: enumOperators,
        valueInputType: 'select',
        valueOptions: [
            { value: 'Press', label: 'Short Press' },
            { value: 'LongPress', label: 'Long Press' }
        ],
    },

    // --- Device Facts ---
    {
        id: 'device.id', // This fact means the condition value will be a device ID
        label: 'Device',  // User-friendly label for the fact itself (e.g., user selects "Device IS X")
        group: 'Device',
        dataType: 'string', // The ID is a string
        operators: stringOperators, // Compare the ID with 'equal', 'notEqual', 'in', etc.
        valueInputType: 'select',   // The UI should show a dropdown
        selectableEntityType: 'Device', // Populate dropdown with Devices
    },
    {
        id: 'device.name',
        label: 'Device Name',
        group: 'Device',
        dataType: 'string',
        operators: stringOperators,
        valueInputType: 'text',
    },
    {
        id: 'device.type',
        label: 'Device Type',
        group: 'Device',
        dataType: 'enum',
        operators: enumOperators,
        valueInputType: 'select',
        valueOptions: Object.values(DeviceType).map(value => ({ value, label: value })).sort((a,b) => a.label.localeCompare(b.label)),
    },
    {
        id: 'device.subtype',
        label: 'Device Subtype',
        group: 'Device',
        dataType: 'enum',
        operators: enumOperators,
        valueInputType: 'select',
         // Use DeviceSubtype enum keys as values and labels
        valueOptions: Object.values(DeviceSubtype).map(value => ({ value, label: value })).sort((a,b) => a.label.localeCompare(b.label)),
    },
    {
        id: 'device.externalId',
        label: 'Device External ID',
        group: 'Device',
        dataType: 'string',
        operators: stringOperators,
        valueInputType: 'text',
    },

    // --- Connector Facts ---
    {
        id: 'connector.id',
        label: 'Connector',
        group: 'Connector',
        dataType: 'string',
        operators: enumOperators,
        valueInputType: 'select', // Or maybe a select if we pass connector list?
        selectableEntityType: 'Connector', // Populate dropdown with Connectors
    },
    // Add connector.name/category later if needed

    // --- Space Facts ---
    {
        id: 'space.id', 
        label: 'Space',
        group: 'Space',
        dataType: 'string',
        operators: stringOperators,
        valueInputType: 'select',
        selectableEntityType: 'Space',
    },
    {
        id: 'space.name',
        label: 'Space Name',
        group: 'Space',
        dataType: 'string',
        operators: stringOperators,
        valueInputType: 'text',
    },

    // --- Alarm Zone Facts ---
    {
        id: 'alarmZone.id', 
        label: 'Alarm Zone',
        group: 'Alarm Zone',
        dataType: 'string',
        operators: stringOperators,
        valueInputType: 'select',
        selectableEntityType: 'AlarmZone',
    },
    {
        id: 'alarmZone.name',
        label: 'Alarm Zone Name',
        group: 'Alarm Zone',
        dataType: 'string',
        operators: stringOperators,
        valueInputType: 'text',
    },
    {
        id: 'alarmZone.armedState',
        label: 'Alarm Zone Armed State',
        group: 'Alarm Zone',
        dataType: 'enum',
        operators: enumOperators,
        valueInputType: 'select',
        valueOptions: mapToOptions(ArmedStateDisplayNames),
    },

    // --- Location Facts (Placeholder) ---
    {
        id: 'location.id',
        label: 'Location',
        group: 'Location',
        dataType: 'string',
        operators: stringOperators,
        valueInputType: 'select',
        selectableEntityType: 'Location',
    },
    {
        id: 'location.name',
        label: 'Location Name',
        group: 'Location',
        dataType: 'string',
        operators: stringOperators,
        valueInputType: 'text',
    },

] as const; // --- Apply 'as const' directly to the array literal ---

// Helper function to get Fact definition by ID
export const getFactById = (id: string): typeof AVAILABLE_AUTOMATION_FACTS[number] | undefined => {
    return AVAILABLE_AUTOMATION_FACTS.find(fact => fact.id === id);
}; 