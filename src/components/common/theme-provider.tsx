'use client'

import * as React from 'react'
import { ThemeProvider as NextThemesProvider, type ThemeProviderProps } from 'next-themes'

export const PREFERRED_THEME_FAMILY_KEY = 'user-preferred-theme-family'; // e.g., 'default' or 'cosmic-night'

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  // Effect to apply the theme family class from localStorage
  React.useEffect(() => {
    const applyThemeFamily = () => {
      const preferredFamily = localStorage.getItem(PREFERRED_THEME_FAMILY_KEY);
      const classList = document.documentElement.classList;
      
      classList.remove('cosmic-night', 't3-chat', 'macos7', 'mono'); // Remove all known theme family classes first

      if (preferredFamily === 'cosmic-night') {
        classList.add('cosmic-night');
      } else if (preferredFamily === 't3-chat') {
        classList.add('t3-chat');
      } else if (preferredFamily === 'mono') {
        classList.add('mono');
      }
      // If preferredFamily is 'default' or something else, no specific family class is added.
    };

    applyThemeFamily(); // Apply on initial mount

    // Listen for changes to this specific localStorage item from other tabs/windows
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === PREFERRED_THEME_FAMILY_KEY) {
        applyThemeFamily();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  return (
    <NextThemesProvider
      {...props} // Spread incoming props first
      attribute="class" // Ensure class attribute is used for theming
      defaultTheme="system" // Set a default theme
      enableSystem={true} // Enable system theme preference
      themes={['light', 'dark', 'system']} // Explicitly list managed themes
    >
      {children}
    </NextThemesProvider>
  )
} 