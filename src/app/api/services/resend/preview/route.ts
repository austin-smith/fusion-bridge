import { NextRequest, NextResponse } from 'next/server';
import { withApiRouteAuth, type ApiRouteAuthContext } from '@/lib/auth/withApiRouteAuth';
import { render } from '@react-email/render';
import { getEmailTemplate, listEmailTemplates, type EmailTemplateKey } from '@/emails/registry';

export const GET = withApiRouteAuth(async (req: NextRequest, authContext: ApiRouteAuthContext) => {
  if ((authContext.user as any)?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const url = new URL(req.url);
    const templateKeyParam = url.searchParams.get('template');
    const templateKey: EmailTemplateKey = templateKeyParam === 'verification' ? 'verification' : 'test';

    // Use a branch to narrow types so props match the selected template
    if (templateKey === 'test') {
      const template = getEmailTemplate('test');
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
    }

    if (templateKey === 'verification') {
      const template = getEmailTemplate('verification');
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
    }
    // Unreachable due to exhaustive check above; return 400 to satisfy control flow
    return NextResponse.json(
      { error: `Unknown template. Allowed: ${listEmailTemplates().map(t => t.key).join(', ')}` },
      { status: 400 }
    );
  } catch (err) {
    console.error('[API /api/services/resend/preview] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});


