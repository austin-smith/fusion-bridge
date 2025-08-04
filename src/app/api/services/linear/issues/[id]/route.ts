import { NextRequest, NextResponse } from 'next/server';
import { withApiRouteAuth, type ApiRouteAuthContext, type RouteContext } from '@/lib/auth/withApiRouteAuth';
import { z } from 'zod';
import { getLinearConfiguration } from '@/data/repositories/service-configurations';
import { getLinearIssue, updateLinearIssue } from '@/services/drivers/linear';

// URL parameter schema
const LinearIssueParamsSchema = z.object({
  id: z.string().min(1, 'Issue ID is required'),
});

// PATCH request body schema
const LinearIssueUpdateSchema = z.object({
  stateId: z.string().optional(),
  assigneeId: z.string().optional(),
  priority: z.number().min(0).max(4).optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  estimate: z.number().optional(),
});

export const GET = withApiRouteAuth(async (
  req: NextRequest, 
  authContext: ApiRouteAuthContext,
  context: RouteContext<{ id: string }>
) => {
  // Await the params promise to get actual params
  const { id: issueId } = await context.params;
  
  try {
    // Validate issue ID parameter
    const parseResult = LinearIssueParamsSchema.safeParse({ id: issueId });
    if (!parseResult.success) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid issue ID',
          details: parseResult.error.flatten().fieldErrors
        },
        { status: 400 }
      );
    }

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

    // Fetch single issue from Linear
    const issue = await getLinearIssue(linearConfig.apiKey, issueId);

    return NextResponse.json({
      success: true,
      data: issue,
      meta: {
        teamId: linearConfig.teamId,
        teamName: linearConfig.teamName,
      }
    });

  } catch (error) {
    console.error(`[API /api/services/linear/issues/${issueId}] Error:`, error);
    
    let errorMessage = 'Internal server error';
    let statusCode = 500;
    
    if (error instanceof Error) {
      if (error.message.includes('401') || error.message.includes('Unauthorized')) {
        errorMessage = 'Invalid Linear API key. Please check your configuration.';
        statusCode = 401;
      } else if (error.message.includes('403') || error.message.includes('Forbidden')) {
        errorMessage = 'Access forbidden. Please check your Linear API key permissions.';
        statusCode = 403;
      } else if (error.message.includes('not found') || error.message.includes('Issue not found')) {
        errorMessage = 'Issue not found. The issue may have been deleted or you may not have access to it.';
        statusCode = 404;
      } else if (error.message.includes('Network')) {
        errorMessage = 'Network error: Unable to connect to Linear API.';
        statusCode = 503;
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

export const PATCH = withApiRouteAuth(async (
  req: NextRequest, 
  authContext: ApiRouteAuthContext,
  context: RouteContext<{ id: string }>
) => {
  // Await the params promise to get actual params
  const { id: issueId } = await context.params;
  
  try {
    // Validate issue ID parameter
    const parseResult = LinearIssueParamsSchema.safeParse({ id: issueId });
    if (!parseResult.success) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid issue ID',
          details: parseResult.error.flatten().fieldErrors
        },
        { status: 400 }
      );
    }

    // Parse request body
    const requestBody = await req.json();
    const updateParseResult = LinearIssueUpdateSchema.safeParse(requestBody);
    if (!updateParseResult.success) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid update data',
          details: updateParseResult.error.flatten().fieldErrors
        },
        { status: 400 }
      );
    }

    const updates = updateParseResult.data;

    // Validate that at least one field is being updated
    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'No fields to update provided'
        },
        { status: 400 }
      );
    }

    // Get Linear configuration
    const linearConfig = await getLinearConfiguration();
    
    if (!linearConfig?.apiKey) {
      return NextResponse.json(
        { success: false, error: 'Linear API key not found' },
        { status: 400 }
      );
    }

    // Update the issue
    const updatedIssue = await updateLinearIssue(linearConfig.apiKey, issueId, updates);

    return NextResponse.json({
      success: true,
      data: updatedIssue,
      meta: {
        updatedFields: Object.keys(updates),
      }
    });

  } catch (error) {
    console.error(`[API PATCH /api/services/linear/issues/${issueId}] Error:`, error);
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update issue',
      },
      { status: 500 }
    );
  }
});