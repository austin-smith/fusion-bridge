import type { nodes } from '@/data/db/schema';

// Define Node type based on Drizzle schema inference
export type Node = typeof nodes.$inferSelect; 