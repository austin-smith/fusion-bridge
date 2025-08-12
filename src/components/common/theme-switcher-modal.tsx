'use client';

import React, { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { Sun, Moon, Monitor, Check } from 'lucide-react';
import { PREFERRED_THEME_FAMILY_KEY, THEME_FAMILY_OPTIONS, applyThemeFamilyClass, setThemeFamilyCookie } from '@/components/common/theme-provider';

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
  const [themeFamily, setThemeFamily] = useState<string>('default');
  const [familyDotColor, setFamilyDotColor] = useState<Record<string, string>>({});
  const [suspendAutoClose, setSuspendAutoClose] = useState(false);

  // Detect if user is holding Cmd/Ctrl to suspend auto-close
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) setSuspendAutoClose(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Meta' || e.key === 'Control') setSuspendAutoClose(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  // Detect platform
  useEffect(() => {
    setIsMac(/Mac|iPod|iPhone|iPad/.test(navigator.platform));
  }, []);

  // Auto-close after a delay when theme changes (disabled while holding modifier)
  useEffect(() => {
    if (!isOpen || suspendAutoClose) return;
    const timer = setTimeout(() => {
      onClose();
    }, 1500);
    return () => clearTimeout(timer);
  }, [theme, isOpen, onClose, suspendAutoClose]);

  // Load current theme family from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(PREFERRED_THEME_FAMILY_KEY) ?? 'default';
      setThemeFamily(stored);
    } catch {
      setThemeFamily('default');
    }
  }, []);

  // Compute color dots for theme families when the modal opens
  useEffect(() => {
    if (!isOpen) return;
    try {
      const root = document.documentElement;
      const originalClasses = Array.from(root.classList);
      const allFamilies = THEME_FAMILY_OPTIONS.map((opt) => opt.value);

      const nextDots: Record<string, string> = {};

      // Helper: apply a family, read --primary, then clean up
      const readPrimaryForFamily = (family: string) => {
        // Restore original classes first to avoid compounding
        root.className = '';
        originalClasses.forEach((cls) => root.classList.add(cls));
        // Remove all theme families
        allFamilies.forEach((fam) => root.classList.remove(fam));
        // Apply this family if not default
        if (family !== 'default') root.classList.add(family);
        const cssValue = getComputedStyle(root).getPropertyValue('--primary').trim();
        return cssValue;
      };

      for (const fam of allFamilies) {
        nextDots[fam] = readPrimaryForFamily(fam);
      }

      // Restore original classes
      root.className = '';
      originalClasses.forEach((cls) => root.classList.add(cls));

      setFamilyDotColor(nextDots);
    } catch {
      // no-op if computed style fails
    }
  }, [isOpen]);

  const handleThemeSelect = (themeValue: string, e?: React.MouseEvent<HTMLButtonElement> | React.KeyboardEvent<HTMLButtonElement>) => {
    setTheme(themeValue);
    // If user is holding a modifier (Cmd/Ctrl), keep the modal open
    const isHoldingModifier = !!e && ((e as any).metaKey || (e as any).ctrlKey);
    if (!isHoldingModifier) {
      onClose();
    }
  };

  const handleThemeFamilySelect = (familyValue: string) => {
    try {
      localStorage.setItem(PREFERRED_THEME_FAMILY_KEY, familyValue);
      setThemeFamilyCookie(familyValue);
      setThemeFamily(familyValue);

      applyThemeFamilyClass(familyValue);
    } catch {
      // no-op
    }
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
                  onClick={(e) => handleThemeSelect(option.value, e)}
                  className={cn(
                    "w-full flex items-center justify-between rounded-lg border transition-all duration-200",
                    "py-3 px-4",
                    "hover:bg-muted/50 focus:outline-none",
                    isCurrent 
                      ? "bg-primary/10 border-primary" 
                      : "border-border hover:border-muted-foreground"
                  )}
                >
                  <div className="flex items-center space-x-3">
                    <div className={cn(
                      "p-1.5 rounded-md transition-colors",
                      isCurrent ? "bg-primary text-primary-foreground" : "bg-muted"
                    )}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="font-medium">{option.label}</span>
                  </div>
                  {isCurrent && (
                    <Check className="h-4 w-4 text-primary" aria-hidden="true" />
                  )}
                </button>
              );
            })}
          </div>

          <div className="pt-4">
            <h3 className="text-sm font-medium mb-2">Theme Family</h3>
            <div className="space-y-1.5">
              {THEME_FAMILY_OPTIONS.map((option) => {
                const isCurrent = option.value === themeFamily;
                return (
                  <button
                    key={option.value}
                    onClick={() => handleThemeFamilySelect(option.value)}
                    className={cn(
                      'w-full relative overflow-hidden flex items-center justify-between rounded-lg border transition-all duration-200',
                      'py-2 px-3',
                      'hover:bg-muted/50 focus:outline-none',
                      isCurrent ? 'bg-primary/10 border-primary' : 'border-border hover:border-muted-foreground'
                    )}
                  >
                    <span
                      className="absolute inset-y-0 left-0 w-1"
                      style={{ backgroundColor: familyDotColor[option.value] || 'currentColor' }}
                      aria-hidden="true"
                    />
                    <span className="font-medium text-sm flex items-center">{option.label}</span>
                    {isCurrent && (
                      <Check className="h-3 w-3 text-primary" aria-hidden="true" />
                    )}
                  </button>
                );
              })}
            </div>
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
