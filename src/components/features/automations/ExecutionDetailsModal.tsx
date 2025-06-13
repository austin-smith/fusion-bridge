'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Activity,
  Calendar,
  Timer,
  Pause,
  RotateCcw,
  ChevronRight,
  Building,
  MapPin
} from 'lucide-react';
import { format } from 'date-fns';
import type { AutomationExecutionSummary } from '@/services/automation-audit-query-service';

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
          icon: CheckCircle2,
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
          icon: CheckCircle2,
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

interface ExecutionDetailsModalProps {
  execution: AutomationExecutionSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExecutionDetailsModal({ 
  execution, 
  open, 
  onOpenChange 
}: ExecutionDetailsModalProps) {
  const [executionDetail, setExecutionDetail] = useState<AutomationExecutionDetail | null>(null);
  const [triggerEvent, setTriggerEvent] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [eventLoading, setEventLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchExecutionDetail = useCallback(async (executionId: string) => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/automations/executions?executionId=${executionId}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const apiResponse = await response.json();
      
      // Check if the API response has the expected structure
      if (!apiResponse.success || !apiResponse.data) {
        throw new Error('Invalid API response structure');
      }
      
      const data: AutomationExecutionDetail = apiResponse.data;
      
      // Convert date strings back to Date objects
      data.triggerTimestamp = new Date(data.triggerTimestamp);
      data.actions = (data.actions || []).map(action => ({
        ...action,
        startedAt: new Date(action.startedAt),
        completedAt: action.completedAt ? new Date(action.completedAt) : undefined,
      }));
      
      setExecutionDetail(data);

      // If this execution was triggered by an event, fetch the event details
      if (data.triggerEventId) {
        fetchTriggerEvent(data.triggerEventId);
      }
    } catch (err) {
      console.error('Failed to fetch execution detail:', err);
      setError('Failed to load execution details');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (execution && open) {
      fetchExecutionDetail(execution.id);
    }
  }, [execution, open, fetchExecutionDetail]);

  const fetchTriggerEvent = async (eventUuid: string) => {
    try {
      setEventLoading(true);
      const response = await fetch(`/api/events?eventUuid=${eventUuid}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      if (data.success && data.data) {
        setTriggerEvent(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch trigger event:', err);
      // Don't set error state for event fetch failure, just log it
    } finally {
      setEventLoading(false);
    }
  };

  if (!execution) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span>{execution.automationName}</span>
            <ExecutionStatusBadge status={execution.executionStatus} />
          </DialogTitle>
        </DialogHeader>
        
        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : error ? (
          <div className="p-4 bg-red-50 border border-red-200 rounded text-red-700 dark:bg-red-950 dark:border-red-800 dark:text-red-300">
            {error}
          </div>
        ) : executionDetail ? (
          <div className="space-y-6">
            {/* Overview Section */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide mb-2">
                  Triggered
                </div>
                <div className="text-sm font-medium">
                  {format(executionDetail.triggerTimestamp, 'PPp')}
                </div>
                <div className="text-xs text-muted-foreground">
                  {format(executionDetail.triggerTimestamp, 'PPp')}
                </div>
              </div>

              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide mb-2">
                  Trigger Type
                </div>
                <TriggerBadge triggerEventId={executionDetail.triggerEventId} />
              </div>

              {executionDetail.executionDurationMs && (
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wide mb-2">
                    Total Duration
                  </div>
                  <div className="flex items-center gap-1">
                    <Timer className="h-4 w-4 text-muted-foreground" />
                    <span className="font-mono text-sm">{formatDuration(executionDetail.executionDurationMs)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Trigger Event Details */}
            {executionDetail.triggerEventId && (
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide mb-3">
                  Trigger Event Details
                </div>
                {eventLoading ? (
                  <Skeleton className="h-32 w-full" />
                ) : triggerEvent ? (
                  <Card className="p-4 bg-blue-50/50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="text-xs">
                              {triggerEvent.eventCategory}
                            </Badge>
                            <Badge variant="secondary" className="text-xs">
                              {triggerEvent.eventType}
                            </Badge>
                            {triggerEvent.eventSubtype && (
                              <Badge variant="outline" className="text-xs">
                                {triggerEvent.eventSubtype}
                              </Badge>
                            )}
                          </div>
                          <div className="text-sm font-medium">
                            {triggerEvent.deviceName || triggerEvent.deviceId}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {triggerEvent.connectorName} • {format(new Date(triggerEvent.timestamp), 'p')}
                          </div>
                        </div>
                        <div className="text-right">
                          {triggerEvent.areaName && (
                            <div className="text-xs text-muted-foreground flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {triggerEvent.areaName}
                            </div>
                          )}
                          {triggerEvent.locationName && (
                            <div className="text-xs text-muted-foreground flex items-center gap-1">
                              <Building className="h-3 w-3" />
                              {triggerEvent.locationName}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Raw Event Data */}
                      {triggerEvent.rawPayload && Object.keys(triggerEvent.rawPayload).length > 0 && (
                        <details className="group">
                          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                            Raw Event Data (click to expand)
                          </summary>
                          <pre className="text-xs bg-muted p-3 rounded overflow-x-auto max-h-40 mt-2">
                            {JSON.stringify(triggerEvent.rawPayload, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  </Card>
                ) : (
                  <div className="p-4 bg-muted/50 border border-dashed rounded text-center text-sm text-muted-foreground">
                    Event details not available (Event ID: {executionDetail.triggerEventId})
                  </div>
                )}
              </div>
            )}

            {/* Actions Summary */}
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide mb-2">
                Actions Summary
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  {executionDetail.failedActions === 0 ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : executionDetail.successfulActions === 0 ? (
                    <XCircle className="h-4 w-4 text-red-600" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-yellow-600" />
                  )}
                  <span className="text-sm font-medium">
                    {executionDetail.failedActions === 0 ? executionDetail.totalActions :
                     executionDetail.successfulActions === 0 ? executionDetail.totalActions :
                     `${executionDetail.successfulActions}/${executionDetail.totalActions}`}
                  </span>
                </div>
                <div className="text-sm text-muted-foreground">
                  {executionDetail.successfulActions} of {executionDetail.totalActions} actions completed successfully
                </div>
              </div>
            </div>

            {/* Individual Actions */}
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide mb-3">
                Action Details ({executionDetail.actions.length} actions)
              </div>
              <div className="space-y-3">
                {executionDetail.actions.map((action) => (
                  <ActionCard key={action.id} action={action} />
                ))}
              </div>
            </div>

            {/* Technical Details Section */}
            <div className="border-t pt-4">
              <details className="group">
                <summary className="text-xs text-muted-foreground uppercase tracking-wide mb-3 cursor-pointer hover:text-foreground flex items-center gap-2">
                  <span>Technical Details</span>
                  <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
                </summary>
                
                <div className="mt-3 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Execution ID</div>
                      <code className="text-xs bg-muted px-2 py-1 rounded font-mono block">
                        {executionDetail.id}
                      </code>
                    </div>
                    
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Automation ID</div>
                      <code className="text-xs bg-muted px-2 py-1 rounded font-mono block">
                        {executionDetail.automationId}
                      </code>
                    </div>

                    {executionDetail.triggerEventId && (
                      <div className="md:col-span-2">
                        <div className="text-xs text-muted-foreground mb-1">Trigger Event ID</div>
                        <code className="text-xs bg-muted px-2 py-1 rounded font-mono block">
                          {executionDetail.triggerEventId}
                        </code>
                      </div>
                    )}
                  </div>

                  {/* Trigger Context */}
                  {Object.keys(executionDetail.triggerContext).length > 0 && (
                    <div>
                      <div className="text-xs text-muted-foreground mb-2">Trigger Context:</div>
                      <pre className="text-xs bg-muted p-3 rounded overflow-x-auto max-h-40">
                        {JSON.stringify(executionDetail.triggerContext, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </details>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            No execution details available
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
} 