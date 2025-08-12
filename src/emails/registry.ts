import * as React from 'react';
import { TestEmail, type TestEmailProps } from '@/emails/TestEmail';
import { VerificationEmail, type VerificationEmailProps } from '@/emails/VerificationEmail';

export type EmailTemplateKey = 'test' | 'verification';

interface EmailTemplateDefinition<P> {
  key: EmailTemplateKey;
  label: string;
  // Build props for preview from query params
  buildPreviewProps: (params: URLSearchParams) => P;
  // Render the React element for this email
  render: (props: P) => React.ReactElement;
}

type TemplateMap = {
  test: EmailTemplateDefinition<TestEmailProps>;
  verification: EmailTemplateDefinition<VerificationEmailProps>;
};

const templates: TemplateMap = {
  test: {
    key: 'test',
    label: 'Test Email',
    buildPreviewProps: (params) => ({
      who: params.get('to') || 'you@example.com',
      appName: 'Fusion',
    }),
    render: (props) => React.createElement(TestEmail, props),
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
    render: (props) => React.createElement(VerificationEmail, props),
  },
};

export function getEmailTemplate<K extends EmailTemplateKey>(key: K): TemplateMap[K] | null;
export function getEmailTemplate(key: string): TemplateMap[keyof TemplateMap] | null;
export function getEmailTemplate(key: string) {
  return (templates as Record<string, TemplateMap[keyof TemplateMap]>)[key] || null;
}

export function listEmailTemplates(): Array<{ key: EmailTemplateKey; label: string }> {
  return Object.values(templates).map(({ key, label }) => ({ key, label }));
}



