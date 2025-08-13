'use server';

import { z } from 'zod';
import { db } from '@/data/db';
import { user, account, session } from '@/data/db/schema';
import { auth } from '@/lib/auth/server';
import { eq, sql, and, max, type InferInsertModel } from 'drizzle-orm';
import crypto from 'crypto';
import { revalidatePath } from 'next/cache';
import { headers as nextHeaders, cookies as nextCookies } from 'next/headers';
import { redirect } from 'next/navigation';

// --- Types and Schemas ---
// Define the schema internally, but don't export it
const UserSchema = z.object({
  id: z.string().min(1),
  name: z.string().nullable(),
  email: z.string().email(),
  image: z.string().url().nullable(),
  twoFactorEnabled: z.boolean().optional(),
  createdAt: z.date(),
  // Admin plugin fields
  role: z.string().nullable().optional(),
  banned: z.boolean().nullable().optional(),
  banReason: z.string().nullable().optional(),
  banExpires: z.date().nullable().optional(),
});

// Export only the inferred type
export type User = z.infer<typeof UserSchema>;

const AddUserSchema = z.object({
  name: z.string().min(1, { message: 'Name is required.' }),
  email: z.string().email({ message: 'Invalid email address.'}), 
  password: z.string().min(8, { message: 'Password must be at least 8 characters.' }),
});

const UpdateUserSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1, { message: 'Name is required.' }),
    image: z.string().url({ message: "Must be a valid URL." }).optional().or(z.literal('')),
    role: z.enum(['user', 'admin']).optional(),
});

// Schema for updating CURRENT user (only name and image needed)
const UpdateCurrentUserSchema = z.object({
    name: z.string().min(1, { message: 'Name is required.' }),
    image: z.string().url({ message: "Must be a valid URL." }).optional().or(z.literal('')), // Optional URL, allow empty string to clear
});

// Schema for updating CURRENT user's password
const UpdateCurrentUserPasswordSchema = z.object({
    currentPassword: z.string().min(1, { message: 'Current password is required.' }),
    newPassword: z.string().min(12, { message: 'New password must be at least 8 characters.' }),
    confirmPassword: z.string().min(8, { message: 'Confirm password must be at least 8 characters.' }),
})
.refine((data) => data.newPassword === data.confirmPassword, {
    message: "New passwords don't match",
    path: ["confirmPassword"], // Path of the error
});

interface ActionResult {
    success: boolean;
    message?: string;
}

// Specific result type for user update action - EXPORT THIS
export interface UpdateUserResult extends ActionResult {
    updatedUser?: User | null; 
}

// Define SessionCheckResponse type used by the API route
interface SessionCheckResponse {
  isAuthenticated: boolean;
  user?: { id: string };
  error?: string;
}

