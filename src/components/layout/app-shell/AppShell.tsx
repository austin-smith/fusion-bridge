'use client';

import React, { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useTheme } from "next-themes";
import { FiMenu } from "react-icons/fi";
import { AppSidebar } from '../app-sidebar';
import { SidebarTrigger, SidebarInset } from '@/components/ui/sidebar';
import { ThemeToggle } from '@/components/common/theme-toggle';
import { getPageConfig } from '@/lib/page-config';
import dynamic from 'next/dynamic';
import { useFusionStore } from '@/stores/store';

const ClientBreadcrumb = dynamic(() => import('../page-breadcrumb').then(mod => ({ default: mod.PageBreadcrumb })), { 
  ssr: false 
});

interface AppShellProps {
  children: React.ReactNode;
}

const AppShell: React.FC<AppShellProps> = ({ children }) => {
  const pathname = usePathname();
  const showSidebar = !['/login', '/setup', '/verify-2fa', '/create-password'].includes(pathname);
  
  // Get page configuration from comprehensive page config
  const pageInfo = getPageConfig(pathname);
  const locations = useFusionStore(state => state.locations);

  // Enhance breadcrumbs with dynamic location name for location-scoped routes (no ID fallback to avoid flicker)
  let enhancedBreadcrumbs = pageInfo?.breadcrumbs;
  if (pageInfo?.breadcrumbs && /^\/locations\/([^\/]+)\/floor-plans/.test(pathname)) {
    const match = pathname.match(/^\/locations\/([^\/]+)\//);
    const locationId = match?.[1];
    const location = locations.find((l) => l.id === locationId);
    if (location) {
      const crumbs = [...pageInfo.breadcrumbs];
      const last = crumbs.pop();
      if (last) {
        crumbs.push({ label: location.name });
        crumbs.push(last);
      }
      enhancedBreadcrumbs = crumbs;
    } else {
      // Until location is available, keep default breadcrumbs without inserting ID
      enhancedBreadcrumbs = pageInfo.breadcrumbs;
    }
  }

  // Automatically set document title
  useEffect(() => {
    if (pageInfo?.title) {
      document.title = `${pageInfo.title} // Fusion`;
    }
  }, [pageInfo?.title]);

  return (
    <>
      {showSidebar ? (
        <>
          <AppSidebar />
          <SidebarInset className="flex flex-col w-full max-w-full overflow-hidden">
            <header className="sticky top-0 z-40 w-full flex h-[60px] items-center border-b bg-background/95 px-4 backdrop-blur md:px-6 max-w-full shrink-0">
              <SidebarTrigger className="mr-2">
                <FiMenu className="h-5 w-5" />
                <span className="sr-only">Toggle Sidebar</span>
              </SidebarTrigger>
              
              <div className="flex-1">
                {enhancedBreadcrumbs && (
                  <ClientBreadcrumb breadcrumbs={enhancedBreadcrumbs} />
                )}
              </div>

              <ThemeToggle />
            </header>

            <div className="flex-1 w-full max-w-full overflow-hidden">
              <div className="h-full w-full overflow-auto">
                <div className="w-full max-w-full h-full">
                  <main className="flex flex-col h-full min-h-0 overflow-auto p-4">
                    {children}
                  </main>
                </div>
              </div>
            </div>

            <footer className="border-t bg-muted/40 py-3 px-4 md:px-6 w-full max-w-full shrink-0">
              <div className="text-center text-sm text-muted-foreground">
                © {new Date().getFullYear()} Cook Solutions Group
              </div>
            </footer>
          </SidebarInset>
        </>
      ) : (
        <div className="flex h-screen w-full items-center justify-center p-6 md:p-10">
          <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
            {children}
          </main>
        </div>
      )}
    </>
  );
};

export default AppShell; 