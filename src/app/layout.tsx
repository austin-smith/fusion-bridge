import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import localFont from 'next/font/local';
import '@/styles/globals.css';
import AppShell from '@/components/layout/app-shell/AppShell';
import { ClientLayout } from '@/components/layout/client-layout';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

const csgFont = localFont({
  src: '../assets/fonts/CsgFont.otf',
  variable: '--font-csg',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Fusion Bridge',
  description: 'A local-first security integration platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning> 
      <body className={`${inter.variable} ${csgFont.variable} font-sans`}>
        {/* Wrap AppShell and children with ClientLayout */}
        <ClientLayout>
          <AppShell>
            {children}
          </AppShell>
        </ClientLayout>
      </body>
    </html>
  );
} 