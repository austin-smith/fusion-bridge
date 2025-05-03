import type { devices } from '@/data/db/schema';
import type { ActionableState } from '@/lib/mappings/definitions';

/**
 * Represents the necessary device information for action handlers.
 */
export type DeviceContext = Pick<
    typeof devices.$inferSelect, 
    'id' | 'deviceId' | 'type' | 'connectorId' | 'rawDeviceData'
>;

/**
 * Interface for connector-specific device action handlers.
 */
export interface IDeviceActionHandler {
    /**
     * The connector category this handler supports (e.g., 'yolink').
     */
    readonly category: string;

    /**
     * Checks if this handler can perform the requested state change 
     * on the given device.
     * @param device - The context containing device information.
     * @param newState - The desired abstract state change.
     * @returns True if the handler can perform the action, false otherwise.
     */
    canHandle(device: DeviceContext, newState: ActionableState): boolean;

    /**
     * Executes the state change command for the specific connector.
     * @param device - The context containing device information.
     * @param connectorConfig - The parsed configuration for the connector.
     * @param newState - The desired abstract state change.
     * @returns Promise resolving to true if the command was sent successfully.
     * @throws Error if the execution fails (e.g., API error, missing data).
     */
    executeStateChange(
        device: DeviceContext, 
        connectorConfig: any, // Type can be refined if needed
        newState: ActionableState
    ): Promise<boolean>;
} 