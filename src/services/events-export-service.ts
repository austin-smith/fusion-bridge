import { utils, write } from "xlsx";
import type { EnrichedEvent } from '@/types/events';
import { 
  EVENT_TYPE_DISPLAY_MAP, 
  EVENT_CATEGORY_DISPLAY_MAP, 
  EVENT_SUBTYPE_DISPLAY_MAP 
} from '@/lib/mappings/definitions';
import { formatConnectorCategory } from '@/lib/utils';

export interface ExportOptions {
  format: 'csv' | 'xlsx' | 'json';
  columns: string[];
  includeMetadata?: boolean;
}

export interface ExportResult {
  data: Uint8Array;
  filename: string;
  contentType: string;
}

export class EventsExportService {
  /**
   * Export events for API routes (server-side)
   * Returns bytes that can be sent as Response
   */
  async exportEventsForAPI(
    events: EnrichedEvent[], 
    options: ExportOptions
  ): Promise<ExportResult> {
    
    const { format, columns } = options;
    const transformedData = this.transformEventsForExport(events, columns);
    const timestamp = new Date().toISOString().split('T')[0];
    
    switch (format) {
      case 'csv': {
        const ws = utils.json_to_sheet(transformedData);
        const csv = utils.sheet_to_csv(ws);
        return {
          data: new TextEncoder().encode(csv),
          filename: `events-${timestamp}.csv`,
          contentType: 'text/csv'
        };
      }
      
      case 'xlsx': {
        const wb = utils.book_new();
        const ws = utils.json_to_sheet(transformedData);
        
        // Add metadata sheet if requested
        if (options.includeMetadata) {
          const metadataWs = this.createMetadataSheet(events, columns);
          utils.book_append_sheet(wb, metadataWs, 'Export Info');
        }
        
        utils.book_append_sheet(wb, ws, 'Events');
        
        const data = write(wb, { 
          bookType: 'xlsx', 
          type: 'array',
          compression: true 
        });
        
        return {
          data: new Uint8Array(data),
          filename: `events-${timestamp}.xlsx`,
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        };
      }
      
      case 'json': {
        const exportData = {
          exportedAt: new Date().toISOString(),
          totalEvents: events.length,
          columns: columns,
          data: transformedData
        };
        const json = JSON.stringify(exportData, null, 2);
        
        return {
          data: new TextEncoder().encode(json),
          filename: `events-${timestamp}.json`,
          contentType: 'application/json'
        };
      }
      
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  /**
   * Export events for client-side (browser download)
   * Triggers direct download using writeFile
   */
  exportEventsForClient(
    events: EnrichedEvent[], 
    options: ExportOptions
  ): void {
    const { format, columns } = options;
    const transformedData = this.transformEventsForExport(events, columns);
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `events-${timestamp}`;

    switch (format) {
      case 'csv': {
        const ws = utils.json_to_sheet(transformedData);
        const wb = utils.book_new();
        utils.book_append_sheet(wb, ws, 'Events');
        
        // Use dynamic import for client-side
        import('xlsx').then(XLSX => {
          XLSX.writeFile(wb, `${filename}.csv`, { bookType: 'csv' });
        });
        break;
      }
      
      case 'xlsx': {
        const wb = utils.book_new();
        const ws = utils.json_to_sheet(transformedData);
        
        if (options.includeMetadata) {
          const metadataWs = this.createMetadataSheet(events, columns);
          utils.book_append_sheet(wb, metadataWs, 'Export Info');
        }
        
        utils.book_append_sheet(wb, ws, 'Events');
        
        // Use writeFileXLSX for tree-shaken XLSX-only helper
        import('xlsx').then(XLSX => {
          XLSX.writeFileXLSX(wb, `${filename}.xlsx`);
        });
        break;
      }
      
      case 'json': {
        const exportData = {
          exportedAt: new Date().toISOString(),
          totalEvents: events.length,
          columns: columns,
          data: transformedData
        };
        
        // Manual download for JSON
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { 
          type: 'application/json' 
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}.json`;
        a.click();
        URL.revokeObjectURL(url);
        break;
      }
    }
  }

  private transformEventsForExport(events: EnrichedEvent[], columns: string[]): any[] {
    return events.map(event => {
      const transformed: any = {};
      
      columns.forEach(column => {
        switch (column) {
          case 'timestamp':
            transformed['Timestamp'] = new Date(event.timestamp).toISOString();
            break;
          case 'deviceName':
            transformed['Device Name'] = event.deviceName || event.deviceId;
            break;
          case 'connectorName':
            transformed['Connector'] = event.connectorName || 'System';
            break;
          case 'connectorCategory':
            transformed['Connector Type'] = formatConnectorCategory(event.connectorCategory);
            break;
          case 'eventType':
            transformed['Event Type'] = EVENT_TYPE_DISPLAY_MAP[event.eventType as keyof typeof EVENT_TYPE_DISPLAY_MAP] || event.eventType;
            break;
          case 'eventCategory':
            transformed['Event Category'] = EVENT_CATEGORY_DISPLAY_MAP[event.eventCategory as keyof typeof EVENT_CATEGORY_DISPLAY_MAP] || event.eventCategory;
            break;
          case 'eventSubtype':
            const subtypeDisplay = event.eventSubtype ? EVENT_SUBTYPE_DISPLAY_MAP[event.eventSubtype as keyof typeof EVENT_SUBTYPE_DISPLAY_MAP] : '';
            transformed['Event Subtype'] = subtypeDisplay || event.eventSubtype || '';
            break;
          case 'deviceType':
            transformed['Device Type'] = event.deviceTypeInfo?.type || 'Unknown';
            break;
          case 'displayState':
            transformed['State'] = event.displayState || '';
            break;
          case 'locationName':
            transformed['Location'] = event.locationName || '';
            break;
          case 'spaceName':
            transformed['Space'] = event.spaceName || '';
            break;
          case 'eventUuid':
            transformed['Event ID'] = event.eventUuid;
            break;
          case 'deviceId':
            transformed['Device ID'] = event.deviceId;
            break;
          case 'payload':
            transformed['Payload'] = event.payload ? JSON.stringify(event.payload) : '';
            break;
          default:
            // Handle any other columns gracefully
            transformed[column] = (event as any)[column] || '';
        }
      });
      
      return transformed;
    });
  }

  private createMetadataSheet(events: EnrichedEvent[], columns: string[]) {
    const eventCount = events.length;
    const dateRange = eventCount > 0 ? 
      `${new Date(Math.min(...events.map(e => e.timestamp))).toISOString()} to ${new Date(Math.max(...events.map(e => e.timestamp))).toISOString()}` : 
      'No events';
    
    const metadata = [
      ['Export Information', ''],
      ['Generated At', new Date().toISOString()],
      ['Total Events', eventCount],
      ['Date Range', dateRange],
      ['Exported Columns', columns.join(', ')],
      ['', ''],
      ['Column Mapping', ''],
      ...columns.map(col => [col, this.getColumnDescription(col)])
    ];
    
    return utils.aoa_to_sheet(metadata);
  }

  private getColumnDescription(column: string): string {
    const descriptions: Record<string, string> = {
      'timestamp': 'Event occurrence time in ISO format',
      'connectorCategory': 'Category/type of connector (e.g., yolink, piko)',
      'connectorName': 'Name of the connector system',
      'deviceName': 'Name or identifier of the device',
      'deviceType': 'Type of device (e.g., sensor, camera, lock)',
      'eventCategory': 'Category of the event (e.g., device, alarm)',
      'eventType': 'Type of event that occurred',
      'eventSubtype': 'Subtype classification of the event',
      'displayState': 'Current state of the device',
      'locationName': 'Location where the device is installed',
      'spaceName': 'Specific space within the location',
      'eventUuid': 'Unique identifier for the event',
      'deviceId': 'Connector-specific device identifier',
      'payload': 'Additional event data in JSON format'
    };
    return descriptions[column] || `Data for ${column}`;
  }

  /**
   * Get available columns for export selection
   */
  static getAvailableColumns(): { key: string; label: string; description: string }[] {
    return [
      { key: 'timestamp', label: 'Timestamp', description: 'When the event occurred' },
      { key: 'connectorCategory', label: 'Connector Type', description: 'Type of connector' },
      { key: 'connectorName', label: 'Connector', description: 'Source connector' },
      { key: 'deviceId', label: 'Device ID', description: 'Device identifier' },
      { key: 'deviceName', label: 'Device Name', description: 'Name of the device' },
      { key: 'deviceType', label: 'Device Type', description: 'Type of device' },
      { key: 'eventCategory', label: 'Event Category', description: 'Category classification' },
      { key: 'eventType', label: 'Event Type', description: 'What type of event occurred' },
      { key: 'eventSubtype', label: 'Event Subtype', description: 'Subtype classification' },
      { key: 'displayState', label: 'State', description: 'Current device state' },
      { key: 'locationName', label: 'Location', description: 'Device location' },
      { key: 'spaceName', label: 'Space', description: 'Specific space' },
      { key: 'eventUuid', label: 'Event ID', description: 'Unique event identifier' },
      { key: 'payload', label: 'Payload', description: 'Additional event data' },
    ];
  }

  /**
   * Get predefined column presets
   */
  static getColumnPresets(): { key: string; label: string; columns: string[] }[] {
    return [
      {
        key: 'essential',
        label: 'Essential',
        columns: ['timestamp', 'deviceName', 'eventType', 'connectorName', 'displayState']
      },
      {
        key: 'standard',
        label: 'Standard',
        columns: ['timestamp', 'deviceName', 'eventType', 'eventCategory', 'connectorName', 'connectorCategory', 'deviceType', 'displayState', 'locationName']
      },
      {
        key: 'detailed',
        label: 'Detailed',
        columns: ['timestamp', 'deviceName', 'eventType', 'eventCategory', 'eventSubtype', 'connectorName', 'connectorCategory', 'deviceType', 'displayState', 'locationName', 'spaceName', 'eventUuid', 'deviceId']
      },
      {
        key: 'full',
        label: 'Full Dataset',
        columns: EventsExportService.getAvailableColumns().map(col => col.key)
      }
    ];
  }
} 