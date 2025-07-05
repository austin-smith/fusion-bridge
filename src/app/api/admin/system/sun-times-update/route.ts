import { NextRequest, NextResponse } from 'next/server';
import { withApiRouteAuth, type ApiRouteAuthContext } from '@/lib/auth/withApiRouteAuth';
import { updateSunTimes } from '@/lib/cron/jobs/update-sun-times';

/**
 * Admin endpoint to manually trigger sun times update
 * POST /api/admin/system/sun-times-update
 */
export const POST = withApiRouteAuth(async (req: NextRequest, authContext: ApiRouteAuthContext) => {
  try {
    // Check if user is admin
    if (authContext.type !== 'session' || (authContext.session?.user as any)?.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'Admin access required' },
        { status: 403 }
      );
    }

    console.log('[Admin API] Manual sun times update triggered');
    
    // Run the sun times update job
    const stats = await updateSunTimes();
    
    console.log(`[Admin API] Sun times update completed in ${stats.executionTimeMs}ms`);

    return NextResponse.json({
      success: true,
      message: 'Sun times update completed successfully',
      stats: stats
    });

  } catch (error) {
    console.error('[Admin API] Error during manual sun times update:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to update sun times',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}); 