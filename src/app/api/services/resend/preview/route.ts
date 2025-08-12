import { NextRequest, NextResponse } from 'next/server';
import { withApiRouteAuth, type ApiRouteAuthContext } from '@/lib/auth/withApiRouteAuth';
import { render } from '@react-email/render';
import { getEmailTemplate, listEmailTemplates } from '@/emails/registry';

export const GET = withApiRouteAuth(async (req: NextRequest, authContext: ApiRouteAuthContext) => {
  if ((authContext.user as any)?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const url = new URL(req.url);
    const templateKey = url.searchParams.get('template') || 'test';
    const template = getEmailTemplate(templateKey);
    if (!template) {
      return NextResponse.json(
        { error: `Unknown template. Allowed: ${listEmailTemplates().map(t => t.key).join(', ')}` },
        { status: 400 }
      );
    }
    const props = template.buildPreviewProps(url.searchParams);
    const reactEmail = template.render(props);
    const html = await render(reactEmail);
    const text = await render(reactEmail, { plainText: true });

    return NextResponse.json({ html, text }, { status: 200 });
  } catch (err) {
    console.error('[API /api/services/resend/preview] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});


