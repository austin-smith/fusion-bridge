import type { IDeviceActionHandler, IDeviceCommandHandler, DeviceContext } from './types';
import { ActionableState, DeviceCommand } from '@/lib/mappings/definitions';
import * as yolinkDriver from '@/services/drivers/yolink';
import type { YoLinkConfig } from '@/services/drivers/yolink';

const SUPPORTED_STATE_TYPES = ['Switch', 'Outlet', 'MultiOutlet', 'Manipulator'];
const SUPPORTED_ACTIONS = [ActionableState.SET_ON, ActionableState.SET_OFF];

const SUPPORTED_COMMAND_TYPES = ['SpeakerHub'];
const SUPPORTED_COMMANDS = [DeviceCommand.PLAY_AUDIO];

export class YoLinkHandler implements IDeviceActionHandler, IDeviceCommandHandler {
    readonly category = 'yolink';

    // --- IDeviceActionHandler Implementation (State Changes) ---
    public getControllableRawTypes(): string[] {
        return SUPPORTED_STATE_TYPES;
    }

    canHandle(device: DeviceContext, newState: ActionableState): boolean {
        const isSupportedType = SUPPORTED_STATE_TYPES.includes(device.type);
        const isSupportedAction = SUPPORTED_ACTIONS.includes(newState);
        return isSupportedType && isSupportedAction;
    }

    // --- IDeviceCommandHandler Implementation (Commands) ---
    public getCommandableRawTypes(): string[] {
        return SUPPORTED_COMMAND_TYPES;
    }

    canExecuteCommand(device: DeviceContext, command: DeviceCommand): boolean {
        const isSupportedType = SUPPORTED_COMMAND_TYPES.includes(device.type);
        const isSupportedCommand = SUPPORTED_COMMANDS.includes(command);
        return isSupportedType && isSupportedCommand;
    }

    async executeStateChange(
        device: DeviceContext, 
        connectorConfig: YoLinkConfig,
        newState: ActionableState
    ): Promise<boolean> {
        console.log(`[YoLinkHandler] Executing state change for ${device.deviceId} to ${newState}`);
        
        const deviceToken = this.extractDeviceToken(device);
        const targetYoLinkState: 'open' | 'close' = newState === ActionableState.SET_ON ? 'open' : 'close';

        try {
            console.log(`[YoLinkHandler] Calling yolinkDriver.setDeviceState for ${device.deviceId} with state ${targetYoLinkState}`);
            await yolinkDriver.setDeviceState(
                device.connectorId,
                connectorConfig,
                device.deviceId,
                deviceToken,
                device.type,
                targetYoLinkState
            );
            console.log(`[YoLinkHandler] YoLink state change successful for ${device.deviceId}`);
            return true;
        } catch (error) {
            console.error(`[YoLinkHandler] Error calling yolinkDriver.setDeviceState for ${device.deviceId}:`, error);
            throw error;
        }
    }

    async executeCommand(
        device: DeviceContext, 
        connectorConfig: YoLinkConfig,
        command: DeviceCommand,
        params?: Record<string, any>
    ): Promise<boolean> {
        console.log(`[YoLinkHandler] Executing command ${command} for ${device.deviceId}`);
        
        const deviceToken = this.extractDeviceToken(device);

        switch (command) {
            case DeviceCommand.PLAY_AUDIO:
                return await this.executePlayAudioCommand(device, connectorConfig, deviceToken, params);
            default:
                console.warn(`[YoLinkHandler] Unsupported DeviceCommand ${command} reached execute.`);
                throw new Error(`Unsupported command ${command} for this YoLink device.`);
        }
    }

    /**
     * Shared method to extract device token from raw device data
     */
    private extractDeviceToken(device: DeviceContext): string {
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

        return deviceToken;
    }

    /**
     * Executes PLAY_AUDIO command on YoLink SpeakerHub devices
     */
    private async executePlayAudioCommand(
        device: DeviceContext,
        connectorConfig: YoLinkConfig,
        deviceToken: string,
        params?: Record<string, any>
    ): Promise<boolean> {
        // Extract audio parameters from the provided params
        const audioParams = {
            tone: params?.tone,
            message: params?.message || 'Test audio message',
            volume: params?.volume,
            repeat: params?.repeat
        };

        try {
            console.log(`[YoLinkHandler] Calling yolinkDriver.playAudio for ${device.deviceId} with params:`, audioParams);
            await yolinkDriver.playAudio(
                device.connectorId,
                connectorConfig,
                device.deviceId,
                deviceToken,
                audioParams
            );
            console.log(`[YoLinkHandler] YoLink audio playback successful for ${device.deviceId}`);
            return true;
        } catch (error) {
            console.error(`[YoLinkHandler] Error calling yolinkDriver.playAudio for ${device.deviceId}:`, error);
            throw error;
        }
    }
} 