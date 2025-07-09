import 'server-only';

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
type DrizzleInstance = LibSQLDatabase<DBSchema>;

// --- Lazy Initialization Variables ---
let dbInstance: DrizzleInstance | null = null;
let clientInstance: Client | Database.Database | null = null;
let isInitialized = false; // Flag to prevent multiple initializations

// --- Function to Get/Initialize DB Instance ---
function getDbInstance(): DrizzleInstance {
  if (isInitialized && dbInstance) {
    return dbInstance;
  }
  if (isInitialized && !dbInstance) {
      // This case should ideally not happen if initialization logic is sound
      throw new Error("DB initialization flag set but instance is null.");
  }

  // Lock initialization to prevent race conditions in concurrent requests
  isInitialized = true; 

  const dbDriver = process.env.DB_DRIVER; // 'sqlite' or 'turso'
  const dbUrl = process.env.DATABASE_URL;
  const dbAuthToken = process.env.DATABASE_AUTH_TOKEN; // Turso auth token

  console.log(`Initializing database ON DEMAND with driver: ${dbDriver || 'sqlite (default)'}`);

  if (dbDriver === 'turso') {
    if (!dbUrl) {
      throw new Error('DATABASE_URL environment variable is not set for turso driver.');
    }
    if (!dbAuthToken) {
      throw new Error('DATABASE_AUTH_TOKEN must be set when using the turso driver.');
    }
    console.log(`Connecting to Turso: ${dbUrl}`); // Specific to Turso
    const tursoClient = createClient({ url: dbUrl, authToken: dbAuthToken });
    clientInstance = tursoClient;
    dbInstance = drizzleLibsql(tursoClient, { schema });
    console.log('Turso database instance created.'); // Specific to Turso
  } else {
    // --- SQLite Setup (Default) ---
    const sqlitePath = getDbPath();
    console.log(`Connecting to SQLite: ${sqlitePath}`); // Specific to SQLite
    ensureDbDir();
    const sqlite = new Database(sqlitePath);
    clientInstance = sqlite;
    const sqliteDb = drizzleSqlite(sqlite, { schema, logger: true });
    dbInstance = sqliteDb as unknown as DrizzleInstance;
    console.log('SQLite database instance created (cast to async interface).'); // Specific to SQLite
  }

  if (!dbInstance) {
      // Throw if initialization failed somehow
      throw new Error("Database instance failed to initialize.");
  }

  return dbInstance;
}

// Function to safely close the connection
export async function closeDbConnection() {
  if (clientInstance) {
    console.log('Closing database connection...');
    clientInstance.close();
    clientInstance = null;
    dbInstance = null; // Clear instance on close
    isInitialized = false; // Reset initialization flag
    console.log('Database connection closed.');
  } else {
    console.log('Database connection already closed or not initialized.');
  }
}

// --- Export a Singleton Instance ---
// The actual initialization happens on the first call to `db`
export const db: DrizzleInstance = getDbInstance();

// Re-export schema for convenience
export * from './schema';