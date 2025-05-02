import 'server-only'; // Mark this module as server-only

// Use LibSQLDatabase as the unified type
import { drizzle as drizzleLibsql, LibSQLDatabase } from 'drizzle-orm/libsql';
import { createClient, Client } from '@libsql/client';

// Keep better-sqlite3 imports for the conditional logic
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';

// Import helpers for the local SQLite path
import { getDbPath, ensureDbDir } from './utils';

import * as schema from './schema';
import { DefaultLogger } from 'drizzle-orm'; // Import only DefaultLogger

type DBSchema = typeof schema;
// Define the unified instance type as the async one (LibSQL)
// This ensures consuming code always sees an async interface
type DrizzleInstance = LibSQLDatabase<DBSchema>;

const dbDriver = process.env.DB_DRIVER; // 'sqlite' or 'turso'
// DATABASE_URL is now only needed for Turso
const dbUrl = process.env.DATABASE_URL; 
const dbAuthToken = process.env.DATABASE_AUTH_TOKEN; // Turso auth token

let dbInstance: DrizzleInstance;
// Keep track of the underlying client for closing
let clientInstance: Client | Database.Database | null = null;

console.log(`Initializing database with driver: ${dbDriver || 'sqlite (default)'}`);

if (dbDriver === 'turso') {
  if (!dbUrl) {
    // dbUrl (DATABASE_URL) is mandatory for Turso
    throw new Error('DATABASE_URL environment variable is not set for turso driver.');
  }
  if (!dbAuthToken) {
    throw new Error('DATABASE_AUTH_TOKEN must be set when using the turso driver.');
  }
  console.log(`Connecting to Turso: ${dbUrl}`);
  const tursoClient = createClient({ url: dbUrl, authToken: dbAuthToken });
  clientInstance = tursoClient;
  // Add logger to Turso/libsql instance if desired (assuming it supports logger option)
  dbInstance = drizzleLibsql(tursoClient, { schema, logger: new DefaultLogger() });
  console.log('Turso database instance created.');
} else {
  // --- SQLite Setup (Default) ---
  const sqlitePath = getDbPath(); // Get path from utils
  console.log(`Connecting to SQLite: ${sqlitePath}`);
  ensureDbDir(); // Ensure directory exists
  const sqlite = new Database(sqlitePath);
  clientInstance = sqlite;

  // Define a logger instance
  const logger = new DefaultLogger({ writer: { write: (message) => console.log(`[DB Query] ${message}`) }});

  // Create the SQLite-specific drizzle instance WITH the logger
  const sqliteDb = drizzleSqlite(sqlite, { 
      schema, 
      // Enable detailed logging
      logger: true // Or pass the custom logger instance: logger 
  });
  // ...then CAST it to the unified async type (LibSQLDatabase) for export.
  // This assumes the core API methods (select, insert, etc.) are compatible enough.
  // `as unknown` is used to bridge the potential deep type differences before the final assertion.
  dbInstance = sqliteDb as unknown as DrizzleInstance;
  console.log('SQLite database instance created (cast to async interface).');
}

// Function to safely close the connection
export async function closeDbConnection() {
  if (clientInstance) {
    console.log('Closing database connection...');
    // Both client types have a close() method
    clientInstance.close();
    clientInstance = null;
    console.log('Database connection closed.');
  } else {
    console.log('Database connection already closed or not initialized.');
  }
}

// Export the configured Drizzle instance, now consistently typed as LibSQLDatabase
export const db: DrizzleInstance = dbInstance;
export * from './schema'; // Re-export schema for convenience

// Add a listener for graceful shutdown
process.on('SIGINT', async () => {
  console.log('SIGINT received, closing DB connection...');
  await closeDbConnection();
  process.exit(0);
});
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing DB connection...');
  await closeDbConnection();
  process.exit(0);
}); 