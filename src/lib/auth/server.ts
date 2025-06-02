import 'server-only';

import * as betterAuth from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/data/db";
import { twoFactor } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { admin as adminPlugin } from "better-auth/plugins";
import { organization } from "better-auth/plugins";
import { apiKey } from "better-auth/plugins";

export const auth = betterAuth.betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  appName: "Fusion",
  baseURL: process.env.BETTER_AUTH_URL || process.env.NEXTAUTH_URL || "http://localhost:3000",
  trustedOrigins: [
    "http://localhost:3000",
    "https://fusion-bridge-dev.up.railway.app",
    "https://fusion-bridge-production.up.railway.app"
  ],

  database: drizzleAdapter(db, {
    provider: "sqlite",
  }),
  
  user: {
    additionalFields: {
      keypadPin: {
        type: "string",
        required: false,
        input: false,
      },
      keypadPinSetAt: {
        type: "date",
        required: false,
        input: false,
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
      organization({
        allowUserToCreateOrganization: async (user) => {
          return (user as any).role === 'admin';
        },
        organizationLimit: 10,
        membershipLimit: 100,
        sendInvitationEmail: async (data) => {
          console.log(`Organization invitation sent to ${data.email} for organization ${data.organization.name}`);
        },
        organizationCreation: {
          afterCreate: async ({ organization, member, user }) => {
            console.log(`Organization "${organization.name}" created by user ${user.email}`);
          },
        },
      }),
      apiKey({
        enableMetadata: true,
        keyExpiration: {
          defaultExpiresIn: null,
        },
        rateLimit: {
          enabled: true,
          timeWindow: 1000 * 60 * 60 * 24,
          maxRequests: 10000,
        }
      })
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 1,
    updateAge: 60 * 60 * 6,
  },
});