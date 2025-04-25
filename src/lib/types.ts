import type { connectors } from '@/data/db/schema';

// Define Connector type based on Drizzle schema inference
export type Connector = typeof connectors.$inferSelect; 