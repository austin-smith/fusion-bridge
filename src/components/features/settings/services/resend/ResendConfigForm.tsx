'use client';

import { useState, useEffect, useActionState, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { ResendConfig, SaveResendConfigFormState } from '@/types/email/resend-types';
import { saveResendConfigurationAction } from '@/services/settings-services-actions';

interface ResendConfigFormProps {
  initialConfig: ResendConfig | null;
  isEnabled: boolean;
  onSaveSuccess: (savedIsEnabled: boolean, savedConfigId?: string, savedApiKey?: string) => void;
}

export function ResendConfigForm({ initialConfig, isEnabled, onSaveSuccess }: ResendConfigFormProps) {
  const initialState: SaveResendConfigFormState = { success: false };
  const [formState, formAction] = useActionState(saveResendConfigurationAction, initialState);
  const [showApiKey, setShowApiKey] = useState(false);
  const [localIsEnabled, setLocalIsEnabled] = useState(isEnabled);
  const [submitting, setSubmitting] = useState(false);
  const lastToastKeyRef = useRef<string | null>(null);

  useEffect(() => { setLocalIsEnabled(isEnabled); }, [isEnabled]);
  useEffect(() => {
    const key = JSON.stringify({
      s: formState.success,
      m: formState.message,
      e: formState.savedIsEnabled,
      id: formState.savedConfigId,
      k: formState.savedApiKey,
    });
    if (lastToastKeyRef.current === key) {
      setSubmitting(false);
      return;
    }
    if (formState.success) {
      toast.success('Resend Configuration', { description: formState.message || 'Saved successfully.' });
      onSaveSuccess(formState.savedIsEnabled ?? localIsEnabled, formState.savedConfigId, formState.savedApiKey);
      lastToastKeyRef.current = key;
    } else if (!formState.success && formState.message) {
      toast.error('Error Saving Configuration', { description: formState.message });
      lastToastKeyRef.current = key;
    }
    setSubmitting(false);
  }, [formState, localIsEnabled, onSaveSuccess]);

  const handleSubmit = (formData: FormData) => {
    setSubmitting(true);
    formData.set('isEnabled', String(localIsEnabled));
    formAction(formData);
  };

  return (
    <form action={handleSubmit} className="space-y-6">
      {/* Enable/Disable Toggle */}
      <div className="flex items-center space-x-2">
        <Switch id="resend-enabled" checked={localIsEnabled} onCheckedChange={setLocalIsEnabled} />
        <Label htmlFor="resend-enabled">Enable Resend Email Service</Label>
      </div>

      {/* API Key */}
      <div className="space-y-2">
        <Label htmlFor="apiKey">API Key</Label>
        <div className="relative">
          <Input
            id="apiKey"
            name="apiKey"
            type={showApiKey ? 'text' : 'password'}
            placeholder="re_..."
            defaultValue={initialConfig?.apiKey || ''}
            className={`w-full pr-10 ${formState.errors?.apiKey ? 'border-destructive' : ''}`}
            aria-describedby="apiKey-error"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-0 top-0 h-full px-3 py-2 text-muted-foreground"
            onClick={() => setShowApiKey(!showApiKey)}
            aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
          >
            {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        </div>
        {formState.errors?.apiKey && (
          <p id="apiKey-error" className="text-sm text-destructive">{formState.errors.apiKey[0]}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Manage your keys in the{' '}
          <a
            href="https://resend.com/api-keys"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-primary"
          >
            Resend dashboard
          </a>.
        </p>
      </div>

      {/* From Email */}
      <div className="space-y-2">
        <Label htmlFor="fromEmail">From Email</Label>
        <Input
          id="fromEmail"
          name="fromEmail"
          type="email"
          placeholder="noreply@yourdomain.com"
          defaultValue={initialConfig?.fromEmail || ''}
          className={formState.errors?.fromEmail ? 'border-destructive' : ''}
          aria-describedby="fromEmail-error"
        />
        {formState.errors?.fromEmail && (
          <p id="fromEmail-error" className="text-sm text-destructive">{formState.errors.fromEmail[0]}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Must be a verified sender on your domain.{' '}
          <a
            href="https://resend.com/docs/api-reference/emails/send-email#param-from"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-primary"
          >
            Learn more
          </a>.
        </p>
      </div>

      {/* From Name */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label htmlFor="fromName">From Name</Label>
          <span className="text-xs text-muted-foreground">Optional</span>
        </div>
        <Input id="fromName" name="fromName" type="text" defaultValue={initialConfig?.fromName || ''} />
        <p className="text-xs text-muted-foreground">
          Friendly display name to show with the sender.{' '}
          <a
            href="https://resend.com/docs/api-reference/emails/send-email#param-from"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-primary"
          >
            Learn more
          </a>.
        </p>
      </div>

      {/* Reply To */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label htmlFor="replyToEmail">Reply To</Label>
          <span className="text-xs text-muted-foreground">Optional</span>
        </div>
        <Input id="replyToEmail" name="replyToEmail" type="email" defaultValue={initialConfig?.replyToEmail || ''} />
        {formState.errors?.replyToEmail && (
          <p className="text-sm text-destructive">{formState.errors.replyToEmail[0]}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Replies will go to this address instead of the From address.{' '}
          <a
            href="https://resend.com/docs/api-reference/emails/send-email#param-reply-to"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-primary"
          >
            Learn more
          </a>.
        </p>
      </div>

      {/* Submit */}
      <div className="flex items-center justify-end">
        <Button type="submit" disabled={submitting}>
          {submitting ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</>) : 'Save'}
        </Button>
      </div>
    </form>
  );
}

export default ResendConfigForm;


