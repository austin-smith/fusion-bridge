import { withOrganizationAuth, type OrganizationAuthContext } from '@/lib/auth/withOrganizationAuth';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/data/db';
import { organization } from '@/data/db/schema';
import { eq } from 'drizzle-orm';

export const GET = withOrganizationAuth(async (req: NextRequest, authContext: OrganizationAuthContext) => {
  // This endpoint now requires organization-scoped authentication
  
  let organizationInfo = null;

  // Fetch organization details using the organizationId from context
  try {
    const orgResult = await db
      .select()
      .from(organization)
      .where(eq(organization.id, authContext.organizationId))
      .limit(1);
    
    if (orgResult.length > 0) {
      organizationInfo = orgResult[0];
    }
  } catch (error) {
    console.warn('Failed to fetch organization info:', error);
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