import { NextResponse } from 'next/server';
import { db } from '@/data/db';
import { devices, nodes, pikoServers, cameraAssociations } from '@/data/db/schema';
import { eq, count } from 'drizzle-orm';
import * as yolinkDriver from '@/services/drivers/yolink';
import * as pikoDriver from '@/services/drivers/piko';

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
  
  return result[0].value;
}

// GET /api/devices – returns devices with connector information and association count
export async function GET() {
  try {
    // Fetch all devices
    const allDevices = await db.select().from(devices);

    // Map device rows into DeviceWithConnector objects
    const devicesWithConnector = await Promise.all(
      allDevices.map(async (deviceRow) => {
        let connectorName = 'Unknown';
        let connectorCategory = 'Unknown';
        let serverName: string | undefined = undefined;
        let pikoServerDetails: import('@/types').PikoServer | undefined = undefined;

        // Fetch connector info
        try {
          const connector = await db
            .select({ name: nodes.name, category: nodes.category })
            .from(nodes)
            .where(eq(nodes.id, deviceRow.connectorId))
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
              pikoServerDetails = serverResult[0] as import('@/types').PikoServer;
              serverName = pikoServerDetails.name; 
            }
          } catch { /* ignore server lookup errors */ }
        }
        
        // Fetch association count using the internal device ID
        const associationCount = await getAssociationCount(
          deviceRow.id,
          connectorCategory
        );

        return {
          // original device fields
          deviceId: deviceRow.deviceId,
          connectorId: deviceRow.connectorId,
          name: deviceRow.name,
          type: deviceRow.type,
          status: deviceRow.status,
          model: deviceRow.model ?? undefined, // Convert null to undefined for type compatibility
          // enriched
          connectorName,
          connectorCategory,
          serverName, 
          pikoServerDetails, 
          associationCount, // Include association count
        } satisfies import('@/types').DeviceWithConnector;
      })
    );

    return NextResponse.json({ success: true, data: devicesWithConnector });
  } catch (error) {
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
    
    // Fetch all nodes (connectors)
    const allConnectors = await db.select().from(nodes);
    
    // For each connector, sync devices
    for (const connector of allConnectors) {
      try {
        if (connector.category === 'yolink') {
          // Sync YoLink devices
          let yolinkConfig;
          try {
            yolinkConfig = JSON.parse(connector.cfg_enc);
          } catch (parseError: any) {
            console.error(`Error parsing config for connector ${connector.name}:`, parseError);
            errors.push({
              connectorName: connector.name,
              error: 'Invalid configuration format'
            });
            continue; // Skip this connector
          }

          // **Update validation to check for uaid and clientSecret**
          if (!yolinkConfig || typeof yolinkConfig.uaid !== 'string' || yolinkConfig.uaid.trim() === '' || 
              typeof yolinkConfig.clientSecret !== 'string' || yolinkConfig.clientSecret.trim() === '') {
            console.error(`Incomplete YoLink configuration for connector ${connector.name}. Needs uaid & clientSecret. Found keys: ${Object.keys(yolinkConfig || {}).join(', ')}`);
            errors.push({
              connectorName: connector.name,
              error: 'Incomplete YoLink configuration: Missing or empty uaid/clientSecret'
            });
            continue; // Skip this connector
          }
          
          // Now we know the config has the required fields (uaid, clientSecret)
          console.log(`Valid YoLink config (uaid/clientSecret) found for ${connector.name}. Proceeding to sync.`);
          // syncYoLinkDevices returns a count
          const countFromYoLinkSync = await syncYoLinkDevices(connector.id, yolinkConfig);
          syncedCount += countFromYoLinkSync;
        } else if (connector.category === 'piko') {
          // Sync Piko devices
          const pikoConfig = JSON.parse(connector.cfg_enc);
          const countFromPikoSync = await syncPikoDevices(connector.id, pikoConfig);
          syncedCount += countFromPikoSync;
        } else {
          errors.push({
            connectorName: connector.name,
            error: `Unsupported connector type: ${connector.category}`
          });
        }
      } catch (err) {
        console.error(`Error syncing devices for connector ${connector.name}:`, err);
        errors.push({
          connectorName: connector.name,
          error: err instanceof Error ? err.message : 'Unknown error during sync'
        });
      }
    }
    
    // Fetch updated devices
    const allDevices = await db.select().from(devices);
    
    // Map device rows into DeviceWithConnector objects (identical logic to GET)
    const devicesWithConnector = await Promise.all(
      allDevices.map(async (deviceRow) => {
        let connectorName = 'Unknown';
        let connectorCategory = 'Unknown';
        let serverName: string | undefined = undefined;
        let pikoServerDetails: import('@/types').PikoServer | undefined = undefined;

        // Fetch connector info
        try {
          const connector = await db
            .select({ name: nodes.name, category: nodes.category })
            .from(nodes)
            .where(eq(nodes.id, deviceRow.connectorId))
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
              pikoServerDetails = serverResult[0] as import('@/types').PikoServer;
              serverName = pikoServerDetails.name; 
            }
          } catch { /* ignore server lookup errors */ }
        }
        
        // Fetch association count using the internal device ID
        const associationCount = await getAssociationCount(
          deviceRow.id,
          connectorCategory
        );

        return {
          // original device fields
          deviceId: deviceRow.deviceId,
          connectorId: deviceRow.connectorId,
          name: deviceRow.name,
          type: deviceRow.type,
          status: deviceRow.status,
          model: deviceRow.model ?? undefined, // Convert null to undefined for type compatibility
          // enriched
          connectorName,
          connectorCategory,
          serverName, 
          pikoServerDetails, 
          associationCount, // Include association count
        } satisfies import('@/types').DeviceWithConnector;
      })
    );
    
    return NextResponse.json({
      success: true,
      data: devicesWithConnector,
      syncedCount,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error syncing devices:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to sync devices' },
      { status: 500 }
    );
  }
}

