import type { Config } from 'drizzle-kit';
import { join } from 'path';
import { homedir } from 'os';

// Define the path for the local SQLite database file
const dbPath = join(homedir(), '.fusion-bridge', 'fusion.db');
console.log(`Using local SQLite database at: ${dbPath}`); // Add log to confirm path

export default {
  schema: './src/data/db/schema.ts',
  out: './src/data/db/migrations',
  driver: 'better-sqlite', // Revert driver to SQLite
  dbCredentials: {
    // Point back to the local file path
    url: dbPath,
  },
  // Remove verbose/strict if not needed, keep if helpful
  verbose: true, 
  strict: true,
} satisfies Config; 