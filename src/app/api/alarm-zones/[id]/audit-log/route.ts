import { NextResponse, NextRequest } from 'next/server';
import { withOrganizationAuth, type OrganizationAuthContext } from '@/lib/auth/withOrganizationAuth';
import { createAlarmZonesRepository } from '@/data/repositories/alarm-zones';
import type { RouteContext } from '@/lib/auth/withApiRouteAuth';

// Get audit log for an alarm zone
export const GET = withOrganizationAuth(async (request: NextRequest, authContext: OrganizationAuthContext, context: RouteContext<{ id: string }>) => {
  if (!context?.params) {
    return NextResponse.json({ success: false, error: "Missing route parameters" }, { status: 400 });
  }
  
  const { id } = await context.params;
  const { searchParams } = new URL(request.url);
  
  const limitParam = searchParams.get('limit');
  const offsetParam = searchParams.get('offset');
  
  const limit = limitParam ? parseInt(limitParam, 10) : 100;
  const offset = offsetParam ? parseInt(offsetParam, 10) : 0;

  if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id)) {
    return NextResponse.json({ success: false, error: "Invalid ID format" }, { status: 400 });
  }

  if (isNaN(limit) || limit <= 0 || limit > 1000) {
    return NextResponse.json({ success: false, error: "Invalid limit parameter (must be 1-1000)" }, { status: 400 });
  }

  if (isNaN(offset) || offset < 0) {
    return NextResponse.json({ success: false, error: "Invalid offset parameter (must be >= 0)" }, { status: 400 });
  }

  try {
    const alarmZonesRepo = createAlarmZonesRepository(authContext.organizationId);
    const auditEntries = await alarmZonesRepo.getZoneAuditLog(id, limit, offset);

    const auditEntriesWithTimestamps = auditEntries.map(entry => ({
      ...entry,
      createdAt: new Date(entry.createdAt).toISOString(),
    }));

    return NextResponse.json({ 
      success: true, 
      data: auditEntriesWithTimestamps,
      pagination: {
        limit,
        offset,
        hasMore: auditEntriesWithTimestamps.length === limit
      }
    });

  } catch (error) {
    console.error(`Error fetching audit log for alarm zone ${id}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    if (errorMessage.includes('not found or not accessible')) {
      return NextResponse.json({ success: false, error: errorMessage }, { status: 404 });
    }
    
    return NextResponse.json({ success: false, error: `Failed to fetch audit log: ${errorMessage}` }, { status: 500 });
  }
}); 