'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Copy, Check, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

interface CopyKeyDialogProps {
  apiKey: {
    id: string;
    name: string | null;
    key: string;
    rateLimitEnabled?: boolean;
    rateLimitMax?: number;
    expiresAt?: string | null;
    createdAt: string;
  } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CopyKeyDialog({ apiKey, open, onOpenChange }: CopyKeyDialogProps) {
  const handleCopy = async () => {
    if (!apiKey?.key) return;
    
    try {
      await navigator.clipboard.writeText(apiKey.key);
      toast.success('API key copied to clipboard!');
    } catch (error) {
      console.error('Failed to copy API key:', error);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = apiKey.key;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      toast.success('API key copied to clipboard!');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  if (!apiKey) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Check className="h-5 w-5 text-green-600" />
            API Key Created Successfully
          </DialogTitle>
          <DialogDescription>
            Please save your secret key in a safe place since <strong>you won&apos;t be able to view it again</strong>.
            Keep it secure, as anyone with your API key can make requests on your behalf.
            If you do lose it, you&apos;ll need to generate a new one.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 overflow-y-auto max-h-[60vh] pr-2">
          {/* API Key Details */}
          <div className="space-y-3">
            <div>
              <Label className="text-sm font-medium">Name</Label>
              <p className="text-sm text-muted-foreground break-words">
                {apiKey.name || 'Unnamed API Key'}
              </p>
            </div>
          </div>

          {/* API Key Display and Copy */}
          <div className="space-y-2">
            <Label htmlFor="apiKey">Your API Key</Label>
            <div className="relative">
              <Input
                id="apiKey"
                value={apiKey.key}
                readOnly
                className="font-mono text-sm pr-10"
                onClick={(e) => e.currentTarget.select()}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={handleCopy}
              >
                <Copy className="h-4 w-4" />
                <span className="sr-only">Copy API key</span>
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>
            I&apos;ve saved my API key
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 