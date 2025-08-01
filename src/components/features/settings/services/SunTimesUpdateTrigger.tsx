'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Loader2, Sun, RefreshCw, Clock, MapPin, CheckCircle, AlertTriangle } from 'lucide-react';

interface SunTimesUpdateResult {
  success: boolean;
  message?: string;
  stats?: {
    totalLocations: number;
    successfulUpdates: number;
    failedUpdates: number;
    executionTimeMs: number;
  };
  error?: string;
}

export function SunTimesUpdateTrigger() {
  const [isUpdating, setIsUpdating] = useState(false);
  const [lastResult, setLastResult] = useState<SunTimesUpdateResult | null>(null);

  const handleTriggerUpdate = async () => {
    setIsUpdating(true);
    setLastResult(null);

    try {
      const response = await fetch('/api/admin/system/sun-times-update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json() as SunTimesUpdateResult;

      if (response.ok && result.success) {
        setLastResult(result);
        toast.success('Sun times updated successfully!', {
          description: `Updated ${result.stats?.successfulUpdates || 0} locations`,
        });
      } else {
        setLastResult(result);
        toast.error('Sun times update failed', {
          description: result.error || 'See details below for more information',
        });
      }
    } catch (error) {
      console.error('Error triggering sun times update:', error);
      const errorResult: SunTimesUpdateResult = {
        success: false,
        error: 'Network error while triggering sun times update'
      };
      setLastResult(errorResult);
      toast.error('Network error while triggering sun times update');
    } finally {
      setIsUpdating(false);
    }
  };

  const formatExecutionTime = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sun className="h-5 w-5 text-amber-500" />
          Sun Times Update
        </CardTitle>
        <CardDescription>
          Manually trigger an update of sunrise and sunset times for all locations with coordinates.
          This runs automatically daily, but can be triggered on-demand here.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Updates sunrise/sunset times using OpenWeather API for all locations with coordinates
          </div>
          <Button
            onClick={handleTriggerUpdate}
            disabled={isUpdating}
            className="gap-2"
          >
            {isUpdating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {isUpdating ? 'Updating...' : 'Update Sun Times'}
          </Button>
        </div>

        {lastResult && (
          <div className={`p-4 rounded-lg border ${
            lastResult.success 
              ? 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800'
              : 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800'
          }`}>
            <div className="flex items-start gap-3">
              {lastResult.success ? (
                <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              )}
              
              <div className="flex-1 space-y-2">
                <div className="font-medium text-sm">
                  {lastResult.success ? 'Update Completed Successfully' : 'Update Failed'}
                </div>
                
                {lastResult.message && (
                  <div className="text-sm text-muted-foreground">
                    {lastResult.message}
                  </div>
                )}
                
                {lastResult.error && (
                  <div className="text-sm text-red-600 dark:text-red-400">
                    {lastResult.error}
                  </div>
                )}
                
                {lastResult.stats && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    <Badge variant="secondary" className="text-xs gap-1">
                      <MapPin className="h-3 w-3" />
                      {lastResult.stats.totalLocations} locations
                    </Badge>
                    
                    {lastResult.stats.successfulUpdates > 0 && (
                      <Badge variant="secondary" className="text-xs gap-1 text-green-700 bg-green-100 dark:text-green-400 dark:bg-green-900/30">
                        <CheckCircle className="h-3 w-3" />
                        {lastResult.stats.successfulUpdates} updated
                      </Badge>
                    )}
                    
                    {lastResult.stats.failedUpdates > 0 && (
                      <Badge variant="secondary" className="text-xs gap-1 text-red-700 bg-red-100 dark:text-red-400 dark:bg-red-900/30">
                        <AlertTriangle className="h-3 w-3" />
                        {lastResult.stats.failedUpdates} failed
                      </Badge>
                    )}
                    
                    <Badge variant="secondary" className="text-xs gap-1">
                      <Clock className="h-3 w-3" />
                      {formatExecutionTime(lastResult.stats.executionTimeMs)}
                    </Badge>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        
        <div className="text-xs text-muted-foreground">
          <strong>Note:</strong> This requires OpenWeather API to be configured and locations to have valid coordinates.
          Updates are cached in the database and used by time-of-day automation filters.
        </div>
      </CardContent>
    </Card>
  );
} 