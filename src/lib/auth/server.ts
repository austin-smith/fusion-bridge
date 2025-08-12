import 'server-only';
import * as React from 'react';

import * as betterAuth from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/data/db";
import { twoFactor } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { admin as adminPlugin } from "better-auth/plugins";
import { organization } from "better-auth/plugins";
import { apiKey } from "better-auth/plugins";
import { eq, and, desc, isNotNull } from "drizzle-orm";
import { member, session } from "@/data/db/schema";
import type { VerificationEmailProps } from "@/emails/VerificationEmail";

export const auth = betterAuth.betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  appName: "Fusion",
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
  trustedOrigins: [
    "http://localhost:3000",
    "https://fusion-bridge-dev.up.railway.app",
    "https://fusion-bridge-production.up.railway.app",
    "https://app.getfusion.io"
  ],

  database: drizzleAdapter(db, {
    provider: "sqlite",
  }),
  
  databaseHooks: {
    session: {
      create: {
        before: async (sessionData) => {
          try {
            // Step 1: Get user's most recent session with active organization
            const lastActiveSession = await db
              .select({ activeOrganizationId: session.activeOrganizationId })
              .from(session)
              .where(and(
                eq(session.userId, sessionData.userId),
                isNotNull(session.activeOrganizationId)
              ))
              .orderBy(desc(session.updatedAt))
              .limit(1);

            // Step 2: Validate last active organization (if exists)
            if (lastActiveSession.length > 0 && lastActiveSession[0].activeOrganizationId) {
              const stillMember = await db
                .select({ organizationId: member.organizationId })
                .from(member)
                .where(and(
                  eq(member.userId, sessionData.userId),
                  eq(member.organizationId, lastActiveSession[0].activeOrganizationId)
                ))
                .limit(1);

              // If user is still member of last active org, use it
              if (stillMember.length > 0) {
                return {
                  data: {
                    ...sessionData,
                    activeOrganizationId: lastActiveSession[0].activeOrganizationId
                  }
                };
              }
            }

            // Step 3: Fallback to first available organization
            const userOrganizations = await db
              .select({ organizationId: member.organizationId })
              .from(member)
              .where(eq(member.userId, sessionData.userId))
              .limit(1);

            if (userOrganizations.length > 0) {
              return {
                data: {
                  ...sessionData,
                  activeOrganizationId: userOrganizations[0].organizationId
                }
              };
            }

            // Step 4: No organizations available
            return { data: sessionData };
          } catch (error) {
            console.error('Error setting active organization on session create:', error);
            // Fallback to original session data if something goes wrong
            return { data: sessionData };
          }
        }
      }
    }
  },
  
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
    requireEmailVerification: true,
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    async sendVerificationEmail({ user, url, token }, request) {
      // Lazy import to avoid loading React email at module init
      const { sendEmail } = await import('@/services/email/send-email');
      const { default: VerificationEmail } = (await import('@/emails/VerificationEmail')) as {
        default: React.ComponentType<VerificationEmailProps>;
      };
      // Ensure callbackURL sends user to create-password page after auto sign-in
      let verificationUrl = url;
      try {
        const u = new URL(url);
        u.searchParams.set('callbackURL', '/create-password');
        verificationUrl = u.toString();
      } catch {
        verificationUrl = `${url}${url.includes('?') ? '&' : '?'}callbackURL=${encodeURIComponent('/create-password')}`;
      }
      const result = await sendEmail({
        to: user.email,
        subject: 'Verify your email address',
        react: React.createElement(
          VerificationEmail,
          {
            verificationUrl,
            email: user.email,
            appName: 'Fusion',
          } satisfies VerificationEmailProps
        ),
        text: `Click the link to verify your email: ${verificationUrl}`,
      });
      if (!result?.success) {
        console.error('sendVerificationEmail: failed to dispatch email', result?.error);
        throw new Error(result?.error || 'Failed to send verification email');
      }
    },
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
          beforeCreate: async ({ organization, user }, request) => {
            // Set default metadata for new organizations
            return {
              data: {
                ...organization,
                metadata: {
                  defaultTimezone: "America/Los_Angeles"
                }
              }
            };
          },
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
          maxRequests: 100000,
        }
      })
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24 // 1 day (every 1 day the session expiration is updated)
  },
});