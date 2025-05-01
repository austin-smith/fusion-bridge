import { NextResponse, NextRequest } from 'next/server';
import { db } from '@/data/db';
import { devices, connectors, pikoServers, cameraAssociations } from '@/data/db/schema';
import { eq, count } from 'drizzle-orm';
import * as yolinkDriver from '@/services/drivers/yolink';
import * as pikoDriver from '@/services/drivers/piko';
import * as geneaDriver from '@/services/drivers/genea';
import { getDeviceTypeInfo } from '@/lib/mappings/identification';
import type { DeviceWithConnector, PikoServer } from '@/types';
import { useFusionStore } from '@/stores/store';
import type { TypedDeviceInfo } from '@/lib/mappings/definitions';
import { DeviceType } from '@/lib/mappings/definitions';

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

// GET /api/devices – returns devices with connector information and association count
// Optionally filters by deviceId query parameter
export async function GET(request: NextRequest) {
  try {
    // Check for deviceId query parameter
    const { searchParams } = new URL(request.url);
    const requestedDeviceId = searchParams.get('deviceId');

    let devicesToProcess: typeof devices.$inferSelect[] = [];

    if (requestedDeviceId) {
      // Fetch specific device by deviceId
      const specificDevice = await db.select()
        .from(devices)
        .where(eq(devices.deviceId, requestedDeviceId))
        .limit(1);
      
      if (specificDevice.length > 0) {
        devicesToProcess = specificDevice;
      } else {
        // Device not found
        return NextResponse.json(
          { success: false, error: 'Device not found' },
          { status: 404 }
        );
      }
    } else {
      // Fetch all devices if no specific ID requested
      devicesToProcess = await db.select().from(devices);
    }

    // Map device rows into DeviceWithConnector objects
    const devicesWithConnector = await Promise.all(
      devicesToProcess.map(async (deviceRow) => {
        let connectorName = 'Unknown';
        let connectorCategory = 'Unknown';
        let serverName: string | undefined = undefined;
        let pikoServerDetails: PikoServer | undefined = undefined;
        let associationCount: number | null = null;
        let deviceTypeInfo: TypedDeviceInfo | undefined = undefined;

        try {
          // Fetch connector info
          const connector = await db
            .select({ name: connectors.name, category: connectors.category })
            .from(connectors)
            .where(eq(connectors.id, deviceRow.connectorId))
            .limit(1);
          if (connector.length > 0) {
            connectorName = connector[0].name;
            connectorCategory = connector[0].category;
          }
        } catch (e) { console.error(`Error fetching connector for device ${deviceRow.id}:`, e); }

        try {
          // Fetch Piko server details if applicable
          if (connectorCategory === 'piko' && deviceRow.serverId) {
            const serverResult = await db
              .select() 
              .from(pikoServers)
              .where(eq(pikoServers.serverId, deviceRow.serverId))
              .limit(1);
            if (serverResult.length > 0) {
              pikoServerDetails = serverResult[0] as PikoServer;
              serverName = pikoServerDetails.name; 
            }
          }
        } catch (e) { console.error(`Error fetching piko server ${deviceRow.serverId} for device ${deviceRow.id}:`, e); }
        
        try {
          associationCount = await getAssociationCount(deviceRow.id, connectorCategory);
        } catch (e) { console.error(`Error fetching association count for device ${deviceRow.id}:`, e); associationCount = null; }

        try {
          deviceTypeInfo = getDeviceTypeInfo(connectorCategory, deviceRow.type);
        } catch (e) { 
          console.error(`Error getting device type info for device ${deviceRow.id} (Category: ${connectorCategory}, Type: ${deviceRow.type}):`, e); 
          deviceTypeInfo = getDeviceTypeInfo('Unmapped', 'Unknown'); 
        }

        return {
          // original device fields
          id: deviceRow.id,
          deviceId: deviceRow.deviceId,
          connectorId: deviceRow.connectorId,
          name: deviceRow.name,
          type: deviceRow.type,
          status: deviceRow.status,
          model: deviceRow.model ?? undefined, // Convert null to undefined for type compatibility
          vendor: deviceRow.vendor ?? undefined, // Ensure vendor is included
          url: deviceRow.url ?? undefined,       // Ensure url is included
          createdAt: deviceRow.createdAt,
          updatedAt: deviceRow.updatedAt,
          // enriched
          connectorName,
          connectorCategory,
          serverName, 
          pikoServerDetails, 
          associationCount, // Include association count
          // Mapped type info object
          deviceTypeInfo: deviceTypeInfo!, // Use non-null assertion as we provide a fallback
        } satisfies DeviceWithConnector;
      })
    );

    // If a specific device was requested, return the single object, otherwise the array
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
    const allDevices = await db.select().from(devices);
    const devicesWithConnector = await Promise.all(
      allDevices.map(async (deviceRow) => {
        let connectorName = 'Unknown';
        let connectorCategory = 'Unknown';
        let serverName: string | undefined = undefined;
        let pikoServerDetails: PikoServer | undefined = undefined;
        let associationCount: number | null = null;
        let deviceTypeInfo: TypedDeviceInfo | undefined = undefined;

        // Fetch connector info
        try {
          const connector = await db
            .select({ name: connectors.name, category: connectors.category })
            .from(connectors)
            .where(eq(connectors.id, deviceRow.connectorId))
            .limit(1);
          if (connector.length > 0) {
            connectorName = connector[0].name;
            connectorCategory = connector[0].category;
          }
        } catch { /* ignore lookup errors */ }

        // If it's a Piko device and has a serverId, fetch full server details
        if (connectorCategory === 'piko' && deviceRow.serverId) {
          try {
            const serverResult = await db
              .select() 
              .from(pikoServers)
              .where(eq(pikoServers.serverId, deviceRow.serverId))
              .limit(1);
            if (serverResult.length > 0) {
              pikoServerDetails = serverResult[0] as PikoServer;
              serverName = pikoServerDetails.name; 
            }
          } catch { /* ignore server lookup errors */ }
        }
        
        // Fetch association count using the internal device ID
        associationCount = await getAssociationCount(deviceRow.id, connectorCategory);

        // Map device type/subtype
        deviceTypeInfo = getDeviceTypeInfo(connectorCategory, deviceRow.type);

        return {
          // original device fields
          id: deviceRow.id,
          deviceId: deviceRow.deviceId,
          connectorId: deviceRow.connectorId,
          name: deviceRow.name,
          type: deviceRow.type,
          status: deviceRow.status,
          model: deviceRow.model ?? undefined, // Convert null to undefined for type compatibility
          vendor: deviceRow.vendor ?? undefined, // Ensure vendor is included
          url: deviceRow.url ?? undefined,       // Ensure url is included
          createdAt: deviceRow.createdAt,
          updatedAt: deviceRow.updatedAt,
          // enriched
          connectorName,
          connectorCategory,
          serverName, 
          pikoServerDetails, 
          associationCount, // Include association count
          // Mapped type info object
          deviceTypeInfo: deviceTypeInfo!, // Use non-null assertion as we provide a fallback
        } satisfies DeviceWithConnector;
      })
    );
    
    // Update Zustand store
    try {
      useFusionStore.getState().setDeviceStatesFromSync(devicesWithConnector);
      console.log('[API Sync] Successfully updated FusionStore with synced devices.');
    } catch (storeError) {
      console.error('[API Sync] Failed to update FusionStore:', storeError);
    }
    
    return NextResponse.json({
      success: true,
      data: devicesWithConnector,
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
}

/**
 * Syncs YoLink devices, populating standardized types.
 */
async function syncYoLinkDevices(connectorId: string, config: yolinkDriver.YoLinkConfig): Promise<number> {
  let processedCount = 0;
  try {
    console.log(`Syncing YoLink devices for connector ${connectorId}`);
    const driverConfig = { uaid: config.uaid, clientSecret: config.clientSecret };
    const accessToken = await yolinkDriver.getAccessToken(driverConfig);
    const yolinkDevicesFromApi = await yolinkDriver.getDeviceList(accessToken);
    console.log(`Found ${yolinkDevicesFromApi.length} YoLink devices from API.`);

    if (yolinkDevicesFromApi.length === 0) return 0; 

    console.log(`Upserting ${yolinkDevicesFromApi.length} YoLink devices...`);
    for (const device of yolinkDevicesFromApi) {
      if (!device.deviceId || !device.name || !device.type) continue;

      let deviceStatusString: string | null = null;
      if (typeof device.state === 'object' && device.state !== null) {
        deviceStatusString = (device.state as any).state ?? (device.state as any).power ?? null;
      }

      // Get Standardized Type Info
      const stdTypeInfo = getDeviceTypeInfo('yolink', device.type);

      const deviceData = {
        deviceId: device.deviceId,
        connectorId: connectorId,
        name: device.name,
        type: device.type, // Raw type
        standardizedDeviceType: stdTypeInfo.type, 
        standardizedDeviceSubtype: stdTypeInfo.subtype ?? null,
        status: deviceStatusString,
        model: device.modelName,
        serverId: null,
        vendor: null, 
        url: null, 
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
              model: deviceData.model,
              serverId: null,
              vendor: null,
              url: null,
              updatedAt: deviceData.updatedAt
            }
          });
        processedCount++;
      } catch (upsertError: unknown) {
        console.error(`  [Error] Failed YoLink upsert for deviceId ${deviceData.deviceId}:`, upsertError);
      }
    }
    console.log(`YoLink Sync finished for ${connectorId}. Processed: ${processedCount}`);
    return processedCount;
  } catch (error: unknown) {
    console.error(`Error syncing YoLink devices for connector ${connectorId}:`, error);
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

    const tokenResponse = await pikoDriver.getToken(config);
    const accessToken = tokenResponse.accessToken;
    console.log(`Successfully obtained Piko token (Type: ${config.type})`);

    // --- Sync Piko Servers (Cloud only) ---
    if (config.type === 'cloud' && config.selectedSystem) {
        try {
          console.log(`Syncing Piko servers for system: ${config.selectedSystem}...`);
          const pikoServersFromApi = await pikoDriver.getSystemServers(config, accessToken);
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
    const pikoDevicesFromApi = await pikoDriver.getSystemDevices(config, accessToken);
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