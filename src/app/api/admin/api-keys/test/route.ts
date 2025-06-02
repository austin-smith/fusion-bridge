import { withApiRouteAuth } from '@/lib/auth/withApiRouteAuth';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/data/db';
import { apikey, organization } from '@/data/db/schema';
import { eq } from 'drizzle-orm';

export const GET = withApiRouteAuth(async (req: NextRequest, authContext) => {
  // This endpoint will work with either session cookies OR API keys
  
  let organizationInfo = null;

  // If authenticated via API key, fetch organization information
  if (authContext.type === 'apikey' && authContext.apiKey) {
    try {
      // Get the full API key details to access metadata
      const apiKeyResult = await db
        .select({ metadata: apikey.metadata })
        .from(apikey)
        .where(eq(apikey.id, authContext.apiKey.id))
        .limit(1);
      
      if (apiKeyResult.length > 0) {
        const metadata = apiKeyResult[0].metadata;
        let parsedMetadata = null;
        
        if (metadata) {
          try {
            parsedMetadata = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
            
            // Check if we got a string back (double-encoded JSON)
            if (typeof parsedMetadata === 'string') {
              parsedMetadata = JSON.parse(parsedMetadata);
            }
          } catch (error) {
            console.warn(`Failed to parse API key metadata:`, error);
          }
        }
        
        const organizationId = parsedMetadata?.organizationId;
        
        if (organizationId) {
          // Fetch organization details
          const orgResult = await db
            .select()
            .from(organization)
            .where(eq(organization.id, organizationId))
            .limit(1);
          
          if (orgResult.length > 0) {
            organizationInfo = orgResult[0];
          }
        }
      }
    } catch (error) {
      console.warn('Failed to fetch organization info for API key:', error);
    }
  }

  // If authenticated via session, get organization from active session
  if (authContext.type === 'session' && authContext.session?.session?.activeOrganizationId) {
    try {
      const orgResult = await db
        .select()
        .from(organization)
        .where(eq(organization.id, authContext.session.session.activeOrganizationId))
        .limit(1);
      
      if (orgResult.length > 0) {
        organizationInfo = orgResult[0];
      }
    } catch (error) {
      console.warn('Failed to fetch organization info for session:', error);
    }
  }
  
  const response = {
    success: true,
    message: 'Authentication successful!',
    timestamp: new Date().toISOString(),
    authMethod: authContext.type,
    userId: authContext.userId,
    organizationInfo,
    // Include different data based on auth method
    ...(authContext.type === 'session' && {
      sessionInfo: {
        user: {
          id: authContext.user?.id,
          email: authContext.user?.email,
          name: authContext.user?.name,
        },
        hasSession: true,
      }
    }),
    ...(authContext.type === 'apikey' && {
      apiKeyInfo: {
        keyId: authContext.apiKey?.id,
        keyName: authContext.apiKey?.name,
        rateLimitEnabled: authContext.apiKey?.rateLimitEnabled,
        remaining: authContext.apiKey?.remaining,
      }
    })
  };

  return NextResponse.json(response, { status: 200 });
}); 