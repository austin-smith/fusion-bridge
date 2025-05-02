'use server';

import { z } from 'zod';
import { db } from '@/data/db';
import { user, account } from '@/data/db/schema';
import { auth } from '@/lib/auth/server';
import { eq, sql } from 'drizzle-orm';
import crypto from 'crypto';
import { revalidatePath } from 'next/cache';

// --- Types and Schemas ---
// Define the schema internally, but don't export it
const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string().nullable(),
  email: z.string().email(),
  image: z.string().url().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

// Export only the inferred type
export type User = z.infer<typeof UserSchema>;

const AddUserSchema = z.object({
  name: z.string().min(1, { message: 'Name is required.' }),
  email: z.string().email({ message: 'Invalid email address.' }),
  password: z.string().min(8, { message: 'Password must be at least 8 characters.' }),
});

const UpdateUserSchema = z.object({
    id: z.string().uuid(),
    name: z.string().min(1, { message: 'Name is required.' }),
    image: z.string().url({ message: "Must be a valid URL." }).optional().or(z.literal('')),
});

// Schema for updating CURRENT user (only name and image needed)
const UpdateCurrentUserSchema = z.object({
    name: z.string().min(1, { message: 'Name is required.' }),
    image: z.string().url({ message: "Must be a valid URL." }).optional().or(z.literal('')), // Optional URL, allow empty string to clear
});

interface ActionResult {
    success: boolean;
    message?: string;
}

// --- Server Actions ---

/**
 * Fetches all users from the database.
 * TODO: Add authorization check here later.
 */
export async function getUsers(): Promise<User[]> {
  try {
    console.log("[Server Action] Fetching all users...");
    const usersData = await db.select({
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
    }).from(user);
    console.log(`[Server Action] Found ${usersData.length} users.`);
    // Validate fetched data against schema before returning
    return z.array(UserSchema).parse(usersData);
  } catch (error) {
    console.error("[Server Action] Error fetching users:", error);
    // In a real app, handle this more gracefully (e.g., return error object)
    return [];
  }
}

/**
 * Adds a new user with email/password credentials.
 * Signature updated to work with useFormState.
 */
export async function addUser(
    prevState: ActionResult, // Added previous state argument
    formData: FormData
): Promise<ActionResult> {
  console.log("[Server Action] Attempting to add new user...");

  const validatedFields = AddUserSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!validatedFields.success) {
    const errorMessages = Object.values(validatedFields.error.flatten().fieldErrors).flat().join(', ');
    console.warn("[Server Action] Invalid add user input:", errorMessages);
    return { success: false, message: `Invalid input: ${errorMessages}` };
  }

  const { name, email, password } = validatedFields.data;

  // Check if email already exists
  try {
    const existingUser = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
    if (existingUser.length > 0) {
      console.warn(`[Server Action] Attempted to add user with existing email: ${email}`);
      return { success: false, message: 'Email address is already in use.' };
    }
  } catch (error) {
    console.error("[Server Action] Error checking existing email:", error);
    return { success: false, message: 'Database error during email check.' };
  }

  // Hash password using better-auth's default hasher (scrypt)
  let hashedPassword = '';
  try {
    const ctx = await auth.$context;
    if (!ctx?.password?.hash) {
        throw new Error('Could not get password hashing context from better-auth.');
    }
    console.log("[Server Action] Hashing password...");
    hashedPassword = await ctx.password.hash(password);
    console.log("[Server Action] Password hashed.");
  } catch (error) {
    console.error("[Server Action] Error hashing password:", error);
    return { success: false, message: 'Failed to process password.' };
  }

  // Insert user and account in transaction
  try {
    await db.transaction(async (tx) => {
      const newUserId = crypto.randomUUID();
      console.log(`[Server Action] Inserting user ${email} with ID ${newUserId}`);
      await tx.insert(user).values({
          id: newUserId,
          email: email,
          name: name,
          // emailVerified is null by default, user needs to verify if email setup
      });

      console.log(`[Server Action] Inserting credentials account for user ${newUserId}`);
      await tx.insert(account).values({
          id: crypto.randomUUID(),
          userId: newUserId,
          providerId: 'credential', // Standard provider ID for email/password
          accountId: newUserId,      // Typically use user ID for credential accounts
          password: hashedPassword,
      });
    });
    console.log("[Server Action] User and account created successfully.");
    revalidatePath('/admin/users'); // Revalidate the user list page
    return { success: true, message: 'User created successfully.' };
  } catch (error) {
    console.error("[Server Action] Error inserting user/account:", error);
    return { success: false, message: 'Database error during user creation.' };
  }
}

/**
 * Updates a user's name and image URL.
 */
