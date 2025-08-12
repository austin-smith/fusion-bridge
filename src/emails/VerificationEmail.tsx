import * as React from 'react';
import { Heading, Text, Section, Button } from '@react-email/components';
import BaseEmailLayout from '@/emails/layouts/BaseEmailLayout';

export interface VerificationEmailProps {
  verificationUrl: string;
  email: string;
  appName?: string;
}

export function VerificationEmail({ verificationUrl, email, appName = 'Fusion' }: VerificationEmailProps) {
  const previewText = `Verify your email address for ${appName}`;
  return (
    <BaseEmailLayout previewText={previewText} heading={appName}>
      <Heading className="text-xl font-semibold text-center text-text">Verify your email</Heading>
      <Section className="mt-6 space-y-4">
        <Text className="text-sm text-text">Hi,</Text>
        <Text className="text-sm text-text">
          Please confirm that <strong>{email}</strong> is your email address.
        </Text>
        <div className="mt-4 text-center">
          <Button
            href={verificationUrl}
            className="box-border inline-block rounded bg-brand px-4 py-2 text-center text-sm font-medium text-white"
          >
            Verify email
          </Button>
        </div>
        <Text className="text-xs text-muted mt-6">
          If the button does not work, copy and paste this link into your browser:
          <br />
          <a href={verificationUrl} className="underline break-all">{verificationUrl}</a>
        </Text>
      </Section>
      <Text className="text-xs text-muted mt-8 text-center">
        If you did not create an account, you can safely ignore this email.
      </Text>
    </BaseEmailLayout>
  );
}

export default VerificationEmail;


