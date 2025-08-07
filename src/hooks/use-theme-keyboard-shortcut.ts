import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';

/**
 * Hook to handle global keyboard shortcut for theme cycling (Cmd/Ctrl + J)
 * Shows a modal for theme selection and cycles through themes
 */
export function useThemeKeyboardShortcut() {
  const { theme, setTheme } = useTheme();
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Handle Ctrl/Cmd + J for theme cycling
      if (event.key === 'j' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        
        // If modal is already open, cycle to next theme
        if (isModalOpen) {
          const getNextTheme = (currentTheme: string | undefined): string => {
            switch (currentTheme) {
              case 'light':
                return 'dark';
              case 'dark':
                return 'system';
              case 'system':
                return 'light';
              default:
                return 'light'; // fallback to light if theme is undefined
            }
          };

          const nextTheme = getNextTheme(theme);
          setTheme(nextTheme);
        } else {
          // Open the modal
          setIsModalOpen(true);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [theme, setTheme, isModalOpen]);

  return {
    isModalOpen,
    setIsModalOpen
  };
}
