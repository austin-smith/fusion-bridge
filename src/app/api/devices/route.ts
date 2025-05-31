import { NextResponse, NextRequest } from 'next/server';
import { withApiRouteAuth } from '@/lib/auth/withApiRouteAuth';
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
import { DeviceType, BinaryState, ContactState, ON, OFF, CANONICAL_STATE_MAP, OFFLINE, ONLINE, LockStatus } from '@/lib/mappings/definitions';
import { z } from 'zod';
import { deviceSyncSchema } from '@/lib/schemas/api-schemas';

// Helper function to get association count
async function getAssociationCount(
  internalDeviceId: string, 
  category: string
): Promise<number | null> {
  let result: { value: number }[];

  if (category === 'piko') {
    // If it's a Piko camera, count associated devices using its internal ID
    result = await db.select({ value: count() })
      .from(cameraAssociations)
      .where(eq(cameraAssociations.pikoCameraId, internalDeviceId));
  } else {
    // For any other device category, count associated Piko cameras
    result = await db.select({ value: count() })
      .from(cameraAssociations)
      .where(eq(cameraAssociations.deviceId, internalDeviceId));
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
  isOnline: boolean;
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
  isOnline: boolean;
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
    isOnline: device.isOnline,
    createdAt: device.createdAt.toISOString(),
    updatedAt: device.updatedAt.toISOString(),
    connectorName: device.connectorName,
    connectorCategory: device.connectorCategory,
  };
}

