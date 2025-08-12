import * as React from 'react';
import { Heading, Text, Section } from '@react-email/components';
import BaseEmailLayout from './layouts/BaseEmailLayout';

export interface TestEmailProps {
  who: string;
  appName?: string;
  testId?: string;
}

export function TestEmail({ who, appName = 'Fusion', testId }: TestEmailProps) {
  const previewText = `${appName} test email`;
  return (
    <BaseEmailLayout previewText={previewText} heading={appName}>
      <Heading className="text-xl font-semibold text-center text-text">{appName} Email Test</Heading>
      <Section className="mt-6">
        <Text className="text-sm text-text">Hello,</Text>
        <Text className="text-sm text-text">
          This is a verification that your Resend configuration works. We attempted to send this to: <strong>{who}</strong>.
        </Text>
        {testId && <Text className="text-xs text-muted">Test ID: {testId}</Text>}
      </Section>
      <Text className="text-xs text-muted mt-8 text-center">If you did not expect this message, you can ignore it.</Text>
    </BaseEmailLayout>
  );
}

export default TestEmail;


