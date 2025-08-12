import * as React from 'react';
import { Html, Head, Preview, Tailwind, Body, Container, Section, Text } from '@react-email/components';
import emailTailwindConfig from '@/emails/tailwind.email.config';
import FusionIcon from '@/components/icons/FusionIcon';

interface BaseEmailLayoutProps {
  previewText?: string;
  heading?: string;
  children: React.ReactNode;
}

export function BaseEmailLayout({ previewText, heading = 'Fusion', children }: BaseEmailLayoutProps) {
  return (
    <Html lang="en">
      <Head />
      {previewText ? <Preview>{previewText}</Preview> : null}
      <Tailwind config={emailTailwindConfig as any}>
        <Body className="bg-bg my-auto mx-auto font-sans">
          <Section className="w-full bg-bg">
            <Container className="mx-auto py-6 w-[600px]">
              <div className="text-center mb-2">
                <FusionIcon width={28} height={28} className="text-brand inline-block" />
              </div>
              <Text className="m-0 p-0 text-base font-semibold text-text text-center">{heading}</Text>
            </Container>
          </Section>
          <Container className="my-0 mx-auto px-6 pb-10 w-[600px]">
            {children}
          </Container>
          <Section className="w-full">
            <Container className="mx-auto w-[600px]">
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


