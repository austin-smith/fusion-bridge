'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button'; // Assuming this is the correct path

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: Array<string>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed', platform: string }>;
  prompt(): Promise<void>;
}

const AddToHomeScreenPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallButton, setShowInstallButton] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      const typedEvent = event as BeforeInstallPromptEvent;
      // Prevent the mini-infobar from appearing on mobile
      typedEvent.preventDefault();
      // Stash the event so it can be triggered later.
      setDeferredPrompt(typedEvent);
      // Update UI to notify the user they can add to home screen
      setShowInstallButton(true);
      console.log("'beforeinstallprompt' event fired and stashed.");
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Track app installed state
    const handleAppInstalled = () => {
      // Hide the install button if the app is installed
      setShowInstallButton(false);
      setDeferredPrompt(null);
      console.log('PWA was installed');
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      return;
    }
    // Show the install prompt
    deferredPrompt.prompt();
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to A2HS prompt: ${outcome}`);
    // We've used the prompt, and can't use it again, discard it
    setDeferredPrompt(null);
    setShowInstallButton(false);
  };

  if (!showInstallButton) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <Button 
        onClick={handleInstallClick}
        variant="default" // Or your preferred variant
        size="lg" // Or your preferred size
      >
        Install App
      </Button>
    </div>
  );
};

export default AddToHomeScreenPrompt; 