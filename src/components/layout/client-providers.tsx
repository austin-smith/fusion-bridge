'use client';

import React, { createContext } from 'react';
import { useFusionStore } from '@/stores/store';
import toast from 'react-hot-toast';
import { ThemeProvider } from "@/components/common/theme-provider";
import { ToasterProvider } from '@/components/common/toaster-provider';
import { ServerInit } from '@/components/layout/server-init';
import { SidebarProvider } from '@/components/ui/sidebar';
import { ChatAIAssistant } from '@/components/features/ai-assistant/ChatAIAssistant';

// Component to handle global state effects like toasts
function GlobalStateEffects() {
  const { error, setError } = useFusionStore();

  React.useEffect(() => {
    if (error) {
      toast.error(error);
      setError(null); // Clear the error from the store after showing
    }
  }, [error, setError]);

  return null;
}

interface ClientProvidersProps {
  children: React.ReactNode;
  initialSidebarOpen?: boolean;
  initialUserRole?: string | null;
}

export const AuthContext = createContext<{ initialUserRole: string | null }>({ initialUserRole: null });

export function ClientProviders({ children, initialSidebarOpen = true, initialUserRole = null }: ClientProvidersProps) {
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
      <AuthContext.Provider value={{ initialUserRole }}>
        <SidebarProvider defaultOpen={initialSidebarOpen}>
          {children}
          <ChatAIAssistant />
        </SidebarProvider>
      </AuthContext.Provider>
    </ThemeProvider>
  );
} 