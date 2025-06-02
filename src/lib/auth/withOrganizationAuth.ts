import 'server-only';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withApiRouteAuth, ApiRouteAuthContext, RouteContext } from './withApiRouteAuth';
import { auth } from '@/lib/auth/server';
import { db } from '@/data/db';
import { apikey } from '@/data/db/schema';
import { eq } from 'drizzle-orm';

/**
 * Extended authentication context for organization-scoped operations
 */
export type OrganizationAuthContext = ApiRouteAuthContext & {
  organizationId: string;
  organizationRole?: string;
};

/**
 * Higher-order function to protect API routes with organization-level authentication.
 * 
 * This middleware:
 * 1. Ensures user is authenticated (via withApiRouteAuth)
 * 2. Validates user has an active organization
 * 3. Provides organization context for clean database filtering
 *
 * @template T The expected return type of the handler.
 * @param handler The API route handler function to wrap.
 * @returns An async function that acts as the protected, organization-scoped API route handler.
 */

// Overload for routes without dynamic parameters
export function withOrganizationAuth<T>(
  handler: (
    req: NextRequest,
    authContext: OrganizationAuthContext
  ) => Promise<T | NextResponse>
): (req: NextRequest) => Promise<T | NextResponse>;

// Overload for routes with dynamic parameters
export function withOrganizationAuth<T, P = any>(
  handler: (
    req: NextRequest,
    authContext: OrganizationAuthContext,
    context: RouteContext<P>
  ) => Promise<T | NextResponse>
): (req: NextRequest, context: RouteContext<P>) => Promise<T | NextResponse>;

// Implementation
export function withOrganizationAuth<T, P = any>(
  handler: any
): any {
  // First wrap with the base auth middleware
  const authHandler = withApiRouteAuth<T, P>(async (req, authContext, context) => {
    try {
      // Handle API key authentication
      if (authContext.type === 'apikey') {
        // Ensure API key exists in context
        if (!authContext.apiKey) {
          return NextResponse.json({ 
            success: false,
            error: 'API key context not found',
            code: 'INVALID_API_KEY_CONTEXT'
          }, { status: 401 });
        }
        
        // Get the full API key details to access metadata
        const apiKeyResult = await db
          .select({ metadata: apikey.metadata })
          .from(apikey)
          .where(eq(apikey.id, authContext.apiKey.id))
          .limit(1);
        
        if (!apiKeyResult || apiKeyResult.length === 0) {
          return NextResponse.json({ 
            success: false,
            error: 'API key not found or invalid',
            code: 'INVALID_API_KEY'
          }, { status: 401 });
        }
        
        // Check if the API key has organization metadata
        let metadata = apiKeyResult[0].metadata ? JSON.parse(apiKeyResult[0].metadata as string) : null;
        
        // Check if we got a string back (double-encoded JSON)
        if (typeof metadata === 'string') {
          metadata = JSON.parse(metadata);
        }
        
        const organizationId = metadata?.organizationId;
        
        if (!organizationId) {
          return NextResponse.json({ 
            success: false,
            error: 'API key is not associated with an organization. Please create an organization-scoped API key.',
            code: 'NO_ORGANIZATION_METADATA'
          }, { status: 403 });
        }
        
        // TODO: Optionally verify the user who owns the API key is still a member of this organization
        // This adds an extra security layer but may be overkill depending on your use case
        
        // Create the extended organization context for API key auth
        const orgAuthContext: OrganizationAuthContext = {
          ...authContext,
          organizationId,
          // organizationRole could be derived from user's role in the org if needed
        };

        // Call the actual handler with organization context
        return handler(req, orgAuthContext, context);
      }

      // For session-based auth, extract organization from session
      const activeOrganizationId = authContext.session?.session?.activeOrganizationId;

      if (!activeOrganizationId) {
        return NextResponse.json({ 
          success: false,
          error: 'No active organization found. Please select an organization first.',
          code: 'NO_ACTIVE_ORGANIZATION'
        }, { status: 400 });
      }

      // TODO: Optionally verify user is actually a member of this organization
      // This could be important for security, but might be overkill if Better Auth handles it
      
      // Create the extended organization context
      const orgAuthContext: OrganizationAuthContext = {
        ...authContext,
        organizationId: activeOrganizationId,
        // organizationRole could be added here if needed
      };

      // Call the actual handler with organization context
      return handler(req, orgAuthContext, context);

    } catch (error) {
      console.error('[withOrganizationAuth] Error processing organization context:', error);
      return NextResponse.json({ 
        success: false,
        error: 'Failed to process organization context',
        code: 'ORGANIZATION_CONTEXT_ERROR'
      }, { status: 500 });
    }
  });

  return authHandler;
} 