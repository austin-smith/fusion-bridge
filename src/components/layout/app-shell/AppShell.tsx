'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { useTheme } from "next-themes";
import { FiMenu } from "react-icons/fi";
import { AppSidebar } from '../app-sidebar';
import { SidebarTrigger, SidebarInset } from '@/components/ui/sidebar';
import { ThemeToggle } from '@/components/common/theme-toggle';
import AddToHomeScreenPrompt from '@/components/common/AddToHomeScreenPrompt';

interface AppShellProps {
  children: React.ReactNode;
}

const AppShell: React.FC<AppShellProps> = ({ children }) => {
  const pathname = usePathname();
  const showSidebar = !['/login', '/setup', '/verify-2fa'].includes(pathname);

  return (
    <>
      <AddToHomeScreenPrompt />
      {showSidebar ? (
        <>
          <AppSidebar />
          <SidebarInset className="flex flex-col w-full max-w-full overflow-hidden">
            <header className="sticky top-0 z-40 w-full flex h-[60px] items-center border-b bg-background/95 px-4 backdrop-blur md:px-6 max-w-full shrink-0">
              <SidebarTrigger className="mr-2">
                <FiMenu className="h-5 w-5" />
                <span className="sr-only">Toggle Sidebar</span>
              </SidebarTrigger>
              
              <div className="flex-1"></div>

              <ThemeToggle />
            </header>

            <div className="flex-1 w-full max-w-full overflow-hidden">
              <div className="h-full w-full overflow-auto">
                <div className="w-full max-w-full p-4 md:p-6">
                  {children}
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
        <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
          {children}
        </div>
      )}
    </>
  );
};

export default AppShell; 