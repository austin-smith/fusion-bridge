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
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Plus, Loader2, Key, Clock, Shield, AlertCircle } from 'lucide-react';
import { createApiKey } from '@/lib/actions/auth-actions';

interface CreateApiKeyDialogProps {
  onApiKeyCreated?: (apiKey: any) => void;
  trigger?: React.ReactNode;
}

export function CreateApiKeyDialog({ onApiKeyCreated, trigger }: CreateApiKeyDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    expiresIn: 'never',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Build the API key creation payload
      const payload: any = {
        name: formData.name || undefined,
      };

      // Add expiration if specified
      if (formData.expiresIn && formData.expiresIn !== 'never') {
        const days = parseInt(formData.expiresIn);
        payload.expiresIn = days * 24 * 60 * 60; // Convert days to seconds
      }

      console.log('Creating API key with payload:', payload);

      // Create the API key using server action
      const result = await createApiKey(payload);

      if (!result.success) {
        console.error('Error creating API key:', result.error);
        setError(result.error || 'Failed to create API key. Please try again.');
        return;
      }

      if (result.apiKey) {
        console.log('API key created successfully:', result.apiKey);
        onApiKeyCreated?.(result.apiKey);
        setOpen(false);
        
        // Reset form
        setFormData({
          name: '',
          expiresIn: 'never',
        });
        setError(null);
      }
    } catch (error) {
      console.error('Error creating API key:', error);
      setError('Failed to create API key. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const defaultTrigger = (
    <Button className="flex items-center gap-2">
      <Plus className="h-4 w-4" />
      Create API Key
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || defaultTrigger}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Create API Key
          </DialogTitle>
          <DialogDescription>
            This API key is tied to your user and can make requests against the selected project.
            If you are removed from the organization or project, this key will be disabled.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Basic Configuration */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-sm font-medium">
                Name
              </Label>
              <Input
                id="name"
                placeholder="My Test Key"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                className="h-10"
              />
              <p className="text-xs text-muted-foreground">
                Optional. Give your API key a descriptive name for easy identification.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="expiration" className="text-sm font-medium flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Expiration
              </Label>
              <Select
                value={formData.expiresIn}
                onValueChange={(value) => setFormData(prev => ({ ...prev, expiresIn: value }))}
              >
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Never expires" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="never">Never expires</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                  <SelectItem value="180">6 months</SelectItem>
                  <SelectItem value="365">1 year</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Recommended for security. You can always create a new key later.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create API Key
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
} 