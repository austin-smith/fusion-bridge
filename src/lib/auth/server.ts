import 'server-only';

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle"; // Import Drizzle adapter again
import { db } from "@/data/db"; // Import the Drizzle db instance
import { twoFactor } from "better-auth/plugins"; // Import the twoFactor plugin
// We don't need the direct driver or utils here anymore
// import Database from 'better-sqlite3'; 
// import { getDbPath } from "@/data/db/utils"; 
// No longer need individual import if passing the whole schema
// import { verificationTokens } from "@/data/db/schema";

// Ensure environment variables are defined, potentially throwing an error if not
if (!process.env.BETTER_AUTH_SECRET) {
  throw new Error("Missing BETTER_AUTH_SECRET environment variable");
}
if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
    console.warn("Missing GitHub client ID or secret. GitHub login will not work.");
    // Decide if you want to throw an error here or allow the app to run without GitHub auth
    // throw new Error("Missing GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET environment variable");
}

// Remove direct sqlite instance creation
// const dbPath = getDbPath();
// console.log(...);
// const sqlite = new Database(dbPath);

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  appName: "Fusion Bridge", // Add appName for TOTP issuer
  // Revert to using the drizzleAdapter with the Drizzle db instance
  // Since tables are named per defaults (user, account, etc.), no schema mapping needed hopefully
  database: drizzleAdapter(db, {
    provider: "sqlite",
  }),
  emailAndPassword: {
    enabled: true,
    // Remove custom password hasher - revert to better-auth default (scrypt)
    // password: { ... }, 
  },
  socialProviders: {
  },
  plugins: [
      twoFactor() // Add the twoFactor plugin
  ],
  // Add other global better-auth configurations if needed
  // Example: Set a custom base path if not using /api/auth
  // basePath: "/custom-auth-path", 
});

// Optionally, export types or session helper functions if needed later
// export type { Session } from "better-auth"; 