/**
 * Syncs YoLink devices for a specific connector
 * @param connectorId The ID of the connector
 * @param config The YoLink configuration
 * @returns Count of synced devices
 */
async function syncYoLinkDevices(connectorId: string, config: any): Promise<number> {
  let processedCount = 0;
  try {
    console.log(`Syncing YoLink devices for connector ${connectorId} using Upsert Strategy`);
    
    const driverConfig = {
      uaid: config.uaid,
      clientSecret: config.clientSecret
    };
    
    const accessToken = await yolinkDriver.getAccessToken(driverConfig);
    console.log('Successfully obtained access token.');
    
    const yolinkDevicesFromApi = await yolinkDriver.getDeviceList(accessToken);
    console.log(`Found ${yolinkDevicesFromApi.length} YoLink devices from API.`);

    if (yolinkDevicesFromApi.length === 0) {
      console.log(`No devices found from API for ${connectorId}. Skipping DB operations.`);
      // Optionally, we could delete existing devices here if desired.
      // await db.delete(devices).where(eq(devices.connectorId, connectorId));
      return 0; 
    }

    // **Strategy: Upsert each device individually using onConflictDoUpdate**
    console.log(`Upserting ${yolinkDevicesFromApi.length} devices...`);
    for (const device of yolinkDevicesFromApi) {
      if (!device.deviceId || !device.name || !device.type) {
        console.warn('[Upsert Loop] Skipping device with missing required fields:', device);
        continue;
      }

      const deviceData = {
        deviceId: device.deviceId,
        connectorId: connectorId,
        name: device.name,
        type: device.type,
        status: device.state || null, // Use state if available
        model: device.modelName, // Map modelName to model
        // Piko specific fields will be null for YoLink
        serverId: null,
        vendor: null, 
        url: null, 
        // createdAt is handled by DB default on initial insert
        updatedAt: new Date() // Always update this
      };

      try {
        // console.log(`  [Upsert] Attempting for deviceId: ${deviceData.deviceId}`); // Removed verbose log
        await db.insert(devices)
          .values({ ...deviceData, createdAt: new Date() }) // Need createdAt for initial insert
          .onConflictDoUpdate({
            target: [devices.connectorId, devices.deviceId], // Composite primary key
            set: { // Update specific fields
              name: deviceData.name,
              type: deviceData.type,
              status: deviceData.status,
              model: deviceData.model, // Ensure model is updated too
              // Reset Piko fields to null in case it was previously mis-categorized
              serverId: null,
              vendor: null,
              url: null,
              updatedAt: deviceData.updatedAt
            }
          });
        processedCount++;
        // console.log(`  [Success] Upsert successful for ${deviceData.deviceId}`); // Removed verbose log
      } catch (upsertError: any) {
        // Keep error log for failed upserts
        console.error(`  [Error] Failed upsert for deviceId ${deviceData.deviceId}:`, upsertError);
      }
    }

    // Optional: Delete devices that exist in DB but were NOT in the latest API response
    // const apiDeviceIds = new Set(yolinkDevicesFromApi.map(d => d.deviceId));
    // const devicesToDelete = await db.select({ deviceId: devices.deviceId })
    //   .from(devices)
    //   .where(eq(devices.connectorId, connectorId))
    //   .then(dbDevices => dbDevices.filter(dbDev => !apiDeviceIds.has(dbDev.deviceId)));
    // if (devicesToDelete.length > 0) {
    //   console.log(`Deleting ${devicesToDelete.length} devices not found in latest API sync...`);
    //   await db.delete(devices).where(and(
    //     eq(devices.connectorId, connectorId),
    //     inArray(devices.deviceId, devicesToDelete.map(d => d.deviceId))
    //   ));
    // }

    console.log(`Sync finished for ${connectorId}. Total devices processed: ${processedCount}`);
    return processedCount;
  } catch (error: any) {
    console.error(`Error syncing YoLink devices for connector ${connectorId}:`, error);
    throw error; // Re-throw error to indicate sync failure for this connector
  }
}

