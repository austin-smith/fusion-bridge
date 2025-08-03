'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Search, Loader2, AlertCircle, Settings, List, Group } from 'lucide-react';

import { LinearIssuesTable } from '@/components/features/linear/linear-issues-table';
import { LinearIssuesTableSkeleton } from '@/components/features/linear/linear-issues-table';
import { LinearIssueDetailDialog } from '@/components/features/linear/linear-issue-detail-dialog';
import type { LinearIssue } from '@/services/drivers/linear';

interface LinearConfig {
  configured: boolean;
  reason?: 'not_configured' | 'disabled' | 'no_team' | 'error' | 'unknown';
  teamId?: string;
  teamName?: string;
}

export default function RoadmapPage() {
  const [config, setConfig] = useState<LinearConfig | null>(null);
  const [issues, setIssues] = useState<LinearIssue[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [selectedIssue, setSelectedIssue] = useState<LinearIssue | null>(null);
  const [enableGrouping, setEnableGrouping] = useState(false);
  const [activeOnly, setActiveOnly] = useState(true);

  const fetchLinearData = useCallback(async () => {
    setIsLoading(true);
    setError('');
    
    try {
      console.log('Fetching Linear data...');
      
      const issuesResponse = await fetch(`/api/services/linear/issues?activeOnly=${activeOnly}`, {
        credentials: 'include'
      });

      if (!issuesResponse.ok) {
        const errorData = await issuesResponse.json();
        
        // Handle configuration errors by setting config state
        if (issuesResponse.status === 400) {
          if (errorData.error.includes('not configured')) {
            setConfig({ configured: false, reason: 'not_configured' });
          } else if (errorData.error.includes('disabled')) {
            setConfig({ configured: false, reason: 'disabled' });
          } else if (errorData.error.includes('team')) {
            setConfig({ configured: false, reason: 'no_team' });
          } else {
            setConfig({ configured: false, reason: 'unknown' });
          }
          return;
        }
        
        throw new Error(`Failed to fetch issues: HTTP ${issuesResponse.status}`);
      }

      const issuesData = await issuesResponse.json();

      console.log('Linear data fetched successfully:', {
        issuesCount: issuesData.data?.issues?.length || 0
      });

      setConfig({ configured: true });
      setIssues(issuesData.data?.issues || []);
      setError('');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('Error fetching Linear data:', error);
      setError(errorMessage);
      setIssues([]);
    } finally {
      setIsLoading(false);
    }
  }, [activeOnly]);

  const handleRefresh = useCallback(async () => {
    await fetchLinearData();
  }, [fetchLinearData]);

  // Initial load
  useEffect(() => {
    fetchLinearData();
  }, [fetchLinearData]);

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      {/* Page Header */}
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Roadmap</h2>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tasks..."
            className="pl-8"
            disabled
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 border rounded-md p-1">
            <Button
              variant={activeOnly ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setActiveOnly(true)}
              className="h-8"
            >
              Active
            </Button>
            <Button
              variant={!activeOnly ? "secondary" : "ghost"}
              size="sm" 
              onClick={() => setActiveOnly(false)}
              className="h-8"
            >
              All
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEnableGrouping(!enableGrouping)}
            className="flex items-center gap-2"
          >
            {enableGrouping ? <Group className="h-4 w-4" /> : <List className="h-4 w-4" />}
            {enableGrouping ? "Grouped" : "Flat"}
          </Button>
        </div>
      </div>

      {/* Content based on state */}
      {isLoading && <LinearIssuesTableSkeleton />}

      {!isLoading && !config?.configured && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              Linear Configuration Required
            </CardTitle>
            <CardDescription>
              Linear integration needs to be configured before you can view tasks.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {config?.reason === 'not_configured' 
                  ? 'Add your Linear API key to get started.'
                  : config?.reason === 'disabled'
                  ? 'Enable the Linear service to view tasks.'
                  : config?.reason === 'no_team'
                  ? 'Select a Linear team to view tasks.'
                  : 'There was a problem with your Linear configuration.'
                } Go to Settings to configure your Linear integration.
              </p>
              <Button asChild>
                <a href="/settings" className="inline-flex items-center">
                  <Settings className="mr-2 h-4 w-4" />
                  Configure Linear
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!isLoading && error && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-500" />
              Error Loading Linear Tasks
            </CardTitle>
            <CardDescription>
              There was a problem fetching Linear tasks.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground bg-muted p-3 rounded-md font-mono">
                {error}
              </div>
              <div className="text-sm text-muted-foreground">
                <p>Try the following:</p>
                <ul className="list-disc list-inside space-y-1 mt-2">
                  <li>Check your Linear configuration in Settings</li>
                  <li>Verify your API key is valid and has the right permissions</li>
                  <li>Ensure your team selection is correct</li>
                  <li>Try refreshing the page</li>
                </ul>
              </div>
              <Button onClick={handleRefresh} disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  'Try Again'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!isLoading && config?.configured && !error && (
        <LinearIssuesTable
          issues={issues}
          onRowClick={setSelectedIssue}
          enableGrouping={enableGrouping}
        />
      )}

      {selectedIssue && (
        <LinearIssueDetailDialog
          issue={selectedIssue}
          isOpen={!!selectedIssue}
          onClose={() => setSelectedIssue(null)}
        />
      )}
    </div>
  );
}