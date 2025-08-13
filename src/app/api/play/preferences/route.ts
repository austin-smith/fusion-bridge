import { NextResponse, type NextRequest } from 'next/server';
import { withOrganizationAuth } from '@/lib/auth/withOrganizationAuth';
import { and, eq } from 'drizzle-orm';
import { db, userLayoutPreferences, layouts } from '@/data/db';

type Prefs = { defaultLayoutId: string | null };

export const GET = withOrganizationAuth(async (req: NextRequest, authCtx) => {
  const userId = authCtx.userId;
  const organizationId = authCtx.organizationId;

  const rows = await db.select().from(userLayoutPreferences)
    .where(and(
      eq(userLayoutPreferences.userId, userId),
      eq(userLayoutPreferences.organizationId, organizationId),
    ))
    .limit(1);

  if (rows.length === 0) {
    const data: Prefs = { defaultLayoutId: null };
    return NextResponse.json({ success: true, data });
  }

  const row = rows[0];
  const data: Prefs = { defaultLayoutId: row.defaultLayoutId ?? null };
  return NextResponse.json({ success: true, data });
});

export const PATCH = withOrganizationAuth(async (req: NextRequest, authCtx) => {
  const userId = authCtx.userId;
  const organizationId = authCtx.organizationId;

  let body: Partial<Prefs> = {};
  try {
    body = await req.json();
  } catch {
    // ignore
  }

  let nextDefault: string | null | undefined = body.defaultLayoutId;

  // Normalize inputs
  if (typeof nextDefault === 'string' && nextDefault.trim() === '') nextDefault = null;

  // Validate layout ids belong to the same organization
  if (typeof nextDefault === 'string') {
    const valid = await db.select({ id: layouts.id }).from(layouts)
      .where(and(eq(layouts.organizationId, organizationId), eq(layouts.id, nextDefault)))
      .limit(1);
    if (valid.length === 0) {
      return NextResponse.json({ success: false, error: 'defaultLayoutId is invalid for this organization' }, { status: 400 });
    }
  }

  // Read existing
  const existing = await db.select().from(userLayoutPreferences)
    .where(and(
      eq(userLayoutPreferences.userId, userId),
      eq(userLayoutPreferences.organizationId, organizationId),
    ))
    .limit(1);

  const current: Prefs = existing.length > 0
    ? { defaultLayoutId: existing[0].defaultLayoutId ?? null }
    : { defaultLayoutId: null };

  const updated: Prefs = {
    defaultLayoutId: typeof nextDefault !== 'undefined' ? nextDefault : current.defaultLayoutId,
  };

  if (existing.length === 0) {
    await db.insert(userLayoutPreferences).values({
      userId,
      organizationId,
      defaultLayoutId: updated.defaultLayoutId,
    });
  } else {
    await db.update(userLayoutPreferences)
      .set({
        defaultLayoutId: updated.defaultLayoutId,
        updatedAt: new Date(),
      })
      .where(and(
        eq(userLayoutPreferences.userId, userId),
        eq(userLayoutPreferences.organizationId, organizationId),
      ));
  }

  return NextResponse.json({ success: true, data: updated });
});


