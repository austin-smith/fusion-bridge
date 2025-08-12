import * as React from 'react';
import { Html, Head, Preview, Tailwind, Body, Container, Section, Text, Img } from '@react-email/components';
import emailTailwindConfig from '@/emails/tailwind.email.config';

interface BaseEmailLayoutProps {
  previewText?: string;
  heading?: string;
  children: React.ReactNode;
}

export function BaseEmailLayout({ previewText, heading = 'Fusion', children }: BaseEmailLayoutProps) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || '';
  return (
    <Html lang="en">
      <Tailwind config={emailTailwindConfig as any}>
        <Head />
        {previewText ? <Preview>{previewText}</Preview> : null}
        <Body className="bg-bg my-auto mx-auto font-sans">
          <Section className="w-full bg-bg">
            <Container className="mx-auto py-6 w-full max-w-[600px]">
              <div className="text-center mb-2">
                <Img src={`${baseUrl}/email-header-logo.png`} width={300} alt="Fusion" className="inline-block" />
              </div>
            </Container>
          </Section>
          <Container className="my-0 mx-auto px-6 pb-10 w-full max-w-[600px]">
            {children}
          </Container>
          <Section className="w-full">
            <Container className="mx-auto w-full max-w-[600px]">
              <Text className="text-xs text-muted text-center">
                © {new Date().getFullYear()} Fusion
              </Text>
            </Container>
          </Section>
        </Body>
      </Tailwind>
    </Html>
  );
}

export default BaseEmailLayout;


