'use client';

import React, { useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { ResendConfig } from '@/types/email/resend-types';

interface ResendTestModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  resendConfig: ResendConfig | null;
  defaultRecipientEmail?: string;
}

export function ResendTestModal({ isOpen, onOpenChange, resendConfig, defaultRecipientEmail }: ResendTestModalProps) {
  const [loading, setLoading] = useState(false);
  const sendBtnRef = useRef<HTMLButtonElement>(null);
  const toEmailRef = useRef<HTMLInputElement>(null);

  const disabled = !resendConfig?.id || !resendConfig.apiKey || !resendConfig.fromEmail;

  const handleSend = async () => {
    if (disabled) return;
    try {
      setLoading(true);
      const toEmail = toEmailRef.current?.value?.trim() || '';
      if (!toEmail) {
        toast.error('Recipient is required');
        return;
      }
      const res = await fetch('/api/services/resend/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: toEmail }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success('Test email sent', { description: `Message ID: ${json.id || 'N/A'}` });
        onOpenChange(false);
      } else {
        toast.error('Failed to send test', { description: json.error || 'Unknown error' });
      }
    } catch (e) {
      toast.error('Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          sendBtnRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Send Test Email</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="toEmail">Recipient</Label>
            <Input id="toEmail" type="email" placeholder="you@example.com" defaultValue={defaultRecipientEmail || ''} ref={toEmailRef} />
          </div>
          <div className="flex justify-end">
            <Button ref={sendBtnRef} onClick={handleSend} disabled={loading || disabled}>
              {loading ? 'Sending…' : 'Send'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ResendTestModal;


