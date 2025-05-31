import { withApiRouteAuth } from '@/lib/auth/withApiRouteAuth';
import { NextRequest, NextResponse } from 'next/server';

/**
 * @swagger
 * /api/admin/api-keys/test/protected:
 *   get:
 *     summary: Test API key authentication
 *     description: Test endpoint to verify API key authentication is working
 *     tags: [Admin]
 */
export const GET = withApiRouteAuth(async (req: NextRequest, authContext) => {
  // This endpoint will work with either session cookies OR API keys
  
  const response = {
    message: 'Authentication successful!',
    timestamp: new Date().toISOString(),
    authMethod: authContext.type,
    userId: authContext.userId,
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

/**
 * @swagger
 * /api/admin/api-keys/test/protected:
 *   post:
 *     summary: Test API key with data
 *     description: Test endpoint that accepts and echoes back JSON data to verify API key authentication
 *     tags: [Admin]
 */
export const POST = withApiRouteAuth(async (req: NextRequest, authContext) => {
  try {
    const body = await req.json();
    
    return NextResponse.json({
      message: 'POST request authenticated successfully',
      authMethod: authContext.type,
      userId: authContext.userId,
      receivedData: body,
      timestamp: new Date().toISOString(),
    }, { status: 200 });
  } catch (error) {
    return NextResponse.json({
      message: 'Invalid JSON in request body',
      authMethod: authContext.type,
      userId: authContext.userId,
    }, { status: 400 });
  }
}); 