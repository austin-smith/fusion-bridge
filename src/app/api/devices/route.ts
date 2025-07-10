import { NextResponse, NextRequest } from 'next/server';
import { withOrganizationAuth, type OrganizationAuthContext } from '@/lib/auth/withOrganizationAuth';
import { createOrgScopedDb } from '@/lib/db/org-scoped-db';
import { db } from '@/data/db';
import { devices, connectors, pikoServers, cameraAssociations, areas, areaDevices } from '@/data/db/schema';
import { eq, count, and, inArray, sql } from 'drizzle-orm';
import * as yolinkDriver from '@/services/drivers/yolink';
import { getRawStateStringFromYoLinkData } from '@/services/drivers/yolink';
import * as pikoDriver from '@/services/drivers/piko';
import * as geneaDriver from '@/services/drivers/genea';
import { getDeviceTypeInfo } from '@/lib/mappings/identification';
import type { DeviceWithConnector, PikoServer, Connector } from '@/types';
import { useFusionStore } from '@/stores/store';
import type { TypedDeviceInfo, IntermediateState, DisplayState } from '@/lib/mappings/definitions';
import { DeviceType, BinaryState, ContactState, ON, OFF, CANONICAL_STATE_MAP, OFFLINE, ONLINE, LockStatus, ErrorState } from '@/lib/mappings/definitions';
import { z } from 'zod';
import { deviceSyncSchema } from '@/lib/schemas/api-schemas';

// Helper function to determine if a device is a security device based on its type
function isSecurityDevice(deviceTypeInfo: TypedDeviceInfo): boolean {
  const securityDeviceTypes = [
    DeviceType.Sensor,
    DeviceType.Camera,
    DeviceType.Door,
    DeviceType.Lock,
    DeviceType.Alarm,
  ];
  
  return securityDeviceTypes.includes(deviceTypeInfo.type);
}

// Helper function to get association count (organization-scoped)
async function getAssociationCount(
  internalDeviceId: string, 
  category: string,
  orgDb: any
): Promise<number | null> {
  let result: { value: number }[];

  if (category === 'piko') {
    // If it's a Piko camera, count associated devices using its internal ID
    result = await db.select({ value: count() })
      .from(cameraAssociations)
      .innerJoin(devices, eq(devices.id, cameraAssociations.deviceId))
      .innerJoin(connectors, eq(devices.connectorId, connectors.id))
      .where(and(
        eq(cameraAssociations.pikoCameraId, internalDeviceId),
        eq(connectors.organizationId, orgDb.organizationId)
      ));
  } else {
    // For any other device category, count associated Piko cameras
    result = await db.select({ value: count() })
      .from(cameraAssociations)
      .innerJoin(devices, eq(devices.id, cameraAssociations.pikoCameraId))
      .innerJoin(connectors, eq(devices.connectorId, connectors.id))
      .where(and(
        eq(cameraAssociations.deviceId, internalDeviceId),
        eq(connectors.organizationId, orgDb.organizationId)
      ));
  }
  
  return result?.[0]?.value ?? null;
}

// --- BEGIN Re-add Helper to map IntermediateState to DisplayState ---
function mapIntermediateToDisplay(state: IntermediateState | undefined | null): DisplayState | undefined {
    if (!state) return undefined;

    // Simple direct mappings first
    const simpleMap = CANONICAL_STATE_MAP.simple as Record<IntermediateState, DisplayState>;
    if (simpleMap[state]) {
        return simpleMap[state];
    }

    // Context-dependent mappings (add later if needed for sensors)

    console.warn(`[API Devices] No display mapping found for IntermediateState: ${state}`);
    return undefined; // Or return a default like 'Unknown'
}
// --- END Re-add Helper to map IntermediateState to DisplayState ---

interface DeviceWithConnectorInfo {
  id: string;
  deviceId: string;
  connectorId: string;
  name: string | null;
  type: string;
  lastStateUpdate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  connectorName: string;
  connectorCategory: string;
}

