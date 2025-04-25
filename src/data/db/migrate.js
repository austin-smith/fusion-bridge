/* eslint-disable @typescript-eslint/no-require-imports */
// Node migration script runs in Node.js context; CommonJS require is acceptable.
const { join } = require('path');
// Drizzle and DB drivers
const Database = require('better-sqlite3');
const { drizzle } = require('drizzle-orm/better-sqlite3');
const { migrate: migrateSqlite } = require('drizzle-orm/better-sqlite3/migrator');
const { createClient } = require('@libsql/client');
const { drizzle: drizzleLibsql } = require('drizzle-orm/libsql');
const { migrate: migrateLibsql } = require('drizzle-orm/libsql/migrator');

// Import helpers for the local SQLite path
// Note: Cannot directly import TS utils, need to duplicate or require compiled JS
// For simplicity here, let's redefine the necessary logic from utils.ts
const { homedir } = require('os');
const { mkdirSync } = require('fs');

const DB_DIR_NAME = ".fusion-bridge";
const DB_FILE_NAME = "fusion.db";

function getDbDir_Migrate() {
  return join(homedir(), DB_DIR_NAME);
}
function getDbPath_Migrate() {
  return join(getDbDir_Migrate(), DB_FILE_NAME);
}
function ensureDbDir_Migrate() {
  const dbDir = getDbDir_Migrate();
  try {
    mkdirSync(dbDir, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') {
      console.error(`Error creating database directory '${dbDir}':`, err);
      throw err;
    }
  }
}

// --- Configuration --- 
const dbDriver = process.env.DB_DRIVER; // 'sqlite' or 'turso'
const dbUrl = process.env.DATABASE_URL; // File path ONLY needed for Turso
const dbAuthToken = process.env.DATABASE_AUTH_TOKEN; // Turso auth token
const migrationsFolder = join(__dirname, 'migrations');
// -------------------------------------------------------------------

// --- Main Migration Logic ---
async function runMigrations() {
  console.log('Running migrations...');

  let client;
  let db;
  let migrateFn;

  try {
    if (dbDriver === 'turso') {
      // --- Turso Setup ---
      console.log(`Using Turso driver. Connecting to: ${dbUrl}`);
      if (!dbUrl) {
        console.error('Error: DATABASE_URL must be set when using the turso driver.');
        process.exit(1);
      }
      if (!dbAuthToken) {
        console.error('Error: DATABASE_AUTH_TOKEN must be set when using the turso driver.');
        process.exit(1);
      }
      client = createClient({ url: dbUrl, authToken: dbAuthToken });
      db = drizzleLibsql(client);
      migrateFn = migrateLibsql;
      console.log('Turso client created.');

    } else {
      // --- SQLite Setup (Default) ---
      const sqlitePath = getDbPath_Migrate(); // Use local helper
      console.log(`Using SQLite driver. Connecting to: ${sqlitePath}`);
      ensureDbDir_Migrate(); // Use local helper
      client = new Database(sqlitePath);
      db = drizzle(client);
      migrateFn = migrateSqlite;
      console.log('SQLite client created.');
    }

    // --- Run Migrations ---
    console.log(`Applying migrations from: ${migrationsFolder}`);
    await migrateFn(db, { migrationsFolder });
    console.log('Migrations completed successfully!');

  } catch (error) {
    // --- Error Handling ---
    const isTableExistsError = 
      error.cause && 
      error.cause.code === 'SQLITE_ERROR' && 
      error.cause.message && 
      error.cause.message.includes('already exists');

    if (isTableExistsError) {
      console.log('Some tables might already exist (SQLite). Migration partially applied or skipped. This is often safe.');
      console.log('Specific error:', error.cause.message);
    } else {
      console.error('Error running migrations:', error);
      console.error('Detailed error:', JSON.stringify(error, null, 2));
      process.exit(1);
    }
  } finally {
    // --- Cleanup ---
    if (client) {
      console.log('Closing database connection...');
      if (typeof client.close === 'function') {
        client.close();
        console.log('Database connection closed.');
      } else {
        console.warn('Client does not have a close method?');
      }
    }
  }
}

// --- Script Execution ---
if (require.main === module) {
  runMigrations().catch(err => {
    console.error("Migration script failed unexpectedly:", err);
    process.exit(1);
  });
}

module.exports = { runMigrations }; 