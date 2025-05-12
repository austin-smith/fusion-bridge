'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ShareIcon, XIcon, CloudDownload } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: Array<string>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed', platform: string }>;
  prompt(): Promise<void>;
}

const AddToHomeScreenPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIosDevice, setIsIosDevice] = useState(false);
  const [showIosInstallInstructions, setShowIosInstallInstructions] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check if running as a PWA or on iOS in standalone mode initially
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                         (typeof (window.navigator as any).standalone === 'boolean' && (window.navigator as any).standalone === true);

    if (isStandalone) {
      console.log('App is already in standalone mode. No prompt needed.');
      setIsVisible(false);
      return; // Don't set up listeners if already standalone
    }

    const userAgent = window.navigator.userAgent.toLowerCase();
    const currentIsIos = /iphone|ipad|ipod/.test(userAgent);
    setIsIosDevice(currentIsIos);

    const handleBeforeInstallPrompt = (event: Event) => {
      const typedEvent = event as BeforeInstallPromptEvent;
      typedEvent.preventDefault();
      setDeferredPrompt(typedEvent);
      if (!currentIsIos) { // Only show generic PWA prompt if not iOS (iOS has its own path)
        setIsVisible(true);
        console.log("&apos;beforeinstallprompt&apos; event fired and stashed for generic PWA.");
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    const handleAppInstalled = () => {
      console.log('PWA was installed');
      setIsVisible(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    // If it's iOS and not standalone, and no deferredPrompt (meaning beforeinstallprompt didn't fire or isn't applicable)
    if (currentIsIos && !isStandalone && !deferredPrompt) {
        setIsVisible(true);
        console.log('iOS device detected, not standalone, showing iOS specific prompt.');
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [deferredPrompt]); // Rerun if deferredPrompt changes, e.g. if it gets set after initial iOS check

  useEffect(() => {
    // Secondary check for iOS standalone specifically, in case initial check was too early
    // This is more of a safeguard
    const userAgent = window.navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(userAgent)) {
      const isIosStandalone = typeof (window.navigator as any).standalone === 'boolean' && (window.navigator as any).standalone === true;
      if (isIosStandalone) {
        setIsVisible(false);
      }
    }
  }, []);

  const handleGenericInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to A2HS prompt: ${outcome}`);
    if (outcome === 'accepted') {
      setIsVisible(false);
    }
    setDeferredPrompt(null);
  };

  const handleIosInstallClick = () => {
    setShowIosInstallInstructions(true);
  };

  const handleCloseIosInstructions = () => {
    setShowIosInstallInstructions(false);
    // Optionally, you might want to hide the main button too, or set a cookie to not show again for a while
    // setIsVisible(false); 
  };

  if (!isVisible) {
    return null;
  }

  // Render for iOS devices (manual instructions path)
  if (isIosDevice) {
    if (showIosInstallInstructions) {
      return (
        <div className="fixed bottom-6 right-6 z-50 animate-in fade-in zoom-in-95 duration-200">
          <Card className="shadow-lg border-primary/5 w-[300px] overflow-hidden">
            <div className="absolute right-0 top-0 h-16 w-16 -mt-5 -mr-5 bg-primary/5 rounded-full blur-xl" />
            <div className="absolute left-0 bottom-0 h-16 w-16 -ml-8 -mb-8 bg-primary/5 rounded-full blur-xl" />
            <CardHeader className="pb-2 relative">
              <CardTitle className="text-base flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <CloudDownload size={20} className="text-primary" />
                  <span>Install App on iOS</span>
                </div>
                <Button 
                  onClick={handleCloseIosInstructions} 
                  variant="ghost" 
                  size="icon" 
                  className="rounded-full h-7 w-7 hover:bg-muted/80"
                >
                  <XIcon size={14} />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm pb-3 relative">
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary/10 text-primary font-medium shrink-0">1</div>
                  <div className="space-y-0.5">
                    <div className="font-medium">Tap the Share button</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <ShareIcon className="h-3.5 w-3.5" /> in Safari&apos;s toolbar
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary/10 text-primary font-medium shrink-0">2</div>
                  <div className="space-y-0.5">
                    <div className="font-medium">Tap &apos;Add to Home Screen&apos;</div>
                    <div className="text-xs text-muted-foreground">Scroll to find this option</div>
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter className="pt-0 pb-3 relative bg-muted/20">
              <div className="text-xs text-muted-foreground italic flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-primary/40"></span>
                <span>Access the app directly from your home screen!</span>
              </div>
            </CardFooter>
          </Card>
        </div>
      );
    }
    // iOS install button
    return (
      <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
        <Button 
          onClick={handleIosInstallClick} 
          variant="secondary"
          size="sm"
          className="rounded-full shadow-md px-4 flex items-center gap-2 transition hover:bg-secondary/70 hover:shadow-lg active:bg-secondary/90 active:scale-95"
        >
          <CloudDownload size={16} />
          <span>Install App</span>
        </Button>
      </div>
    );
  }

  // Render for generic PWA install (non-iOS, or iOS if beforeinstallprompt was somehow caught, though unlikely)
  if (deferredPrompt) {
    return (
      <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
        <Button 
          onClick={handleGenericInstallClick} 
          variant="secondary"
          size="sm"
          className="rounded-full shadow-md px-4 flex items-center gap-2 transition hover:bg-secondary/70 hover:shadow-lg active:bg-secondary/90 active:scale-95"
        >
          <CloudDownload size={16} />
          <span>Install App</span>
        </Button>
      </div>
    );
  }

  return null; // Should not be reached if logic is correct and isVisible is true
};

export default AddToHomeScreenPrompt; 