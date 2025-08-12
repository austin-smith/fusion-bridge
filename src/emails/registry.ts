import * as React from 'react';
import { TestEmail } from '@/emails/TestEmail';
import { VerificationEmail } from '@/emails/VerificationEmail';

export type EmailTemplateKey = 'test' | 'verification';

interface EmailTemplateDefinition {
  key: EmailTemplateKey;
  label: string;
  // Build props for preview from query params
  buildPreviewProps: (params: URLSearchParams) => Record<string, any>;
  // Render the React element for this email
  render: (props: Record<string, any>) => React.ReactElement;
}

const templates: Record<EmailTemplateKey, EmailTemplateDefinition> = {
  test: {
    key: 'test',
    label: 'Test Email',
    buildPreviewProps: (params) => ({
      who: params.get('to') || 'you@example.com',
      appName: 'Fusion',
    }),
    render: (props) => React.createElement(TestEmail as any, props),
  },
  verification: {
    key: 'verification',
    label: 'Verification Email',
    buildPreviewProps: (params) => {
      const email = params.get('to') || 'you@example.com';
      // Use a fixed relative URL for previews (no environment-specific origin)
      const verificationUrl = '/api/auth/verify?token=preview&callbackURL=/create-password';
      return { email, verificationUrl, appName: 'Fusion' };
    },
    render: (props) => React.createElement(VerificationEmail as any, props),
  },
};

export function getEmailTemplate(key: string): EmailTemplateDefinition | null {
  return templates[key as EmailTemplateKey] || null;
}

export function listEmailTemplates(): Array<{ key: EmailTemplateKey; label: string }> {
  return Object.values(templates).map(({ key, label }) => ({ key, label }));
}



