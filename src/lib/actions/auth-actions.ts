'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { db } from '@/data/db';
import { user, account, organization, member } from '@/data/db/schema';
import { auth } from '@/lib/auth/server';
import { sql } from 'drizzle-orm';
import crypto from 'crypto';

// Define schema for input validation
const SetupSchema = z.object({
  name: z.string().min(2, { message: 'Name must be at least 2 characters.' }),
  email: z.string().email({ message: 'Invalid email address.' }),
  password: z.string().min(8, { message: 'Password must be at least 8 characters.' }), 
});

// API Key creation schema
const CreateApiKeySchema = z.object({
  name: z.string().optional(),
  expiresIn: z.number().optional(), // seconds
}).transform((data) => {
  // Filter out undefined values
  const filtered: Record<string, any> = {};
  Object.entries(data).forEach(([key, value]) => {
    if (value !== undefined) {
      filtered[key] = value;
    }
  });
  return filtered;
});

interface ActionResult {
    success: boolean;
    error?: string;
}

interface ApiKeyResult extends ActionResult {
    apiKey?: any;
}

interface ApiKeysListResult extends ActionResult {
    apiKeys?: any[];
}

export async function createFirstAdminUser(formData: z.infer<typeof SetupSchema>): Promise<ActionResult> {
    console.log("[Server Action] Attempting to create first admin user...");

    // 1. Re-check if users already exist (using renamed 'user' table)
    try {
        const result = await db.select({ count: sql<number>`count(*)` }).from(user).limit(1);
        const userCount = result[0]?.count ?? 0;
        if (userCount > 0) {
            console.warn("[Server Action] Setup attempted, but users already exist.");
            return { success: false, error: 'Setup has already been completed.' };
        }
    } catch (error) {
        console.error("[Server Action] Error checking user count:", error);
        return { success: false, error: 'Database error during setup check.' };
    }

    // 2. Validate input
    const validatedFields = SetupSchema.safeParse(formData);
    if (!validatedFields.success) {
        // Combine errors into a single string for simplicity
        const errorMessages = Object.values(validatedFields.error.flatten().fieldErrors).flat().join(', ');
        console.warn("[Server Action] Invalid setup input:", errorMessages);
        return { success: false, error: `Invalid input: ${errorMessages}` };
    }

    const { name, email, password } = validatedFields.data;

    // 3. Hash password using better-auth's default hasher (scrypt)
    let hashedPassword = '';
    try {
        const ctx = await auth.$context;
        if (!ctx?.password?.hash) {
            throw new Error('Could not get password hashing context from better-auth.');
        }
        console.log("[Server Action] Hashing password with default hasher (scrypt)...");
        hashedPassword = await ctx.password.hash(password);
        console.log("[Server Action] Password hashed.");
    } catch (error) {
        console.error("[Server Action] Error hashing password:", error);
        return { success: false, error: 'Failed to process password.' };
    }

    // 4. Insert user, account, organization, and membership in transaction
    try {
        await db.transaction(async (tx) => {
            const newUserId = crypto.randomUUID();
            const orgId = crypto.randomUUID();
            
            // Create admin user with admin role
            console.log(`[Server Action] Inserting user ${email} with ID ${newUserId}`);
            await tx.insert(user).values({
                id: newUserId,
                email: email,
                name: name,
                emailVerified: true, // Assume verified for initial admin
                role: 'admin',
            });

            // Create credentials account
            console.log(`[Server Action] Inserting credentials account for user ${newUserId}`);
            await tx.insert(account).values({
                id: crypto.randomUUID(),
                userId: newUserId,
                providerId: 'credential',
                accountId: newUserId, 
                password: hashedPassword,
            });

            // Create default organization
            console.log(`[Server Action] Creating default organization with ID ${orgId}`);
            await tx.insert(organization).values({
                id: orgId,
                name: 'Default Organization',
                slug: 'default',
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            // Make admin user the owner of the default organization
            console.log(`[Server Action] Making user ${newUserId} owner of default organization`);
            await tx.insert(member).values({
                id: crypto.randomUUID(),
                userId: newUserId,
                organizationId: orgId,
                role: 'owner',
                createdAt: new Date(),
                updatedAt: new Date(),
            });
        });
        
        console.log("[Server Action] Admin user, default organization, and membership created successfully.");
        return { success: true };

    } catch (error) {
        console.error("[Server Action] Error inserting user/account/organization:", error);
        // Check for unique constraint errors (e.g., email already exists - shouldn't happen if count check works)
        if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
             return { success: false, error: 'An account with this email might already exist unexpectedly.' };
        }
        return { success: false, error: 'Database error during user creation.' };
    }
} 

export async function createApiKey(formData: z.infer<typeof CreateApiKeySchema>): Promise<ApiKeyResult> {
    console.log("[Server Action] Creating API key with data:", formData);

    try {
        // Get the current session to get the user ID
        const headersList = await headers();
        const session = await auth.api.getSession({ headers: headersList });
        
        if (!session) {
            console.log("[Server Action] No session found");
            return { success: false, error: 'You must be logged in to create an API key.' };
        }

        console.log("[Server Action] Session found for user:", session.user.id);

        // Validate input and filter undefined values
        const validatedFields = CreateApiKeySchema.safeParse(formData);
        if (!validatedFields.success) {
            const errorMessages = Object.values(validatedFields.error.flatten().fieldErrors).flat().join(', ');
            console.log("[Server Action] Validation failed:", errorMessages);
            return { success: false, error: `Invalid input: ${errorMessages}` };
        }

        const body = validatedFields.data; // Already filtered by Zod transform
        console.log("[Server Action] API call body:", body);

        // Create API key using server auth instance
        const apiKey = await auth.api.createApiKey({
            body,
            headers: headersList
        });

        console.log("[Server Action] API key created successfully:", apiKey);
        return { success: true, apiKey };

    } catch (error) {
        console.error("[Server Action] Detailed error creating API key:", error);
        
        // Try to extract more specific error information
        let errorMessage = 'Failed to create API key. Please try again.';
        if (error instanceof Error) {
            console.error("[Server Action] Error message:", error.message);
            console.error("[Server Action] Error stack:", error.stack);
            errorMessage = error.message;
        }
        
        return { success: false, error: errorMessage };
    }
}

export async function listApiKeys(): Promise<ApiKeysListResult> {
    try {
        // Get the current session to get the user ID
        const headersList = await headers();
        const session = await auth.api.getSession({ headers: headersList });
        if (!session) {
            return { success: false, error: 'You must be logged in to list API keys.' };
        }

        // List API keys for the current user
        const apiKeys = await auth.api.listApiKeys({
            headers: headersList
        });

        return { success: true, apiKeys };

    } catch (error) {
        console.error("[Server Action] Error listing API keys:", error);
        let errorMessage = 'Failed to list API keys.';
        if (error instanceof Error) {
            errorMessage = error.message;
        }
        return { success: false, error: errorMessage };
    }
}

export async function deleteApiKey(keyId: string): Promise<ActionResult> {
    try {
        // Get the current session to verify ownership
        const headersList = await headers();
        const session = await auth.api.getSession({ headers: headersList });
        if (!session) {
            return { success: false, error: 'You must be logged in to delete an API key.' };
        }

        // Delete the API key (better-auth will verify ownership)
        await auth.api.deleteApiKey({
            body: { keyId },
            headers: headersList
        });

        return { success: true };

    } catch (error) {
        console.error("[Server Action] Error deleting API key:", error);
        let errorMessage = 'Failed to delete API key.';
        if (error instanceof Error) {
            errorMessage = error.message;
        }
        return { success: false, error: errorMessage };
    }
} 