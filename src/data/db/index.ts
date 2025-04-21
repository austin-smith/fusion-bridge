import 'server-only'; // Mark this module as server-only

import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "./schema";
import { join } from "path";
import { homedir } from "os";
import { mkdirSync } from "fs";

// Ensure the directory exists
const dbDir = join(homedir(), ".fusion-bridge");
try {
  mkdirSync(dbDir, { recursive: true });
} catch (e) {
  // Directory already exists or can't be created
  console.error("Error creating database directory:", e);
}

// Database path
const dbPath = join(dbDir, "fusion.db");

// Create the database connection
const sqlite = new Database(dbPath);
export const db = drizzle(sqlite, { schema }); 