import { NextResponse, NextRequest } from 'next/server';
import { db } from '@/data/db';
import { devices, connectors, pikoServers, cameraAssociations } from '@/data/db/schema';
import { eq, count, and, inArray, sql } from 'drizzle-orm';
import * as yolinkDriver from '@/services/drivers/yolink';
import * as pikoDriver from '@/services/drivers/piko';
import * as geneaDriver from '@/services/drivers/genea';
import { getDeviceTypeInfo } from '@/lib/mappings/identification';
import type { DeviceWithConnector, PikoServer, Connector } from '@/types';
import { useFusionStore } from '@/stores/store';
import type { TypedDeviceInfo, IntermediateState, DisplayState } from '@/lib/mappings/definitions';
import { DeviceType, BinaryState, ON, OFF, CANONICAL_STATE_MAP } from '@/lib/mappings/definitions';

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

// GET /api/devices – returns devices with connector information and association count
// Optionally filters by deviceId query parameter
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedDeviceId = searchParams.get('deviceId');

    // --- BEGIN Optimized Query ---
    // 1. Fetch core device data with connector relation
    const devicesQuery = db.query.devices.findMany({
      where: requestedDeviceId ? eq(devices.deviceId, requestedDeviceId) : undefined,
      limit: requestedDeviceId ? 1 : undefined,
      with: {
        connector: { // Use the defined relation name
          columns: {
            name: true,
            category: true
          }
        }
      }
    });

    const devicesResult = await devicesQuery;

    if (requestedDeviceId && devicesResult.length === 0) {
      return NextResponse.json({ success: false, error: 'Device not found' }, { status: 404 });
    }

    if (devicesResult.length === 0) {
        return NextResponse.json({ success: true, data: [] }); // Return empty array if no devices
    }

    const deviceIds = devicesResult.map(d => d.id);
    const pikoServerIds = devicesResult.filter(d => d.connector.category === 'piko' && d.serverId).map(d => d.serverId!);

    // 2. Fetch Piko Server details efficiently (if any)
    const pikoServersMap = new Map<string, PikoServer>();
    if (pikoServerIds.length > 0) {
      const servers = await db.select().from(pikoServers).where(inArray(pikoServers.serverId, pikoServerIds));
      servers.forEach(server => pikoServersMap.set(server.serverId, server as PikoServer));
    }

    // 3. Fetch association counts efficiently
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
      // If a device is also a target, add to its existing count (or set if not a source)
      const existingCount = associationCountsMap.get(row.pikoCameraId) ?? 0;
      associationCountsMap.set(row.pikoCameraId, existingCount + row.count);
    });


    // 4. Map results, combining fetched data
    const devicesWithConnector: DeviceWithConnector[] = devicesResult.map(deviceRow => {
      const connector = deviceRow.connector as Connector; // Cast based on 'with' clause
      const pikoServerDetails = deviceRow.serverId ? pikoServersMap.get(deviceRow.serverId) : undefined;
      const associationCount = associationCountsMap.get(deviceRow.id) ?? null; // Use the map
      const deviceTypeInfo = getDeviceTypeInfo(connector.category, deviceRow.type);
      const displayState = deviceRow.status as DisplayState | undefined;

      return {
        id: deviceRow.id,
        deviceId: deviceRow.deviceId,
        connectorId: deviceRow.connectorId,
        name: deviceRow.name,
        type: deviceRow.type, // Keep raw type
        status: deviceRow.status, // Keep raw status
        model: deviceRow.model ?? undefined,
        vendor: deviceRow.vendor ?? undefined,
        url: deviceRow.url ?? undefined,
        createdAt: deviceRow.createdAt,
        updatedAt: deviceRow.updatedAt,
        // --- Use data from optimized queries ---
        connectorName: connector.name,
        connectorCategory: connector.category,
        serverName: pikoServerDetails?.name, // From map
        pikoServerDetails: pikoServerDetails, // From map
        associationCount: associationCount, // From map
        deviceTypeInfo: deviceTypeInfo!,
        displayState, // From initial fetch
      } satisfies DeviceWithConnector;
    });
    // --- END Optimized Query ---

    // Return response
    if (requestedDeviceId) {
      return NextResponse.json({ success: true, data: devicesWithConnector[0] });
    } else {
      return NextResponse.json({ success: true, data: devicesWithConnector });
    }

  } catch (error: unknown) {
    console.error('Error fetching devices:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch devices' },
      { status: 500 }
    );
  }
}

