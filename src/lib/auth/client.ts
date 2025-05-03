import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/client/plugins";

// Create the client instance. 
// No baseURL needed if client and server are on the same domain/port.
export const authClient = createAuthClient({
    plugins: [
        twoFactorClient({
            onTwoFactorRedirect(){
                window.location.href = "/verify-2fa";
            }
        })
    ]
});

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