import { NextRequest, NextResponse } from 'next/server';
import { withApiRouteAuth, type ApiRouteAuthContext } from '@/lib/auth/withApiRouteAuth';
import { z } from 'zod';
import { getLinearConfiguration } from '@/data/repositories/service-configurations';
import { getLinearIssues } from '@/services/drivers/linear';

// Request query schema for Linear issues
const LinearIssuesQuerySchema = z.object({
  teamId: z.string().optional(),
  first: z.coerce.number().min(1).max(100).optional().default(50),
  after: z.string().optional(),
  orderBy: z.enum(['updatedAt', 'createdAt']).optional().default('updatedAt'),
  state: z.string().optional(),
  assignee: z.string().optional(),
  priority: z.coerce.number().min(0).max(4).optional(),
});

export const GET = withApiRouteAuth(async (req: NextRequest, authContext: ApiRouteAuthContext) => {
  try {
    // Parse query parameters
    const url = new URL(req.url);
    const queryParams = Object.fromEntries(url.searchParams.entries());
    
    const parseResult = LinearIssuesQuerySchema.safeParse(queryParams);
    if (!parseResult.success) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid query parameters',
          details: parseResult.error.flatten().fieldErrors
        },
        { status: 400 }
      );
    }

    const { teamId, first, after, orderBy, state, assignee, priority } = parseResult.data;

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
        { success: false, error: 'Linear service is disabled. Enable the service first to fetch issues.' },
        { status: 400 }
      );
    }

    if (!linearConfig.apiKey) {
      return NextResponse.json(
        { success: false, error: 'Linear API key is missing. Please add your API key in the configuration.' },
        { status: 400 }
      );
    }

    // Use configured team if no team specified in query
    const effectiveTeamId = teamId || linearConfig.teamId;

    // Build filter object
    const filter: any = {};
    if (state) filter.state = state;
    if (assignee) filter.assignee = assignee;
    if (priority !== undefined) filter.priority = priority;

    // Fetch issues from Linear
    const issuesResponse = await getLinearIssues(linearConfig.apiKey, effectiveTeamId, {
      first,
      after,
      orderBy,
      filter: Object.keys(filter).length > 0 ? filter : undefined,
    });

    return NextResponse.json({
      success: true,
      data: issuesResponse,
      meta: {
        teamId: effectiveTeamId,
        filters: filter,
      }
    });

  } catch (error) {
    console.error('[API /api/services/linear/issues] Error:', error);
    
    let errorMessage = 'Internal server error';
    
    if (error instanceof Error) {
      if (error.message.includes('401') || error.message.includes('Unauthorized')) {
        errorMessage = 'Invalid Linear API key. Please check your configuration.';
      } else if (error.message.includes('403') || error.message.includes('Forbidden')) {
        errorMessage = 'Access forbidden. Please check your Linear API key permissions.';
      } else if (error.message.includes('Network')) {
        errorMessage = 'Network error: Unable to connect to Linear API.';
      } else if (error.message.includes('not found')) {
        errorMessage = 'Linear team or resource not found. Please check your configuration.';
      } else {
        errorMessage = error.message;
      }
    }

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      { status: 500 }
    );
  }
});