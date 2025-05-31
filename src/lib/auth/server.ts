import 'server-only';

import * as betterAuth from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/data/db";
import { twoFactor } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { admin as adminPlugin } from "better-auth/plugins";
import { apiKey } from "better-auth/plugins";

export const auth = betterAuth.betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  appName: "Fusion", // Add appName for TOTP issuer

  database: drizzleAdapter(db, {
    provider: "sqlite",
  }),
  user: {
    additionalFields: {
      keypadPin: {
        type: "string",
        required: false,
        input: false, // Don't allow user to set PIN during signup
      },
      keypadPinSetAt: {
        type: "date",
        required: false,
        input: false, // System managed
      },
    },
  },
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
  },
  plugins: [
      twoFactor(),
      nextCookies(),
      adminPlugin(),
      apiKey({
        enableMetadata: false, // Disabled for now
        keyExpiration: {
          defaultExpiresIn: null, // No expiration by default
        },
        rateLimit: {
          enabled: true,
          timeWindow: 1000 * 60 * 60 * 24, // 24 hours
          maxRequests: 10000, // 1000 requests per day default (configurable per key)
        }
      })
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 1, // 1 day in seconds
    updateAge: 60 * 60 * 6,      // 6 hours in seconds
  },
});