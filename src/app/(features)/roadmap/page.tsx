'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Search, Loader2, AlertCircle, Settings, SquareKanban, Table, Table2, Map } from 'lucide-react';

import { LinearIssuesTable } from '@/components/features/linear/linear-issues-table';
import { LinearIssuesTableSkeleton } from '@/components/features/linear/linear-issues-table';
import { LinearKanbanBoard, LinearKanbanBoardSkeleton } from '@/components/features/linear/linear-kanban-board';
import { LinearIssueDetailDialog } from '@/components/features/linear/linear-issue-detail-dialog';
import type { LinearIssue, LinearUser } from '@/services/drivers/linear';
import { useFusionStore } from '@/stores/store';
import { PageHeader } from '@/components/layout/page-header';
import { extractStatesFromIssues } from '@/lib/linear-utils';

interface LinearConfig {
  configured: boolean;
  reason?: 'not_configured' | 'disabled' | 'no_team' | 'error' | 'unknown';
  teamId?: string;
  teamName?: string;
}

export default function RoadmapPage() {
  const [config, setConfig] = useState<LinearConfig | null>(null);
  const [issues, setIssues] = useState<LinearIssue[]>([]);
  const [teamMembers, setTeamMembers] = useState<LinearUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [selectedIssue, setSelectedIssue] = useState<LinearIssue | null>(null);
  const [activeOnly, setActiveOnly] = useState(true);
  
  // Use store for view type preference
  const { roadmapViewType, setRoadmapViewType, initializeRoadmapPreferences } = useFusionStore();
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);

  const fetchLinearData = useCallback(async () => {
    setIsLoading(true);
    setError('');
    
    try {
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
      const teamId = issuesData.meta?.teamId;

      // Fetch team members if we have a team ID
      let teamMembersData: LinearUser[] = [];
      if (teamId) {
        try {
          const membersResponse = await fetch(
            `/api/services/linear/teams/${teamId}/members?limit=50&activeOnly=true`,
            { credentials: 'include' }
          );
          
          if (membersResponse.ok) {
            const membersJson = await membersResponse.json();
            teamMembersData = membersJson.success ? membersJson.data : [];
          } else {
            console.warn('Failed to fetch team members, continuing without assignee functionality');
          }
        } catch (membersError) {
          console.warn('Error fetching team members:', membersError);
          // Continue without team members - graceful degradation
        }
      }

      setConfig({ configured: true, teamId });
      setIssues(issuesData.data?.issues || []);
      setTeamMembers(teamMembersData);
      setError('');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('Error fetching Linear data:', error);
      setError(errorMessage);
      setIssues([]);
      setTeamMembers([]);
    } finally {
      setIsLoading(false);
    }
  }, [activeOnly]);

  const handleRefresh = useCallback(async () => {
    await fetchLinearData();
  }, [fetchLinearData]);

  // Initialize roadmap preferences on mount
  useEffect(() => {
    initializeRoadmapPreferences();
    setPreferencesLoaded(true);
  }, [initializeRoadmapPreferences]);

  // Initial load
  useEffect(() => {
    fetchLinearData();
  }, [fetchLinearData]);

  return (
    <div className="flex flex-col h-full p-4 md:p-6">
      <PageHeader 
        title={
          <div className="flex items-center gap-2">
            Roadmap
            {!isLoading && config?.configured && !error && (
              <Badge 
                variant="secondary"
                className="rounded-full"
              >
                {issues.length}
              </Badge>
            )}
          </div>
        }
        icon={<Map className="h-6 w-6" />}
      />

      {/* Search and Filters */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:gap-2 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tasks..."
            className="pl-8"
            disabled
          />
        </div>
        <div className="flex items-center gap-2">
          {/* Active/All toggle */}
          <TooltipProvider>
            <div className="flex items-center gap-1 border rounded-md p-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={activeOnly ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setActiveOnly(true)}
                    className="h-8"
                  >
                    Active
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Show active issues only</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={!activeOnly ? "secondary" : "ghost"}
                    size="sm" 
                    onClick={() => setActiveOnly(false)}
                    className="h-8"
                  >
                    All
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Show all issues</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>

          {/* View Type toggle */}
          {preferencesLoaded ? (
            <TooltipProvider>
              <div className="flex items-center gap-1 border rounded-md p-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={roadmapViewType === 'table-grouped' ? "secondary" : "ghost"}
                      size="sm"
                      onClick={() => setRoadmapViewType('table-grouped')}
                      className="h-8"
                    >
                      <Table2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Grouped Table</p>
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={roadmapViewType === 'table-flat' ? "secondary" : "ghost"}
                      size="sm"
                      onClick={() => setRoadmapViewType('table-flat')}
                      className="h-8"
                    >
                      <Table className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Flat Table</p>
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={roadmapViewType === 'kanban' ? "secondary" : "ghost"}
                      size="sm"
                      onClick={() => setRoadmapViewType('kanban')}
                      className="h-8"
                    >
                      <SquareKanban className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Kanban Board</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          ) : (
            <div className="flex items-center gap-1 border rounded-md p-1">
              <div className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium h-8 px-3">
                <div className="h-4 w-4 bg-muted animate-pulse rounded" />
              </div>
              <div className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium h-8 px-3">
                <div className="h-4 w-4 bg-muted animate-pulse rounded" />
              </div>
              <div className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium h-8 px-3">
                <div className="h-4 w-4 bg-muted animate-pulse rounded" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Content based on state */}
      {isLoading && (
        roadmapViewType === 'kanban' ? 
          <LinearKanbanBoardSkeleton /> : 
          <LinearIssuesTableSkeleton />
      )}

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
                  <Settings className="h-4 w-4" />
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
        <>
          {roadmapViewType === 'kanban' ? (
            <LinearKanbanBoard
              issues={issues}
              onCardClick={setSelectedIssue}
            />
          ) : (
            <LinearIssuesTable
              issues={issues}
              onRowClick={setSelectedIssue}
              enableGrouping={roadmapViewType === 'table-grouped'}
            />
          )}
        </>
      )}

      {selectedIssue && (
        <LinearIssueDetailDialog
          issue={selectedIssue}
          availableStates={extractStatesFromIssues(issues)}
          teamMembers={teamMembers}
          isOpen={!!selectedIssue}
          onClose={() => setSelectedIssue(null)}
          onIssueUpdate={(updatedIssue) => {
            // Update the issue in the local state
            setIssues(prevIssues => 
              prevIssues.map(issue => 
                issue.id === updatedIssue.id ? updatedIssue : issue
              )
            );
            // Update the selected issue to reflect changes
            setSelectedIssue(updatedIssue);
          }}
        />
      )}
    </div>
  );
}