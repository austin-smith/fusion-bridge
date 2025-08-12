'use client'

import * as React from 'react'
import { ThemeProvider as NextThemesProvider, type ThemeProviderProps } from 'next-themes'
import {
  PREFERRED_THEME_FAMILY_KEY,
  THEME_FAMILIES,
  THEME_FAMILY_OPTIONS,
  isKnownFamily,
  THEME_FAMILY_COOKIE_MAX_AGE_SECONDS,
} from '@/lib/theme/constants';

export { PREFERRED_THEME_FAMILY_KEY, THEME_FAMILIES, THEME_FAMILY_OPTIONS, isKnownFamily } from '@/lib/theme/constants';
export type { KnownFamily, ThemeFamilyOption, ThemeFamilyValue } from '@/lib/theme/constants';

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

export function setThemeFamilyCookie(value: string) {
  try {
    const secure = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${PREFERRED_THEME_FAMILY_KEY}=${encodeURIComponent(value)}; path=/; max-age=${THEME_FAMILY_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
  } catch {
    // no-op
  }
}

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
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