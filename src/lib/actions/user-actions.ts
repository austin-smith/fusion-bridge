'use server';

import { z } from 'zod';
import { db } from '@/data/db';
import { user, account, session } from '@/data/db/schema';
import { auth } from '@/lib/auth/server';
import { eq, sql, and, max, inArray } from 'drizzle-orm';
import crypto from 'crypto';
import { revalidatePath } from 'next/cache';
import { headers as nextHeaders, cookies } from 'next/headers';

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
        await db.transaction(async (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => {
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
        const currentCookies = await cookies(); // Ensure cookies() is awaited here as well
        const cookieHeaderString = currentCookies.getAll().map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
        const baseURL = process.env.NEXTAUTH_URL || process.env.VERCEL_URL || 'http://localhost:3000';
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

// --- User Location Management Server Actions ---

// Schema for location assignment
const AssignUserLocationsSchema = z.object({
    userId: z.string().min(1, { message: 'User ID is required.' }),
    locationIds: z.array(z.string().uuid()).min(0, "Location IDs must be valid UUIDs"),
});

// Type for user with location IDs (Better Auth additional field)
type UserWithLocationIds = z.infer<typeof UserSchema> & {
    locationIds?: string;
};

/**
 * Gets all locations assigned to a specific user
 * Empty locationIds array means user has access to ALL locations
 */
export async function getUserLocations(userId: string) {
    console.log(`[Server Action] Fetching locations for user ${userId}...`);
    
    try {
        // Get user with locationIds
        const userData = await db.select()
            .from(user)
            .where(eq(user.id, userId))
            .limit(1);

        if (userData.length === 0) {
            console.warn(`[Server Action] User ${userId} not found`);
            return { success: false, message: 'User not found.', locations: [] };
        }

        const userRecord = userData[0];
        const userLocationIds = (userRecord as any).locationIds; // Direct access to Better Auth additional field

        // Parse the JSON string to get location IDs array
        let locationIdsArray: string[];
        try {
            locationIdsArray = typeof userLocationIds === 'string' 
                ? JSON.parse(userLocationIds) 
                : (userLocationIds || []);
        } catch (error) {
            console.warn(`[Server Action] Invalid locationIds JSON for user ${userId}:`, userLocationIds);
            locationIdsArray = [];
        }

        // Empty array means access to ALL locations
        if (locationIdsArray.length === 0) {
            console.log(`[Server Action] User ${userId} has access to ALL locations`);
            return { success: true, message: 'User has access to all locations.', locations: [] };
        }

        // Fetch the actual location data for specific assignments
        const { locations: locationsTable } = await import('@/data/db/schema');
        const userLocations = await db.select()
            .from(locationsTable)
            .where(inArray(locationsTable.id, locationIdsArray))
            .orderBy(locationsTable.path);

        console.log(`[Server Action] Found ${userLocations.length} specific locations for user ${userId}`);
        return { success: true, message: 'Locations fetched successfully.', locations: userLocations };

    } catch (error) {
        console.error(`[Server Action] Error fetching locations for user ${userId}:`, error);
        return { success: false, message: 'Database error while fetching user locations.', locations: [] };
    }
}

/**
 * Assigns locations to a user (replaces existing assignments)
 */
export async function assignUserLocations(
    prevState: ActionResult,
    formData: FormData
): Promise<ActionResult> {
    console.log("[Server Action] Assigning locations to user...");
    
    const rawData = {
        userId: formData.get('userId'),
        locationIds: formData.getAll('locationIds'), // Get all selected location IDs
    };

    const validatedFields = AssignUserLocationsSchema.safeParse(rawData);

    if (!validatedFields.success) {
        const errorMessages = Object.values(validatedFields.error.flatten().fieldErrors).flat().join(', ');
        console.warn("[Server Action] Invalid assign locations input:", errorMessages);
        return { success: false, message: `Invalid input: ${errorMessages}` };
    }

    const { userId, locationIds } = validatedFields.data;

    try {
        // Verify user exists
        const existingUser = await db.select({ id: user.id })
            .from(user)
            .where(eq(user.id, userId))
            .limit(1);

        if (existingUser.length === 0) {
            console.warn(`[Server Action] Attempted to assign locations to non-existent user ${userId}`);
            return { success: false, message: 'User not found.' };
        }

        // Verify all location IDs exist if any are provided
        if (locationIds.length > 0) {
            const { locations: locationsTable } = await import('@/data/db/schema');
            const existingLocations = await db.select({ id: locationsTable.id })
                .from(locationsTable)
                .where(inArray(locationsTable.id, locationIds));

            if (existingLocations.length !== locationIds.length) {
                const foundIds = existingLocations.map(loc => loc.id);
                const missingIds = locationIds.filter(id => !foundIds.includes(id));
                console.warn(`[Server Action] Some locations not found: ${missingIds.join(', ')}`);
                return { success: false, message: `Location(s) not found: ${missingIds.join(', ')}` };
            }
        }

        // Update user's locationIds field
        const locationIdsJson = JSON.stringify(locationIds);
        await db.update(user)
            .set({
                updatedAt: new Date(),
                // Type assertion for Better Auth additional field
                locationIds: locationIdsJson
            } as any)
            .where(eq(user.id, userId));

        console.log(`[Server Action] Successfully assigned ${locationIds.length} locations to user ${userId}`);
        revalidatePath('/admin/users'); // Revalidate the user list page
        return { 
            success: true, 
            message: `User locations updated successfully. ${locationIds.length} location(s) assigned.` 
        };

    } catch (error) {
        console.error(`[Server Action] Error assigning locations to user ${userId}:`, error);
        return { success: false, message: 'Database error during location assignment.' };
    }
}

/**
 * Removes a specific location from a user's assignments
 */
export async function removeUserLocation(userId: string, locationId: string): Promise<ActionResult> {
    console.log(`[Server Action] Removing location ${locationId} from user ${userId}...`);
    
    try {
        // Get current user locations
        const currentLocationsResult = await getUserLocations(userId);
        if (!currentLocationsResult.success) {
            return currentLocationsResult;
        }

        // Filter out the location to remove
        const currentLocationIds = currentLocationsResult.locations.map(loc => loc.id);
        const updatedLocationIds = currentLocationIds.filter(id => id !== locationId);

        // Update user's locationIds field
        const locationIdsJson = JSON.stringify(updatedLocationIds);
        await db.update(user)
            .set({
                updatedAt: new Date(),
                locationIds: locationIdsJson
            } as any)
            .where(eq(user.id, userId));

        console.log(`[Server Action] Successfully removed location ${locationId} from user ${userId}`);
        revalidatePath('/admin/users');
        return { 
            success: true, 
            message: 'Location removed from user successfully.' 
        };

    } catch (error) {
        console.error(`[Server Action] Error removing location from user ${userId}:`, error);
        return { success: false, message: 'Database error while removing user location.' };
    }
}

/**
 * Utility function to check if a user has access to a specific location
 * @param userLocationIds - Array of location IDs the user has access to (empty = all access)
 * @param targetLocationId - The location ID to check access for
 * @returns true if user has access, false otherwise
 */
function userHasLocationAccess(userLocationIds: string[], targetLocationId: string): boolean {
    // Empty array = access to all locations
    if (userLocationIds.length === 0) return true;
    
    // Otherwise check if specific location is in user's list
    return userLocationIds.includes(targetLocationId);
}

/**
 * Utility function to get user's location IDs from user data
 * @param userData - User data from database
 * @returns Array of location IDs (empty = all access)
 */
function getUserLocationIds(userData: any): string[] {
    try {
        const locationIds = userData.locationIds;
        if (typeof locationIds === 'string') {
            return JSON.parse(locationIds);
        }
        return locationIds || [];
    } catch (error) {
        console.warn('Error parsing user locationIds:', error);
        return [];
    }
}

// --- End User Location Management Server Actions --- 