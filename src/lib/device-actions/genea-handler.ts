import type { IDeviceActionHandler, DeviceContext } from './types';
import { ActionableState } from '@/lib/mappings/definitions';
import * as geneaDriver from '@/services/drivers/genea';
import type { GeneaConfig } from '@/services/drivers/genea';

const SUPPORTED_TYPES = ['Door'];
const SUPPORTED_ACTIONS = [
  ActionableState.SET_LOCKED,
  ActionableState.SET_UNLOCKED,
  ActionableState.QUICK_GRANT,
];

export class GeneaHandler implements IDeviceActionHandler {
    readonly category = 'genea';

    public getControllableRawTypes(): string[] {
        return SUPPORTED_TYPES;
    }

    canHandle(device: DeviceContext, newState: ActionableState): boolean {
        const isSupportedType = SUPPORTED_TYPES.includes(device.type);
        const isSupportedAction = SUPPORTED_ACTIONS.includes(newState);
        return isSupportedType && isSupportedAction;
    }

    async executeStateChange(
        device: DeviceContext, 
        connectorConfig: GeneaConfig,
        newState: ActionableState
    ): Promise<boolean> {
        console.log(`[GeneaHandler] Executing state change for door ${device.deviceId} to ${newState}`);
        
        // The deviceId for Genea doors is the door UUID
        const doorUuid = device.deviceId;
        if (!doorUuid) {
            console.error(`[GeneaHandler] Missing deviceId (door UUID) for Genea device ${device.id}.`);
            throw new Error('Missing door UUID for Genea device.');
        }

        try {
            let success: boolean;
            
            switch (newState) {
                case ActionableState.SET_LOCKED:
                    console.log(`[GeneaHandler] Calling geneaDriver.lockGeneaDoor for ${doorUuid}`);
                    success = await geneaDriver.lockGeneaDoor(connectorConfig, doorUuid);
                    break;
                    
                case ActionableState.SET_UNLOCKED:
                    console.log(`[GeneaHandler] Calling geneaDriver.unlockGeneaDoor for ${doorUuid}`);
                    success = await geneaDriver.unlockGeneaDoor(connectorConfig, doorUuid);
                    break;
                case ActionableState.QUICK_GRANT:
                    console.log(`[GeneaHandler] Calling geneaDriver.quickGrantGeneaDoor for ${doorUuid}`);
                    success = await geneaDriver.quickGrantGeneaDoor(connectorConfig, doorUuid);
                    break;
                    
                default:
                    console.warn(`[GeneaHandler] Unsupported ActionableState ${newState} reached execute.`);
                    throw new Error(`Unsupported action ${newState} for Genea door.`);
            }

            if (success) {
                console.log(`[GeneaHandler] Genea door action successful for ${doorUuid}`);
                return true;
            } else {
                console.error(`[GeneaHandler] Genea door action failed for ${doorUuid}`);
                throw new Error('Door action failed.');
            }

        } catch (error) {
            console.error(`[GeneaHandler] Error executing door action for ${doorUuid}:`, error);
            throw error;
        }
    }
}