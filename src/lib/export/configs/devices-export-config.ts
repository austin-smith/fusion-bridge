import type { 
  ExportConfig, 
  DataTransformer, 
  MetadataGenerator, 
  ColumnDefinition
} from '../types';
import type { DeviceWithConnector } from '@/types';
import type { DisplayState } from '@/lib/mappings/definitions';
import { formatConnectorCategory } from '@/lib/utils';

// Extended device interface for export (matches what we expect from devices page)
interface ExportableDevice extends DeviceWithConnector {
  internalId?: string;
  displayState?: DisplayState;
  lastSeen?: Date;
  lastStateUpdate?: Date | null;
  batteryPercentage?: number | null;
  spaceName?: string | null;
  locationName?: string | null;
  spaceId?: string | null;
}

// Consolidated column definitions with transform functions
interface DeviceColumnDefinition extends ColumnDefinition {
  transform: (device: ExportableDevice) => string;
}

const DEVICE_COLUMNS: DeviceColumnDefinition[] = [
  {
    key: 'internalId',
    label: 'Internal Device ID',
    description: 'Internal database identifier for the device',
    transform: (device) => device.internalId || device.id
  },
  {
    key: 'deviceId',
    label: 'External Device ID', 
    description: 'Connector-specific device identifier',
    transform: (device) => device.deviceId
  },
  {
    key: 'name',
    label: 'Device Name',
    description: 'User-friendly name of the device',
    transform: (device) => device.name || device.deviceId
  },
  {
    key: 'deviceType',
    label: 'Device Type',
    description: 'Type of device (e.g., sensor, camera, lock)',
    transform: (device) => device.deviceTypeInfo?.type || device.type || 'Unknown'
  },
  {
    key: 'deviceSubtype',
    label: 'Device Subtype',
    description: 'Subtype classification of the device',
    transform: (device) => device.deviceTypeInfo?.subtype || ''
  },
  {
    key: 'displayState',
    label: 'Current State',
    description: 'Current state of the device',
    transform: (device) => device.displayState || ''
  },
  {
    key: 'batteryPercentage',
    label: 'Battery %',
    description: 'Battery level percentage (if applicable)',
    transform: (device) => device.batteryPercentage !== null && device.batteryPercentage !== undefined 
      ? `${device.batteryPercentage}%` : ''
  },
  {
    key: 'connectorCategory',
    label: 'Connector Type',
    description: 'Category/type of connector (e.g., yolink, piko)',
    transform: (device) => formatConnectorCategory(device.connectorCategory)
  },
  {
    key: 'connectorName',
    label: 'Connector',
    description: 'Name of the connector system',
    transform: (device) => device.connectorName || 'Unknown'
  },
  {
    key: 'locationName',
    label: 'Location',
    description: 'Location where the device is installed',
    transform: (device) => device.locationName || ''
  },
  {
    key: 'spaceName',
    label: 'Space',
    description: 'Specific space within the location',
    transform: (device) => device.spaceName || ''
  },
  {
    key: 'vendor',
    label: 'Vendor',
    description: 'Device manufacturer or vendor',
    transform: (device) => device.vendor || ''
  },
  {
    key: 'model',
    label: 'Model',
    description: 'Device model number or name',
    transform: (device) => device.model || ''
  },
  {
    key: 'lastSeen',
    label: 'Last Seen',
    description: 'Last time the device was seen/active',
    transform: (device) => device.lastSeen ? device.lastSeen.toISOString() : ''
  },
  {
    key: 'lastStateUpdate',
    label: 'Last State Update',
    description: 'Last time the device state was updated',
    transform: (device) => device.lastStateUpdate ? new Date(device.lastStateUpdate).toISOString() : ''
  },
  {
    key: 'createdAt',
    label: 'Created At',
    description: 'When the device was first added to the system',
    transform: (device) => new Date(device.createdAt).toISOString()
  },
  {
    key: 'updatedAt',
    label: 'Last Updated',
    description: 'When the device record was last modified',
    transform: (device) => new Date(device.updatedAt).toISOString()
  },
  {
    key: 'rawDeviceData',
    label: 'Raw Device Data',
    description: 'Original device data from connector in JSON format',
    transform: (device) => device.rawDeviceData ? JSON.stringify(device.rawDeviceData) : ''
  }
];

// Devices-specific transformer
class DevicesDataTransformer implements DataTransformer<ExportableDevice> {
  transform(devices: ExportableDevice[], columns: string[]): Record<string, any>[] {
    return devices.map(device => {
      const transformed: any = {};
      
      columns.forEach(column => {
        const columnDef = DEVICE_COLUMNS.find(def => def.key === column);
        if (columnDef) {
          transformed[columnDef.label] = columnDef.transform(device);
        } else {
          // Handle unknown columns gracefully
          transformed[column] = (device as any)[column] || '';
        }
      });
      
      return transformed;
    });
  }

  getColumnDescription(column: string): string {
    const columnDef = DEVICE_COLUMNS.find(def => def.key === column);
    return columnDef ? columnDef.description : `Data for ${column}`;
  }
}

// Create and export the devices export configuration
export const devicesExportConfig: ExportConfig<ExportableDevice> = {
  availableColumns: DEVICE_COLUMNS,
  transformer: new DevicesDataTransformer()
};

// Export individual pieces for convenience
export { DevicesDataTransformer };
export { DEVICE_COLUMNS };
export type { ExportableDevice }; 