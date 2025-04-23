/* eslint-disable @typescript-eslint/no-require-imports */
// Node migration script runs in Node.js context; CommonJS require is acceptable.
const { join } = require('path');
const { homedir } = require('os');
const { mkdirSync } = require('fs');
const Database = require('better-sqlite3');
const { drizzle } = require('drizzle-orm/better-sqlite3');
const { migrate } = require('drizzle-orm/better-sqlite3/migrator');

// Define utility functions inline to eliminate dependency on compiled TS
function getDbDir() {
  return join(homedir(), ".fusion-bridge");
}

function getDbPath() {
  return join(getDbDir(), "fusion.db");
}

function ensureDbDir() {
  const dbDir = getDbDir();
  try {
    mkdirSync(dbDir, { recursive: true });
    console.log(`Database directory ensured: ${dbDir}`);
  } catch (err) {
    if (err.code !== 'EEXIST') {
      // EEXIST means the directory already exists, which is fine
      // Only log other types of errors like permission issues or disk failures
      console.error('Error creating database directory:', err);
    }
  }
}

// Ensure the directory exists
ensureDbDir();

// Get the database path
const dbPath = getDbPath();

function runMigrations() {
  console.log('Running migrations...');
  
  const sqlite = new Database(dbPath);
  const db = drizzle(sqlite);

  // Get path to migrations directory
  const migrationsFolder = join(__dirname, 'migrations');

  try {
    migrate(db, { migrationsFolder });
    console.log('Migrations completed successfully!');
  } catch (error) {
    // Check if this is a "table already exists" error
    const isTableExistsError = 
      error.cause && 
      error.cause.code === 'SQLITE_ERROR' && 
      error.cause.message && 
      error.cause.message.includes('already exists');
    
    if (isTableExistsError) {
      console.log('Some tables already exist, migration partially applied. This is generally safe to ignore.');
      console.log('Specific error:', error.cause.message);
    } else {
      // This is a more serious error, log and exit with failure
      console.error('Error running migrations:', error);
      process.exit(1);
    }
  } finally {
    sqlite.close();
  }
}

// If this script is run directly
if (require.main === module) {
  runMigrations();
}

module.exports = { runMigrations }; 