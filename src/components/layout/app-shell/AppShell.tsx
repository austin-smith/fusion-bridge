'use client';

import React from 'react';
import { useTheme } from "next-themes";
import { FiMenu } from "react-icons/fi";
import { AppSidebar } from '../app-sidebar';
import { SidebarTrigger, SidebarInset } from '@/components/ui/sidebar';
import { ThemeToggle } from '@/components/common/theme-toggle';

interface AppShellProps {
  children: React.ReactNode;
}

const AppShell: React.FC<AppShellProps> = ({ children }) => {
  return (
    <>
      <AppSidebar />

      <SidebarInset>
        <header className="sticky top-0 z-40 flex h-[60px] items-center border-b bg-background/95 px-4 backdrop-blur md:px-6">
          <SidebarTrigger className="mr-2">
            <FiMenu className="h-5 w-5" />
            <span className="sr-only">Toggle Sidebar</span>
          </SidebarTrigger>
          
          <div className="flex-1"></div>

          <ThemeToggle />
        </header>

        <div className="flex-1 p-4 md:p-6">
          {children}
        </div>

        <footer className="border-t bg-muted/40 p-4 md:p-6">
          <div className="text-center text-sm text-muted-foreground">
            © {new Date().getFullYear()} Cook Solutions Group
          </div>
        </footer>
      </SidebarInset>
    </>
  );
};

export default AppShell; 