// GET /api/devices – returns devices with connector information and association count
// Optionally filters by deviceId query parameter
export const GET = withApiRouteAuth(async (request, authContext) => {
  try {
    const { searchParams } = new URL(request.url);
    const requestedDeviceId = searchParams.get('deviceId');

    // --- BEGIN Modified Query with Joins for Area/Location --- 
    const baseQuery = db
      .select({
        // Select all device fields
        device: devices,
        // Select relevant connector fields
        connector: {
          name: connectors.name,
          category: connectors.category,
        },
        // Select areaId and locationId via joins
        areaId: areaDevices.areaId,
        locationId: areas.locationId,
      })
      .from(devices)
      .leftJoin(connectors, eq(devices.connectorId, connectors.id))
      // Join to get area assignment
      .leftJoin(areaDevices, eq(devices.id, areaDevices.deviceId))
      // Join to get location from area
      .leftJoin(areas, eq(areaDevices.areaId, areas.id))
      .$dynamic(); // Make it dynamic for optional where clause

    if (requestedDeviceId) {
      baseQuery.where(eq(devices.deviceId, requestedDeviceId));
      // Apply limit if fetching a single device
      baseQuery.limit(1);
    }

    const devicesResult = await baseQuery;
    // --- END Modified Query --- 

    if (requestedDeviceId && devicesResult.length === 0) {
      return NextResponse.json({ success: false, error: 'Device not found' }, { status: 404 });
    }

    if (devicesResult.length === 0) {
        return NextResponse.json({ success: true, data: [] }); // Return empty array if no devices
    }

    // --- Fetch additional details efficiently (Piko Servers, Associations) --- 
    // Extract IDs needed for subsequent queries
    const deviceIds = devicesResult.map(d => d.device.id);
    const pikoServerIds = devicesResult
      .filter(d => d.connector?.category === 'piko' && d.device.serverId)
      .map(d => d.device.serverId!);

    // Fetch Piko Server details
    const pikoServersMap = new Map<string, PikoServer>();
    if (pikoServerIds.length > 0) {
      const servers = await db.select().from(pikoServers).where(inArray(pikoServers.serverId, pikoServerIds));
      servers.forEach(server => pikoServersMap.set(server.serverId, server as PikoServer));
    }

    // Fetch association counts
    const associationCountsSourcePromise = db.select({
        deviceId: cameraAssociations.deviceId,
        count: count(cameraAssociations.pikoCameraId).as('count')
      })
      .from(cameraAssociations)
      .where(inArray(cameraAssociations.deviceId, deviceIds))
      .groupBy(cameraAssociations.deviceId);

    const associationCountsTargetPromise = db.select({
        pikoCameraId: cameraAssociations.pikoCameraId,
        count: count(cameraAssociations.deviceId).as('count')
      })
      .from(cameraAssociations)
      .where(inArray(cameraAssociations.pikoCameraId, deviceIds))
      .groupBy(cameraAssociations.pikoCameraId);

    const [countsSourceResult, countsTargetResult] = await Promise.all([
        associationCountsSourcePromise,
        associationCountsTargetPromise
    ]);

    const associationCountsMap = new Map<string, number>();
    countsSourceResult.forEach(row => associationCountsMap.set(row.deviceId, row.count));
    countsTargetResult.forEach(row => {
      const existingCount = associationCountsMap.get(row.pikoCameraId) ?? 0;
      associationCountsMap.set(row.pikoCameraId, existingCount + row.count);
    });
    // --- End Fetch additional details --- 

    // --- Map results, including areaId and locationId --- 
    const devicesWithDetails: DeviceWithConnector[] = devicesResult.map(row => {
      const deviceRow = row.device;
      const connector = row.connector; // Already joined
      const pikoServerDetails = deviceRow.serverId ? pikoServersMap.get(deviceRow.serverId) : undefined;
      const associationCount = associationCountsMap.get(deviceRow.id) ?? null; 
      const deviceTypeInfo = getDeviceTypeInfo(connector?.category, deviceRow.type);
      const displayState = deviceRow.status as DisplayState | undefined;

      return {
        // Map all fields from deviceRow
        id: deviceRow.id,
        deviceId: deviceRow.deviceId,
        connectorId: deviceRow.connectorId,
        name: deviceRow.name,
        type: deviceRow.type,
        status: deviceRow.status,
        model: deviceRow.model ?? undefined,
        vendor: deviceRow.vendor ?? undefined,
        url: deviceRow.url ?? undefined,
        createdAt: deviceRow.createdAt,
        updatedAt: deviceRow.updatedAt,
        serverId: deviceRow.serverId,
        // Map joined/fetched data
        connectorName: connector?.name ?? 'Unknown',
        connectorCategory: connector?.category ?? 'Unknown', 
        serverName: pikoServerDetails?.name,
        pikoServerDetails: pikoServerDetails,
        associationCount: associationCount,
        deviceTypeInfo: deviceTypeInfo!,
        displayState,
        // Add the newly joined fields
        areaId: row.areaId,          // From the join
        locationId: row.locationId,    // From the join
      } satisfies DeviceWithConnector;
    });
    // --- END Map results --- 

    // Return response
    if (requestedDeviceId) {
      return NextResponse.json({ success: true, data: devicesWithDetails[0] });
    } else {
      return NextResponse.json({ success: true, data: devicesWithDetails });
    }

  } catch (error: unknown) {
    console.error('Error fetching devices:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch devices' },
      { status: 500 }
    );
  }
});

