'use client';

import React, { useState, useEffect } from 'react';
import { useFusionStore } from '@/stores/store';
import toast from 'react-hot-toast';
import { ThemeProvider } from "@/components/common/theme-provider";
import { ToasterProvider } from '@/components/common/toaster-provider';
import { ServerInit } from '@/components/layout/server-init';
import { SidebarProvider } from '@/components/ui/sidebar';

const LOCAL_STORAGE_SIDEBAR_KEY = 'sidebar_state';

// Component to handle global state effects like toasts (moved from ClientLayout)
function GlobalStateEffects() {
  const { error, setError } = useFusionStore();

  useEffect(() => {
    if (error) {
      toast.error(error);
      setError(null); // Clear the error from the store after showing
    }
  }, [error, setError]);

  return null;
}

interface ClientProvidersProps {
  children: React.ReactNode;
}

export function ClientProviders({ children }: ClientProvidersProps) {
  // State for controlling sidebar open state, initialized to null for SSR safety (moved from ClientLayout)
  const [sidebarOpen, setSidebarOpen] = useState<boolean | null>(null);

  // Effect to load state from localStorage on mount (moved from ClientLayout)
  useEffect(() => {
    const storedState = localStorage.getItem(LOCAL_STORAGE_SIDEBAR_KEY);
    // Default to true (expanded) if nothing is stored
    setSidebarOpen(storedState ? JSON.parse(storedState) : true);
  }, []); // Empty dependency array ensures this runs only once on mount

  // Effect to save state to localStorage when it changes (and is not null) (moved from ClientLayout)
  useEffect(() => {
    if (sidebarOpen !== null) { // Only save when state is determined
      localStorage.setItem(LOCAL_STORAGE_SIDEBAR_KEY, JSON.stringify(sidebarOpen));
    }
  }, [sidebarOpen]);

  // Avoid rendering children until state is loaded to prevent hydration mismatch (moved from ClientLayout)
  if (sidebarOpen === null) {
    // Optionally return a loading indicator or null
    // Returning null might cause a flash, consider a skeleton if needed
    return null;
  }

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <ToasterProvider />
      <ServerInit />
      <GlobalStateEffects />
      <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
        {children}
      </SidebarProvider>
    </ThemeProvider>
  );
} 