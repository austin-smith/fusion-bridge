import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import localFont from 'next/font/local';
import '@/styles/globals.css';
import AppShell from '@/components/layout/app-shell/AppShell';
import { ClientProviders } from '@/components/layout/client-providers';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

const csgFont = localFont({
  src: '../assets/fonts/CsgFont.otf',
  variable: '--font-csg',
  display: 'swap',
  fallback: ['Arial']
});

export const metadata: Metadata = {
  metadataBase: new URL('https://fusion-bridge-production.up.railway.app'),
  title: 'Fusion',
  description: 'Scurity integration platform',
  openGraph: {
    images: [
      {
        url: '/opengraph-image.png',
        width: 1200,
        height: 630,
      },
    ],
    title: 'Fusion',
    description: 'Unify. Automate. Protect.',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning> 
      <body className={`${inter.variable} ${csgFont.variable} font-sans`}>
        {/* Wrap AppShell and children with ClientProviders */}
        <ClientProviders>
          <AppShell>
            {children}
          </AppShell>
        </ClientProviders>
      </body>
    </html>
  );
} 