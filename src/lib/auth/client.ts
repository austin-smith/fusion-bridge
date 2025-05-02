import { createAuthClient } from "better-auth/react";

// Create the client instance. 
// No baseURL needed if client and server are on the same domain/port.
export const authClient = createAuthClient({});

// Optionally re-export commonly used hooks/functions for convenience
export const { 
    signIn, 
    signOut, 
    signUp, 
    useSession, 
    // Add other exports if needed, e.g.:
    // sendPasswordResetEmail,
    // resetPassword,
    // verifyEmail
} = authClient; 