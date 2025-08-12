import type { ReactElement } from 'react';
import { getResendConfiguration } from '@/data/repositories/service-configurations';
import { sendResendEmail } from '@/services/drivers/resend';

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  react?: ReactElement;
  html?: string;
  text?: string;
  replyToEmail?: string;
}

export interface SendEmailResult {
  success: boolean;
  id?: string;
  error?: string;
}

/**
 * Application-level email sender that reads Resend configuration
 * and dispatches via the Resend driver. Keeps routes/components thin.
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const config = await getResendConfiguration();
  if (!config) {
    return { success: false, error: 'Resend is not configured.' };
  }
  if (!config.isEnabled) {
    return { success: false, error: 'Resend service is disabled.' };
  }
  if (!config.apiKey || !config.fromEmail) {
    return { success: false, error: 'Missing API key or From email in configuration.' };
  }

  const { to, subject, react, html, text, replyToEmail } = params;

  return await sendResendEmail(config.apiKey, {
    fromEmail: config.fromEmail,
    fromName: config.fromName,
    replyToEmail: replyToEmail ?? config.replyToEmail,
    to,
    subject,
    react,
    html,
    text,
  });
}


