import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';

/**
 * Hook to handle global keyboard shortcut for theme cycling (Cmd/Ctrl + J)
 * Shows a modal for theme selection and cycles through themes
 */
export function useThemeKeyboardShortcut() {
  const { theme, setTheme } = useTheme();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isHoldOpen, setIsHoldOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = String(event.key || '').toLowerCase();

      // Hold-to-pick: Cmd/Ctrl + Shift + J opens and stays open while held
      if (key === 'j' && (event.metaKey || event.ctrlKey) && event.shiftKey) {
        event.preventDefault();
        if (!isModalOpen) {
          setIsModalOpen(true);
        }
        if (!isHoldOpen) {
          setIsHoldOpen(true);
        }
        return;
      }

      // Quick cycle: Cmd/Ctrl + J cycles Mode when modal is open; otherwise open modal
      if (key === 'j' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
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
                return 'light';
            }
          };
          setTheme(getNextTheme(theme));
        } else {
          setIsModalOpen(true);
          // Treat as hold-to-pick as well, so releasing Cmd/Ctrl will close
          setIsHoldOpen(true);
        }
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      // If user releases Cmd/Ctrl, close the modal if it was opened in hold mode
      const releasedModifier = event.key === 'Meta' || event.key === 'Control';
      if (releasedModifier && isHoldOpen) {
        setIsHoldOpen(false);
        setIsModalOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, [theme, setTheme, isModalOpen, isHoldOpen]);

  return {
    isModalOpen,
    setIsModalOpen,
    isHoldOpen
  };
}
