import 'server-only';

import * as betterAuth from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/data/db";
import { twoFactor } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { admin as adminPlugin } from "better-auth/plugins";

export const auth = betterAuth.betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  appName: "Fusion", // Add appName for TOTP issuer

  database: drizzleAdapter(db, {
    provider: "sqlite",
  }),
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
  },
  plugins: [
      twoFactor(),
      nextCookies(),
      adminPlugin()
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 1, // 1 day in seconds
    updateAge: 60 * 60 * 6,      // 6 hours in seconds
  },
});