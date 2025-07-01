import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/client/plugins";
import { adminClient } from "better-auth/client/plugins";
import { organizationClient } from "better-auth/client/plugins";
import { apiKeyClient } from "better-auth/client/plugins";

// Create the client instance. 
// No baseURL needed if client and server are on the same domain/port.
export const authClient = createAuthClient({
    plugins: [
        twoFactorClient({
            onTwoFactorRedirect(){
                // Preserve callbackUrl when redirecting to 2FA page
                const currentUrl = new URL(window.location.href);
                const callbackUrl = currentUrl.searchParams.get('callbackUrl');
                const verifyUrl = new URL("/verify-2fa", window.location.origin);
                
                // Add callbackUrl if it exists
                if (callbackUrl) {
                    verifyUrl.searchParams.set("callbackUrl", callbackUrl);
                }
                
                // Redirect with preserved callbackUrl
                window.location.href = verifyUrl.toString();
            }
        }),
        adminClient(),
        organizationClient(),
        apiKeyClient()
    ]
});

// Optionally re-export commonly used hooks/functions for convenience
export const { 
    signIn, 
    signOut, 
    signUp, 
    useSession, 
    // API Key management functions
    apiKey,
    // Add other exports if needed, e.g.:
    // sendPasswordResetEmail,
    // resetPassword,
    // verifyEmail
} = authClient; 