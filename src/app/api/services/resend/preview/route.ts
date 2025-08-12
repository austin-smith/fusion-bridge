import { NextRequest, NextResponse } from 'next/server';
import { withApiRouteAuth, type ApiRouteAuthContext } from '@/lib/auth/withApiRouteAuth';
import TestEmail from '@/emails/TestEmail';
import { render } from '@react-email/render';

export const GET = withApiRouteAuth(async (req: NextRequest, authContext: ApiRouteAuthContext) => {
  if ((authContext.user as any)?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const url = new URL(req.url);
    const who = url.searchParams.get('to') || 'you@example.com';

    const reactEmail = TestEmail({ who, appName: 'Fusion' });
    const html = await render(reactEmail);
    const text = `Hello,\n\nThis is a verification that your Resend configuration works. We attempted to send this to: ${who}.\n\nIf you did not expect this message, you can ignore it.\n— Fusion`;

    return NextResponse.json({ html, text }, { status: 200 });
  } catch (err) {
    console.error('[API /api/services/resend/preview] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});