// --- Server Actions ---

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
        role: formData.get('role'),
    };

    const validatedFields = UpdateUserSchema.safeParse(rawData);

    if (!validatedFields.success) {
        const errorMessages = Object.values(validatedFields.error.flatten().fieldErrors).flat().join(', ');
        console.warn("[Server Action] Invalid update user input:", errorMessages);
        return { success: false, message: `Invalid input: ${errorMessages}` };
    }

    const { id, name, image, role } = validatedFields.data;

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
        await db.transaction(async (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => {
            type UserInsert = InferInsertModel<typeof user>;
            const updateData: Partial<UserInsert> = {
                name,
                image,
                ...(role ? { role } : {}),
            };
            await tx.update(user)
                .set(updateData)
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
 * Uses workaround: Fetches session from internal API route.
 * Returns updated user data on success.
 */
export async function updateCurrentUser(
    prevState: ActionResult,
    formData: FormData
): Promise<UpdateUserResult> {
    console.log("[Server Action] Attempting to update current user (using API fetch workaround)...");

    // 1. Get current user session by fetching internal API route
    let userId: string | undefined;
    try {
        const currentCookies = await nextCookies(); // Ensure cookies() is awaited here as well
        const cookieHeaderString = currentCookies.getAll().map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
        const baseURL = process.env.BETTER_AUTH_URL || 'http://localhost:3000';
        if (!baseURL) throw new Error("Base URL for API fetch missing.");
        const sessionCheckUrl = new URL('/api/auth/check-session', baseURL.startsWith('http') ? baseURL : `https://${baseURL}`);
        const response = await fetch(sessionCheckUrl.toString(), {
          headers: { 'Cookie': cookieHeaderString },
          cache: 'no-store',
        });
        if (!response.ok) {
            throw new Error(`Check session API failed with status: ${response.status}`);
        }
        const apiResponse: SessionCheckResponse = await response.json();
        if (!apiResponse.isAuthenticated || !apiResponse.user?.id) {
            console.warn("[Server Action] updateCurrentUser: No authenticated user found via API fetch.");
            return { success: false, message: 'Authentication required (API check failed).' };
        }
        userId = apiResponse.user.id;
    } catch (error) {
        console.error("[Server Action] updateCurrentUser: Error fetching session via internal API:", error);
        return { success: false, message: 'Error retrieving session context (API fetch).' };
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

    if (!userId) {
         console.error("[Server Action] updateCurrentUser: userId became null unexpectedly after API check.");
         return { success: false, message: 'Internal error: User session lost after API check.' };
    }

    const { name, image } = validatedFields.data;

    // 3. Update user in database
    try {
        console.log(`[Server Action] Updating user ${userId} with name: ${name}, image: ${image || 'null'}`);
        await db.update(user)
            .set({
                name: name,
                image: image || null,
                updatedAt: new Date(),
            })
            .where(eq(user.id, userId));
            
        // 4. Fetch the updated user data to return
        const updatedUserData = await db.select({
            id: user.id,
            name: user.name,
            email: user.email,
            image: user.image,
            twoFactorEnabled: user.twoFactorEnabled,
            createdAt: user.createdAt
        }).from(user).where(eq(user.id, userId)).limit(1);

        console.log(`[Server Action] Current user ${userId} updated successfully.`);
        revalidatePath('/account/settings'); 
        return { 
            success: true, 
            message: 'Profile updated successfully.', 
            updatedUser: updatedUserData.length > 0 ? {
                ...updatedUserData[0],
            } : null 
        }; 
    } catch (error) {
        console.error(`[Server Action] Error updating current user ${userId}:`, error);
        return { success: false, message: 'Database error during profile update.' };
    }
}

/**
 * Updates the currently authenticated user's password.
 */
export async function updateCurrentUserPassword(
    prevState: ActionResult,
    formData: FormData
): Promise<ActionResult> {
    console.log("[Server Action] Attempting to update current user password...");

    // 1. Get current user session from auth context
    let userId: string | undefined;
    let authCtx; // Store context for later use
    try {
        authCtx = await auth.$context; // Get the auth context
        const session = authCtx?.session; // Access session data from the context
        userId = session?.user?.id;
        if (!userId) {
            console.warn("[Server Action] updateCurrentUserPassword: No authenticated user found in context.");
            return { success: false, message: 'Authentication required.' };
        }
        console.log(`[Server Action] updateCurrentUserPassword: Updating password for user ID: ${userId}`);
    } catch (error) {
        console.error("[Server Action] updateCurrentUserPassword: Error fetching auth context:", error);
        return { success: false, message: 'Error retrieving session context.' };
    }

    // 2. Validate form data
    const rawData = {
        currentPassword: formData.get('currentPassword'),
        newPassword: formData.get('newPassword'),
        confirmPassword: formData.get('confirmPassword'),
    };
    const validatedFields = UpdateCurrentUserPasswordSchema.safeParse(rawData);

    if (!validatedFields.success) {
        // Combine errors into a single string for simplicity, preferring specific password match error
        const fieldErrors = validatedFields.error.flatten().fieldErrors;
        let errorMessages = (fieldErrors.confirmPassword ?? []).join(', '); // Prioritize mismatch error
        if (!errorMessages) {
           errorMessages = Object.values(fieldErrors).flat().join(', ');
        }
        console.warn("[Server Action] Invalid update password input:", errorMessages);
        return { success: false, message: `Invalid input: ${errorMessages}` };
    }

    const { currentPassword, newPassword } = validatedFields.data;

    // 3. Verify current password
    try {
         if (!authCtx?.password?.verify) {
            throw new Error('Could not get password verification context from better-auth.');
        }
        // Find the 'credential' account for the user
        const userAccount = await db.select({ password: account.password })
            .from(account)
            .where(and(eq(account.userId, userId), eq(account.providerId, 'credential')))
            .limit(1);

        if (userAccount.length === 0 || !userAccount[0].password) {
             console.error(`[Server Action] updateCurrentUserPassword: Could not find credential account or password for user ${userId}`);
             return { success: false, message: 'Could not verify current password. Account mismatch.' };
        }

        // Pass an object with password and hash to verify
        const isCurrentPasswordValid = await authCtx.password.verify({
            password: currentPassword, 
            hash: userAccount[0].password
        });

        if (!isCurrentPasswordValid) {
            console.warn(`[Server Action] updateCurrentUserPassword: Invalid current password provided for user ${userId}`);
            return { success: false, message: 'Incorrect current password.' };
        }
        console.log(`[Server Action] updateCurrentUserPassword: Current password verified for user ${userId}`);

    } catch (error) {
         console.error(`[Server Action] updateCurrentUserPassword: Error verifying current password for user ${userId}:`, error);
         return { success: false, message: 'Error verifying current password.' };
    }


    // 4. Hash new password
    let hashedNewPassword = '';
    try {
        if (!authCtx?.password?.hash) {
            throw new Error('Could not get password hashing context from better-auth.');
        }
        console.log("[Server Action] Hashing new password...");
        hashedNewPassword = await authCtx.password.hash(newPassword);
        console.log("[Server Action] New password hashed.");
    } catch (error) {
        console.error("[Server Action] Error hashing new password:", error);
        return { success: false, message: 'Failed to process new password.' };
    }


    // 5. Update password in database
    try {
        console.log(`[Server Action] Updating password for credential account associated with user ${userId}`);
        await db.update(account)
            .set({
                password: hashedNewPassword,
                // Optionally update an 'updatedAt' field on the account if it exists
            })
            .where(and(eq(account.userId, userId), eq(account.providerId, 'credential')));

        console.log(`[Server Action] Password updated successfully for user ${userId}.`);
        revalidatePath('/account/settings'); // Revalidate the settings page
        return { success: true, message: 'Password updated successfully.' };
    } catch (error) {
        console.error(`[Server Action] Error updating password for user ${userId}:`, error);
        return { success: false, message: 'Database error during password update.' };
    }
}

/**
 * Resets a specific user's password (Admin action).
 * Takes userId and newPassword.
 * IMPORTANT: Add proper authorization checks before merging!
 */
// Define schema for the reset action
const ResetPasswordSchema = z.object({
    userId: z.string().min(1), // Allow any non-empty string ID
    newPassword: z.string().min(8, { message: 'Password must be at least 8 characters.' }),
    confirmPassword: z.string().min(8, { message: 'Confirm password is required.' }),
})
.refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
});

export async function resetUserPassword(
    prevState: ActionResult,
    formData: FormData
): Promise<ActionResult> {
    console.log("[Server Action] Attempting to reset user password (Admin)...");

    // --- AUTHORIZATION CHECK NEEDED --- 
    // TODO: Verify the calling user has admin privileges
    // Example: Check session user's role/permissions
    // const session = await auth.$context?.session; // Or fetch via API
    // if (!session || !session.user.isAdmin) { // Assuming an isAdmin flag
    //    console.warn("[Server Action] resetUserPassword: Unauthorized attempt.");
    //    return { success: false, message: 'Unauthorized.' };
    // }
    // --- END AUTHORIZATION CHECK ---

    // 1. Validate form data
    const validatedFields = ResetPasswordSchema.safeParse({
        userId: formData.get('userId'),
        newPassword: formData.get('newPassword'),
        confirmPassword: formData.get('confirmPassword'),
    });

    if (!validatedFields.success) {
        const fieldErrors = validatedFields.error.flatten().fieldErrors;
        let errorMessages = (fieldErrors.confirmPassword ?? []).join(', ');
        if (!errorMessages) {
           errorMessages = Object.values(fieldErrors).flat().join(', ');
        }
        console.warn("[Server Action] Invalid reset password input:", errorMessages);
        return { success: false, message: `Invalid input: ${errorMessages}` };
    }

    const { userId, newPassword } = validatedFields.data;
    console.log(`[Server Action] Attempting reset for user ID: ${userId}`);

    let hashedNewPassword = '';
    let authCtx;
    try {
        authCtx = await auth.$context;
        if (!authCtx?.password?.hash) {
            throw new Error('Could not get password hashing context from better-auth.');
        }
        console.log("[Server Action] Hashing new password for reset...");
        hashedNewPassword = await authCtx.password.hash(newPassword);
        console.log("[Server Action] New password hashed for reset.");
    } catch (error) {
        console.error("[Server Action] Error hashing new password during reset:", error);
        return { success: false, message: 'Failed to process new password.' };
    }

    try {
        console.log(`[Server Action] Updating password for credential account associated with user ${userId}`);
        const result = await db.update(account)
            .set({
                password: hashedNewPassword,
            })
            .where(and(eq(account.userId, userId), eq(account.providerId, 'credential')));
            
        if (result.rowsAffected === 0) {
             console.warn(`[Server Action] No credential account found for user ${userId} during password reset attempt.`);
             return { success: true, message: 'Password updated (Note: User might not have a password-based account).' };
        }

        console.log(`[Server Action] Password reset successfully for user ${userId}.`);
        return { success: true, message: 'User password reset successfully.' };
    } catch (error) {
        console.error(`[Server Action] Error updating password during reset for user ${userId}:`, error);
        return { success: false, message: 'Database error during password reset.' };
    }
} 

// --- Set initial password (no current password required) ---
const SetInitialPasswordSchema = z.object({
  newPassword: z.string().min(12, { message: 'New password must be at least 12 characters.' }),
  confirmPassword: z.string().min(12, { message: 'Confirm password must be at least 12 characters.' }),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "New passwords don't match",
  path: ['confirmPassword'],
});

export async function setInitialPasswordAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  // 1) Authenticated user required (prefer API session using request headers, fallback to $context)
  let userId: string | undefined;
  let userEmail: string | undefined;
  let ctx: any | undefined;
  try {
    const hdrs = await nextHeaders();
    const session = await auth.api.getSession({ headers: hdrs });
    if (session?.user?.id) {
      userId = session.user.id as string;
      userEmail = (session.user as any).email as string | undefined;
    }
  } catch {}
  if (!userId) {
    try {
      ctx = await auth.$context;
      userId = ctx?.session?.user?.id as string | undefined;
      userEmail = ctx?.session?.user?.email as string | undefined;
    } catch {}
  }
  if (!userId) {
    return { success: false, message: 'Authentication required.' };
  }

  // 2) Validate input
  const validated = SetInitialPasswordSchema.safeParse({
    newPassword: formData.get('newPassword'),
    confirmPassword: formData.get('confirmPassword'),
  });
  if (!validated.success) {
    const errs = validated.error.flatten().fieldErrors;
    const msg = Object.values(errs).flat().join(', ');
    return { success: false, message: `Invalid input: ${msg}` };
  }

  // 3) Hash password
  let hashed = '';
  try {
    const hashingCtx = ctx ?? (await auth.$context);
    if (!hashingCtx?.password?.hash) throw new Error('Password hashing is unavailable.');
    hashed = await hashingCtx.password.hash(validated.data.newPassword);
  } catch (e) {
    return { success: false, message: 'Failed to process new password.' };
  }

  // 4) Upsert credential account password
  try {
    // Try update existing credential account
    const result = await db.update(account)
      .set({ password: hashed })
      .where(and(eq(account.userId, userId), eq(account.providerId, 'credential')));

    if ((result as any)?.rowsAffected === 0) {
      // Insert if not exists
      const id = crypto.randomUUID();
      const accountIdValue = userEmail || userId;
      await db.insert(account).values({
        id,
        userId,
        providerId: 'credential',
        accountId: accountIdValue,
        password: hashed,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  } catch (e) {
    return { success: false, message: 'Database error while setting password.' };
  }

  // 5) Redirect to home
  redirect('/');
}