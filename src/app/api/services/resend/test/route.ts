import { NextRequest, NextResponse } from 'next/server';
import { withApiRouteAuth, type ApiRouteAuthContext } from '@/lib/auth/withApiRouteAuth';
import { z } from 'zod';
import { getResendConfiguration } from '@/data/repositories/service-configurations';
import TestEmail from '@/emails/TestEmail';
import { sendEmail } from '@/services/email/send-email';

const TestRequestSchema = z.object({
  to: z.string().email('Valid recipient email is required'),
  subject: z.string().max(120).optional(),
});

export const POST = withApiRouteAuth(async (req: NextRequest, authContext: ApiRouteAuthContext) => {
  try {
    if ((authContext.user as any)?.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const parsed = TestRequestSchema.safeParse(body);
    if (!parsed.success) {
      const details = parsed.error.issues?.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })) ?? [];
      return NextResponse.json(
        { success: false, error: 'Invalid request body', details },
        { status: 400 }
      );
    }

    const config = await getResendConfiguration();
    if (!config) {
      return NextResponse.json({ success: false, error: 'Resend is not configured.' }, { status: 400 });
    }
    if (!config.isEnabled) {
      return NextResponse.json({ success: false, error: 'Resend service is disabled.' }, { status: 400 });
    }
    if (!config.apiKey || !config.fromEmail) {
      return NextResponse.json({ success: false, error: 'Missing API key or From email in configuration.' }, { status: 400 });
    }

    const reactEmail = TestEmail({ who: parsed.data.to, appName: 'Fusion' });
    const textEmail = `Hello,\n\nThis is a verification that your Resend configuration works. We attempted to send this to: ${parsed.data.to}.\n\nIf you did not expect this message, you can ignore it.\n— Fusion`;

    const { success, error, id } = await sendEmail({
      to: parsed.data.to,
      subject: parsed.data.subject ?? 'Fusion test email',
      react: reactEmail,
      text: textEmail,
    });

    if (!success) {
      return NextResponse.json({ success: false, error }, { status: 400 });
    }

    return NextResponse.json({ success: true, id });
  } catch (err) {
    console.error('[API /api/services/resend/test] Error:', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
});