export async function updateUser(
    prevState: ActionResult,
    formData: FormData
): Promise<ActionResult> {
    console.log("[Server Action] Attempting to update user...");
    const rawData = {
        id: formData.get('id'),
        name: formData.get('name'),
        image: formData.get('image'),
    };

    const validatedFields = UpdateUserSchema.safeParse(rawData);

    if (!validatedFields.success) {
        const errorMessages = Object.values(validatedFields.error.flatten().fieldErrors).flat().join(', ');
        console.warn("[Server Action] Invalid update user input:", errorMessages);
        return { success: false, message: `Invalid input: ${errorMessages}` };
    }

    const { id, name, image } = validatedFields.data;

    // Check if user exists
    try {
        const existingUser = await db.select({ id: user.id }).from(user).where(eq(user.id, id)).limit(1);
        if (existingUser.length === 0) {
            console.warn(`[Server Action] Attempted to update non-existent user ${id}`);
            return { success: false, message: 'User not found.' };
        }
    } catch (error) {
        console.error("[Server Action] Error checking if user exists:", error);
        return { success: false, message: 'Database error during pre-update check.' };
    }

    // Update user in transaction
    try {
        await db.transaction(async (tx) => {
            await tx.update(user)
                .set({
                    name: name,
                    image: image,
                })
                .where(eq(user.id, id));
        });
        console.log(`[Server Action] User ${id} updated successfully.`);
        revalidatePath('/admin/users'); // Revalidate the user list page
        return { success: true, message: 'User updated successfully.' };
    } catch (error) {
        console.error(`[Server Action] Error updating user ${id}:`, error);
        return { success: false, message: 'Database error during user update.' };
    }
}

/**
 * Updates the currently authenticated user's name and image URL.
 */
export async function updateCurrentUser(
    prevState: ActionResult,
    formData: FormData
): Promise<ActionResult> {
    console.log("[Server Action] Attempting to update current user...");

    // 1. Get current user session from auth context
    let userId: string | undefined;
    try {
        const ctx = await auth.$context; // Get the auth context
        const session = ctx?.session; // Access session data from the context
        userId = session?.user?.id;
        if (!userId) {
            console.warn("[Server Action] updateCurrentUser: No authenticated user found in context.");
            return { success: false, message: 'Authentication required.' };
        }
        console.log(`[Server Action] updateCurrentUser: Updating user ID: ${userId}`);
    } catch (error) {
        console.error("[Server Action] updateCurrentUser: Error fetching auth context:", error);
        return { success: false, message: 'Error retrieving session context.' };
    }

    // 2. Validate form data
    const rawData = {
        name: formData.get('name'),
        image: formData.get('image'),
    };
    const validatedFields = UpdateCurrentUserSchema.safeParse(rawData);

    if (!validatedFields.success) {
        const errorMessages = Object.values(validatedFields.error.flatten().fieldErrors).flat().join(', ');
        console.warn("[Server Action] Invalid update current user input:", errorMessages);
        return { success: false, message: `Invalid input: ${errorMessages}` };
    }

    const { name, image } = validatedFields.data;

    // 3. Update user in database
    try {
        console.log(`[Server Action] Updating user ${userId} with name: ${name}, image: ${image || 'null'}`);
        await db.update(user)
            .set({
                name: name,
                image: image || null, // Set to null if empty string was provided
                updatedAt: new Date(),
            })
            .where(eq(user.id, userId));

        console.log(`[Server Action] Current user ${userId} updated successfully.`);
        revalidatePath('/account/settings'); // Revalidate the settings page
        // We might also need to revalidate other paths if the name/image is shown elsewhere
        // For now, just revalidate the settings page itself.
        return { success: true, message: 'Profile updated successfully.' };
    } catch (error) {
        console.error(`[Server Action] Error updating current user ${userId}:`, error);
        return { success: false, message: 'Database error during profile update.' };
    }
}

/**
 * Deletes a user and their associated data (accounts, sessions).
 * TODO: Add authorization check here later.
 */
export async function deleteUser(userId: string): Promise<ActionResult> {
    console.log(`[Server Action] Attempting to delete user ${userId}...`);

    if (!userId) {
        return { success: false, message: 'User ID is required.' };
    }

    // Basic check to prevent deleting the *very first* user (implicit admin?)
    // This is a simple safeguard, a robust role system is better.
    try {
        const firstUser = await db.select({ id: user.id, createdAt: user.createdAt }).from(user).orderBy(user.createdAt).limit(1);
        if (firstUser.length > 0 && firstUser[0].id === userId) {
            console.warn(`[Server Action] Attempted to delete the first user (${userId}), which is disallowed.`);
            return { success: false, message: 'Cannot delete the initial administrator user.' };
        }
    } catch (error) {
        console.error("[Server Action] Error checking if user is the first user:", error);
        return { success: false, message: 'Database error during pre-delete check.' };
    }

    // Drizzle should handle cascading deletes for accounts and sessions
    // based on the schema's `onDelete: "cascade"`.
    try {
        const result = await db.delete(user).where(eq(user.id, userId));
        
        if (result.rowsAffected === 0) {
             console.warn(`[Server Action] Attempted to delete non-existent user ${userId}.`);
             return { success: false, message: 'User not found.' };
        }

        console.log(`[Server Action] User ${userId} deleted successfully.`);
        revalidatePath('/admin/users'); // Revalidate the user list page
        return { success: true, message: 'User deleted successfully.' };
    } catch (error) {
        console.error(`[Server Action] Error deleting user ${userId}:`, error);
        return { success: false, message: 'Database error during user deletion.' };
    }
} 