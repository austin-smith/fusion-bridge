/**
 * Service for managing ephemeral state related to webhook-based connectors.
 * Currently tracks the timestamp of the last received webhook.
 * NOTE: State is in-memory and lost on server restart.
 */

// Use declare global for singleton pattern in development with hot-reloading
// eslint-disable-next-line no-var
declare global { var __lastWebhookTimestamps: Map<string, number> | undefined; }

const lastWebhookTimestamps: Map<string, number> = 
    globalThis.__lastWebhookTimestamps || (globalThis.__lastWebhookTimestamps = new Map());

/**
 * Updates the timestamp for the last received webhook for a connector.
 * @param connectorId The ID of the connector.
 */
export const recordWebhookActivity = (connectorId: string): void => {
    const now = Date.now();
    lastWebhookTimestamps.set(connectorId, now);
    // console.log(`[Webhook Service] Recorded activity for ${connectorId} at ${new Date(now).toISOString()}`);
};

/**
 * Gets the timestamp (epoch milliseconds) of the last received webhook for a connector.
 * @param connectorId The ID of the connector.
 * @returns The timestamp in milliseconds, or null if no activity recorded.
 */
export const getLastWebhookActivity = (connectorId: string): number | null => {
    return lastWebhookTimestamps.get(connectorId) || null;
}; 