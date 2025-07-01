import type { connectors } from '@fusion-bridge/shared';

// Define Connector type based on Drizzle schema inference
export type Connector = typeof connectors.$inferSelect; 