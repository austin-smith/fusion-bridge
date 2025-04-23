'use client';

import React, { useState, useEffect } from 'react';
import NavMenu, { collapsedNavWidth, expandedNavWidth } from '../nav-menu/NavMenu';
import { cn } from '@/lib/utils'; // Import cn utility
import { useTheme } from "next-themes"; // Import useTheme hook
import { Button } from "@/components/ui/button"; // Import Button
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"; // Import DropdownMenu
import { FiSun, FiMoon } from "react-icons/fi"; // Import icons
import FusionIcon from '@/components/icons/FusionIcon'; // Import the new icon

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
  // Initialize state to null until client-side check
  const [isCollapsed, setIsCollapsed] = useState<boolean | null>(null);

  // Effect to read localStorage and set initial state
  useEffect(() => {
    const storedState = localStorage.getItem('navCollapsed');
    setIsCollapsed(storedState ? JSON.parse(storedState) : false);
  }, []); // Empty dependency array ensures this runs only once on mount

  // Effect to update localStorage when isCollapsed changes (and is not null)
  useEffect(() => {
    if (isCollapsed !== null) { // Only save when state is determined
      localStorage.setItem('navCollapsed', JSON.stringify(isCollapsed));
    }
  }, [isCollapsed]);

  const toggleCollapse = () => {
    // Prevent toggling if state is not yet initialized
    if (isCollapsed === null) return;
    setIsCollapsed(!isCollapsed);
  };

  // Update margin class derivation to match new NavMenu widths
  const collapsedMargin = collapsedNavWidth.replace('w-', 'ml-'); // e.g., 'ml-[70px]'
  const expandedMargin = expandedNavWidth.replace('w-', 'ml-'); // e.g., 'ml-[240px]'

  // Don't render children until hydration is complete and state is set
  if (isCollapsed === null) {
    return null; // Or return a loading skeleton/spinner
  }

  return (
    <div className="relative flex min-h-screen bg-background">
      <NavMenu isCollapsed={isCollapsed} toggleCollapse={toggleCollapse} />
      {/* Main content wrapper with dynamic margin */}
      <div
        className={cn(
          'flex flex-1 flex-col transition-all duration-300 ease-in-out',
          isCollapsed ? collapsedMargin : expandedMargin
        )}
      >
        {/* Header */}
        <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur">
          <div className="container flex h-[60px] items-center">
            <div className="flex-1 font-bold text-xl flex items-center gap-2">
              <FusionIcon className="h-6 w-6 text-primary" />
              <span className="font-csg">FUSION BRIDGE</span>
            </div>
            <ThemeToggleButton /> {/* Add Theme Toggle Button */}
          </div>
        </header>

        {/* Main Content Area - Add overflow-y-auto */}
        <main className="flex-1 py-6 overflow-y-auto">
          <div className="container">
            {children}
          </div>
        </main>

        {/* Footer - Simplified slightly */}
        <footer className="py-6 border-t bg-muted/40">
          <div className="container text-center text-sm text-muted-foreground">
            © {new Date().getFullYear()} Cook Solutions Group
          </div>
        </footer>
      </div>
    </div>
  );
};

export default AppShell; 