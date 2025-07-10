import type { IDeviceActionHandler, DeviceContext } from './types';
import { ActionableState } from '@/lib/mappings/definitions';
import * as yolinkDriver from '@/services/drivers/yolink';
import type { YoLinkConfig } from '@/services/drivers/yolink';

const SUPPORTED_YOLINK_TYPES = ['Switch', 'Outlet', 'MultiOutlet', 'Manipulator'];
const SUPPORTED_ACTIONS = [ActionableState.SET_ON, ActionableState.SET_OFF];

export class YoLinkActionHandler implements IDeviceActionHandler {
    readonly category = 'yolink';

    public getControllableRawTypes(): string[] {
        return SUPPORTED_YOLINK_TYPES;
    }

    canHandle(device: DeviceContext, newState: ActionableState): boolean {
        const isSupportedType = SUPPORTED_YOLINK_TYPES.includes(device.type);
        const isSupportedAction = SUPPORTED_ACTIONS.includes(newState);
        // Could add checks for presence of token in rawDeviceData if desired, but execute will handle it
        return isSupportedType && isSupportedAction;
    }

    async executeStateChange(
        device: DeviceContext, 
        connectorConfig: YoLinkConfig, // Specify type
        newState: ActionableState
    ): Promise<boolean> {
        console.log(`[YoLinkHandler] Executing state change for ${device.deviceId} to ${newState}`);

        // 1. Parse Raw Data to get Device Token
        if (!device.rawDeviceData) {
            console.error(`[YoLinkHandler] Missing rawDeviceData for YoLink device ${device.deviceId}.`);
            throw new Error('Missing required device data (rawDeviceData). Sync needed?');
        }

        let parsedRawData: Record<string, any>;
        try {
            parsedRawData = typeof device.rawDeviceData === 'string' 
                ? JSON.parse(device.rawDeviceData) 
                : device.rawDeviceData;
        } catch (e) {
            console.error(`[YoLinkHandler] Failed to parse rawDeviceData for YoLink device ${device.deviceId}:`, e);
            throw new Error('Invalid raw device data format.');
        }

        const deviceToken = parsedRawData?.token;
        if (!deviceToken || typeof deviceToken !== 'string') {
            console.error(`[YoLinkHandler] Missing or invalid 'token' in rawDeviceData for YoLink device ${device.deviceId}.`);
            throw new Error('Missing required device token in raw data.');
        }

        // 2. Map ActionableState to YoLink command
        let targetYoLinkState: 'open' | 'close';
        if (newState === ActionableState.SET_ON) {
            targetYoLinkState = 'open';
        } else if (newState === ActionableState.SET_OFF) {
            targetYoLinkState = 'close';
        } else {
            // This should theoretically not be reached if canHandle is correct
            console.warn(`[YoLinkHandler] Unsupported ActionableState ${newState} reached execute.`);
            throw new Error(`Unsupported action ${newState} for this YoLink device.`);
        }

        // 3. Call YoLink Driver
        try {
            console.log(`[YoLinkHandler] Calling yolinkDriver.setDeviceState for ${device.deviceId} with token ${!!deviceToken} and state ${targetYoLinkState}`);
            await yolinkDriver.setDeviceState(
                device.connectorId,
                connectorConfig,
                device.deviceId, // Vendor ID
                deviceToken,
                device.type,     // Raw type
                targetYoLinkState
            );
            console.log(`[YoLinkHandler] YoLink state change successful for ${device.deviceId}`);
            return true;
        } catch (error) {
            console.error(`[YoLinkHandler] Error calling yolinkDriver.setDeviceState for ${device.deviceId}:`, error);
            // Re-throw the error to be handled by the main function/API endpoint
            throw error; 
        }
    }
} 