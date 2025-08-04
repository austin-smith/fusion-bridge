'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { 
  ExternalLink, 
  User, 
  Loader2
} from 'lucide-react';
import type { LinearIssue } from '@/services/drivers/linear';
import { MarkdownRenderer } from '@/components/ui/chat/markdown-renderer';
import { toast } from 'sonner';
import { getStateIcon, getLinearPriorityOptions } from '@/lib/linear-utils';

interface LinearIssueDetailDialogProps {
  issue: LinearIssue | null;
  availableStates: Array<{ id: string; name: string; color: string; type: string }>;
  isOpen: boolean;
  onClose: () => void;
  onIssueUpdate?: (updatedIssue: LinearIssue) => void;
}

export function LinearIssueDetailDialog({ 
  issue, 
  availableStates, 
  isOpen, 
  onClose, 
  onIssueUpdate 
}: LinearIssueDetailDialogProps) {
  const [localIssue, setLocalIssue] = useState<LinearIssue | null>(issue);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isUpdatingPriority, setIsUpdatingPriority] = useState(false);

  // Update local state when issue prop changes
  useEffect(() => {
    setLocalIssue(issue);
  }, [issue]);

  if (!localIssue) {
    return null;
  }

  const handleOpenInLinear = () => {
    window.open(localIssue.url, '_blank', 'noopener,noreferrer');
  };

  const handleStatusChange = async (newStateId: string) => {
    if (!localIssue || newStateId === localIssue.state.id) return;

    // Find the new state details
    const newState = availableStates.find(state => state.id === newStateId);
    if (!newState) return;

    setIsUpdatingStatus(true);

    // Optimistic update
    const originalIssue = { ...localIssue };
    const updatedIssue = {
      ...localIssue,
      state: {
        id: newState.id,
        name: newState.name,
        color: newState.color,
        type: newState.type,
      }
    };
    setLocalIssue(updatedIssue);

    try {
      // Call API to update Linear
      const response = await fetch(`/api/services/linear/issues/${localIssue.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stateId: newStateId })
      });

      if (!response.ok) {
        throw new Error('Failed to update issue');
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Failed to update issue');
      }

      // Update with actual response data
      setLocalIssue(result.data);
      
      // Notify parent component
      if (onIssueUpdate) {
        onIssueUpdate(result.data);
      }

      toast.success(`Moved issue to ${newState.name}`);
    } catch (error) {
      // Revert optimistic update
      setLocalIssue(originalIssue);
      toast.error(error instanceof Error ? error.message : 'Failed to update issue');
      console.error('Error updating Linear issue:', error);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handlePriorityChange = async (newPriorityString: string) => {
    const newPriority = parseInt(newPriorityString);
    if (!localIssue || newPriority === localIssue.priority) return;

    setIsUpdatingPriority(true);

    // Optimistic update
    const originalIssue = { ...localIssue };
    const updatedIssue = {
      ...localIssue,
      priority: newPriority,
    };
    setLocalIssue(updatedIssue);

    try {
      // Call API to update Linear
      const response = await fetch(`/api/services/linear/issues/${localIssue.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority: newPriority })
      });

      if (!response.ok) {
        throw new Error('Failed to update issue');
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Failed to update issue');
      }

      // Update with actual response data
      setLocalIssue(result.data);
      
      // Notify parent component
      if (onIssueUpdate) {
        onIssueUpdate(result.data);
      }

      const priorityOptions = getLinearPriorityOptions();
      const priorityLabel = priorityOptions.find(p => p.value === newPriority)?.label || 'Unknown';
      toast.success(`Updated priority to ${priorityLabel}`);
    } catch (error) {
      // Revert optimistic update
      setLocalIssue(originalIssue);
      toast.error(error instanceof Error ? error.message : 'Failed to update priority');
      console.error('Error updating Linear issue priority:', error);
    } finally {
      setIsUpdatingPriority(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl h-[90vh] overflow-hidden p-0">
        <div className="flex h-full overflow-hidden">
          {/* Main Content Area */}
          <div className="flex-1 flex flex-col min-w-0">
            <DialogHeader className="px-8 py-6 border-b bg-muted/20 flex-shrink-0">
              <div className="flex items-center gap-3 mb-4">
                <span className="font-mono text-sm text-muted-foreground">
                  {localIssue.team.name}
                </span>
                <span className="text-muted-foreground">›</span>
                <span className="font-mono text-sm font-medium">
                  {localIssue.identifier}
                </span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleOpenInLinear}
                        className="text-muted-foreground hover:text-foreground h-auto p-1 ml-auto"
                        tabIndex={-1}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      <p>Open in Linear</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <DialogTitle className="text-3xl font-bold leading-tight text-left pr-8">
                {localIssue.title}
              </DialogTitle>
            </DialogHeader>

            <div className="flex-1 overflow-auto px-8 py-6 min-h-0">
              {localIssue.description ? (
                <div className="prose prose-lg max-w-none">
                  <MarkdownRenderer>{localIssue.description}</MarkdownRenderer>
                </div>
              ) : (
                <div className="text-muted-foreground italic">
                  No description provided.
                </div>
              )}
            </div>
          </div>

          {/* Properties Sidebar */}
          <div className="w-80 flex-shrink-0 border-l bg-muted/10 overflow-y-auto">
            <div className="p-6 space-y-6">
              <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Properties
              </div>

              {/* Status */}
              <div className="space-y-2">
                <div className="text-sm font-medium text-muted-foreground">Status</div>
                <Select 
                  value={localIssue.state.id} 
                  onValueChange={handleStatusChange}
                  disabled={isUpdatingStatus}
                >
                  <SelectTrigger className="w-fit min-w-32">
                    {isUpdatingStatus ? (
                      <div className="flex items-center gap-2 mr-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Updating...</span>
                      </div>
                    ) : (
                      <div className="mr-2">
                        <SelectValue />
                      </div>
                    )}
                  </SelectTrigger>
                  <SelectContent>
                    {availableStates.map(state => {
                      const StateIcon = getStateIcon(state.type);
                      return (
                        <SelectItem key={state.id} value={state.id}>
                          <div className="flex items-center gap-2">
                            <StateIcon 
                              className="h-4 w-4" 
                              style={{ color: state.color }}
                            />
                            <span>{state.name}</span>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              {/* Priority */}
              <div className="space-y-2">
                <div className="text-sm font-medium text-muted-foreground">Priority</div>
                <Select 
                  value={localIssue.priority.toString()} 
                  onValueChange={handlePriorityChange}
                  disabled={isUpdatingPriority}
                >
                  <SelectTrigger className="w-fit min-w-32">
                    {isUpdatingPriority ? (
                      <div className="flex items-center gap-2 mr-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Updating...</span>
                      </div>
                    ) : (
                      <div className="mr-2">
                        <SelectValue />
                      </div>
                    )}
                  </SelectTrigger>
                  <SelectContent>
                    {getLinearPriorityOptions().map(priority => {
                      const PriorityIcon = priority.icon;
                      return (
                        <SelectItem key={priority.value} value={priority.value.toString()}>
                          <div className="flex items-center gap-2">
                            <PriorityIcon 
                              className="h-4 w-4" 
                              style={{ color: priority.color, fill: priority.color }}
                            />
                            <span>{priority.label}</span>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              {/* Assignee */}
              <div className="space-y-2">
                <div className="text-sm font-medium text-muted-foreground">Assignee</div>
                {localIssue.assignee ? (
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-sm font-medium">
                        {localIssue.assignee.name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="font-medium">{localIssue.assignee.name}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-muted">
                        <User className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-muted-foreground">Unassigned</span>
                  </div>
                )}
              </div>

              {/* Creator */}
              <div className="space-y-2">
                <div className="text-sm font-medium text-muted-foreground">Created by</div>
                {localIssue.creator ? (
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-sm font-medium">
                        {localIssue.creator.name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="font-medium">{localIssue.creator.name}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-sm font-medium">
                        ?
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-muted-foreground">Unknown</span>
                  </div>
                )}
              </div>

              {/* Labels */}
              {localIssue.labels.length > 0 && (
                <div className="space-y-2">
                  <div className="text-sm font-medium text-muted-foreground">Labels</div>
                  <div className="flex flex-wrap gap-2">
                    {localIssue.labels.map((label) => (
                      <Badge 
                        key={label.id} 
                        variant="outline" 
                        className="text-sm font-medium"
                        style={{ 
                          borderColor: label.color,
                          backgroundColor: `${label.color}15`,
                          color: label.color
                        }}
                      >
                        {label.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Estimate */}
              {localIssue.estimate && (
                <div className="space-y-2">
                  <div className="text-sm font-medium text-muted-foreground">Estimate</div>
                  <div className="text-sm font-semibold">
                    {localIssue.estimate} point{localIssue.estimate !== 1 ? 's' : ''}
                  </div>
                </div>
              )}

              {/* Dates */}
              <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">Created</div>
                  <div className="text-sm">
                    {(localIssue.createdAt instanceof Date ? localIssue.createdAt : new Date(localIssue.createdAt)).toLocaleDateString()}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {(localIssue.createdAt instanceof Date ? localIssue.createdAt : new Date(localIssue.createdAt)).toLocaleTimeString()}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">Updated</div>
                  <div className="text-sm">
                    {(localIssue.updatedAt instanceof Date ? localIssue.updatedAt : new Date(localIssue.updatedAt)).toLocaleDateString()}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {(localIssue.updatedAt instanceof Date ? localIssue.updatedAt : new Date(localIssue.updatedAt)).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}