interface DeviceResponse {
  id: string;
  deviceId: string;
  connectorId: string;
  name: string | null;
  type: string;
  lastStateUpdate: string | null;
  createdAt: string;
  updatedAt: string;
  connectorName: string;
  connectorCategory: string;
}

interface DevicesSyncRequest {
  connectorId: string;
}

// Helper function to format device
function formatDevice(device: DeviceWithConnectorInfo): DeviceResponse {
  return {
    id: device.id,
    deviceId: device.deviceId,
    connectorId: device.connectorId,
    name: device.name,
    type: device.type,
    lastStateUpdate: device.lastStateUpdate ? device.lastStateUpdate.toISOString() : null,
    createdAt: device.createdAt.toISOString(),
    updatedAt: device.updatedAt.toISOString(),
    connectorName: device.connectorName,
    connectorCategory: device.connectorCategory,
  };
}

// Function to count devices with filters (organization-scoped, database-level counting)
async function getDevicesCount(
  organizationId: string,
  connectorCategory?: string,
  deviceType?: string,
  status?: string
): Promise<number> {
  try {
    // Build WHERE conditions
    const conditions = [eq(connectors.organizationId, organizationId)];
    
    // Connector category filtering
    if (connectorCategory && connectorCategory.toLowerCase() !== 'all') {
      conditions.push(eq(connectors.category, connectorCategory.toLowerCase()));
    }
    
    // Device type filtering
    if (deviceType && deviceType.toLowerCase() !== 'all') {
      conditions.push(eq(devices.type, deviceType));
    }
    
    // Status filtering
    if (status && status.toLowerCase() !== 'all') {
      conditions.push(eq(devices.status, status));
    }
    
    // Build the count query
    const result = await db
      .select({ count: count() })
      .from(devices)
      .innerJoin(connectors, eq(devices.connectorId, connectors.id))
      .where(and(...conditions));
    
    return result[0]?.count || 0;
  } catch (error) {
    console.error('Error counting devices:', error);
    return 0;
  }
}

