'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { db } from '@/data/db';
import { user, account } from '@/data/db/schema';
import { auth } from '@/lib/auth/server';
import { sql } from 'drizzle-orm';
import crypto from 'crypto';

// Define schema for input validation
const SetupSchema = z.object({
  name: z.string().min(2, { message: 'Name must be at least 2 characters.' }),
  email: z.string().email({ message: 'Invalid email address.' }),
  password: z.string().min(8, { message: 'Password must be at least 8 characters.' }), 
});

interface ActionResult {
    success: boolean;
    error?: string;
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

    // 4. Insert user and account in transaction (using renamed tables)
    try {
        await db.transaction(async (tx) => {
            const newUserId = crypto.randomUUID();
            console.log(`[Server Action] Inserting user ${email} with ID ${newUserId}`);
            await tx.insert(user).values({
                id: newUserId,
                email: email,
                name: name,
                emailVerified: true, // Assume verified for initial admin
            });

            console.log(`[Server Action] Inserting credentials account for user ${newUserId}`);
            await tx.insert(account).values({
                id: crypto.randomUUID(),
                userId: newUserId,
                providerId: 'credential',
                accountId: newUserId, 
                password: hashedPassword,
            });
        });
        console.log("[Server Action] Admin user and account created successfully.");

        // IMPORTANT: Do NOT redirect from here, as it can cause issues
        // with React state updates in the calling component.
        // Return success and let the client handle UI changes/redirect.
        // redirect('/login'); // <-- DO NOT DO THIS HERE
        return { success: true };

    } catch (error) {
        console.error("[Server Action] Error inserting user/account:", error);
        // Check for unique constraint errors (e.g., email already exists - shouldn't happen if count check works)
        if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
             return { success: false, error: 'An account with this email might already exist unexpectedly.' };
        }
        return { success: false, error: 'Database error during user creation.' };
    }
} 