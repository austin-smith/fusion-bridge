'use client';

import React, { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { Sun, Moon, Monitor } from 'lucide-react';

interface ThemeSwitcherModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ThemeOption {
  value: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const themeOptions: ThemeOption[] = [
  {
    value: 'light',
    label: 'Light',
    icon: Sun
  },
  {
    value: 'dark',
    label: 'Dark',
    icon: Moon
  },
  {
    value: 'system',
    label: 'System',
    icon: Monitor
  }
];

export function ThemeSwitcherModal({ isOpen, onClose }: ThemeSwitcherModalProps) {
  const { theme, setTheme } = useTheme();
  const [isMac, setIsMac] = useState(false);

  // Detect platform
  useEffect(() => {
    setIsMac(/Mac|iPod|iPhone|iPad/.test(navigator.platform));
  }, []);

  // Auto-close after a delay when theme changes
  useEffect(() => {
    if (!isOpen) return;
    
    const timer = setTimeout(() => {
      onClose();
    }, 1500); // Auto-close after 1.5 seconds

    return () => clearTimeout(timer);
  }, [theme, isOpen, onClose]);

  const handleThemeSelect = (themeValue: string) => {
    setTheme(themeValue);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md p-0 gap-0 border-2 shadow-2xl">
        <DialogTitle className="sr-only">Switch Theme</DialogTitle>
        <div className="p-6 space-y-4">
          <div className="text-center space-y-2">
            <h2 className="text-lg font-semibold">Switch Theme</h2>
          </div>
          
          <div className="space-y-2">
            {themeOptions.map((option) => {
              const Icon = option.icon;
              const isCurrent = option.value === theme;
              
              return (
                <button
                  key={option.value}
                  onClick={() => handleThemeSelect(option.value)}
                  className={cn(
                    "w-full flex items-center space-x-4 p-4 rounded-lg border transition-all duration-200",
                    "hover:bg-muted/50 focus:outline-none",
                    isCurrent 
                      ? "bg-primary/10 border-primary" 
                      : "border-border hover:border-muted-foreground"
                  )}
                >
                  <div className={cn(
                    "p-2 rounded-md transition-colors",
                    isCurrent ? "bg-primary text-primary-foreground" : "bg-muted"
                  )}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="font-medium">{option.label}</span>
                </button>
              );
            })}
          </div>
          
          <div className="pt-2 border-t text-center">
            <p className="text-xs text-muted-foreground">
              Use <kbd className="px-1.5 py-0.5 text-xs font-mono bg-muted rounded">
                {isMac ? '⌘J' : 'Ctrl+J'}
              </kbd> to cycle themes
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