// GET /api/devices – returns devices with connector information and association count
// Optionally filters by deviceId query parameter or returns count with count=true
export const GET = withOrganizationAuth(async (request, authContext: OrganizationAuthContext) => {
  try {
    const orgDb = createOrgScopedDb(authContext.organizationId);
    const { searchParams } = new URL(request.url);
    const requestedDeviceId = searchParams.get('deviceId');
    const countOnly = searchParams.get('count') === 'true';
    
    // Parse filter parameters
    const connectorCategory = searchParams.get('connectorCategory');
    const deviceType = searchParams.get('deviceType');
    const status = searchParams.get('status');

    // If count is requested, return count only
    if (countOnly) {
      const deviceCount = await getDevicesCount(
        authContext.organizationId,
        connectorCategory || undefined,
        deviceType || undefined,
        status || undefined
      );
      return NextResponse.json({
        success: true,
        count: deviceCount,
        filters: {
          connectorCategory,
          deviceType,
          status
        }
      });
    }

    if (requestedDeviceId) {
      // Fetch single device by external deviceId
      const deviceResult = await orgDb.devices.findByExternalId(requestedDeviceId);
      
      if (deviceResult.length === 0) {
        return NextResponse.json({ success: false, error: 'Device not found' }, { status: 404 });
      }

      const deviceRow = deviceResult[0];
      
      // Get additional details for this device
      const associationCount = await getAssociationCount(deviceRow.id, deviceRow.connector?.category || 'unknown', orgDb);
      
      // Get Piko server details if applicable
      let pikoServerDetails: PikoServer | undefined = undefined;
      if (deviceRow.serverId) {
        const pikoServerResult = await db.select()
          .from(pikoServers)
          .where(eq(pikoServers.serverId, deviceRow.serverId))
          .limit(1);
        pikoServerDetails = pikoServerResult[0] as PikoServer;
      }

      const deviceTypeInfo = getDeviceTypeInfo(deviceRow.connector?.category || 'unknown', deviceRow.type);
      const displayState = deviceRow.status as DisplayState | undefined;

      const singleDevice: DeviceWithConnector = {
        id: deviceRow.id,
        deviceId: deviceRow.deviceId,
        connectorId: deviceRow.connectorId,
        name: deviceRow.name,
        type: deviceRow.type,
        status: deviceRow.status,
        batteryPercentage: deviceRow.batteryPercentage ?? undefined,
        model: deviceRow.model ?? undefined,
        vendor: deviceRow.vendor ?? undefined,
        url: deviceRow.url ?? undefined,
        createdAt: deviceRow.createdAt,
        updatedAt: deviceRow.updatedAt,
        serverId: deviceRow.serverId,
        connectorName: deviceRow.connector?.name ?? 'Unknown',
        connectorCategory: deviceRow.connector?.category ?? 'Unknown', 
        serverName: pikoServerDetails?.name,
        pikoServerDetails: pikoServerDetails,
        associationCount: associationCount,
        deviceTypeInfo: deviceTypeInfo,
        displayState,
        areaId: deviceRow.areaId,
        locationId: deviceRow.locationId,
      };

      return NextResponse.json({ success: true, data: singleDevice });
    } else {
      // Fetch all devices in organization
      const devicesResult = await orgDb.devices.findAll();

      if (devicesResult.length === 0) {
        return NextResponse.json({ success: true, data: [] });
      }

      // Extract device IDs for batch queries
      const deviceIds = devicesResult.map(d => d.id);

      // Batch fetch association counts
      const pikoAssociations = await db.select({ 
        deviceId: cameraAssociations.pikoCameraId, 
        value: count() 
      })
        .from(cameraAssociations)
        .innerJoin(devices, eq(devices.id, cameraAssociations.deviceId))
        .innerJoin(connectors, eq(devices.connectorId, connectors.id))
        .where(and(
          inArray(cameraAssociations.pikoCameraId, deviceIds),
          eq(connectors.organizationId, authContext.organizationId)
        ))
        .groupBy(cameraAssociations.pikoCameraId);

      const deviceAssociations = await db.select({ 
        deviceId: cameraAssociations.deviceId, 
        value: count() 
      })
        .from(cameraAssociations)
        .innerJoin(devices, eq(devices.id, cameraAssociations.pikoCameraId))
        .innerJoin(connectors, eq(devices.connectorId, connectors.id))
        .where(and(
          inArray(cameraAssociations.deviceId, deviceIds),
          eq(connectors.organizationId, authContext.organizationId)
        ))
        .groupBy(cameraAssociations.deviceId);

      // Create association counts map
      const associationCountsMap = new Map<string, number>();
      pikoAssociations.forEach(assoc => associationCountsMap.set(assoc.deviceId, assoc.value));
      deviceAssociations.forEach(assoc => associationCountsMap.set(assoc.deviceId, assoc.value));

      // Batch fetch Piko servers
      const serverIds = devicesResult
        .filter((d: any) => d.serverId)
        .map((d: any) => d.serverId!)
        .filter((id: string, index: number, arr: string[]) => arr.indexOf(id) === index); // Unique values only

      const pikoServersResult = serverIds.length > 0 
        ? await db.select().from(pikoServers).where(inArray(pikoServers.serverId, serverIds))
        : [];
      
      const pikoServersMap = new Map(pikoServersResult.map(server => [server.serverId, server as PikoServer]));

      // Map results to DeviceWithConnector format
      const devicesWithDetails: DeviceWithConnector[] = devicesResult.map((deviceRow: any) => {
        const pikoServerDetails = deviceRow.serverId ? pikoServersMap.get(deviceRow.serverId) : undefined;
        const associationCount = associationCountsMap.get(deviceRow.id) ?? null; 
        const deviceTypeInfo = getDeviceTypeInfo(deviceRow.connector?.category || 'unknown', deviceRow.type);
        const displayState = deviceRow.status as DisplayState | undefined;

        return {
          id: deviceRow.id,
          deviceId: deviceRow.deviceId,
          connectorId: deviceRow.connectorId,
          name: deviceRow.name,
          type: deviceRow.type,
          status: deviceRow.status,
          batteryPercentage: deviceRow.batteryPercentage ?? undefined,
          model: deviceRow.model ?? undefined,
          vendor: deviceRow.vendor ?? undefined,
          url: deviceRow.url ?? undefined,
          createdAt: deviceRow.createdAt,
          updatedAt: deviceRow.updatedAt,
          serverId: deviceRow.serverId,
          connectorName: deviceRow.connector?.name ?? 'Unknown',
          connectorCategory: deviceRow.connector?.category ?? 'Unknown', 
          serverName: pikoServerDetails?.name,
          pikoServerDetails: pikoServerDetails,
          associationCount: associationCount,
          deviceTypeInfo: deviceTypeInfo,
          displayState,
          areaId: deviceRow.areaId,
          locationId: deviceRow.locationId,
        } satisfies DeviceWithConnector;
      });

      return NextResponse.json({ success: true, data: devicesWithDetails });
    }

  } catch (error) {
    console.error('Error fetching devices:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch devices' },
      { status: 500 }
    );
  }
});

