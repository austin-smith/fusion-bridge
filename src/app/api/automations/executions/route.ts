import { NextRequest, NextResponse } from 'next/server';
import { withOrganizationAuth, type OrganizationAuthContext } from '@/lib/auth/withOrganizationAuth';
import { automationAuditQueryService } from '@/services/automation-audit-query-service';

export const GET = withOrganizationAuth(async (request: NextRequest, authContext: OrganizationAuthContext) => {
  try {
    const { searchParams } = new URL(request.url);
    const automationId = searchParams.get('automationId');
    const executionId = searchParams.get('executionId');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const lastRunOnly = searchParams.get('lastRunOnly') === 'true';
    const count = searchParams.get('count') === 'true';
    const timeStart = searchParams.get('timeStart');
    const timeEnd = searchParams.get('timeEnd');
    const groupBy = searchParams.get('groupBy');

    // If requesting execution counts/stats
    if (count) {
      if (groupBy) {
        // Grouped counts for charts
        const groupedStats = await automationAuditQueryService.getGroupedExecutionCounts(
          groupBy,
          timeStart || undefined,
          timeEnd || undefined,
          authContext.organizationId
        );
        
        return NextResponse.json({
          success: true,
          data: groupedStats
        });
      } else {
        // Overall stats for radial chart
        const stats = await automationAuditQueryService.getExecutionCounts(
          timeStart || undefined,
          timeEnd || undefined,
          authContext.organizationId
        );
        
        return NextResponse.json({
          success: true,
          data: stats
        });
      }
    }

    // If requesting a specific execution detail
    if (executionId) {
      const execution = await automationAuditQueryService.getExecutionDetail(
        executionId, 
        authContext.organizationId
      );
      
      if (!execution) {
        return NextResponse.json({
          success: false,
          error: 'Execution not found or not accessible'
        }, { status: 404 });
      }
      
      return NextResponse.json({
        success: true,
        data: execution
      });
    }

    // If requesting last run summary only
    if (lastRunOnly) {
      const lastRuns = await automationAuditQueryService.getLastRunSummary(
        authContext.organizationId
      );
      
      return NextResponse.json({
        success: true,
        data: lastRuns
      });
    }

    // Default: Get recent executions with pagination
    const executions = await automationAuditQueryService.getRecentExecutions(
      limit,
      offset,
      automationId || undefined,
      authContext.organizationId
    );

    const totalCount = await automationAuditQueryService.getExecutionCount(
      automationId || undefined,
      authContext.organizationId
    );

    return NextResponse.json({
      success: true,
      data: {
        executions,
        pagination: {
          limit,
          offset,
          total: totalCount,
          hasMore: executions.length >= limit
        }
      }
      });

  } catch (error) {
    console.error('[AutomationExecutions] Error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch automation executions'
    }, { status: 500 });
  }
}); 