/**
* Syncs Piko devices for a specific connector
* @param connectorId The ID of the connector
* @param config The Piko configuration (parsed from cfg_enc)
* @returns Promise resolving to the count of successfully processed devices
*/
async function syncPikoDevices(connectorId: string, config: pikoDriver.PikoConfig): Promise<number> {
  let processedDeviceCount = 0;
  try {
    console.log(`Syncing Piko servers and devices for connector ${connectorId}`);

    // Validate required config fields
    if (!config.username || !config.password || !config.selectedSystem) {
      throw new Error('Piko config requires username, password, and selectedSystem ID');
    }
    const { username, password, selectedSystem } = config;
    
    // 1. Get system-scoped access token
    const tokenResponse = await pikoDriver.getSystemScopedAccessToken(username, password, selectedSystem);
    const systemScopedToken = tokenResponse.accessToken;
    console.log(`Successfully obtained Piko system-scoped token for system: ${selectedSystem}`);
    
    // --- Sync Piko Servers ---
    let processedServerCount = 0;
    try {
      console.log("Fetching Piko servers...");
      const pikoServersFromApi = await pikoDriver.getSystemServers(selectedSystem, systemScopedToken);
      console.log(`Found ${pikoServersFromApi.length} Piko servers from API.`);

      if (pikoServersFromApi.length > 0) {
        console.log(`Upserting ${pikoServersFromApi.length} Piko servers...`);
        for (const server of pikoServersFromApi) {
          if (!server.id || !server.name) {
            console.warn('[Piko Server Upsert] Skipping server with missing id or name:', server);
            continue;
          }

          const serverData = {
            serverId: server.id, // Matches schema field name
            connectorId: connectorId,
            name: server.name,
            status: server.status || null,
            version: server.version || null,
            osPlatform: server.osInfo?.platform || null,
            osVariantVersion: server.osInfo?.variantVersion || null,
            url: server.url || null,
            updatedAt: new Date()
          };

          await db.insert(pikoServers)
            .values({ ...serverData, createdAt: new Date() })
            .onConflictDoUpdate({
              target: pikoServers.serverId,
              set: {
                name: serverData.name,
                status: serverData.status,
                version: serverData.version,
                osPlatform: serverData.osPlatform,
                osVariantVersion: serverData.osVariantVersion,
                url: serverData.url,
                updatedAt: serverData.updatedAt
                // connectorId should not change on conflict
              }
            });
          processedServerCount++;
        }
        console.log(`Piko server upsert finished. Processed: ${processedServerCount}`);
      }
      // Optional: Delete servers associated with connectorId not in pikoServersFromApi

    } catch (serverSyncError: any) {
      console.error(`Error during Piko server sync for connector ${connectorId}:`, serverSyncError);
      // Decide if server sync error should stop device sync. For now, log and continue.
      // errors.push(...) could be used if we pass the errors array down.
    }

    // --- Sync Piko Devices ---
    console.log("Fetching Piko devices...");
    const pikoDevicesFromApi = await pikoDriver.getSystemDevices(selectedSystem, systemScopedToken);
    console.log(`Found ${pikoDevicesFromApi.length} Piko devices from API for system ${selectedSystem}.`);

    if (pikoDevicesFromApi.length > 0) {
      console.log(`Upserting ${pikoDevicesFromApi.length} Piko devices...`);
      for (const device of pikoDevicesFromApi) {
        if (!device.id || !device.name) {
          console.warn('[Piko Device Upsert] Skipping device with missing id or name:', device);
          continue;
        }

        const deviceData = {
          deviceId: device.id,
          connectorId: connectorId,
          name: device.name,
          type: device.deviceType || 'Unknown', 
          status: device.status || null, 
          serverId: device.serverId || null,
          vendor: device.vendor || null,
          model: device.model || null, // Use model field from Piko API
          url: device.url || null,
          updatedAt: new Date()
        };

        try {
          await db.insert(devices)
            .values({ ...deviceData, createdAt: new Date() })
            .onConflictDoUpdate({
              target: [devices.connectorId, devices.deviceId], // Composite PK
              set: { 
                name: deviceData.name,
                type: deviceData.type,
                status: deviceData.status,
                serverId: deviceData.serverId, // Update serverId
                vendor: deviceData.vendor,
                model: deviceData.model,
                url: deviceData.url,
                updatedAt: deviceData.updatedAt
              }
            });
          processedDeviceCount++;
        } catch (upsertError: any) {
          console.error(`  [Error] Failed Piko device upsert for deviceId ${deviceData.deviceId}:`, upsertError);
        }
      }
    }
    // Optional: Delete devices associated with connectorId not in pikoDevicesFromApi

    console.log(`Piko device sync finished for ${connectorId}. Total devices processed: ${processedDeviceCount}`);
    return processedDeviceCount; // Return count of devices processed

  } catch (error: any) {
    console.error(`Error syncing Piko data for connector ${connectorId}:`, error);
    throw new Error(`Piko sync failed: ${error.message || 'Unknown error'}`); 
  }
} 