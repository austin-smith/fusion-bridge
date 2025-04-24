import { join } from "path";
import { homedir } from "os";
import { mkdirSync } from "fs";

const DB_DIR_NAME = ".fusion-bridge";
const DB_FILE_NAME = "fusion.db";

/**
 * Gets the absolute path to the database directory (~/.fusion-bridge).
 */
export function getDbDir(): string {
  return join(homedir(), DB_DIR_NAME);
}

/**
 * Gets the absolute path to the database file (~/.fusion-bridge/fusion.db).
 */
export function getDbPath(): string {
  return join(getDbDir(), DB_FILE_NAME);
}

/**
 * Ensures the database directory (~/.fusion-bridge) exists.
 * Throws an error if creation fails for reasons other than EEXIST.
 */
export function ensureDbDir(): void {
  const dbDir = getDbDir();
  try {
    mkdirSync(dbDir, { recursive: true });
    // console.log(`Database directory ensured: ${dbDir}`); // Optional: uncomment for debugging
  } catch (err: any) { // Use 'any' or proper error type checking
    if (err.code !== 'EEXIST') {
      console.error(`Error creating database directory '${dbDir}':`, err);
      throw err; // Re-throw critical errors
    }
    // EEXIST is fine, directory already exists
  }
} 