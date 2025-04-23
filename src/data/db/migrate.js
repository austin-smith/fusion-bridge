/* eslint-disable @typescript-eslint/no-require-imports */
// Node migration script runs in Node.js context; CommonJS require is acceptable.
const { join } = require('path');
const { mkdirSync } = require('fs');
const { homedir } = require('os');
const Database = require('better-sqlite3');
const { drizzle } = require('drizzle-orm/better-sqlite3');
const { migrate } = require('drizzle-orm/better-sqlite3/migrator');

// Ensure the directory exists
const dbDir = join(homedir(), '.fusion-bridge');
try {
  mkdirSync(dbDir, { recursive: true });
} catch (e) {
  // Directory already exists or can't be created
  console.error('Error creating database directory:', e);
}

// Database path
const dbPath = join(dbDir, 'fusion.db');

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
    console.error('Error running migrations:', error);
    process.exit(1);
  } finally {
    sqlite.close();
  }
}

// If this script is run directly
if (require.main === module) {
  runMigrations();
}

module.exports = { runMigrations }; 