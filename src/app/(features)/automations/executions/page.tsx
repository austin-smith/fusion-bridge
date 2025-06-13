'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Activity,
  Calendar,
  Timer,
  Target,
  ExternalLink,
  Eye,
  Play,
  Pause,
  RotateCcw,
  ChevronRight
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { type ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/lib/DataTable';
import { ExecutionDetailsModal } from '@/components/features/automations/ExecutionDetailsModal';
import type { AutomationExecutionSummary } from '@/services/automation-audit-query-service';

interface ExecutionResponse {
  executions: AutomationExecutionSummary[];
  hasMore: boolean;
}

interface AutomationActionExecutionDetail {
  id: string;
  actionIndex: number;
  actionType: string;
  actionParams: Record<string, any>;
  status: 'success' | 'failure' | 'skipped';
  errorMessage?: string;
  retryCount: number;
  executionDurationMs?: number;
  startedAt: Date;
  completedAt?: Date;
}

interface AutomationExecutionDetail extends AutomationExecutionSummary {
  triggerContext: Record<string, any>;
  actions: AutomationActionExecutionDetail[];
}

function ExecutionStatusBadge({ status }: { status: string }) {
  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'success':
        return {
          icon: CheckCircle2,
          className: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800',
          label: 'Success'
        };
      case 'partial_failure':
        return {
          icon: AlertTriangle,
          className: 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800',
          label: 'Partial'
        };
      case 'failure':
        return {
          icon: XCircle,
          className: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800',
          label: 'Failed'
        };
      default:
        return {
          icon: Clock,
          className: 'bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-950 dark:text-gray-300 dark:border-gray-800',
          label: 'Unknown'
        };
    }
  };

  const config = getStatusConfig(status);
  const IconComponent = config.icon;

  return (
    <Badge variant="outline" className={`${config.className} border font-medium`}>
      <IconComponent className="h-3 w-3 mr-1.5" />
      {config.label}
    </Badge>
  );
}

function ActionStatusBadge({ status }: { status: 'success' | 'failure' | 'skipped' }) {
  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'success':
        return {
          icon: CheckCircle2,
          className: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800',
          label: 'Success'
        };
      case 'failure':
        return {
          icon: XCircle,
          className: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800',
          label: 'Failed'
        };
      case 'skipped':
        return {
          icon: Pause,
          className: 'bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-950 dark:text-gray-300 dark:border-gray-800',
          label: 'Skipped'
        };
      default:
        return {
          icon: Clock,
          className: 'bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-950 dark:text-gray-300 dark:border-gray-800',
          label: 'Unknown'
        };
    }
  };

  const config = getStatusConfig(status);
  const IconComponent = config.icon;

  return (
    <Badge variant="outline" className={`${config.className} border text-xs`}>
      <IconComponent className="h-3 w-3 mr-1" />
      {config.label}
    </Badge>
  );
}

function ActionsSummary({ successful, total, failed }: { successful: number; total: number; failed: number }) {
  const successRate = total > 0 ? (successful / total) * 100 : 0;
  
  // Simple, clean display
  if (failed === 0) {
    // All successful - show green indicator
    return (
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-green-600" />
        <span className="text-sm font-medium">{total}</span>
      </div>
    );
  } else if (successful === 0) {
    // All failed - show red indicator
    return (
      <div className="flex items-center gap-2">
        <XCircle className="h-4 w-4 text-red-600" />
        <span className="text-sm font-medium">{total}</span>
      </div>
    );
  } else {
    // Mixed results - show warning with count
    return (
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-yellow-600" />
        <span className="text-sm font-medium">{successful}/{total}</span>
      </div>
    );
  }
}

