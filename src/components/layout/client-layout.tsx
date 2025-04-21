'use client';

import { useEffect } from 'react';
import { useFusionStore } from '@/stores/store';
import toast from 'react-hot-toast';
import { ThemeProvider } from "@/components/common/theme-provider";
import { ToasterProvider } from '@/components/common/toaster-provider';
import { ServerInit } from '@/components/layout/server-init';

// Component to handle global state effects like toasts
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

interface ClientLayoutProps {
  children: React.ReactNode;
}

export function ClientLayout({ children }: ClientLayoutProps) {
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
      {children} 
    </ThemeProvider>
  );
} 