// POST /api/devices – syncs devices from all connectors and returns them with count
export const POST = withApiRouteAuth(async (request, authContext) => {
  try {
    const errors = [];
    let syncedCount = 0;
    
    const allConnectors = await db.select().from(connectors);
    
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
          continue; // Skip this connector
        }

        if (connector.category === 'yolink') {
          if (!connectorConfig?.uaid || !connectorConfig?.clientSecret) {
            console.error(`[API Sync] Incomplete YoLink configuration for connector ${connector.name}. Needs uaid & clientSecret.`);
            errors.push({ connectorName: connector.name, error: 'Incomplete YoLink configuration.' });
            continue;
          }
          // Sync now fetches state AND updates DB status, returns only count
          const count = await syncYoLinkDevices(connector.id, connectorConfig);
          syncedCount += count;
        } else if (connector.category === 'piko') {
          const count = await syncPikoDevices(connector.id, connectorConfig);
          syncedCount += count;
        } else if (connector.category === 'genea') {
          if (!connectorConfig?.apiKey || !connectorConfig?.customerUuid) {
            console.error(`[API Sync] Incomplete Genea configuration for connector ${connector.name}. Needs apiKey & customerUuid.`);
            errors.push({ connectorName: connector.name, error: 'Incomplete Genea configuration (missing apiKey or customerUuid).' });
            continue;
          }
          const count = await syncGeneaDevices(connector.id, connectorConfig);
          syncedCount += count;
        } else {
          console.warn(`[API Sync] Sync not implemented for connector category: ${connector.category} (Name: ${connector.name})`);
        }
      } catch (err: unknown) {
        console.error(`[API Sync] Error syncing devices for connector ${connector.name}:`, err);
        errors.push({
          connectorName: connector.name,
          error: err instanceof Error ? err.message : 'Unknown error during sync'
        });
      }
    }
    
    // Fetch updated device list to return (and update store)
    // --- BEGIN Apply Optimized Fetch Logic from GET to POST --- 
    const allDevicesResult = await db
      .select({
        device: devices,
        connector: {
          name: connectors.name,
          category: connectors.category,
        },
        areaId: areaDevices.areaId,
        locationId: areas.locationId,
      })
      .from(devices)
      .innerJoin(connectors, eq(devices.connectorId, connectors.id))
      .leftJoin(areaDevices, eq(devices.id, areaDevices.deviceId))
      .leftJoin(areas, eq(areaDevices.areaId, areas.id)); // No dynamic needed here, fetching all

    const devicesWithDetails: DeviceWithConnector[] = []; // Initialize empty array

    if (allDevicesResult.length > 0) {
        const deviceIds = allDevicesResult.map(d => d.device.id);
        const pikoServerIds = allDevicesResult
          .filter(d => d.connector?.category === 'piko' && d.device.serverId)
          .map(d => d.device.serverId!);

        // Fetch Piko Server details efficiently
        const pikoServersMap = new Map<string, PikoServer>();
        if (pikoServerIds.length > 0) {
          const servers = await db.select().from(pikoServers).where(inArray(pikoServers.serverId, pikoServerIds));
          servers.forEach(server => pikoServersMap.set(server.serverId, server as PikoServer));
        }

        // Fetch association counts efficiently
        const associationCountsSourcePromise = db.select({
            deviceId: cameraAssociations.deviceId,
            count: count(cameraAssociations.pikoCameraId).as('count')
          })
          .from(cameraAssociations)
          .where(inArray(cameraAssociations.deviceId, deviceIds))
          .groupBy(cameraAssociations.deviceId);

        const associationCountsTargetPromise = db.select({
            pikoCameraId: cameraAssociations.pikoCameraId,
            count: count(cameraAssociations.deviceId).as('count')
          })
          .from(cameraAssociations)
          .where(inArray(cameraAssociations.pikoCameraId, deviceIds))
          .groupBy(cameraAssociations.pikoCameraId);

        const [countsSourceResult, countsTargetResult] = await Promise.all([
            associationCountsSourcePromise,
            associationCountsTargetPromise
        ]);

        const associationCountsMap = new Map<string, number>();
        countsSourceResult.forEach(row => associationCountsMap.set(row.deviceId, row.count));
        countsTargetResult.forEach(row => {
            const existingCount = associationCountsMap.get(row.pikoCameraId) ?? 0;
            associationCountsMap.set(row.pikoCameraId, existingCount + row.count);
        });

        // Map results, including areaId and locationId
        allDevicesResult.forEach(row => {
            const deviceRow = row.device;
            const connector = row.connector;
            const pikoServerDetails = deviceRow.serverId ? pikoServersMap.get(deviceRow.serverId) : undefined;
            const associationCount = associationCountsMap.get(deviceRow.id) ?? null;
            const deviceTypeInfo = getDeviceTypeInfo(connector?.category, deviceRow.type);
            const displayState = deviceRow.status as DisplayState | undefined;

            devicesWithDetails.push({
                // Map all fields from deviceRow
                id: deviceRow.id,
                deviceId: deviceRow.deviceId,
                connectorId: deviceRow.connectorId,
                name: deviceRow.name,
                type: deviceRow.type,
                status: deviceRow.status,
                model: deviceRow.model ?? undefined,
                vendor: deviceRow.vendor ?? undefined,
                url: deviceRow.url ?? undefined,
                createdAt: deviceRow.createdAt,
                updatedAt: deviceRow.updatedAt,
                connectorName: connector.name,
                connectorCategory: connector.category,
                serverId: deviceRow.serverId,
                serverName: pikoServerDetails?.name,
                pikoServerDetails: pikoServerDetails,
                associationCount: associationCount,
                deviceTypeInfo: deviceTypeInfo!,
                displayState,
                areaId: row.areaId,
                locationId: row.locationId,
            } satisfies DeviceWithConnector);
        });
    }
    // --- END Apply Optimized Fetch Logic --- 

    // Update Zustand store
    try {
      useFusionStore.getState().setDeviceStatesFromSync(devicesWithDetails);
      console.log('[API Sync] Successfully updated FusionStore with synced devices (state read from DB).');
    } catch (storeError) {
      console.error('[API Sync] Failed to update FusionStore:', storeError);
    }
    
    return NextResponse.json({
      success: true,
      data: devicesWithDetails, // Return the efficiently fetched data with area/location
      syncedCount, // This comes from the sync loops above
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

/**
 * Syncs YoLink devices, fetching live state and updating the DB status.
 */
// --- BEGIN Restore state fetching and DB update in syncYoLinkDevices ---
// --- BEGIN Modify syncYoLinkDevices signature and remove state fetching ---
async function syncYoLinkDevices(
    connectorId: string, 
    config: yolinkDriver.YoLinkConfig
): Promise<number> { // Return only count
// --- END Modify syncYoLinkDevices signature ---
  let processedCount = 0;
  let deletedCount = 0; // Added to track deletions
  try {
    console.log(`Syncing YoLink devices metadata for connector ${connectorId}`);
    // Use the new getRefreshedYoLinkToken which returns an object with newAccessToken and updatedConfig
    const tokenDetails = await yolinkDriver.getRefreshedYoLinkToken(config);
    // We'll use tokenDetails.updatedConfig for subsequent calls if config needs to be passed,
    // and tokenDetails.newAccessToken where raw accessToken was used.
    // However, getDeviceList now takes connectorId and the original config.
    // The callYoLinkApi within getDeviceList will use getRefreshedYoLinkToken internally.

    // UPDATED: Pass connectorId as the first argument to getDeviceList.
    // The 'config' passed here is the initial config for the connector.
    // getDeviceList will internally handle token refresh using this config.
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
      console.log(`[API Sync YoLink] Deleting ${staleDeviceIds.length} stale devices for connector ${connectorId}:`, staleDeviceIds);
      try {
        await db
          .delete(devices)
          .where(and(
            eq(devices.connectorId, connectorId),
            inArray(devices.deviceId, staleDeviceIds)
          ));
        deletedCount = staleDeviceIds.length;
        console.log(`[API Sync YoLink] Successfully deleted ${deletedCount} stale devices.`);
      } catch (deleteError) {
        console.error(`[API Sync YoLink] Error deleting stale devices for connector ${connectorId}:`, deleteError);
        // Potentially throw or log this error more formally
      }
    }

    if (yolinkDevicesFromApi.length === 0 && staleDeviceIds.length === 0) {
        console.log(`[API Sync YoLink] No devices from API and no stale devices to delete for connector ${connectorId}.`);
        return 0; // No devices processed or deleted
    }
    
    // If only deletions happened, and no devices came from API, processedCount remains 0.
    // The function should reflect the number of upserted devices.

    console.log(`Upserting ${yolinkDevicesFromApi.length} YoLink devices metadata...`);
    for (const device of yolinkDevicesFromApi) {
      if (!device.deviceId || !device.name || !device.type) continue;

      const deviceToken = device.token;
      
      let initialStatusFromList: string | null = null;
      if (typeof device.state === 'object' && device.state !== null) {
        initialStatusFromList = (device.state as any).state ?? (device.state as any).power ?? null;
      }

      const stdTypeInfo = getDeviceTypeInfo('yolink', device.type);
      
      let calculatedDisplayState: DisplayState | undefined = undefined;
      let intermediateState: IntermediateState | undefined = undefined; // Moved up for broader scope

      // --- BEGIN Updated state fetching logic for YoLink devices ---
      const canFetchState = !!device.token; // Simplified: if there's a device token, attempt to fetch state

      if (canFetchState) {
          try {
              console.log(`[API Sync YoLink] Fetching state for ${device.type} ${device.deviceId}...`);
              const stateData = await yolinkDriver.getDeviceState(
                  connectorId, 
                  config,      
                  device.deviceId, 
                  device.token!, // Use non-null assertion as canFetchState guarantees it's a string here
                  device.type
              );
              
              // stateData here corresponds to the 'data' object in the YoLink API response for getState
              if (typeof stateData?.online === 'boolean' && stateData.online === false) {
                  calculatedDisplayState = OFFLINE;
                  console.log(`[API Sync YoLink] Device ${device.deviceId} (${device.type}) reported as explicitly offline by API.`);
              } else {
                  // Device is online or online status is not explicitly in stateData root (or stateData.online is true).
                  // Attempt to find a physical state if one exists.
                  // Use the centralized helper to extract the raw state string
                  // stateData is the direct response from getDeviceState, which can be the state object itself.
                  const rawStateValue = getRawStateStringFromYoLinkData(stdTypeInfo, stateData);

                  if (rawStateValue) {
                      // We have a rawStateValue, now map it based on our standardized device type
                      switch (stdTypeInfo.type) { // Use standardized type for mapping
                          case DeviceType.Switch:
                          case DeviceType.Outlet:
                              if (rawStateValue === 'open' || rawStateValue === 'on') {
                                  intermediateState = BinaryState.On;
                              } else if (rawStateValue === 'closed' || rawStateValue === 'off') {
                                  intermediateState = BinaryState.Off;
                              }
                              break;
                          case DeviceType.Sensor: 
                              if (stdTypeInfo.subtype === 'Contact') { // Standardized subtype
                                  if (rawStateValue === 'open') {
                                      intermediateState = ContactState.Open;
                                  } else if (rawStateValue === 'closed') {
                                      intermediateState = ContactState.Closed;
                                  }
                              }
                              // Potentially add other sensor subtypes here, e.g., for LeakSensor if its rawStateValue is 'normal'/'alert'
                              // This part still requires knowing how specific standardized sensor types report raw states.
                              break;
                          // Add other DeviceType mappings as needed if their rawStateValues need specific interpretation
                          // (e.g., DeviceType.Lock might have 'locked'/'unlocked')
                          case DeviceType.Lock:
                              if (rawStateValue === 'locked') {
                                  intermediateState = LockStatus.Locked;
                              } else if (rawStateValue === 'unlocked') {
                                  intermediateState = LockStatus.Unlocked;
                              }
                              break;
                      }

                      if (intermediateState) {
                          calculatedDisplayState = mapIntermediateToDisplay(intermediateState);
                          console.log(`[API Sync YoLink] Device ${device.deviceId} (${device.type}) physical state: ${rawStateValue} -> ${intermediateState} -> ${calculatedDisplayState}`);
                      } else {
                           console.warn(`[API Sync YoLink] Unknown or unmappable raw state value '${rawStateValue}' for ${device.deviceId} (${device.type}, standardized: ${stdTypeInfo.type}/${stdTypeInfo.subtype || 'N/A'}).`);
                      }
                  } else if (typeof stateData?.online === 'boolean' && stateData.online === true) {
                      // Device is online, but no specific physical state like open/closed or on/off was found.
                      // For devices like Hubs, this is normal. Set explicit ONLINE state.
                      calculatedDisplayState = ONLINE; // Set to ONLINE state
                      console.log(`[API Sync YoLink] Device ${device.deviceId} (${device.type}) is online, no further distinct physical state found. Marked as ONLINE.`);
                  } else if (!calculatedDisplayState) { // If not OFFLINE and no state determined from any source
                      console.warn(`[API Sync YoLink] Could not determine state for ${device.deviceId} (${device.type}) from response:`, stateData);
                  }
              }
          } catch (stateError) {
              const errorMessage = stateError instanceof Error ? stateError.message : String(stateError);
              console.error(`  [Error] Failed to fetch state for ${device.type} ${device.deviceId}:`, errorMessage);
              // Ensure calculatedDisplayState is not modified here if the API call itself fails.
              // The status in the DB should not change if we can't reach the API or the device through the API.
              // If the API was reached but reported an error (e.g. device offline by YoLink error code),
              // we still don't update status based on an error, only on explicit 'online: false' in a successful response.
              console.warn(`[API Sync YoLink] State for ${device.deviceId} (${device.type}) will not be updated due to API error during state fetch.`);
          }
      }
      // --- END Updated state fetching logic ---

      const deviceData = {
        deviceId: device.deviceId,
        connectorId: connectorId,
        name: device.name,
        type: device.type, 
        standardizedDeviceType: stdTypeInfo.type, 
        standardizedDeviceSubtype: stdTypeInfo.subtype ?? null,
        model: device.modelName,
        serverId: null,
        vendor: null, 
        url: null, 
        rawDeviceData: device, 
        // STATUS is set in the upsert based on calculatedDisplayState
        updatedAt: new Date()
      };

      try {
        // Upsert device info, including fetched state in the status column
        await db.insert(devices)
          .values({ 
              ...deviceData, 
              // --- CORRECTED: Use calculatedDisplayState --- //
              status: calculatedDisplayState ?? undefined, // Set status to the calculated state if available
              createdAt: new Date() 
          }) 
          .onConflictDoUpdate({
            target: [devices.connectorId, devices.deviceId],
            set: { // Update metadata AND status from fetched state
              name: deviceData.name,
              type: deviceData.type,
              standardizedDeviceType: deviceData.standardizedDeviceType,
              standardizedDeviceSubtype: deviceData.standardizedDeviceSubtype,
              // --- CORRECTED: Use calculatedDisplayState --- //
              status: calculatedDisplayState ?? undefined, // Update status with calculated state if available
              model: deviceData.model,
              serverId: null,
              vendor: null,
              url: null,
              rawDeviceData: device, 
              updatedAt: deviceData.updatedAt
            }
          });
        processedCount++;

      } catch (upsertError: unknown) {
        console.error(`  [Error] Failed YoLink upsert for deviceId ${deviceData.deviceId}:`, upsertError);
      }
    }
    console.log(`YoLink sync finished for ${connectorId}. Processed ${processedCount} devices. Deleted ${deletedCount} stale devices.`);
    // --- BEGIN Return only count ---
    return processedCount; // Consider if the return value should reflect deletions too
    // --- END Return only count ---
  } catch (error: unknown) {
    console.error(`Error syncing YoLink devices metadata for ${connectorId}:`, error);
    throw error; 
  }
}

/**
* Syncs Piko devices, populating standardized types.
*/
async function syncPikoDevices(connectorId: string, config: pikoDriver.PikoConfig): Promise<number> {
  let processedDeviceCount = 0;
  let deletedCount = 0; // Added to track deletions
  try {
    console.log(`Syncing Piko data for connector ${connectorId} (Type: ${config.type})`);

    // ... Config Validation ...
    if (!config.username || !config.password || (config.type === 'cloud' && !config.selectedSystem) || (config.type === 'local' && (!config.host || !config.port))) {
        throw new Error('Invalid or incomplete Piko configuration.');
    }

    // --- Sync Piko Servers (Cloud only) ---
    if (config.type === 'cloud' && config.selectedSystem) {
        try {
          console.log(`Syncing Piko servers for system: ${config.selectedSystem}...`);
          const pikoServersFromApi = await pikoDriver.getSystemServers(connectorId);
          console.log(`Found ${pikoServersFromApi.length} Piko servers.`);
          if (pikoServersFromApi.length > 0) {
            for (const server of pikoServersFromApi) {
              if (!server.id || !server.name) continue;
              await db.insert(pikoServers)
                .values({ // Insert new server
                    serverId: server.id,
                    connectorId: connectorId,
                    name: server.name,
                    status: server.status || null,
                    version: server.version || null,
                    osPlatform: server.osInfo?.platform || null,
                    osVariantVersion: server.osInfo?.variantVersion || null,
                    url: server.url || null,
                    updatedAt: new Date(),
                    createdAt: new Date()
                 })
                .onConflictDoUpdate({
                  target: pikoServers.serverId,
                  set: { // Update existing server
                    name: server.name,
                    status: server.status || null,
                    version: server.version || null,
                    osPlatform: server.osInfo?.platform || null,
                    osVariantVersion: server.osInfo?.variantVersion || null,
                    url: server.url || null,
                    updatedAt: new Date()
                  }
                });
            }
          }
        } catch (serverSyncError: unknown) {
          console.error(`Error syncing Piko servers for ${connectorId}:`, serverSyncError);
        }
    } else if (config.type === 'local') {
        console.log(`Skipping Piko server sync for local connection.`);
    }

    // --- Sync Piko Devices --- 
    console.log(`Fetching Piko devices (Type: ${config.type})...`);
    const pikoDevicesFromApi = await pikoDriver.getSystemDevices(connectorId);
    console.log(`Found ${pikoDevicesFromApi.length} Piko devices.`);

    const apiDeviceIds = new Set(pikoDevicesFromApi.map(d => d.id));

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
      console.log(`[API Sync Piko] Deleting ${staleDeviceIds.length} stale devices for connector ${connectorId}:`, staleDeviceIds);
      try {
        await db
          .delete(devices)
          .where(and(
            eq(devices.connectorId, connectorId),
            inArray(devices.deviceId, staleDeviceIds)
          ));
        deletedCount = staleDeviceIds.length;
        console.log(`[API Sync Piko] Successfully deleted ${deletedCount} stale devices.`);
      } catch (deleteError) {
        console.error(`[API Sync Piko] Error deleting stale devices for connector ${connectorId}:`, deleteError);
      }
    }
    
    if (pikoDevicesFromApi.length === 0 && staleDeviceIds.length === 0) {
        console.log(`[API Sync Piko] No devices from API and no stale devices to delete for connector ${connectorId}.`);
        return 0; 
    }

    if (pikoDevicesFromApi.length > 0) {
      console.log(`Upserting ${pikoDevicesFromApi.length} Piko devices...`);
      for (const device of pikoDevicesFromApi) {
        if (!device.id || !device.name) continue;

        const rawDeviceType = device.deviceType || 'Unknown';
        const stdTypeInfo = getDeviceTypeInfo('piko', rawDeviceType);

        const deviceData = {
          deviceId: device.id,
          connectorId: connectorId,
          name: device.name,
          type: rawDeviceType,
          standardizedDeviceType: stdTypeInfo.type,
          standardizedDeviceSubtype: stdTypeInfo.subtype ?? null,
          status: device.status || null, 
          serverId: config.type === 'local' ? null : (device.serverId || null),
          vendor: device.vendor || null,
          model: device.model || null,
          url: device.url || null,
          updatedAt: new Date()
        };

        try {
          await db.insert(devices)
            .values({ ...deviceData, createdAt: new Date() }) // Add std types on insert
            .onConflictDoUpdate({
              target: [devices.connectorId, devices.deviceId],
              set: { // Update std types on conflict
                name: deviceData.name,
                type: deviceData.type,
                standardizedDeviceType: deviceData.standardizedDeviceType,
                standardizedDeviceSubtype: deviceData.standardizedDeviceSubtype,
                status: deviceData.status,
                serverId: deviceData.serverId,
                vendor: deviceData.vendor,
                model: deviceData.model,
                url: deviceData.url,
                updatedAt: deviceData.updatedAt
              }
            });
          processedDeviceCount++;
        } catch (upsertError: unknown) {
          console.error(`  [Error] Failed Piko device upsert for deviceId ${deviceData.deviceId}:`, upsertError);
        }
      }
    }

    console.log(`Piko device sync finished for ${connectorId}. Processed: ${processedDeviceCount}. Deleted: ${deletedCount}`);
    return processedDeviceCount;

  } catch (error: unknown) {
    console.error(`Error syncing Piko data for ${connectorId}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Piko sync failed: ${errorMessage}`); 
  }
} 

