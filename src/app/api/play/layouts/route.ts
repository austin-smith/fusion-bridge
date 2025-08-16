import { NextRequest, NextResponse } from 'next/server';
import { withOrganizationAuth, type OrganizationAuthContext } from '@/lib/auth/withOrganizationAuth';
import { db } from '@/data/db';
import { layouts } from '@/data/db/schema';
import type { TileConfig } from '@/types/play';
import { and, eq } from 'drizzle-orm';

export const GET = withOrganizationAuth(async (req: NextRequest, auth: OrganizationAuthContext) => {
  try {
    const result = await db.select().from(layouts).where(eq(layouts.organizationId, auth.organizationId));
    const normalized = result.map((row) => ({
      ...row,
      tileConfigs: (row as any).tileConfigs ?? {},
    }));
    return NextResponse.json({ success: true, data: normalized });
  } catch (e) {
    const err = e as Error;
    console.error('GET /api/play/layouts error:', err.message, err.stack);
    return NextResponse.json({ success: false, error: 'Failed to fetch layouts', code: 'LAYOUTS_FETCH_FAILED' }, { status: 500 });
  }
});

export const POST = withOrganizationAuth(async (req: NextRequest, auth: OrganizationAuthContext) => {
  try {
    const body = await req.json();
    const { name, deviceIds = [], items = [], tileConfigs } = body || {} as { name: string; deviceIds?: string[]; items?: any[]; tileConfigs?: Record<string, TileConfig> };
    if (!name || typeof name !== 'string') {
      return NextResponse.json({ success: false, error: 'name is required' }, { status: 400 });
    }
    const inserted = await db.insert(layouts).values({
      name,
      deviceIds,
      items,
      tileConfigs: tileConfigs ?? {},
      organizationId: auth.organizationId,
      createdByUserId: auth.userId,
      updatedByUserId: auth.userId,
    }).returning();
    const normalized = { ...inserted[0], tileConfigs: (inserted[0] as any).tileConfigs ?? {} };
    return NextResponse.json({ success: true, data: normalized }, { status: 201 });
  } catch (e) {
    console.error('POST /api/play/layouts error', e);
    return NextResponse.json({ success: false, error: 'Failed to create layout' }, { status: 500 });
  }
});


