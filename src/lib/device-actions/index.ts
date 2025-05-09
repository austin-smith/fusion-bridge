import { db } from '@/data/db';
import { devices, connectors } from '@/data/db/schema';
import { eq } from 'drizzle-orm';
import { ActionableState } from '../mappings/definitions';
import * as yolinkDriver from '@/services/drivers/yolink';
import type { YoLinkConfig } from '@/services/drivers/yolink';
// Import other driver types as needed, e.g.:
// import type { PikoConfig } from '@/services/drivers/piko'; 
// import type { GeneaConfig } from '@/services/drivers/genea';
// --- BEGIN Registry Imports ---
import type { IDeviceActionHandler, DeviceContext } from './types';
import { YoLinkActionHandler } from './yolink-handler';
// Import other handlers as they are created:
// import { PikoActionHandler } from './device-actions/piko-handler';
// --- END Registry Imports ---

// --- BEGIN Handler Registry ---
// Instantiate handlers and add them to the registry
const actionHandlers: IDeviceActionHandler[] = [
    new YoLinkActionHandler(),
    // Add other handler instances here:
    // new PikoActionHandler(), 
];
// --- END Handler Registry ---

// --- BEGIN Export actionHandlers and types ---
export { actionHandlers };
export type { IDeviceActionHandler, DeviceContext }; // Also export types
// --- END Export actionHandlers and types ---

/**
 * Attempts to change the state of a device via its connector driver.
 * This acts as an abstraction layer over different vendor APIs, using a handler registry.
 * 
 * @param internalDeviceId The internal database ID of the device record.
 * @param newState The desired abstract state (e.g., SET_ON, SET_OFF).
 * @returns Promise resolving to true if the state change command was successfully sent.
 * @throws Error for configuration issues, unsupported devices/actions, or driver errors.
 */
export async function requestDeviceStateChange(
    internalDeviceId: string, 
    newState: ActionableState
): Promise<boolean> {
    console.log(`[DeviceActions] Requesting state change for internal device ID ${internalDeviceId} to ${newState}`);

    try {
        // 1. Fetch Device Info (including raw data)
        // Fetch only the columns needed by handlers + connector lookup
        const device = await db.query.devices.findFirst({
            where: eq(devices.id, internalDeviceId),
            columns: {
                id: true,
                deviceId: true, // Vendor's device ID
                type: true,     // Raw device type from vendor
                connectorId: true,
                rawDeviceData: true,
            }
        });

        if (!device) {
            console.error(`[DeviceActions] Device with internal ID ${internalDeviceId} not found.`);
            throw new Error(`Device not found.`);
        }

        // Cast to the context type for handlers
        const deviceContext: DeviceContext = device;
        console.log(`[DeviceActions] Found device: ${deviceContext.deviceId}, Type: ${deviceContext.type}`);

        // 2. Fetch Connector Info & Config
        const connector = await db.query.connectors.findFirst({
            where: eq(connectors.id, deviceContext.connectorId),
            columns: {
                id: true,
                category: true,
                cfg_enc: true,
            }
        });

        if (!connector) {
            console.error(`[DeviceActions] Connector ${deviceContext.connectorId} for device ${internalDeviceId} not found.`);
            throw new Error(`Connector configuration not found for device.`);
        }

        console.log(`[DeviceActions] Found connector: ${connector.id}, Category: ${connector.category}`);

        // 3. Parse Config (handle potential errors)
        let parsedConfig: any;
        try {
            parsedConfig = JSON.parse(connector.cfg_enc);
        } catch (e) {
            console.error(`[DeviceActions] Failed to parse configuration for connector ${connector.id}:`, e);
            throw new Error(`Invalid connector configuration.`);
        }

        // 4. Find and Execute Appropriate Handler
        const handler = actionHandlers.find(h => 
            h.category === connector.category && h.canHandle(deviceContext, newState)
        );

        if (!handler) {
            console.warn(`[DeviceActions] No suitable action handler found for category '${connector.category}', device type '${deviceContext.type}', and action '${newState}'.`);
            throw new Error(`Action '${newState}' is not supported for this device type or connector.`);
        }

        console.log(`[DeviceActions] Using handler for category: ${handler.category}`);
        // Delegate execution to the found handler
        return await handler.executeStateChange(deviceContext, parsedConfig, newState);

    } catch (error) {
        console.error(`[DeviceActions] Error during requestDeviceStateChange for ${internalDeviceId}:`, error);
        // Re-throw the error to be handled by the API endpoint
        if (error instanceof Error) {
            throw error; 
        } else {
            throw new Error('An unknown error occurred while changing device state.');
        }
    }
} 