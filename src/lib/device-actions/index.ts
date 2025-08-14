import { db } from '@/data/db';
import { devices, connectors } from '@/data/db/schema';
import { eq } from 'drizzle-orm';
import { ActionableState, DeviceCommand } from '../mappings/definitions';
import * as yolinkDriver from '@/services/drivers/yolink';
import type { YoLinkConfig } from '@/services/drivers/yolink';
import { renamePikoDevice } from '@/services/drivers/piko';
import type { GeneaDoorUpdatePayload } from '@/services/drivers/genea';
import { isRenameSupported } from './capabilities';
// Import other driver types as needed, e.g.:
// import type { PikoConfig } from '@/services/drivers/piko'; 
// import type { GeneaConfig } from '@/services/drivers/genea';
// --- BEGIN Registry Imports ---
import type { IDeviceActionHandler, IDeviceCommandHandler, DeviceContext } from './types';
import { YoLinkHandler } from './yolink-handler';
import { GeneaHandler } from './genea-handler';
// Import other handlers as they are created:
// import { PikoActionHandler } from './device-actions/piko-handler';
// --- END Registry Imports ---

// --- BEGIN Handler Registry ---
// Instantiate handlers and add them to the registry
const handlers = [
    new YoLinkHandler(), // Implements both IDeviceActionHandler and IDeviceCommandHandler
    new GeneaHandler(), // Implements IDeviceActionHandler for door lock/unlock
    // Add other handler instances here:
    // new PikoActionHandler(), 
];

// Separate accessors for type safety
const actionHandlers: IDeviceActionHandler[] = handlers.filter(h => 
    'canHandle' in h && 'executeStateChange' in h
) as IDeviceActionHandler[];

const commandHandlers: IDeviceCommandHandler[] = handlers.filter(h => 
    'canExecuteCommand' in h && 'executeCommand' in h
) as IDeviceCommandHandler[];
// --- END Handler Registry ---

// --- BEGIN Export handlers and types ---
export { actionHandlers, commandHandlers };
export type { IDeviceActionHandler, IDeviceCommandHandler, DeviceContext };
// --- END Export handlers and types ---

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

/**
 * Executes a command on a device via its connector driver.
 * This acts as an abstraction layer over different vendor APIs, using the same handler registry.
 * 
 * @param internalDeviceId The internal database ID of the device record.
 * @param command The desired device command (e.g., PLAY_AUDIO).
 * @param params Optional command-specific parameters.
 * @returns Promise resolving to true if the command was successfully executed.
 * @throws Error for configuration issues, unsupported devices/commands, or driver errors.
 */
export async function requestDeviceCommand(
    internalDeviceId: string, 
    command: DeviceCommand,
    params?: Record<string, any>
): Promise<boolean> {
    console.log(`[DeviceActions] Requesting command ${command} for internal device ID ${internalDeviceId}`);

    try {
        // 1. Fetch Device Info (reusing same logic as requestDeviceStateChange)
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

        // 2. Fetch Connector Info & Config (reusing same logic)
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

        // 3. Parse Config (reusing same logic)
        let parsedConfig: any;
        try {
            parsedConfig = JSON.parse(connector.cfg_enc);
        } catch (e) {
            console.error(`[DeviceActions] Failed to parse configuration for connector ${connector.id}:`, e);
            throw new Error(`Invalid connector configuration.`);
        }

        // 4. Find and Execute Appropriate Command Handler
        const handler = commandHandlers.find(h => 
            h.category === connector.category && h.canExecuteCommand(deviceContext, command)
        );

        if (!handler) {
            console.warn(`[DeviceActions] No suitable command handler found for category '${connector.category}', device type '${deviceContext.type}', and command '${command}'.`);
            throw new Error(`Command '${command}' is not supported for this device type or connector.`);
        }

        console.log(`[DeviceActions] Using command handler for category: ${handler.category}`);
        // Delegate execution to the found handler
        return await handler.executeCommand(deviceContext, parsedConfig, command, params);

    } catch (error) {
        console.error(`[DeviceActions] Error during requestDeviceCommand for ${internalDeviceId}:`, error);
        // Re-throw the error to be handled by the caller
        if (error instanceof Error) {
            throw error; 
        } else {
            throw new Error('An unknown error occurred while executing device command.');
        }
    }
}

