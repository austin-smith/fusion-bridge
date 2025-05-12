import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import localFont from 'next/font/local';
import '@/styles/globals.css';
import AppShell from '@/components/layout/app-shell/AppShell';
import { ClientProviders } from '@/components/layout/client-providers';
import { cookies, headers } from 'next/headers';
import { auth } from '@/lib/auth/server';

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
  description: 'Unify. Automate. Protect.',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/icons/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/icons/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
      { url: '/favicon.ico', type: 'image/x-icon', sizes: 'any' }
    ],
    shortcut: ['/favicon.ico'],
    apple: [
      { url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }
    ],
  },
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

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Read persisted sidebar state from cookie
  const cookieStore = await cookies();
  const sidebarCookie = cookieStore.get('sidebar_state')?.value;
  const initialSidebarOpen = sidebarCookie === 'false' ? false : true;
  
  // Read session to get initial user role
  const headersList = await headers();
  const plainHeaders: Record<string, string> = {};
  for (const [key, value] of headersList.entries()) {
    plainHeaders[key] = value;
  }
  const session = await auth.api.getSession({ headers: plainHeaders as any });
  const initialUserRole = session?.user ? (session.user as any).role : null;

  return (
    <html lang="en" suppressHydrationWarning> 
      <body className={`${inter.variable} ${csgFont.variable} font-sans`}>
        {/* Wrap AppShell and children with ClientProviders */}
        <ClientProviders initialSidebarOpen={initialSidebarOpen} initialUserRole={initialUserRole}>
          <AppShell>
            {children}
          </AppShell>
        </ClientProviders>
      </body>
    </html>
  );
} 