// POST /api/devices – syncs devices from all connectors and returns them with count
export async function POST() {
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
    // --- BEGIN Optimized Fetch Logic (similar to GET) ---
    const allDevicesResult = await db.query.devices.findMany({
      with: {
        connector: {
          columns: {
            name: true,
            category: true
          }
        }
      }
    });

    const devicesWithConnector: DeviceWithConnector[] = []; // Initialize empty array

    if (allDevicesResult.length > 0) {
        const deviceIds = allDevicesResult.map(d => d.id);
        const pikoServerIds = allDevicesResult.filter(d => d.connector.category === 'piko' && d.serverId).map(d => d.serverId!);

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

        // Map results
        allDevicesResult.forEach(deviceRow => {
            const connector = deviceRow.connector as Connector;
            const pikoServerDetails = deviceRow.serverId ? pikoServersMap.get(deviceRow.serverId) : undefined;
            const associationCount = associationCountsMap.get(deviceRow.id) ?? null;
            const deviceTypeInfo = getDeviceTypeInfo(connector.category, deviceRow.type);
            const displayState = deviceRow.status as DisplayState | undefined;

            devicesWithConnector.push({
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
                serverName: pikoServerDetails?.name,
                pikoServerDetails: pikoServerDetails,
                associationCount: associationCount,
                deviceTypeInfo: deviceTypeInfo!,
                displayState,
            } satisfies DeviceWithConnector);
        });
    }
    // --- END Optimized Fetch Logic ---

    // Update Zustand store
    try {
      useFusionStore.getState().setDeviceStatesFromSync(devicesWithConnector);
      console.log('[API Sync] Successfully updated FusionStore with synced devices (state read from DB). ');
    } catch (storeError) {
      console.error('[API Sync] Failed to update FusionStore:', storeError);
    }
    
    return NextResponse.json({
      success: true,
      data: devicesWithConnector, // Return the efficiently fetched data
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
}

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

    if (yolinkDevicesFromApi.length === 0) return 0;

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

      if ((device.type === 'Switch' || device.type === 'Outlet' || device.type === 'MultiOutlet') && deviceToken) {
          try {
              console.log(`[API Sync] Fetching state for ${device.type} ${device.deviceId}...`);
              // UPDATED: Pass connectorId as the first argument.
              // The 'config' here refers to the initial connector config.
              // getDeviceState will internally manage tokens.
              const stateData = await yolinkDriver.getDeviceState(
                  connectorId, // Pass connectorId
                  config,      // Pass the original config
                  device.deviceId, 
                  deviceToken, 
                  device.type
              );
              
              const rawState = stateData?.state; // e.g., 'open', 'closed'
              let intermediateState: IntermediateState | undefined = undefined;
              if (rawState === 'open') {
                  intermediateState = BinaryState.On;
              } else if (rawState === 'closed') {
                  intermediateState = BinaryState.Off;
              }
              
              if (intermediateState) {
                  calculatedDisplayState = mapIntermediateToDisplay(intermediateState); // Assign here
                  console.log(`[API Sync] Device ${device.deviceId} fetched state: ${rawState} -> ${intermediateState} -> ${calculatedDisplayState}`);
              } else {
                   console.warn(`[API Sync] Unknown raw state '${rawState}' received for ${device.deviceId}`);
              }
          } catch (stateError) {
              console.error(`  [Error] Failed to fetch state for ${device.type} ${device.deviceId}:`, stateError instanceof Error ? stateError.message : stateError);
              // Do not update status if state fetch fails, rely on event processor
          }
      }

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
    console.log(`YoLink sync finished for ${connectorId}. Processed ${processedCount} devices.`);
    // --- BEGIN Return only count ---
    return processedCount;
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

    console.log(`Piko device sync finished for ${connectorId}. Processed: ${processedDeviceCount}`);
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
  try {
    console.log(`Syncing Genea devices for connector ${connectorId}`);
    // Config is already parsed and validated in the main POST handler
    const geneaDoorsFromApi = await geneaDriver.getGeneaDoors(config);
    console.log(`Found ${geneaDoorsFromApi.length} Genea doors from API.`);

    if (geneaDoorsFromApi.length === 0) return 0;

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
    console.log(`Genea Sync finished for ${connectorId}. Processed: ${processedCount}`);
    return processedCount;
  } catch (error: unknown) {
    console.error(`Error syncing Genea devices for connector ${connectorId}:`, error);
    // Re-throw error to be caught by the main POST handler and reported
    throw error; 
  }
}
// --- END NEW Genea Sync ---