// --- NEW: Sync Genea devices ---
/**
 * Syncs Genea devices (doors).
 */
async function syncGeneaDevices(connectorId: string, config: geneaDriver.GeneaConfig): Promise<number> {
  let processedCount = 0;
  let deletedCount = 0; // Added to track deletions
  try {
    console.log(`Syncing Genea devices for connector ${connectorId}`);
    // Config is already parsed and validated in the main POST handler
    const geneaDoorsFromApi = await geneaDriver.getGeneaDoors(config);
    console.log(`Found ${geneaDoorsFromApi.length} Genea doors from API.`);

    const apiDeviceIds = new Set(geneaDoorsFromApi.map(d => d.uuid));

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
      console.log(`[API Sync Genea] Deleting ${staleDeviceIds.length} stale devices for connector ${connectorId}:`, staleDeviceIds);
      try {
        await db
          .delete(devices)
          .where(and(
            eq(devices.connectorId, connectorId),
            inArray(devices.deviceId, staleDeviceIds)
          ));
        deletedCount = staleDeviceIds.length;
        console.log(`[API Sync Genea] Successfully deleted ${deletedCount} stale devices.`);
      } catch (deleteError) {
        console.error(`[API Sync Genea] Error deleting stale devices for connector ${connectorId}:`, deleteError);
      }
    }

    if (geneaDoorsFromApi.length === 0 && staleDeviceIds.length === 0) {
        console.log(`[API Sync Genea] No devices from API and no stale devices to delete for connector ${connectorId}.`);
        return 0;
    }

    console.log(`Upserting ${geneaDoorsFromApi.length} Genea doors...`);
    for (const door of geneaDoorsFromApi) {
      if (!door.uuid || !door.name) continue;

      // Determine status based on 'is_online' if available, otherwise null
      const status = typeof door.is_online === 'boolean' 
        ? (door.is_online ? 'Online' : 'Offline') 
        : null;

      // Standardized type info for a Door
      // Use the mapping function for consistency
      const stdTypeInfo = getDeviceTypeInfo('genea', 'Door'); 

      const deviceData = {
        deviceId: door.uuid,
        connectorId: connectorId,
        name: door.name,
        type: 'Door', // Raw type from Genea perspective is still 'Door'
        standardizedDeviceType: stdTypeInfo.type, // Get type from mapping
        standardizedDeviceSubtype: stdTypeInfo.subtype ?? null, // Get subtype (null for Door)
        status: status,
        model: door.reader_model ?? null, // Use null if reader_model is null/undefined
        serverId: null, // Genea doesn't have the concept of a server like Piko
        vendor: 'Genea', // Assuming Genea is the vendor
        url: null, // No specific URL per door in the API sample
        updatedAt: new Date()
      };

      try {
        await db.insert(devices)
          .values({ ...deviceData, createdAt: new Date() })
          .onConflictDoUpdate({
            target: [devices.connectorId, devices.deviceId], // Unique constraint
            set: { // Fields to update on conflict
              name: deviceData.name,
              type: deviceData.type,
              standardizedDeviceType: deviceData.standardizedDeviceType,
              standardizedDeviceSubtype: deviceData.standardizedDeviceSubtype,
              status: deviceData.status,
              model: deviceData.model,
              vendor: deviceData.vendor,
              url: deviceData.url,
              updatedAt: deviceData.updatedAt
              // serverId is intentionally not updated as it's always null for Genea
            }
          });
        processedCount++;
      } catch (upsertError: unknown) {
        console.error(`  [Error] Failed Genea door upsert for deviceId ${deviceData.deviceId}:`, upsertError);
      }
    }
    console.log(`Genea Sync finished for ${connectorId}. Processed: ${processedCount}. Deleted: ${deletedCount}`);
    return processedCount;
  } catch (error: unknown) {
    console.error(`Error syncing Genea devices for connector ${connectorId}:`, error);
    // Re-throw error to be caught by the main POST handler and reported
    throw error; 
  }
}
// --- END NEW Genea Sync ---