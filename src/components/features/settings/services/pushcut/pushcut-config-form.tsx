'use client';

import { useEffect, useState } from 'react';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import type { PushcutConfig } from '@/types/pushcut-types';

// This action will be fully defined later in /app/(app)/settings/services/actions.ts
import { savePushcutConfigurationAction } from '@/services/settings-services-actions'; 

export interface SavePushcutConfigFormState {
  success: boolean;
  message?: string;
  errors?: {
    apiKey?: string[];
    _form?: string[]; // For general form errors
  };
  savedIsEnabled?: boolean; // To reflect the saved state of isEnabled
  savedConfigId?: string; // Add new field for the config ID
  savedApiKey?: string; // Add new field for the saved API key
}

interface PushcutConfigFormProps {
  initialConfig: PushcutConfig | null;
  isEnabled: boolean; // Passed down to control the hidden input
  onSaveSuccess: (savedIsEnabled: boolean, savedConfigId?: string, savedApiKey?: string) => void; // Update prop signature
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Save'}
    </Button>
  );
}

export function PushcutConfigForm({ initialConfig, isEnabled, onSaveSuccess }: PushcutConfigFormProps) {
  const initialState: SavePushcutConfigFormState = { success: false };
  const [formState, formAction] = useActionState(savePushcutConfigurationAction, initialState);
  const [showApiKey, setShowApiKey] = useState(false);
  
  // Local state for enable toggle
  const [localIsEnabled, setLocalIsEnabled] = useState(isEnabled);

  // Update local enabled state when external prop changes
  useEffect(() => {
    setLocalIsEnabled(isEnabled);
  }, [isEnabled]);

  useEffect(() => {
    if (formState.success && formState.savedIsEnabled !== undefined) {
      toast.success('Pushcut Configuration', { description: formState.message || 'Saved successfully.' });
      onSaveSuccess(formState.savedIsEnabled, formState.savedConfigId, formState.savedApiKey);
    } else if (!formState.success && formState.message) {
      toast.error('Error Saving Configuration', {
        description: formState.message || 'An unexpected error occurred.',
      });
    }
  }, [formState, onSaveSuccess]);

  return (
    <form action={formAction} className="space-y-6">
      {/* Hidden input to pass the current isEnabled state to the server action */}
      <input type="hidden" name="isEnabled" value={String(localIsEnabled)} />

      {/* Enable/Disable Toggle */}
      <div className="flex items-center space-x-2">
        <Switch
          id="pushcut-enabled"
          checked={localIsEnabled}
          onCheckedChange={setLocalIsEnabled}
        />
        <Label htmlFor="pushcut-enabled">
          Enable Pushcut Service
        </Label>
      </div>

      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="apiKey">API Key</Label>
          <div className="relative">
            <Input 
              id="apiKey" 
              name="apiKey" 
              type={showApiKey ? "text" : "password"} 
              defaultValue={initialConfig?.apiKey || ''} 
              placeholder="Enter your Pushcut API Key"
              required 
              className="w-full pr-10"
              aria-describedby="apiKey-error"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 h-full px-3 py-2 text-muted-foreground"
              onClick={() => setShowApiKey(!showApiKey)}
              aria-label={showApiKey ? "Hide API key" : "Show API key"}
            >
              {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
          {formState.errors?.apiKey && (
            <p id="apiKey-error" className="text-sm text-destructive">
              {formState.errors.apiKey.join(', ')}
            </p>
          )}
           <p className="text-xs text-muted-foreground pt-1">
            Your Pushcut API Key can be found in the Pushcut app in the Account view.
            Refer to the <a href="https://www.pushcut.io/webapi" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">Pushcut API documentation</a> for more details.
          </p>
        </div>
      </div>
      
      {formState.errors?._form && (
        <div className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {formState.errors._form.join(', ')}
        </div>
      )}
      
      <div className="mt-6 flex items-center justify-end gap-2">
        <SubmitButton />
      </div>
    </form>
  );
} 