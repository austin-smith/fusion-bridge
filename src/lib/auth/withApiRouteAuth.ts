import 'server-only';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/server';
import { db } from '@/data/db';
import { apikey } from '@/data/db/schema';
import { eq, sql } from 'drizzle-orm';

/**
 * Authentication context that can come from either a session or API key
 */
export type ApiRouteAuthContext = {
  type: 'session' | 'apikey';
  userId: string;
  user?: NonNullable<typeof auth.$Infer.Session>['user'];
  session?: NonNullable<typeof auth.$Infer.Session>;
  apiKey?: {
    id: string;
    name: string | null;
    enabled: boolean;
    rateLimitEnabled: boolean;
    remaining: number | null;
  };
};

/**
 * Route context type that matches Next.js 15 expectations
 */
export type RouteContext<P = any> = {
  params: Promise<P>;
};

/**
 * Higher-order function to protect API routes with unified authentication.
 * Supports both session cookies and API key authentication.
 * Also supports Next.js 15 dynamic routes with params.
 * 
 * Authentication precedence:
 * 1. First checks for valid session (existing behavior)
 * 2. If no session, checks for API key in x-api-key header
 * 3. If neither found, returns 401 Unauthorized
 *
 * @template T The expected return type of the handler.
 * @param handler The API route handler function to wrap.
 * @returns An async function that acts as the protected API route handler.
 */

// Overload for routes without dynamic parameters
export function withApiRouteAuth<T>(
  handler: (
    req: NextRequest,
    authContext: ApiRouteAuthContext
  ) => Promise<T | NextResponse>
): (req: NextRequest) => Promise<T | NextResponse>;

// Overload for routes with dynamic parameters
export function withApiRouteAuth<T, P = any>(
  handler: (
    req: NextRequest,
    authContext: ApiRouteAuthContext,
    context: RouteContext<P>
  ) => Promise<T | NextResponse>
): (req: NextRequest, context: RouteContext<P>) => Promise<T | NextResponse>;

// Implementation
export function withApiRouteAuth<T, P = any>(
  handler: any
): any {
  return async (req: NextRequest, context?: RouteContext<P>): Promise<T | NextResponse> => {
    try {
      // Check for API key first to ensure proper tracking
      const apiKeyHeader = req.headers.get('x-api-key');
      
      if (apiKeyHeader) {
        // Verify the API key
        const apiKeyResult = await auth.api.verifyApiKey({
          body: { key: apiKeyHeader }
        });

        if (!apiKeyResult.valid || !apiKeyResult.key) {
          return NextResponse.json({ 
            message: 'Unauthorized. Invalid API key.',
            error: apiKeyResult.error?.message 
          }, { status: 401 });
        }

        // API key is valid - create auth context
        const authContext: ApiRouteAuthContext = {
          type: 'apikey',
          userId: apiKeyResult.key.userId,
          apiKey: {
            id: apiKeyResult.key.id,
            name: apiKeyResult.key.name,
            enabled: apiKeyResult.key.enabled,
            rateLimitEnabled: apiKeyResult.key.rateLimitEnabled,
            remaining: apiKeyResult.key.remaining,
          }
        };

        return handler(req, authContext, context);
      }

      // No API key found, try session-based authentication
      const session = await auth.api.getSession({ headers: req.headers });

      if (session) {
        // Session found - use session-based auth context
        const authContext: ApiRouteAuthContext = {
          type: 'session',
          userId: session.user.id,
          user: session.user,
          session: session,
        };
        return handler(req, authContext, context);
      }

      return NextResponse.json({ message: 'Unauthorized. No session or API key was provided.' }, { status: 401 });

    } catch (error) {
      return NextResponse.json(
        { message: 'Internal Server Error during authentication check' },
        { status: 500 }
      );
    }
  };
} 