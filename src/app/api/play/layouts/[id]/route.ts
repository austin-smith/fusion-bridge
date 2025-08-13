import { NextRequest, NextResponse } from 'next/server';
import { withOrganizationAuth, type OrganizationAuthContext } from '@/lib/auth/withOrganizationAuth';
import type { RouteContext } from '@/lib/auth/withApiRouteAuth';
import { db } from '@/data/db';
import { layouts } from '@/data/db/schema';
import { and, eq } from 'drizzle-orm';

export const PATCH = withOrganizationAuth(async (req: NextRequest, auth: OrganizationAuthContext, ctx: RouteContext<{ id: string }>) => {
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const { name, deviceIds, items } = body || {};
    const update: any = { updatedByUserId: auth.userId, updatedAt: new Date() };
    if (typeof name === 'string') update.name = name;
    if (Array.isArray(deviceIds)) update.deviceIds = deviceIds;
    if (Array.isArray(items)) update.items = items;
    const updated = await db.update(layouts)
      .set(update)
      .where(and(eq(layouts.id, id), eq(layouts.organizationId, auth.organizationId)))
      .returning();
    if (updated.length === 0) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true, data: updated[0] });
  } catch (e) {
    console.error('PATCH /api/play/layouts/:id error', e);
    return NextResponse.json({ success: false, error: 'Failed to update layout' }, { status: 500 });
  }
});

export const DELETE = withOrganizationAuth(async (req: NextRequest, auth: OrganizationAuthContext, ctx: RouteContext<{ id: string }>) => {
  try {
    const { id } = await ctx.params;
    await db.delete(layouts).where(and(eq(layouts.id, id), eq(layouts.organizationId, auth.organizationId)));
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('DELETE /api/play/layouts/:id error', e);
    return NextResponse.json({ success: false, error: 'Failed to delete layout' }, { status: 500 });
  }
});


