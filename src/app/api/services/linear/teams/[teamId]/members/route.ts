import { NextRequest, NextResponse } from 'next/server';
import { withApiRouteAuth, type ApiRouteAuthContext, type RouteContext } from '@/lib/auth/withApiRouteAuth';
import { z } from 'zod';
import { getLinearConfiguration } from '@/data/repositories/service-configurations';
import { getLinearTeamMembers } from '@/services/drivers/linear';
import { MOCK_LINEAR_TEAM_MEMBERS_RESPONSE } from '@/services/drivers/linear-mock-data';

// URL parameter schema
const LinearTeamParamsSchema = z.object({
  teamId: z.string().min(1, 'Team ID is required'),
});

// Query parameter schema
const LinearTeamMembersQuerySchema = z.object({
  limit: z.string().optional().transform(val => val ? parseInt(val) : 50).refine(val => val > 0, {
    message: 'Limit must be a positive number'
  }),
  activeOnly: z.string().optional().transform(val => val !== 'false'),
});

export const GET = withApiRouteAuth(async (
  req: NextRequest, 
  authContext: ApiRouteAuthContext,
  context: RouteContext<{ teamId: string }>
) => {
  // Await the params promise to get actual params
  const { teamId } = await context.params;
  
  try {
    // Validate team ID parameter
    const paramParseResult = LinearTeamParamsSchema.safeParse({ teamId });
    if (!paramParseResult.success) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid team ID',
          details: paramParseResult.error.flatten().fieldErrors
        },
        { status: 400 }
      );
    }

    // Parse query parameters
    const url = new URL(req.url);
    const queryParams = Object.fromEntries(url.searchParams.entries());
    
    const queryParseResult = LinearTeamMembersQuerySchema.safeParse(queryParams);
    if (!queryParseResult.success) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid query parameters',
          details: queryParseResult.error.flatten().fieldErrors
        },
        { status: 400 }
      );
    }

    const { limit, activeOnly } = queryParseResult.data;

    // Get Linear configuration
    const linearConfig = await getLinearConfiguration();
    
    if (!linearConfig) {
      return NextResponse.json(
        { success: false, error: 'Linear service is not configured. Please configure your Linear settings first.' },
        { status: 400 }
      );
    }

    if (!linearConfig.isEnabled) {
      return NextResponse.json(
        { success: false, error: 'Linear service is disabled. Enable the service first to fetch team members.' },
        { status: 400 }
      );
    }

    if (!linearConfig.apiKey) {
      return NextResponse.json(
        { success: false, error: 'Linear API key is missing. Please add your API key in the configuration.' },
        { status: 400 }
      );
    }

    // Return mock data if environment variable is set
    if (process.env.LINEAR_USE_MOCK_DATA === 'true') {
      console.log('[Linear Team Members API] Using mock data');
      return NextResponse.json(MOCK_LINEAR_TEAM_MEMBERS_RESPONSE);
    }

    // Fetch team members from Linear
    const teamMembers = await getLinearTeamMembers(linearConfig.apiKey, teamId, {
      limit,
      activeOnly
    });

    return NextResponse.json({
      success: true,
      data: teamMembers,
      meta: {
        count: teamMembers.length,
        hasMore: teamMembers.length === limit, // Hint if there might be more
        teamId,
        filters: {
          limit,
          activeOnly
        }
      }
    });

  } catch (error) {
    console.error(`[API /api/services/linear/teams/${teamId}/members] Error:`, error);
    
    let errorMessage = 'Internal server error';
    let statusCode = 500;
    
    if (error instanceof Error) {
      if (error.message.includes('401') || error.message.includes('Unauthorized')) {
        errorMessage = 'Invalid Linear API key. Please check your configuration.';
        statusCode = 401;
      } else if (error.message.includes('403') || error.message.includes('Forbidden')) {
        errorMessage = 'Access forbidden. Please check your Linear API key permissions.';
        statusCode = 403;
      } else if (error.message.includes('not found') || error.message.includes('Team not found')) {
        errorMessage = 'Team not found. The team may not exist or you may not have access to it.';
        statusCode = 404;
      } else if (error.message.includes('Network')) {
        errorMessage = 'Network error: Unable to connect to Linear API.';
        statusCode = 503;
      } else if (error.message.includes('rate limit') || error.message.includes('Rate limit')) {
        errorMessage = 'Linear API rate limit exceeded. Please try again later.';
        statusCode = 429;
      } else {
        errorMessage = error.message;
      }
    }

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      { status: statusCode }
    );
  }
});