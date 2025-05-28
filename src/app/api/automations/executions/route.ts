import { NextRequest, NextResponse } from 'next/server';
import { automationAuditQueryService } from '@/services/automation-audit-query-service';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const automationId = searchParams.get('automationId');
    const executionId = searchParams.get('executionId');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const lastRunOnly = searchParams.get('lastRunOnly') === 'true';

    if (lastRunOnly) {
      // Get minimal last run info for automation cards (just timestamp and status)
      const lastRuns = await automationAuditQueryService.getLastRunSummary();
      return NextResponse.json(lastRuns);
    } else if (executionId) {
      // Get detailed execution information including actions
      const executionDetail = await automationAuditQueryService.getExecutionDetail(executionId);
      if (!executionDetail) {
        return NextResponse.json(
          { error: 'Execution not found' },
          { status: 404 }
        );
      }
      return NextResponse.json(executionDetail);
    } else {
      // Get regular execution list - fetch one extra to determine if there are more
      const executions = await automationAuditQueryService.getRecentExecutions(limit + 1, offset, automationId || undefined);
      
      // Check if we have more results than requested
      const hasMore = executions.length > limit;
      
      // Return only the requested number of executions
      const resultExecutions = hasMore ? executions.slice(0, limit) : executions;
      
      return NextResponse.json({
        executions: resultExecutions,
        hasMore
      });
    }
  } catch (error) {
    console.error('Error fetching automation executions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch automation executions' },
      { status: 500 }
    );
  }
} 