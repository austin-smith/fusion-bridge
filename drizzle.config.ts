import type { Config } from 'drizzle-kit';
import { getDbPath, ensureDbDir } from './src/data/db/utils'; // Import helpers

// Get the standard local DB path
const dbPath = getDbPath();
console.log(`Drizzle Kit targeting local SQLite database at: ${dbPath}`);

// Ensure the directory exists before drizzle-kit tries to access the file
try {
  ensureDbDir(); 
} catch (e) {
  console.error("Failed to ensure database directory for Drizzle Kit:", e);
  // Depending on severity, you might want to process.exit(1) here
}

export default {
  schema: './src/data/db/schema.ts',
  out: './src/data/db/migrations',
  driver: 'better-sqlite',
  dbCredentials: {
    // Point to the path from utils.ts
    url: dbPath,
  },
  verbose: true, 
  strict: true,
} satisfies Config; 