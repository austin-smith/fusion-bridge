'use client';

import React, { useState, useEffect, useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle2, AlertCircle, Loader2, Eye, EyeOff } from 'lucide-react';
import { saveOpenAIConfigurationAction } from '@/services/settings-services-actions';
import type { OpenAIConfig, SaveOpenAIConfigFormState } from '@/types/ai/openai-service-types';
import { OpenAIModel, OPENAI_MODEL_DISPLAY_NAMES } from '@/types/ai/openai-service-types';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

interface OpenAIConfigFormProps {
  initialConfig: OpenAIConfig | null;
  isEnabled: boolean;
  onSaveSuccess: (savedIsEnabled: boolean, savedConfigId?: string, savedApiKey?: string) => void;
}

const initialFormState: SaveOpenAIConfigFormState = {
  success: false,
};

export function OpenAIConfigForm({ initialConfig, isEnabled, onSaveSuccess }: OpenAIConfigFormProps) {
  const [formState, formAction] = useActionState(saveOpenAIConfigurationAction, initialFormState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  
  // Local state for slider values to provide immediate visual feedback
  const [maxTokens, setMaxTokens] = useState(initialConfig?.maxTokens || 2000);
  const [temperature, setTemperature] = useState(initialConfig?.temperature || 0.7);
  const [topP, setTopP] = useState(initialConfig?.topP || 1.0);
  const [selectedModel, setSelectedModel] = useState<OpenAIModel>(initialConfig?.model || OpenAIModel.GPT_4O_MINI);
  // Add local state for enable toggle
  const [localIsEnabled, setLocalIsEnabled] = useState(isEnabled);

  // Update local state when initialConfig changes
  useEffect(() => {
    if (initialConfig) {
      setMaxTokens(initialConfig.maxTokens);
      setTemperature(initialConfig.temperature);
      setTopP(initialConfig.topP);
      setSelectedModel(initialConfig.model);
    }
  }, [initialConfig]);

  // Update local enabled state when external prop changes
  useEffect(() => {
    setLocalIsEnabled(isEnabled);
  }, [isEnabled]);

  useEffect(() => {
    if (formState.success) {
      toast.success('OpenAI Configuration', { description: formState.message || 'OpenAI configuration saved successfully!' });
      onSaveSuccess(
        formState.savedIsEnabled ?? localIsEnabled,
        formState.savedConfigId,
        formState.savedApiKey
      );
    } else if (!formState.success && formState.message) {
      toast.error('Error Saving Configuration', {
        description: formState.message || 'An unexpected error occurred.',
      });
    }
    setIsSubmitting(false);
  }, [formState, localIsEnabled, onSaveSuccess]);

  const handleSubmit = async (formData: FormData) => {
    setIsSubmitting(true);
    
    // Add the current slider values to form data with safety checks
    formData.set('maxTokens', (maxTokens || 2000).toString());
    const isGpt5 = selectedModel === OpenAIModel.GPT_5 || selectedModel === OpenAIModel.GPT_5_MINI;
    const effectiveTemperature = isGpt5 ? 1 : (temperature || 0.7);
    formData.set('temperature', effectiveTemperature.toString());
    formData.set('topP', (topP || 1.0).toString());
    formData.set('model', selectedModel);
    formData.set('isEnabled', localIsEnabled.toString());
    
    formAction(formData);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>OpenAI Configuration</CardTitle>
        <CardDescription>
          Configure your OpenAI API settings for AI-powered features and intelligent analysis.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={handleSubmit} className="space-y-6">
          {/* Enable/Disable Toggle */}
          <div className="flex items-center space-x-2">
            <Switch
              id="openai-enabled"
              checked={localIsEnabled}
              onCheckedChange={setLocalIsEnabled}
            />
            <Label htmlFor="openai-enabled">
              Enable OpenAI Service
            </Label>
          </div>

          {/* API Key */}
          <div className="space-y-2">
            <Label htmlFor="apiKey">API Key</Label>
            <div className="relative">
              <Input
                id="apiKey"
                name="apiKey"
                type={showApiKey ? "text" : "password"}
                placeholder="sk-..."
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
                aria-label={showApiKey ? "Hide API key" : "Show API key"}
              >
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            {formState.errors?.apiKey && (
              <p id="apiKey-error" className="text-sm text-destructive">{formState.errors.apiKey[0]}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Get your API key from the{' '}
              <a
                href="https://platform.openai.com/api-keys"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-primary"
              >
                OpenAI Platform
              </a>.
            </p>
          </div>

          {/* Model Selection */}
          <div className="space-y-2">
            <Label htmlFor="model">Model</Label>
            <Select name="model" value={selectedModel} onValueChange={(value) => setSelectedModel(value as OpenAIModel)}>
              <SelectTrigger className={formState.errors?.model ? 'border-destructive' : ''}>
                <SelectValue placeholder="Select a model" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(OPENAI_MODEL_DISPLAY_NAMES).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {formState.errors?.model && (
              <p className="text-sm text-destructive">{formState.errors.model[0]}</p>
            )}
          </div>

          {/* Max Tokens Slider */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="maxTokens">Max Tokens</Label>
              <span className="text-sm text-muted-foreground font-mono">{maxTokens?.toLocaleString() || '2,000'}</span>
            </div>
            <Slider
              value={[maxTokens || 2000]}
              onValueChange={(value: number[]) => setMaxTokens(value[0])}
              max={4000}
              min={100}
              step={100}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>100</span>
              <span>4,000</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Maximum number of tokens the AI can generate in a single response. Higher values allow for more detailed and comprehensive outputs.
            </p>
            {formState.errors?.maxTokens && (
              <p className="text-sm text-destructive">{formState.errors.maxTokens[0]}</p>
            )}
          </div>

          {/* Temperature Slider */}
          {!(selectedModel === OpenAIModel.GPT_5 || selectedModel === OpenAIModel.GPT_5_MINI) && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="temperature">Temperature</Label>
                <span className="text-sm text-muted-foreground font-mono">{(temperature || 0.7)?.toFixed(2)}</span>
              </div>
              <Slider
                value={[temperature || 0.7]}
                onValueChange={(value: number[]) => setTemperature(value[0])}
                max={2.0}
                min={0.0}
                step={0.1}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>0.0 (focused)</span>
                <span>2.0 (creative)</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Controls randomness in responses. Lower values = more consistent and focused. Higher values = more creative and varied.
              </p>
              {formState.errors?.temperature && (
                <p className="text-sm text-destructive">{formState.errors.temperature[0]}</p>
              )}
            </div>
          )}

          {/* Top-p Slider */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="topP">Top P</Label>
              <span className="text-sm text-muted-foreground font-mono">{topP?.toFixed(2) || '1.00'}</span>
            </div>
            <Slider
              value={[topP || 1.0]}
              onValueChange={(value: number[]) => setTopP(value[0])}
              max={1.0}
              min={0.01}
              step={0.01}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0.01 (very focused)</span>
              <span>1.0 (full range)</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Alternative to temperature. Controls diversity by considering only top tokens with cumulative probability up to this value.
            </p>
            {formState.errors?.topP && (
              <p className="text-sm text-destructive">{formState.errors.topP[0]}</p>
            )}
          </div>

          {/* Error Messages - Keep only validation errors */}
          {formState.errors?._form && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{formState.errors._form[0]}</AlertDescription>
            </Alert>
          )}

          {/* Submit Button */}
          <div className="flex items-center justify-end">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save'
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
} 