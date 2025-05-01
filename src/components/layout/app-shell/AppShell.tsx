'use client';

import React from 'react';
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FiSun, FiMoon, FiMenu } from "react-icons/fi";
import FusionIcon from '@/components/icons/FusionIcon';
import { AppSidebar } from '../app-sidebar';
import { SidebarTrigger, SidebarInset } from '@/components/ui/sidebar';

// Theme Toggle Button Component (Simplified for Header)
const ThemeToggleButton = () => {
  const { setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9">
          <FiSun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <FiMoon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme("light")}>
          Light
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          Dark
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

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

          <ThemeToggleButton />
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