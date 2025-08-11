'use client';

import { useActionState } from 'react';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { LinearConfig } from '@/services/drivers/linear';
import { saveLinearConfigurationAction } from '@/services/settings-services-actions';

// Form state interface - will implement the action later
export interface SaveLinearConfigFormState {
  success: boolean;
  message?: string;
  errors?: {
    apiKey?: string[];
    teamId?: string[];
    _form?: string[];
  };
  savedIsEnabled?: boolean;
  savedConfigId?: string;
  savedApiKey?: string;
}

interface LinearConfigFormProps {
  initialConfig: LinearConfig | null;
  isEnabled: boolean;
  onSaveSuccess: (savedIsEnabled: boolean, savedConfigId?: string, savedApiKey?: string) => void;
}

interface LinearTeam {
  id: string;
  name: string;
  key: string;
}

function SubmitButton() {
  return (
    <Button type="submit">
      Save
    </Button>
  );
}

export function LinearConfigForm({ initialConfig, isEnabled, onSaveSuccess }: LinearConfigFormProps) {
  const [formState, formAction] = useActionState(
    saveLinearConfigurationAction,
    { success: false }
  );

  const [availableTeams, setAvailableTeams] = useState<LinearTeam[]>([]);
  const [isLoadingTeams, setIsLoadingTeams] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string>(initialConfig?.teamId || 'none');
  const [apiKey, setApiKey] = useState<string>(initialConfig?.apiKey || '');
  const [localIsEnabled, setLocalIsEnabled] = useState<boolean>(isEnabled);
  const [showApiKey, setShowApiKey] = useState<boolean>(false);

  // Load teams when API key changes
  useEffect(() => {
    const loadTeams = async () => {
      if (!apiKey || apiKey.length < 10) {
        setAvailableTeams([]);
        return;
      }

      setIsLoadingTeams(true);
      try {
        const response = await fetch('/api/services/linear/teams', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey }),
        });

        if (response.ok) {
          const data = await response.json();
          setAvailableTeams(data.teams || []);
        } else {
          console.error('Failed to load Linear teams');
          setAvailableTeams([]);
        }
      } catch (error) {
        console.error('Error loading Linear teams:', error);
        setAvailableTeams([]);
      } finally {
        setIsLoadingTeams(false);
      }
    };

    // Debounce the API call
    const timeoutId = setTimeout(loadTeams, 500);
    return () => clearTimeout(timeoutId);
  }, [apiKey]);

  // Handle successful save
  useEffect(() => {
    if (formState.success && formState.savedIsEnabled !== undefined) {
      onSaveSuccess(
        formState.savedIsEnabled,
        formState.savedConfigId,
        formState.savedApiKey
      );
    }
  }, [formState, onSaveSuccess]);

  return (
    <form action={formAction} className="space-y-4">
      {/* Hidden input to pass the current isEnabled state to the server action */}
      <input type="hidden" name="isEnabled" value={String(localIsEnabled)} />

      {/* Enable/Disable Toggle */}
      <div className="flex items-center space-x-2">
        <Switch
          id="linear-enabled"
          checked={localIsEnabled}
          onCheckedChange={(checked) => {
            // If trying to enable, require team selection
            if (checked && selectedTeamId === 'none') {
              // Don't allow enabling without team
              return;
            }
            setLocalIsEnabled(checked);
          }}
        />
        <Label htmlFor="linear-enabled">
          Enable Linear Service
        </Label>
      </div>
      {localIsEnabled && selectedTeamId === 'none' && (
        <p className="text-sm text-red-500">
          Please select a team before enabling the Linear service.
        </p>
      )}

      {/* API Key Field */}
      <div className="space-y-2">
        <Label htmlFor="apiKey">Linear API Key</Label>
        <div className="relative">
          <Input
            id="apiKey"
            name="apiKey"
            type={showApiKey ? "text" : "password"}
            placeholder="lin_api_..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className={`w-full pr-10 ${formState.errors?.apiKey ? 'border-red-500' : ''}`}
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
          <p id="apiKey-error" className="text-sm text-red-500">{formState.errors.apiKey[0]}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Create a Personal API key in your Linear Settings → API → Personal API keys
        </p>
      </div>

      {/* Team Selection */}
      <div className="space-y-2">
        <Label htmlFor="teamId">
          Team{localIsEnabled && <span className="text-red-500 ml-1">*</span>}
        </Label>
        <div className="relative">
          <Select
            value={selectedTeamId}
            onValueChange={(value) => {
              setSelectedTeamId(value);
              // If "none" is selected while service is enabled, disable the service
              if (value === 'none' && localIsEnabled) {
                setLocalIsEnabled(false);
              }
            }}
            disabled={!apiKey || isLoadingTeams || availableTeams.length === 0}
          >
            <SelectTrigger>
              {isLoadingTeams && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mr-2 shrink-0" />
              )}
              <SelectValue placeholder={
                isLoadingTeams 
                  ? "Loading teams..." 
                  : availableTeams.length === 0
                    ? "Enter API key to load teams"
                    : "Select a team"
              } />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">
                No team{localIsEnabled && ' (will disable service)'}
              </SelectItem>
              {availableTeams.map((team) => (
                <SelectItem key={team.id} value={team.id}>
                  {team.name} ({team.key})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

        </div>
        {formState.errors?.teamId && (
          <p className="text-sm text-red-500">{formState.errors.teamId[0]}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Choose a team for creating and viewing issues.
        </p>
      </div>

      {/* Hidden fields for selected team data */}
      <input 
        type="hidden" 
        name="teamId" 
        value={selectedTeamId === 'none' ? '' : selectedTeamId} 
      />
      <input 
        type="hidden" 
        name="teamName" 
        value={selectedTeamId === 'none' ? '' : (availableTeams.find(t => t.id === selectedTeamId)?.name || '')} 
      />

      {/* Error Messages */}
      {formState.errors?._form && (
        <div className="text-sm text-red-500 bg-red-50 dark:bg-red-950/20 p-3 rounded-md">
          {formState.errors._form.map((error, index) => (
            <p key={index}>{error}</p>
          ))}
        </div>
      )}

      {/* Success Message */}
      {formState.success && formState.message && (
        <div className="text-sm text-green-600 bg-green-50 dark:bg-green-950/20 p-3 rounded-md">
          {formState.message}
        </div>
      )}

      <div className="mt-6 flex items-center justify-end gap-2">
        <SubmitButton />
      </div>

    </form>
  );
}