import { join } from "path";
import { homedir } from "os";
import { mkdirSync } from "fs";

// Get database directory path
export function getDbDir(): string {
  return join(homedir(), ".fusion-bridge");
}

// Get database file path
export function getDbPath(): string {
  return join(getDbDir(), "fusion.db");
}

// Ensure database directory exists
export function ensureDbDir(): void {
  const dbDir = getDbDir();
  try {
    mkdirSync(dbDir, { recursive: true });
  } catch (e) {
    // Directory already exists or can't be created
    console.error("Error creating database directory:", e);
  }
} 