// POST /api/devices – syncs devices from all connectors and returns them with count
export const POST = withOrganizationAuth(async (request, authContext: OrganizationAuthContext) => {
  try {
    const orgDb = createOrgScopedDb(authContext.organizationId);
    const errors = [];
    let syncedCount = 0;
    
    // Get all connectors for this organization
    const allConnectors = await orgDb.connectors.findAll();
    
    // Sync devices for each connector
    for (const connector of allConnectors) {
      try {
        let connectorConfig;
        try { 
          connectorConfig = JSON.parse(connector.cfg_enc); 
        } catch (e) {
          console.error(`[API Sync] Error parsing config for connector ${connector.name} (ID: ${connector.id}):`, e);
          errors.push({
            connectorName: connector.name,
            error: 'Failed to parse connector configuration.'
          });
          continue;
        }

        let result: number;
        switch (connector.category) {
          case 'yolink':
            result = await syncYoLinkDevices(connector.id, connectorConfig);
            break;
          case 'piko':
            result = await syncPikoDevices(connector.id, connectorConfig);
            break;
          case 'genea':
            result = await syncGeneaDevices(connector.id, connectorConfig);
            break;
          default:
            console.warn(`[API Sync] Skipping unsupported connector category: ${connector.category}`);
            continue;
        }

        syncedCount += result;
        console.log(`[API Sync] Synced ${result} devices from ${connector.category} connector ${connector.name}`);

      } catch (connectorError) {
        const errorMessage = connectorError instanceof Error ? connectorError.message : 'Unknown error';
        console.error(`[API Sync] Error syncing connector ${connector.name}:`, errorMessage);
        errors.push({
          connectorName: connector.name,
          error: errorMessage
        });
      }
    }

    // Fetch updated devices for response
    const devicesWithDetails = await fetchDevicesForOrganization(orgDb);
    
    return NextResponse.json({
      success: true,
      data: devicesWithDetails,
      syncedCount,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error: unknown) {
    console.error('[API Sync] Error syncing devices:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to sync devices' },
      { status: 500 }
    );
  }
});

// Helper function to fetch all devices for organization (used after sync)
async function fetchDevicesForOrganization(orgDb: any): Promise<DeviceWithConnector[]> {
  const devicesResult = await orgDb.devices.findAll();
  
  if (devicesResult.length === 0) {
    return [];
  }

  const deviceIds = devicesResult.map((d: any) => d.id);

  // Batch fetch association counts (organization-scoped)
  const pikoAssociations = await db.select({ 
    deviceId: cameraAssociations.pikoCameraId, 
    value: count() 
  })
    .from(cameraAssociations)
    .innerJoin(devices, eq(devices.id, cameraAssociations.deviceId))
    .innerJoin(connectors, eq(devices.connectorId, connectors.id))
    .where(and(
      inArray(cameraAssociations.pikoCameraId, deviceIds),
      eq(connectors.organizationId, orgDb.organizationId)
    ))
    .groupBy(cameraAssociations.pikoCameraId);

  const deviceAssociations = await db.select({ 
    deviceId: cameraAssociations.deviceId, 
    value: count() 
  })
    .from(cameraAssociations)
    .innerJoin(devices, eq(devices.id, cameraAssociations.pikoCameraId))
    .innerJoin(connectors, eq(devices.connectorId, connectors.id))
    .where(and(
      inArray(cameraAssociations.deviceId, deviceIds),
      eq(connectors.organizationId, orgDb.organizationId)
    ))
    .groupBy(cameraAssociations.deviceId);

  const associationCountsMap = new Map<string, number>();
  pikoAssociations.forEach(assoc => associationCountsMap.set(assoc.deviceId, assoc.value));
  deviceAssociations.forEach(assoc => associationCountsMap.set(assoc.deviceId, assoc.value));

  // Batch fetch Piko servers
  const serverIds = devicesResult
    .filter((d: any) => d.serverId)
    .map((d: any) => d.serverId!)
    .filter((id: string, index: number, arr: string[]) => arr.indexOf(id) === index);

  const pikoServersResult = serverIds.length > 0 
    ? await db.select().from(pikoServers).where(inArray(pikoServers.serverId, serverIds))
    : [];
  
  const pikoServersMap = new Map(pikoServersResult.map(server => [server.serverId, server as PikoServer]));

  // Map results to DeviceWithConnector format
  return devicesResult.map((deviceRow: any) => {
    const pikoServerDetails = deviceRow.serverId ? pikoServersMap.get(deviceRow.serverId) : undefined;
    const associationCount = associationCountsMap.get(deviceRow.id) ?? null;
    const deviceTypeInfo = getDeviceTypeInfo(deviceRow.connector?.category || 'unknown', deviceRow.type);
    const displayState = deviceRow.status as DisplayState | undefined;

    return {
      id: deviceRow.id,
      deviceId: deviceRow.deviceId,
      connectorId: deviceRow.connectorId,
      name: deviceRow.name,
      type: deviceRow.type,
      status: deviceRow.status,
      batteryPercentage: deviceRow.batteryPercentage ?? undefined,
      model: deviceRow.model ?? undefined,
      vendor: deviceRow.vendor ?? undefined,
      url: deviceRow.url ?? undefined,
      createdAt: deviceRow.createdAt,
      updatedAt: deviceRow.updatedAt,
      serverId: deviceRow.serverId,
      connectorName: deviceRow.connector?.name ?? 'Unknown',
      connectorCategory: deviceRow.connector?.category ?? 'Unknown',
      serverName: pikoServerDetails?.name,
      pikoServerDetails: pikoServerDetails,
      associationCount: associationCount,
      deviceTypeInfo: deviceTypeInfo,
      displayState,
      areaId: deviceRow.areaId,
      locationId: deviceRow.locationId,
    } satisfies DeviceWithConnector;
  });
}

// Rest of the sync functions remain the same but now work within organization scope
// since they operate on connectors that are already organization-filtered

/**
 * Syncs YoLink devices, fetching live state and updating the DB status.
 */
async function syncYoLinkDevices(
    connectorId: string, 
    config: yolinkDriver.YoLinkConfig
): Promise<number> {
  let processedCount = 0;
  let deletedCount = 0;
  try {
    console.log(`Syncing YoLink devices metadata for connector ${connectorId}`);
    const tokenDetails = await yolinkDriver.getRefreshedYoLinkToken(config);
    const yolinkDevicesFromApi = await yolinkDriver.getDeviceList(connectorId, config);
    console.log(`Found ${yolinkDevicesFromApi.length} YoLink devices from API for metadata sync.`);

    const apiDeviceIds = new Set(yolinkDevicesFromApi.map(d => d.deviceId));

    // Fetch existing device IDs from DB for this connector
    const existingDbDevices = await db
      .select({ deviceId: devices.deviceId })
      .from(devices)
      .where(eq(devices.connectorId, connectorId));
    
    const dbDeviceIds = new Set(existingDbDevices.map(d => d.deviceId));

    // Identify and delete stale devices
    const staleDeviceIds: string[] = [];
    for (const dbDeviceId of dbDeviceIds) {
        if (!apiDeviceIds.has(dbDeviceId)) {
            staleDeviceIds.push(dbDeviceId);
        }
    }

    if (staleDeviceIds.length > 0) {
        console.log(`[API Sync YoLink] Deleting ${staleDeviceIds.length} stale devices: ${staleDeviceIds.join(', ')}`);
        const deleteResult = await db.delete(devices)
            .where(and(
                eq(devices.connectorId, connectorId),
                inArray(devices.deviceId, staleDeviceIds)
            ));
        deletedCount = staleDeviceIds.length;
        console.log(`[API Sync YoLink] Deleted ${deletedCount} stale devices.`);
    }
    
    for (const device of yolinkDevicesFromApi) {
      if (!device.deviceId || !device.name || !device.type) continue;

      const deviceToken = device.token;
      
      let initialStatusFromList: string | null = null;
      if (typeof device.state === 'object' && device.state !== null) {
        initialStatusFromList = (device.state as any).state ?? (device.state as any).power ?? null;
      }

      const stdTypeInfo = getDeviceTypeInfo('yolink', device.type);
      
      let calculatedDisplayState: DisplayState | undefined = undefined;
      let intermediateState: IntermediateState | undefined = undefined;

      const canFetchState = !!device.token;
      if (canFetchState) {
          try {
              console.log(`  [API Sync YoLink] Fetching fresh state for ${device.type} ${device.deviceId}...`);
              const stateData = await yolinkDriver.getDeviceState(connectorId, config, device.deviceId, deviceToken!, device.type);
              
              if (stateData && typeof stateData === 'object') {
                  // Handle offline state first (explicit check)
                  if (typeof stateData.online === 'boolean' && stateData.online === false) {
                      calculatedDisplayState = OFFLINE;
                      console.log(`[API Sync YoLink] Device ${device.deviceId} (${device.type}) is offline.`);
                  } else {
                      // For online devices, extract state from the state data
                      const rawStateString = getRawStateStringFromYoLinkData(stdTypeInfo, stateData);
                      
                      if (rawStateString) {
                          // Map raw state to intermediate state using canonical mapping
                          
                          // Handle error state for any device type
                          if (rawStateString === 'error') {
                              intermediateState = ErrorState.Error;
                          } else if (stdTypeInfo.type === DeviceType.Switch || stdTypeInfo.type === DeviceType.Outlet) {
                              if (rawStateString === 'open' || rawStateString === 'on') {
                                  intermediateState = BinaryState.On;
                              } else if (rawStateString === 'closed' || rawStateString === 'off') {
                                  intermediateState = BinaryState.Off;
                              }
                          } else if (stdTypeInfo.type === DeviceType.Sensor || stdTypeInfo.type === DeviceType.WaterValveController) {
                              if (rawStateString === 'open') {
                                  intermediateState = ContactState.Open;
                              } else if (rawStateString === 'closed') {
                                  intermediateState = ContactState.Closed;
                              }
                          } else if (stdTypeInfo.type === DeviceType.Lock) {
                              if (rawStateString === 'locked') {
                                  intermediateState = LockStatus.Locked;
                              } else if (rawStateString === 'unlocked') {
                                  intermediateState = LockStatus.Unlocked;
                              }
                          }
                          
                          if (intermediateState !== undefined) {
                              // Map intermediate state to display state using the simple map
                              const simpleMap = CANONICAL_STATE_MAP.simple as Record<string, DisplayState>;
                              calculatedDisplayState = simpleMap[intermediateState];
                              console.log(`[API Sync YoLink] Device ${device.deviceId} (${device.type}) state: ${rawStateString} -> ${intermediateState} -> ${calculatedDisplayState}`);
                          } else {
                              console.warn(`[API Sync YoLink] Could not map raw state "${rawStateString}" to intermediate state for ${device.deviceId} (${device.type})`);
                          }
                      } else if (typeof stateData?.online === 'boolean' && stateData.online === true) {
                          calculatedDisplayState = ONLINE;
                          console.log(`[API Sync YoLink] Device ${device.deviceId} (${device.type}) is online, no further distinct physical state found. Marked as ONLINE.`);
                      } else if (!calculatedDisplayState) {
                          console.warn(`[API Sync YoLink] Could not determine state for ${device.deviceId} (${device.type}) from response:`, stateData);
                      }
                  }
              }
          } catch (stateError) {
              const errorMessage = stateError instanceof Error ? stateError.message : String(stateError);
              console.error(`  [Error] Failed to fetch state for ${device.type} ${device.deviceId}:`, errorMessage);
              console.warn(`[API Sync YoLink] State for ${device.deviceId} (${device.type}) will not be updated due to API error during state fetch.`);
          }
      }

      await db.insert(devices)
        .values({
          deviceId: device.deviceId,
          connectorId: connectorId,
          name: device.name,
          type: device.type,
          status: calculatedDisplayState || null,
          vendor: device.vendor ? String(device.vendor) : null,
          model: device.model ? String(device.model) : null,
          url: device.url ? String(device.url) : null,
          standardizedDeviceType: stdTypeInfo.type,
          standardizedDeviceSubtype: stdTypeInfo.subtype || null,
          isSecurityDevice: isSecurityDevice(stdTypeInfo),
          rawDeviceData: device,
          serverId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [devices.connectorId, devices.deviceId],
          set: {
            name: device.name,
            type: device.type,
            status: calculatedDisplayState || sql`status`,
            vendor: device.vendor ? String(device.vendor) : null,
            model: device.model ? String(device.model) : null,
            url: device.url ? String(device.url) : null,
            standardizedDeviceType: stdTypeInfo.type,
            standardizedDeviceSubtype: stdTypeInfo.subtype || null,
            isSecurityDevice: isSecurityDevice(stdTypeInfo),
            rawDeviceData: device,
            updatedAt: new Date(),
          }
        });

      processedCount++;
    }

    console.log(`[API Sync YoLink] Completed sync for connector ${connectorId}: processed ${processedCount}, deleted ${deletedCount}`);
    return processedCount;

  } catch (error) {
    console.error(`[API Sync YoLink] Error syncing YoLink devices for connector ${connectorId}:`, error);
    throw error;
  }
}

/**
 * Syncs Piko devices
 */
async function syncPikoDevices(
    connectorId: string,
    config: pikoDriver.PikoConfig
): Promise<number> {
  let processedCount = 0;
  try {
    console.log(`Syncing Piko devices for connector ${connectorId}`);
    
    const [cameras, servers] = await Promise.all([
      pikoDriver.getSystemDevices(connectorId),
      pikoDriver.getSystemServers(connectorId)
    ]);
    
    console.log(`Found ${cameras.length} cameras and ${servers.length} servers from Piko API`);

    // Handle device deletions - delete devices not in current API response
    const apiDeviceIds = cameras.map(c => c.id).filter(Boolean);
    
    if (apiDeviceIds.length > 0) {
        await db.delete(devices)
            .where(and(
                eq(devices.connectorId, connectorId),
                sql`${devices.deviceId} NOT IN (${sql.join(apiDeviceIds.map(id => sql`${id}`), sql`, `)})`
            ));
        console.log(`[API Sync Piko] Deleted stale devices not in current API response.`);
    } else {
        // If no devices from API, delete all devices for this connector
        await db.delete(devices)
            .where(eq(devices.connectorId, connectorId));
        console.log(`[API Sync Piko] Deleted all devices (no devices from API).`);
    }

    // Sync servers first
    for (const server of servers) {
      if (!server.id || !server.name) continue;
      
      await db.insert(pikoServers)
        .values({
          serverId: server.id,
          connectorId: connectorId,
          name: server.name,
          status: server.status || null,
          version: server.version || null,
          osPlatform: server.osInfo?.platform || null,
          osVariantVersion: server.osInfo?.variantVersion || null,
          url: server.url || null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: pikoServers.serverId,
          set: {
            name: server.name,
            status: server.status || null,
            version: server.version || null,
            osPlatform: server.osInfo?.platform || null,
            osVariantVersion: server.osInfo?.variantVersion || null,
            url: server.url || null,
            updatedAt: new Date(),
          }
        });
    }

    // Sync cameras
    for (const camera of cameras) {
      if (!camera.id || !camera.name) continue;

      const stdTypeInfo = getDeviceTypeInfo('piko', 'Camera');
      
      await db.insert(devices)
        .values({
          deviceId: camera.id,
          connectorId: connectorId,
          name: camera.name,
          type: 'Camera',
          status: camera.status || null,
          vendor: camera.vendor || 'Piko',
          model: camera.model || null,
          url: camera.url || null,
          standardizedDeviceType: stdTypeInfo.type,
          standardizedDeviceSubtype: stdTypeInfo.subtype || null,
          isSecurityDevice: isSecurityDevice(stdTypeInfo),
          rawDeviceData: camera,
          serverId: camera.serverId || null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [devices.connectorId, devices.deviceId],
          set: {
            name: camera.name,
            status: camera.status || sql`status`,
            model: camera.model || null,
            url: camera.url || null,
            serverId: camera.serverId || null,
            rawDeviceData: camera,
            updatedAt: new Date(),
          }
        });

      processedCount++;
    }

    console.log(`[API Sync Piko] Completed sync for connector ${connectorId}: processed ${processedCount} cameras`);
    return processedCount;

  } catch (error) {
    console.error(`[API Sync Piko] Error syncing Piko devices for connector ${connectorId}:`, error);
    throw error;
  }
}

/**
 * Syncs Genea devices
 */
async function syncGeneaDevices(
    connectorId: string,
    config: geneaDriver.GeneaConfig
): Promise<number> {
  let processedCount = 0;
  try {
    console.log(`Syncing Genea devices for connector ${connectorId}`);
    
    const doors = await geneaDriver.getGeneaDoors(config);
    console.log(`Found ${doors.length} doors from Genea API`);

    // Handle device deletions - delete devices not in current API response
    const apiDeviceIds = doors.map(d => d.uuid).filter(Boolean);
    
    if (apiDeviceIds.length > 0) {
        await db.delete(devices)
            .where(and(
                eq(devices.connectorId, connectorId),
                sql`${devices.deviceId} NOT IN (${sql.join(apiDeviceIds.map(id => sql`${id}`), sql`, `)})`
            ));
        console.log(`[API Sync Genea] Deleted stale devices not in current API response.`);
    } else {
        // If no devices from API, delete all devices for this connector
        await db.delete(devices)
            .where(eq(devices.connectorId, connectorId));
        console.log(`[API Sync Genea] Deleted all devices (no devices from API).`);
    }

    for (const door of doors) {
      if (!door.uuid || !door.name) continue;

      const stdTypeInfo = getDeviceTypeInfo('genea', 'Door');
      
      // Map door status to display state
      let displayState: DisplayState | undefined = undefined;
      if (typeof door.is_locked === 'boolean') {
        displayState = door.is_locked ? 'Locked' : 'Unlocked';
      }
      
      await db.insert(devices)
        .values({
          deviceId: door.uuid,
          connectorId: connectorId,
          name: door.name,
          type: 'Door',
          status: displayState || null,
          vendor: 'Genea',
          model: door.reader_model || null,
          url: null,
          standardizedDeviceType: stdTypeInfo.type,
          standardizedDeviceSubtype: stdTypeInfo.subtype || null,
          isSecurityDevice: isSecurityDevice(stdTypeInfo),
          rawDeviceData: door,
          serverId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [devices.connectorId, devices.deviceId],
          set: {
            name: door.name,
            type: 'Door',
            status: displayState || sql`status`,
            model: door.reader_model || null,
            rawDeviceData: door,
            updatedAt: new Date(),
          }
        });

      processedCount++;
    }

    console.log(`[API Sync Genea] Completed sync for connector ${connectorId}: processed ${processedCount} devices`);
    return processedCount;

  } catch (error) {
    console.error(`[API Sync Genea] Error syncing Genea devices for connector ${connectorId}:`, error);
    throw error;
  }
}