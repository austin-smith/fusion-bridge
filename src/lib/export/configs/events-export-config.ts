import type { 
  ExportConfig, 
  DataTransformer, 
  MetadataGenerator, 
  ColumnDefinition
} from '../types';
import type { EnrichedEvent } from '@/types/events';
import { 
  EVENT_TYPE_DISPLAY_MAP, 
  EVENT_CATEGORY_DISPLAY_MAP, 
  EVENT_SUBTYPE_DISPLAY_MAP 
} from '@/lib/mappings/definitions';
import { formatConnectorCategory } from '@/lib/utils';

// Consolidated column definitions with transform functions
interface EventColumnDefinition extends ColumnDefinition {
  transform: (event: EnrichedEvent) => string;
}

const EVENT_COLUMNS: EventColumnDefinition[] = [
  {
    key: 'timestamp',
    label: 'Timestamp',
    description: 'When the event occurred',
    transform: (event) => new Date(event.timestamp).toISOString()
  },
  {
    key: 'connectorCategory',
    label: 'Connector Type',
    description: 'Type of connector', 
    transform: (event) => formatConnectorCategory(event.connectorCategory)
  },
  {
    key: 'connectorName',
    label: 'Connector', 
    description: 'Source connector',
    transform: (event) => event.connectorName || 'System'
  },
  {
    key: 'deviceId', 
    label: 'Device ID',
    description: 'Device identifier',
    transform: (event) => event.deviceId
  },
  {
    key: 'deviceName', 
    label: 'Device Name',
    description: 'Name of the device',
    transform: (event) => event.deviceName || event.deviceId
  },
  {
    key: 'deviceType',
    label: 'Device Type',
    description: 'Type of device',
    transform: (event) => event.deviceTypeInfo?.type || 'Unknown'
  },
  {
    key: 'eventCategory', 
    label: 'Event Category',
    description: 'Category classification',
    transform: (event) => EVENT_CATEGORY_DISPLAY_MAP[event.eventCategory as keyof typeof EVENT_CATEGORY_DISPLAY_MAP] || event.eventCategory
  },
  {
    key: 'eventType',
    label: 'Event Type',
    description: 'What type of event occurred',
    transform: (event) => EVENT_TYPE_DISPLAY_MAP[event.eventType as keyof typeof EVENT_TYPE_DISPLAY_MAP] || event.eventType
  },
  {
    key: 'eventSubtype',
    label: 'Event Subtype', 
    description: 'Subtype classification',
    transform: (event) => {
      const subtypeDisplay = event.eventSubtype ? EVENT_SUBTYPE_DISPLAY_MAP[event.eventSubtype as keyof typeof EVENT_SUBTYPE_DISPLAY_MAP] : '';
      return subtypeDisplay || event.eventSubtype || '';
    }
  },
  {
    key: 'displayState',
    label: 'State', 
    description: 'Current device state',
    transform: (event) => event.displayState || ''
  },
  {
    key: 'locationName',
    label: 'Location',
    description: 'Device location', 
    transform: (event) => event.locationName || ''
  },
  {
    key: 'spaceName',
    label: 'Space',
    description: 'Specific space',
    transform: (event) => event.spaceName || ''
  },
  {
    key: 'eventUuid',
    label: 'Event ID',
    description: 'Unique event identifier',
    transform: (event) => event.eventUuid
  },
  {
    key: 'payload',
    label: 'Payload',
    description: 'Additional event data',
    transform: (event) => event.payload ? JSON.stringify(event.payload) : ''
  }
];

// Events-specific transformer
class EventsDataTransformer implements DataTransformer<EnrichedEvent> {
  transform(events: EnrichedEvent[], columns: string[]): Record<string, any>[] {
    return events.map(event => {
      const transformed: any = {};
      
      columns.forEach(column => {
        const columnDef = EVENT_COLUMNS.find(def => def.key === column);
        if (columnDef) {
          transformed[columnDef.label] = columnDef.transform(event);
        } else {
          // Handle unknown columns gracefully
          transformed[column] = (event as any)[column] || '';
        }
      });
      
      return transformed;
    });
  }

  getColumnDescription(column: string): string {
    const columnDef = EVENT_COLUMNS.find(def => def.key === column);
    return columnDef ? columnDef.description : `Data for ${column}`;
  }
}

// Create and export the events export configuration
export const eventsExportConfig: ExportConfig<EnrichedEvent> = {
  availableColumns: EVENT_COLUMNS,
  transformer: new EventsDataTransformer(),
};

// Export individual pieces for convenience
export { EventsDataTransformer };
export { EVENT_COLUMNS }; 