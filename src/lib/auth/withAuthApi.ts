import 'server-only';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/server';
import { headers } from 'next/headers';

/**
 * Higher-order function to protect API routes.
 * Checks for a valid session using `auth.api.getSession`.
 * If no session exists, returns a 401 Unauthorized response.
 * Otherwise, calls the provided handler with the request and session.
 *
 * @template T The expected return type of the handler.
 * @param handler The API route handler function to wrap.
 * @returns An async function that acts as the protected API route handler.
 */
export function withAuthApi<T>(
  handler: (
    req: NextRequest,
    session: NonNullable<typeof auth.$Infer.Session> // Ensure session is non-nullable
  ) => Promise<T | NextResponse>
) {
  return async (req: NextRequest): Promise<T | NextResponse> => {
    try {
      // Pass request headers directly to getSession
      const session = await auth.api.getSession({ headers: req.headers });

      if (!session) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
      }

      // Session exists, call the original handler
      return handler(req, session);
    } catch (error) {
      console.error('[withAuthApi] Error checking session:', error);
      return NextResponse.json(
        { message: 'Internal Server Error during authentication check' },
        { status: 500 }
      );
    }
  };
} 