'use client';

import React from 'react';
import { useSession } from '@/lib/auth/client';
import { redirect } from 'next/navigation';

/**
 * Higher-order component (HOC) to protect pages/components that require authentication.
 *
 * It uses the `useSession` hook with `required: true`.
 * - Displays a loading indicator (or null) while checking the session.
 * - Redirects to the login page ('/login') if the user is not authenticated.
 * - Renders the wrapped component if the user is authenticated.
 *
 * @param Component The component to wrap and protect.
 * @returns A new component that handles the authentication check.
 */
export function withPageAuth<P extends object>(
  Component: React.ComponentType<P>
): React.FC<P> {
  const AuthenticatedComponent: React.FC<P> = (props) => {
    // Use the hook without the options object initially
    const { data: sessionData, isPending, error } = useSession();

    React.useEffect(() => {
      // Handle unauthenticated state after initial check
      if (!isPending && !sessionData && !error) {
        console.log('[withPageAuth] No session found, redirecting to /login');
        redirect('/login');
      }
      // Handle potential errors during session fetch
      if (error) {
        console.error('[withPageAuth] Error fetching session:', error);
        // Optionally redirect to an error page or login
        redirect('/login?error=session_error');
      }
    }, [sessionData, isPending, error]);

    // Show loading state while session is being checked
    if (isPending) {
      // You can replace this with a proper loading spinner
      return <div>Loading...</div>;
    }

    // If authenticated (sessionData exists), render the component
    // If not pending and no sessionData, the useEffect will handle the redirect
    if (sessionData) {
       return <Component {...props} />;
    }

    // Fallback case (should ideally be handled by loading or redirect)
    return null;
  };

  // Set display name for better debugging
  AuthenticatedComponent.displayName = `withPageAuth(${Component.displayName || Component.name || 'Component'})`;

  return AuthenticatedComponent;
} 