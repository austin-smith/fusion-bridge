'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { 
  Clock, 
  Database, 
  Blend, 
  Trash2, 
  AlertTriangle,
  Info,
  Loader2
} from 'lucide-react';
import type { EventRetentionPolicy, OrganizationEventSettings } from '@/types/organization-settings';
import { DEFAULT_EVENT_RETENTION_POLICY, RetentionStrategy } from '@/types/organization-settings';
import { toast } from 'sonner';

interface EventRetentionSettingsProps {
  organizationId: string;
}

export function EventRetentionSettings({
  organizationId
}: EventRetentionSettingsProps) {
  const [settings, setSettings] = useState<OrganizationEventSettings | null>(null);
  const [policy, setPolicy] = useState<EventRetentionPolicy>(DEFAULT_EVENT_RETENTION_POLICY);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ maxEvents?: string; maxAgeInDays?: string }>({});
  const [previewResult, setPreviewResult] = useState<any>(null);
  const [currentEventCount, setCurrentEventCount] = useState<number>(0);

  // Fetch initial settings
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setIsLoading(true);
        setHasChanges(false);
        setPreviewResult(null);
        
        const response = await fetch('/api/organizations/settings/event-retention');
        
        if (!response.ok) {
          throw new Error('Failed to fetch retention settings');
        }
        
        const data = await response.json();
        
        if (data.success) {
          setSettings(data.data);
          setPolicy(data.data.policy);
          
          // Fetch current event count separately (not stored)
          const countResponse = await fetch('/api/events?count=true');
          if (countResponse.ok) {
            const countData = await countResponse.json();
            if (countData.success) {
              setCurrentEventCount(countData.count);
            }
          }
        } else {
          throw new Error(data.error || 'Failed to fetch retention settings');
        }
      } catch (error) {
        console.error('Error fetching retention settings:', error);
        toast.error(error instanceof Error ? error.message : 'Failed to load settings');
      } finally {
        setIsLoading(false);
      }
    };

    fetchSettings();
  }, [organizationId]);

  const handlePolicyChange = (updates: Partial<EventRetentionPolicy>) => {
    setPolicy(prev => ({ ...prev, ...updates }));
    setHasChanges(true);
    
    // Clear field errors when user types
    if (updates.maxEvents !== undefined && fieldErrors.maxEvents) {
      setFieldErrors(prev => ({ ...prev, maxEvents: undefined }));
    }
    if (updates.maxAgeInDays !== undefined && fieldErrors.maxAgeInDays) {
      setFieldErrors(prev => ({ ...prev, maxAgeInDays: undefined }));
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setFieldErrors({});
    
    // Validate policy before sending
    const errors: { maxEvents?: string; maxAgeInDays?: string } = {};
    
    if ((policy.strategy === RetentionStrategy.COUNT || policy.strategy === RetentionStrategy.HYBRID) && 
        (!policy.maxEvents || policy.maxEvents < 1000)) {
      errors.maxEvents = 'Maximum events must be at least 1,000';
    }
    
    if ((policy.strategy === RetentionStrategy.TIME || policy.strategy === RetentionStrategy.HYBRID) && 
        (!policy.maxAgeInDays || policy.maxAgeInDays < 1)) {
      errors.maxAgeInDays = 'Maximum age must be at least 1 day';
    }
    
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      toast.error('Validation errors');
      setIsSaving(false);
      return;
    }
    
    try {
      const response = await fetch('/api/organizations/settings/event-retention', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(policy),
      });

      if (!response.ok) {
        throw new Error('Failed to save retention policy');
      }

      const data = await response.json();
      
      if (data.success) {
        setSettings(data.data);
        setHasChanges(false);
        setFieldErrors({}); // Clear all field errors on successful save
        toast.success('Retention policy saved successfully');
      } else {
        throw new Error(data.error || 'Failed to save retention policy');
      }
    } catch (error) {
      console.error('Failed to save policy:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save policy');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePreviewCleanup = async () => {
    setIsPreviewing(true);
    
    try {
      const response = await fetch('/api/organizations/settings/event-retention/cleanup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ preview: true }),
      });

      if (!response.ok) {
        throw new Error('Failed to preview cleanup');
      }

      const data = await response.json();
      
      if (data.success) {
        setPreviewResult(data.data);
        toast.success('Cleanup preview generated successfully');
      } else {
        throw new Error(data.error || 'Failed to preview cleanup');
      }
    } catch (error) {
      console.error('Failed to preview cleanup:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to preview cleanup');
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleExecuteCleanup = async () => {
    setIsCleaningUp(true);
    
    try {
      const response = await fetch('/api/organizations/settings/event-retention/cleanup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ preview: false }),
      });

      if (!response.ok) {
        throw new Error('Failed to execute cleanup');
      }

      const data = await response.json();
      
      if (data.success) {
        // Refresh settings to get updated stats
        const settingsResponse = await fetch('/api/organizations/settings/event-retention');
        if (settingsResponse.ok) {
          const settingsData = await settingsResponse.json();
          if (settingsData.success) {
            setSettings(settingsData.data);
          }
        }
        
        // Refresh current event count
        const countResponse = await fetch('/api/events?count=true');
        if (countResponse.ok) {
          const countData = await countResponse.json();
          if (countData.success) {
            setCurrentEventCount(countData.count);
          }
        }
        setPreviewResult(null); // Clear preview after execution
        toast.success('Cleanup executed successfully');
      } else {
        throw new Error(data.error || 'Failed to execute cleanup');
      }
    } catch (error) {
      console.error('Failed to execute cleanup:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to execute cleanup');
    } finally {
      setIsCleaningUp(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading retention settings...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div>
        <h3 className="text-lg font-medium">Event Retention Policy</h3>
        <p className="text-sm text-muted-foreground">
          Configure how long events are stored before automatic cleanup.
        </p>
      </div>



      <div className="space-y-6">
        {/* Current Status */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Current Events</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {currentEventCount.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">
                Total events stored
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Last Cleanup</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {settings?.stats.lastCleanupAt ? 
                  new Date(settings.stats.lastCleanupAt).toLocaleDateString() : 
                  'Never'
                }
              </div>
              <p className="text-xs text-muted-foreground">
                {settings?.stats.totalEventsDeleted.toLocaleString() ?? '0'} events deleted
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Next Cleanup</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {settings?.stats.nextScheduledCleanup ?
                  new Date(settings.stats.nextScheduledCleanup).toLocaleDateString() :
                  'Unknown'
                }
              </div>
              <p className="text-xs text-muted-foreground">
                Scheduled cleanup time
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Strategy Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-4 w-4" />
                Retention Strategy
              </CardTitle>
              <CardDescription>
                Choose how you want to limit event storage for your organization.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <Label>Strategy Type</Label>
                <Select
                  value={policy.strategy}
                  onValueChange={(value: RetentionStrategy) => 
                    handlePolicyChange({ strategy: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={RetentionStrategy.TIME}>
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Clock className="h-4 w-4" />
                          <span className="whitespace-nowrap">Time-based</span>
                        </div>
                        <span className="text-xs text-muted-foreground ml-2">Delete events older than n days</span>
                      </div>
                    </SelectItem>
                    <SelectItem value={RetentionStrategy.COUNT}>
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Database className="h-4 w-4" />
                          <span className="whitespace-nowrap">Count-based</span>
                        </div>
                        <span className="text-xs text-muted-foreground ml-2">Keep only the most recent n events</span>
                      </div>
                    </SelectItem>
                    <SelectItem value={RetentionStrategy.HYBRID}>
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Blend className="h-4 w-4" />
                          <span className="whitespace-nowrap">Hybrid</span>
                        </div>
                        <span className="text-xs text-muted-foreground ml-2">Apply both time and count limits</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Time-based Settings */}
              {(policy.strategy === RetentionStrategy.TIME || policy.strategy === RetentionStrategy.HYBRID) && (
                <div className="space-y-2">
                  <Label htmlFor="maxAge">Maximum Age (Days)</Label>
                  <Input
                    id="maxAge"
                    type="number"
                    min="1"
                    max="365"
                    value={policy.maxAgeInDays || ''}
                    onChange={(e) => handlePolicyChange({ 
                      maxAgeInDays: parseInt(e.target.value) || undefined 
                    })}
                    placeholder="90"
                    className={cn(fieldErrors.maxAgeInDays && 'border-destructive focus:border-destructive focus:ring-destructive')}
                  />
                  {fieldErrors.maxAgeInDays && (
                    <p className="text-xs text-destructive">{fieldErrors.maxAgeInDays}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Events older than this will be deleted (1-365 days)
                  </p>
                </div>
              )}

              {/* Count-based Settings */}
              {(policy.strategy === RetentionStrategy.COUNT || policy.strategy === RetentionStrategy.HYBRID) && (
                <div className="space-y-2">
                  <Label htmlFor="maxEvents">Maximum Events</Label>
                  <Input
                    id="maxEvents"
                    type="number"
                    min="1000"
                    max="250000"
                    value={policy.maxEvents || ''}
                    onChange={(e) => handlePolicyChange({ 
                      maxEvents: parseInt(e.target.value) || undefined 
                    })}
                    placeholder="100000"
                    className={cn(fieldErrors.maxEvents && 'border-destructive focus:border-destructive focus:ring-destructive')}
                  />
                  {fieldErrors.maxEvents && (
                    <p className="text-xs text-destructive">{fieldErrors.maxEvents}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Only the most recent events will be kept (1,000-250,000)
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

        {/* Manual Cleanup */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trash2 className="h-4 w-4" />
              Manual Cleanup
            </CardTitle>
            <CardDescription>
              Run cleanup immediately or preview what would be deleted
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Manual cleanup will permanently delete events according to your current policy. 
                This action cannot be undone.
              </AlertDescription>
            </Alert>
            <div className="flex space-x-2">
              <Button 
                variant="outline" 
                className="flex items-center gap-2"
                onClick={handlePreviewCleanup}
                disabled={isPreviewing || isCleaningUp}
              >
                {isPreviewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Info className="h-4 w-4" />}
                {isPreviewing ? 'Previewing...' : 'Preview Cleanup'}
              </Button>
              <Button 
                variant="destructive" 
                className="flex items-center gap-2"
                onClick={handleExecuteCleanup}
                disabled={isPreviewing || isCleaningUp}
              >
                {isCleaningUp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {isCleaningUp ? 'Cleaning...' : 'Run Cleanup Now'}
              </Button>
            </div>

            {/* Preview Results */}
            {previewResult && (
              <div className="mt-6 p-4 border rounded-lg bg-blue-50 dark:bg-blue-950/20">
                <div className="flex items-center gap-2 mb-3">
                  <Info className="h-4 w-4 text-blue-600" />
                  <h4 className="font-medium text-blue-900 dark:text-blue-100">Cleanup Preview</h4>
                </div>
                
                <div className="grid grid-cols-2 gap-4 mb-3">
                  <div className="bg-white dark:bg-gray-800 p-3 rounded border">
                    <div className="text-sm text-muted-foreground">Current Events</div>
                    <div className="text-lg font-semibold">{previewResult.currentEventCount.toLocaleString()}</div>
                  </div>
                  <div className="bg-white dark:bg-gray-800 p-3 rounded border">
                    <div className="text-sm text-muted-foreground">Would Delete</div>
                    <div className="text-lg font-semibold text-red-600">{previewResult.estimatedDeletions.total.toLocaleString()}</div>
                  </div>
                </div>

                {(previewResult.estimatedDeletions.byTime || previewResult.estimatedDeletions.byCount) && (
                  <div className="pt-2 border-t">
                    <div className="text-xs text-muted-foreground mb-2">Breakdown:</div>
                    <div className="space-y-1 text-sm">
                      {previewResult.estimatedDeletions.byTime && (
                        <div className="flex justify-between">
                          <span>By age limit ({previewResult.policy?.maxAgeInDays} days)</span>
                          <span className="font-medium">{previewResult.estimatedDeletions.byTime.toLocaleString()}</span>
                        </div>
                      )}
                      {previewResult.estimatedDeletions.byCount && (
                        <div className="flex justify-between">
                          <span>By count limit ({previewResult.policy?.maxEvents?.toLocaleString()})</span>
                          <span className="font-medium">{previewResult.estimatedDeletions.byCount.toLocaleString()}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
}