/**
 * Attempts to rename a device via its connector driver.
 * This acts as an abstraction layer over different vendor APIs.
 * 
 * @param internalDeviceId The internal database ID of the device record.
 * @param newName The new name for the device.
 * @returns Promise resolving to true if the rename was successful.
 * @throws Error for configuration issues, unsupported devices, or driver errors.
 */
export async function requestDeviceRename(
    internalDeviceId: string, 
    newName: string
): Promise<boolean> {
    console.log(`[DeviceActions] Requesting rename for internal device ID ${internalDeviceId} to "${newName}"`);

    try {
        // 1. Fetch Device Info using the same pattern
        const device = await db.query.devices.findFirst({
            where: eq(devices.id, internalDeviceId),
            columns: {
                id: true,
                deviceId: true,
                connectorId: true,
                rawDeviceData: true, // Need this for Genea to get current is_elevator_door value
            }
        });

        if (!device) {
            console.error(`[DeviceActions] Device with internal ID ${internalDeviceId} not found.`);
            throw new Error(`Device not found.`);
        }

        console.log(`[DeviceActions] Found device: ${device.deviceId}`);

        // 2. Fetch Connector Info & Config using the same pattern
        const connector = await db.query.connectors.findFirst({
            where: eq(connectors.id, device.connectorId),
            columns: {
                id: true,
                category: true,
                cfg_enc: true,
            }
        });

        if (!connector) {
            console.error(`[DeviceActions] Connector ${device.connectorId} for device ${internalDeviceId} not found.`);
            throw new Error(`Connector configuration not found for device.`);
        }

        console.log(`[DeviceActions] Found connector: ${connector.id}, Category: ${connector.category}`);

        // 3. Check if rename is supported for this connector category
        if (!isRenameSupported(connector.category)) {
            console.warn(`[DeviceActions] Rename not supported for connector category '${connector.category}'.`);
            throw new Error(`Device renaming is not supported for ${connector.category} devices.`);
        }

        // 4. Parse Config using the same pattern
        let parsedConfig: any;
        try {
            parsedConfig = JSON.parse(connector.cfg_enc);
        } catch (e) {
            console.error(`[DeviceActions] Failed to parse configuration for connector ${connector.id}:`, e);
            throw new Error(`Invalid connector configuration.`);
        }

        // 5. Call the appropriate driver function
        if (connector.category === 'piko') {
            console.log(`[DeviceActions] Calling renamePikoDevice for ${device.deviceId}`);
            await renamePikoDevice(device.connectorId, device.deviceId, newName);
        } else if (connector.category === 'genea') {
            console.log(`[DeviceActions] Calling updateGeneaDoor for ${device.deviceId}`);
            
            // For Genea, we need to provide is_elevator_door from the current device data
            // since the API requires it even for name-only updates
            const payload: GeneaDoorUpdatePayload = { name: newName };
            
            if (device.rawDeviceData && typeof device.rawDeviceData === 'object') {
                const rawData = device.rawDeviceData as any;
                if (typeof rawData.is_elevator_door === 'boolean') {
                    payload.is_elevator_door = rawData.is_elevator_door;
                }
            }
            
            // Import and use updateGeneaDoor instead of renameGeneaDoor for more control
            const { updateGeneaDoor } = await import('@/services/drivers/genea');
            await updateGeneaDoor(parsedConfig, device.deviceId, payload);
        }

        console.log(`[DeviceActions] Successfully renamed device ${device.deviceId} to "${newName}"`);
        return true;

    } catch (error) {
        console.error(`[DeviceActions] Error during requestDeviceRename for ${internalDeviceId}:`, error);
        // Re-throw the error to be handled by the API endpoint
        if (error instanceof Error) {
            throw error; 
        } else {
            throw new Error('An unknown error occurred while renaming device.');
        }
    }
} 