function TriggerBadge({ triggerEventId }: { triggerEventId?: string }) {
  const isEvent = !!triggerEventId;
  
  return (
    <Badge variant="secondary" className="text-xs font-medium">
      {isEvent ? (
        <>
          <Activity className="h-3 w-3 mr-1" />
          Event
        </>
      ) : (
        <>
          <Calendar className="h-3 w-3 mr-1" />
          Schedule
        </>
      )}
    </Badge>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function ConditionsStatus({ 
  stateConditionsMet, 
  temporalConditionsMet 
}: { 
  stateConditionsMet?: boolean; 
  temporalConditionsMet?: boolean; 
}) {
  if (stateConditionsMet === undefined && temporalConditionsMet === undefined) {
    return <span className="text-xs text-muted-foreground">No conditions</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {stateConditionsMet !== undefined && (
        <Badge variant={stateConditionsMet ? 'default' : 'destructive'} className="text-xs">
          State: {stateConditionsMet ? 'Met' : 'Not Met'}
        </Badge>
      )}
      {temporalConditionsMet !== undefined && (
        <Badge variant={temporalConditionsMet ? 'default' : 'destructive'} className="text-xs">
          Temporal: {temporalConditionsMet ? 'Met' : 'Not Met'}
        </Badge>
      )}
    </div>
  );
}

function ActionCard({ action }: { action: AutomationActionExecutionDetail }) {
  return (
    <Card className="p-4">
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-muted-foreground">#{action.actionIndex + 1}</span>
              <h4 className="font-medium text-sm">{action.actionType}</h4>
            </div>
            <div className="text-xs text-muted-foreground">
              Started: {format(action.startedAt, 'p')}
              {action.completedAt && (
                <> • Completed: {format(action.completedAt, 'p')}</>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ActionStatusBadge status={action.status} />
            {action.executionDurationMs && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Timer className="h-3 w-3" />
                {formatDuration(action.executionDurationMs)}
              </div>
            )}
          </div>
        </div>

        {action.retryCount > 0 && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <RotateCcw className="h-3 w-3" />
            Retried {action.retryCount} time{action.retryCount !== 1 ? 's' : ''}
          </div>
        )}

        {action.errorMessage && (
          <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700 dark:bg-red-950 dark:border-red-800 dark:text-red-300">
            <strong>Error:</strong> {action.errorMessage}
          </div>
        )}

        {Object.keys(action.actionParams).length > 0 && (
          <div>
            <div className="text-xs text-muted-foreground mb-1">Parameters:</div>
            <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
              {JSON.stringify(action.actionParams, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </Card>
  );
}

export default function AutomationExecutionsPage() {
  const [executions, setExecutions] = useState<AutomationExecutionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [selectedExecution, setSelectedExecution] = useState<AutomationExecutionSummary | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [windowWidth, setWindowWidth] = useState(0);

  // Set page title
  useEffect(() => {
    document.title = 'Automation Log // Fusion';
  }, []);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    handleResize(); // Set initial width
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const fetchExecutions = useCallback(async (loadMore = false) => {
    try {
      if (loadMore) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      
      const currentOffset = loadMore ? offset : 0;
      const response = await fetch(`/api/automations/executions?limit=50&offset=${currentOffset}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const apiResponse = await response.json();
      
      // Check if the API response has the expected structure
      if (!apiResponse.success || !apiResponse.data) {
        throw new Error('Invalid API response structure');
      }
      
      const data = apiResponse.data;
      const executions = data.executions || [];
      const hasMoreData = data.pagination?.hasMore ?? false;
      
      if (loadMore) {
        // Append new executions to existing ones
        setExecutions(prev => [...prev, ...executions]);
        setOffset(prev => prev + executions.length);
      } else {
        // Replace executions (initial load)
        setExecutions(executions);
        setOffset(executions.length);
      }
      
      setHasMore(hasMoreData);
    } catch (err) {
      console.error('Failed to fetch executions:', err);
      setError('Failed to load execution history');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [offset]);

  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      fetchExecutions(true);
    }
  };

  useEffect(() => {
    fetchExecutions();
  }, [fetchExecutions]);

  const openExecutionDetails = (execution: AutomationExecutionSummary) => {
    setSelectedExecution(execution);
    setModalOpen(true);
  };

  const handleRowClick = (row: any) => {
    openExecutionDetails(row.original);
  };

  // Base columns that are always visible
  const baseColumns: ColumnDef<AutomationExecutionSummary>[] = [
    {
      accessorKey: 'automationName',
      header: 'Automation',
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="font-medium text-sm truncate pr-2">
            {row.getValue('automationName')}
          </div>
          <div className="flex items-center gap-2 mt-1 md:hidden">
            <ExecutionStatusBadge status={row.original.executionStatus} />
            <TriggerBadge triggerEventId={row.original.triggerEventId} />
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'triggerTimestamp',
      header: 'Time',
      cell: ({ row }) => {
        const timestamp = row.getValue('triggerTimestamp') as Date;
        return (
          <div className="min-w-0">
            <div className="text-sm font-medium">
              {format(timestamp, 'MMM d, p')}
            </div>
            <div className="text-xs text-muted-foreground truncate">
              {formatDistanceToNow(timestamp, { addSuffix: true })}
            </div>
          </div>
        );
      },
    },
  ];

  // Medium screen columns (md+)
  const mediumColumns: ColumnDef<AutomationExecutionSummary>[] = [
    {
      accessorKey: 'executionStatus',
      header: 'Status',
      cell: ({ row }) => (
        <ExecutionStatusBadge status={row.getValue('executionStatus')} />
      ),
    },
    {
      id: 'trigger',
      header: 'Trigger',
      cell: ({ row }) => (
        <TriggerBadge triggerEventId={row.original.triggerEventId} />
      ),
    },
  ];

  // Large screen columns (lg+)
  const largeColumns: ColumnDef<AutomationExecutionSummary>[] = [
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <ActionsSummary
          successful={row.original.successfulActions}
          total={row.original.totalActions}
          failed={row.original.failedActions}
        />
      ),
    },
  ];

  // Extra large screen columns (xl+)
  const extraLargeColumns: ColumnDef<AutomationExecutionSummary>[] = [
    {
      accessorKey: 'executionDurationMs',
      header: 'Duration',
      cell: ({ row }) => {
        const duration = row.getValue('executionDurationMs') as number | undefined;
        if (!duration) return <span className="text-xs text-muted-foreground">—</span>;
        
        return (
          <div className="flex items-center gap-1">
            <Timer className="h-3 w-3 text-muted-foreground" />
            <span className="text-sm font-mono">{formatDuration(duration)}</span>
          </div>
        );
      },
    },
  ];

  // Details column (always last)
  const detailsColumn: ColumnDef<AutomationExecutionSummary> = {
    id: 'details',
    header: '',
    cell: ({ row }) => (
      <div className="flex justify-end">
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-8 w-8 p-0"
          onClick={(e) => {
            e.stopPropagation();
            openExecutionDetails(row.original);
          }}
        >
          <Eye className="h-4 w-4" />
        </Button>
      </div>
    ),
  };

  // Build responsive columns based on screen size
  const getResponsiveColumns = () => {
    const columns = [...baseColumns];
    
    // Add medium screen columns (768px+)
    if (windowWidth >= 768) {
      columns.splice(1, 0, ...mediumColumns); // Insert after automation name
    }
    
    // Add large screen columns (1024px+)
    if (windowWidth >= 1024) {
      columns.push(...largeColumns);
    }
    
    // Add extra large screen columns (1280px+)
    if (windowWidth >= 1280) {
      columns.push(...extraLargeColumns);
    }
    
    // Always add details column last
    columns.push(detailsColumn);
    
    return columns;
  };

  const responsiveColumns = getResponsiveColumns();

  // Mobile card view for small screens
  function ExecutionMobileCard({ execution }: { execution: AutomationExecutionSummary }) {
    return (
      <Card 
        className="overflow-hidden cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => openExecutionDetails(execution)}
      >
        <div className="p-4">
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="font-medium text-sm truncate">{execution.automationName}</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {format(execution.triggerTimestamp, 'MMM d, p')} • {formatDistanceToNow(execution.triggerTimestamp, { addSuffix: true })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <ExecutionStatusBadge status={execution.executionStatus} />
                <Eye className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <TriggerBadge triggerEventId={execution.triggerEventId} />
                {execution.executionDurationMs && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Timer className="h-3 w-3" />
                    {formatDuration(execution.executionDurationMs)}
                  </div>
                )}
              </div>
              <ActionsSummary
                successful={execution.successfulActions}
                total={execution.totalActions}
                failed={execution.failedActions}
              />
            </div>
          </div>
        </div>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="container mx-auto p-4 md:p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Automation Log</h1>
          <p className="text-muted-foreground">View automation execution history and audit logs</p>
        </div>
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 md:h-12 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-4 md:p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Automation Log</h1>
          <p className="text-muted-foreground">View automation execution history and audit logs</p>
        </div>
        <Card className="p-6 bg-destructive/10 border-destructive">
          <div className="flex items-center space-x-3">
            <AlertTriangle className="h-6 w-6 text-destructive" />
            <div className="text-destructive font-medium">{error}</div>
          </div>
          <Button variant="outline" className="mt-4" onClick={() => fetchExecutions()}>
            Try Again
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Automation Log</h1>
        <p className="text-muted-foreground">
          View automation execution history and audit logs
        </p>
      </div>

      {executions.length === 0 ? (
        <Card className="p-6 text-center">
          <CardTitle className="mb-2">No Executions Found</CardTitle>
          <p className="text-muted-foreground">
            No automation executions have been recorded yet. Trigger some automations to see them here.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Mobile view - cards */}
          <div className="block md:hidden space-y-3">
            {executions.map((execution) => (
              <ExecutionMobileCard key={execution.id} execution={execution} />
            ))}
          </div>

          {/* Desktop view - table */}
          <div className="hidden md:block">
            <DataTable
              columns={responsiveColumns}
              data={executions}
              onRowClick={handleRowClick}
            />
          </div>
          
          {hasMore && (
            <div className="flex justify-center pt-4">
              <Button 
                variant="outline" 
                onClick={handleLoadMore}
                disabled={loadingMore}
              >
                {loadingMore ? 'Loading...' : 'Load More'}
              </Button>
            </div>
          )}
        </div>
      )}

      <ExecutionDetailsModal
        execution={selectedExecution}
        open={modalOpen}
        onOpenChange={setModalOpen}
      />
    </div>
  );
} 