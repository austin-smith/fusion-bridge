'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Building2, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmojiPicker } from 'frimousse';

interface OrganizationLogoSelectorProps {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
}

export function OrganizationLogoSelector({ value, onChange }: OrganizationLogoSelectorProps) {
  const [activeTab, setActiveTab] = useState<'url' | 'emoji'>('url');
  const [urlValue, setUrlValue] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState<string | null>(null);

  // Only set initial values once based on the incoming prop
  useEffect(() => {
    if (!value) {
      // Default to url tab with no value
      setActiveTab('url');
      return;
    }

    // Check if it's a URL
    if (value.startsWith('http')) {
      setActiveTab('url');
      setUrlValue(value);
      // Don't set emoji value
    }
    // Otherwise it's an emoji
    else {
      setActiveTab('emoji');
      setSelectedEmoji(value);
      // Don't set URL value
    }
  }, [value]); // Include value dependency

  // Update the parent when values change
  useEffect(() => {
    let newValue: string | null = null;

    switch (activeTab) {
      case 'url':
        newValue = urlValue || null;
        break;
      case 'emoji':
        newValue = selectedEmoji;
        break;
    }

    onChange(newValue);
  }, [activeTab, urlValue, selectedEmoji, onChange]);

  return (
    <div className="space-y-2">
      <Label>Logo</Label>
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="url">Image URL</TabsTrigger>
          <TabsTrigger value="emoji">Emoji</TabsTrigger>
        </TabsList>

        <TabsContent value="url" className="space-y-2">
          <Input
            placeholder="https://example.com/logo.png"
            type="url"
            value={urlValue}
            onChange={(e) => setUrlValue(e.target.value)}
          />
          <p className="text-sm text-muted-foreground">
            Enter a URL for your organization&apos;s logo image
          </p>
        </TabsContent>

        <TabsContent value="emoji" className="space-y-2">
          <div className="flex flex-col gap-2">
            {selectedEmoji && (
              <div className="flex items-center gap-2 p-2 rounded-md border bg-muted/50">
                <span className="text-2xl">{selectedEmoji}</span>
                <span className="text-sm text-muted-foreground">Selected emoji</span>
              </div>
            )}
            <EmojiPicker.Root 
              className="isolate flex h-[368px] w-full flex-col rounded-md border bg-background"
              onEmojiSelect={(selected) => setSelectedEmoji(selected.emoji)}
            >
              <EmojiPicker.Search className="z-10 mx-2 mt-2 appearance-none rounded-md bg-muted px-2.5 py-2 text-sm" />
              <EmojiPicker.Viewport className="relative flex-1 outline-hidden">
                <EmojiPicker.Loading className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
                  Loading emojis...
                </EmojiPicker.Loading>
                <EmojiPicker.Empty className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
                  No emoji found.
                </EmojiPicker.Empty>
                <EmojiPicker.List
                  className="select-none pb-1.5"
                  components={{
                    CategoryHeader: ({ category, ...props }) => (
                      <div
                        className="bg-background px-3 pt-3 pb-1.5 font-medium text-muted-foreground text-xs"
                        {...props}
                      >
                        {category.label}
                      </div>
                    ),
                    Row: ({ children, ...props }) => (
                      <div className="scroll-my-1.5 px-1.5" {...props}>
                        {children}
                      </div>
                    ),
                    Emoji: ({ emoji, ...props }) => (
                      <button
                        type="button"
                        className="flex size-8 items-center justify-center rounded-md text-lg hover:bg-accent data-[active]:bg-accent"
                        {...props}
                      >
                        {emoji.emoji}
                      </button>
                    ),
                  }}
                />
              </EmojiPicker.Viewport>
            </EmojiPicker.Root>
          </div>
          <p className="text-sm text-muted-foreground">
            Select an emoji to represent your organization
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Helper component to render organization logo
export function OrganizationLogoDisplay({
  logo,
  className,
  size = 'default',
  fallbackIcon: FallbackIcon = Building2,
}: {
  logo: string | null | undefined;
  className?: string;
  size?: 'sm' | 'default' | 'lg';
  fallbackIcon?: LucideIcon;
}) {
  const sizeClasses = {
    sm: 'text-lg',
    default: 'text-2xl',
    lg: 'text-4xl',
  };

  if (!logo) {
    return <FallbackIcon className={cn('text-muted-foreground', className)} />;
  }

  // URL - use Next.js Image with unoptimized for external URLs to avoid domain restrictions
  if (logo.startsWith('http')) {
    return (
      <Image
        src={logo}
        alt="Organization logo"
        width={24}
        height={24}
        unoptimized
        className={cn('object-cover', className)}
        onError={(e) => {
          // If image fails to load, replace with fallback icon
          const target = e.target as HTMLImageElement;
          target.style.display = 'none';
          const parent = target.parentElement;
          if (parent) {
            const iconElement = document.createElement('div');
            iconElement.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className} text-muted-foreground"><path d="M12 2H8a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8l-6-6Z"/><path d="M12 2v6h6"/><path d="M10 12h4"/><path d="M10 16h4"/></svg>`;
            parent.appendChild(iconElement.firstChild!);
          }
        }}
      />
    );
  }

  // Emoji (anything else that's not a URL)
  return (
    <span className={cn('flex items-center justify-center', sizeClasses[size], className)}>
      {logo}
    </span>
  );
} 