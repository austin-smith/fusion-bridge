import { Resend } from 'resend';
import type { ReactElement } from 'react';

export interface SendResendEmailParams {
  fromEmail: string;
  fromName?: string;
  replyToEmail?: string;
  to: string | string[];
  subject: string;
  react?: ReactElement;
  html?: string;
  text?: string;
}

export interface SendResendEmailResult {
  success: boolean;
  id?: string;
  error?: string;
}

/**
 * Thin wrapper around Resend SDK to standardize usage across the app.
 */
export async function sendResendEmail(
  apiKey: string,
  params: SendResendEmailParams
): Promise<SendResendEmailResult> {
  const client = new Resend(apiKey);

  const { fromEmail, fromName, replyToEmail, to, subject, react, html, text } = params;

  const { data, error } = await client.emails.send({
    from: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
    to,
    subject,
    react,
    html,
    text,
    replyTo: replyToEmail,
  });

  if (error) {
    return { success: false, error: String(error) };
  }

  return { success: true, id: (data as any)?.id };
}


