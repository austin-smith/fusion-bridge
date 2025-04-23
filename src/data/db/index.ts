import 'server-only'; // Mark this module as server-only

import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "./schema";
import { ensureDbDir, getDbPath } from "./utils";

// Ensure the database directory exists
ensureDbDir();

// Create the database connection
const sqlite = new Database(getDbPath());
export const db = drizzle(sqlite, { schema }); 