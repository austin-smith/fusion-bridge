import { withOrganizationAuth, type OrganizationAuthContext } from '@/lib/auth/withOrganizationAuth';
import { createOrgScopedDb } from '@/lib/db/org-scoped-db';
import { handleExportRequest } from '@/lib/api/export-handler';
import { devicesExportConfig, type ExportableDevice } from '@/lib/export/configs/devices-export-config';
import type { DataFetcher } from '@/lib/api/export-handler';
import { getDeviceTypeInfo } from '@/lib/mappings/identification';
import type { DisplayState } from '@/lib/mappings/definitions';

// Data fetcher function for devices
const fetchDevicesForExport: DataFetcher<ExportableDevice> = async (
  authContext: OrganizationAuthContext,
  filters: Record<string, any>
): Promise<ExportableDevice[]> => {
  const orgDb = createOrgScopedDb(authContext.organizationId);
  
  // Build device query filters from the provided filters
  const deviceFilters: any = {};
  
  // Apply connector category filter
  if (filters.connectorCategory) {
    deviceFilters.connectorCategory = filters.connectorCategory;
  }
  
  // Apply device type filter
  if (filters.deviceType) {
    deviceFilters.deviceType = filters.deviceType;
  }
  
  // Apply status filter (could be online/offline/all)
  if (filters.status && filters.status !== 'all') {
    // This would need to be implemented based on your status definition
    // For now, we'll skip complex status filtering in the SQL query
  }
  
  // Apply location/space filters
  if (filters.locationId) {
    deviceFilters.locationId = filters.locationId;
  }
  
  if (filters.spaceId) {
    deviceFilters.spaceId = filters.spaceId;
  }
  
  // Apply text-based filters (device name, connector name, etc.)
  if (filters.deviceName) {
    deviceFilters.deviceName = filters.deviceName;
  }
  
  if (filters.connectorName) {
    deviceFilters.connectorName = filters.connectorName;
  }
  
  try {
    // Fetch all devices for the organization
    const devices = await orgDb.devices.findAll();
    
          // Transform the devices to match our ExportableDevice interface
      const exportableDevices: ExportableDevice[] = devices.map(device => {
        // Compute standardized device type info (same as UI displays)
        const deviceTypeInfo = getDeviceTypeInfo(device.connector.category, device.type);
        
        return {
          ...device,
          internalId: device.id,
          connectorCategory: device.connector.category,
          connectorName: device.connector.name,
          deviceTypeInfo: deviceTypeInfo, // Add the standardized type info
          displayState: (device.status as DisplayState) || undefined, // Map device.status to displayState for export
          // Add computed fields that might not be in the base query
          lastSeen: device.updatedAt ? new Date(device.updatedAt) : undefined,
          lastStateUpdate: device.updatedAt || null,
          // batteryPercentage comes directly from the device table
          batteryPercentage: device.batteryPercentage ?? null,
        };
      });
    
    // Apply client-side filtering for now (could be optimized with proper DB filtering later)
    let filteredDevices = exportableDevices;
    
    if (filters.connectorCategory && filters.connectorCategory !== 'all') {
      filteredDevices = filteredDevices.filter(d => d.connectorCategory === filters.connectorCategory);
    }
    
    if (filters.deviceType) {
      filteredDevices = filteredDevices.filter(d => 
        d.deviceTypeInfo?.type?.toLowerCase().includes(filters.deviceType.toLowerCase()) ||
        d.type?.toLowerCase().includes(filters.deviceType.toLowerCase())
      );
    }
    
    if (filters.deviceName) {
      filteredDevices = filteredDevices.filter(d => 
        d.name?.toLowerCase().includes(filters.deviceName.toLowerCase()) ||
        d.deviceId?.toLowerCase().includes(filters.deviceName.toLowerCase())
      );
    }
    
    if (filters.connectorName) {
      filteredDevices = filteredDevices.filter(d => 
        d.connectorName?.toLowerCase().includes(filters.connectorName.toLowerCase())
      );
    }
    
    console.log(`[DevicesExport] Fetched ${filteredDevices.length} devices for export (${exportableDevices.length} total)`);
    
    return filteredDevices;
    
  } catch (error) {
    console.error('[DevicesExport] Error fetching devices:', error);
    throw new Error('Failed to fetch devices for export');
  }
};

// GET handler for devices export
export const GET = withOrganizationAuth(async (request, authContext: OrganizationAuthContext) => {
  return handleExportRequest(request, authContext, {
    dataFetcher: fetchDevicesForExport,
    exportConfig: devicesExportConfig,
    dataTypeName: 'devices'
  });
}); 