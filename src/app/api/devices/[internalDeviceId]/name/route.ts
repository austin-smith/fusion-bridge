import { NextRequest, NextResponse } from 'next/server';
import { withOrganizationAuth, type OrganizationAuthContext } from '@/lib/auth/withOrganizationAuth';
import type { RouteContext } from '@/lib/auth/withApiRouteAuth';
import { db } from '@/data/db';
import { devices as devicesTable } from '@/data/db/schema';
import { eq } from 'drizzle-orm';
import { requestDeviceRename } from '@/lib/device-actions';

type PatchBody = { name?: string };

export const PATCH = withOrganizationAuth(async (
  request: NextRequest,
  authContext: OrganizationAuthContext,
  context: RouteContext<{ internalDeviceId: string }>
) => {
  try {
    if (!context?.params) {
      return NextResponse.json({ success: false, error: 'Missing route parameters' }, { status: 400 });
    }
    const { internalDeviceId } = await context.params;

    let body: PatchBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    const rawName = (body.name ?? '').toString();
    const name = rawName.trim();
    if (!name) {
      return NextResponse.json({ success: false, error: 'Name is required' }, { status: 400 });
    }
    if (name.length > 100) {
      return NextResponse.json({ success: false, error: 'Name is too long (max 100)' }, { status: 400 });
    }

    // Use the device actions service layer for all the heavy lifting
    await requestDeviceRename(internalDeviceId, name);

    const warnings: string[] = [];
    try {
      await db.update(devicesTable)
        .set({ name, updatedAt: new Date() })
        .where(eq(devicesTable.id, internalDeviceId));
    } catch (e) {
      // Remote rename succeeded; record a warning for local persist failure
      console.error(`[API Device Rename] Failed to update local DB for ${internalDeviceId}:`, e);
      warnings.push('Remote rename succeeded, but local persist failed; name will reconcile on next sync.');
    }

    return NextResponse.json({ success: true, data: { name }, ...(warnings.length ? { warnings } : {}) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});




