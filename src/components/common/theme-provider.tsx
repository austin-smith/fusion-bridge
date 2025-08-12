'use client'

import * as React from 'react'
import { ThemeProvider as NextThemesProvider, type ThemeProviderProps } from 'next-themes'

export const PREFERRED_THEME_FAMILY_KEY = 'user-preferred-theme-family'; // e.g., 'default' or 'cosmic-night'

// Single source of truth
export const THEME_FAMILY_OPTIONS = [
  { value: 'default', label: 'Default' },
  { value: 'cosmic-night', label: 'Cosmic Night' },
  { value: 'mono', label: 'Mono' },
  { value: 't3-chat', label: 'T3 Chat' },
] as const;

export type ThemeFamilyOption = typeof THEME_FAMILY_OPTIONS[number];
export type ThemeFamilyValue = ThemeFamilyOption['value'];
export type KnownFamily = Exclude<ThemeFamilyValue, 'default'>;

export const THEME_FAMILIES = THEME_FAMILY_OPTIONS
  .filter((o) => o.value !== 'default')
  .map((o) => o.value) as readonly KnownFamily[];

export function isKnownFamily(value: string): value is KnownFamily {
  return (THEME_FAMILIES as readonly string[]).includes(value);
}

export function removeAllThemeFamilyClasses(target: DOMTokenList) {
  THEME_FAMILIES.forEach((fam) => target.remove(fam));
}

export function applyThemeFamilyClass(preferredFamily: string | null) {
  const classList = document.documentElement.classList;
  removeAllThemeFamilyClasses(classList);
  if (preferredFamily && preferredFamily !== 'default' && isKnownFamily(preferredFamily)) {
    classList.add(preferredFamily);
  }
}

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  // Only listen for cross-tab changes. Initial apply is handled server-side via cookie.
  React.useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === PREFERRED_THEME_FAMILY_KEY) {
        try {
          applyThemeFamilyClass(event.newValue);
        } catch {
          // no-op
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  return (
    <NextThemesProvider
      {...props}
      attribute="class"
      defaultTheme="system"
      enableSystem={true}
      themes={['light', 'dark', 'system']}
    >
      {children}
    </NextThemesProvider>
  )
} 