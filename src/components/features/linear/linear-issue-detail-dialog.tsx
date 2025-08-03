'use client';

import React from 'react';
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { 
  ExternalLink, 
  User, 
  Circle,
  CircleDashed,
  CircleCheck,
  LoaderCircle,
  CircleX,
  AlertCircle,
  SignalHigh,
  SignalMedium,
  SignalLow,
  Ellipsis
} from 'lucide-react';
import type { LinearIssue } from '@/services/drivers/linear';
import { MarkdownRenderer } from '@/components/ui/chat/markdown-renderer';

interface LinearIssueDetailDialogProps {
  issue: LinearIssue | null;
  isOpen: boolean;
  onClose: () => void;
}

// Priority configuration
const getPriorityConfig = (priority: number) => {
  const configs = {
    0: { label: 'No Priority', color: '#6b7280', icon: Ellipsis }, // gray-500
    1: { label: 'Urgent', color: '#ef4444', icon: AlertCircle },     // red-500
    2: { label: 'High', color: '#f97316', icon: SignalHigh },        // orange-500
    3: { label: 'Medium', color: '#eab308', icon: SignalMedium },    // yellow-500
    4: { label: 'Low', color: '#3b82f6', icon: SignalLow },          // blue-500
  };
  return configs[priority as keyof typeof configs] || configs[0];
};



export function LinearIssueDetailDialog({ issue, isOpen, onClose }: LinearIssueDetailDialogProps) {
  if (!issue) {
    return null;
  }

  const priorityConfig = getPriorityConfig(issue.priority);

  // Map state type to icon
  const getStateIcon = (type: string) => {
    switch (type) {
      case 'unstarted': return Circle; // Todo
      case 'backlog': return CircleDashed;
      case 'started': return LoaderCircle; // In Progress
      case 'completed': return CircleCheck; // Done
      case 'canceled': return CircleX;
      default: return Circle;
    }
  };

  const StateIconComponent = getStateIcon(issue.state.type);

  const handleOpenInLinear = () => {
    window.open(issue.url, '_blank', 'noopener,noreferrer');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden p-0">
        <div className="flex h-full">
          {/* Main Content Area */}
          <div className="flex-1 overflow-y-auto">
            <DialogHeader className="px-8 py-6 border-b bg-muted/20">
              <div className="flex items-center gap-3 mb-4">
                <span className="font-mono text-sm text-muted-foreground">
                  {issue.team.name}
                </span>
                <span className="text-muted-foreground">›</span>
                <span className="font-mono text-sm font-medium">
                  {issue.identifier}
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
                {issue.title}
              </DialogTitle>
            </DialogHeader>

            <div className="px-8 py-6">
              {issue.description ? (
                <div className="prose prose-lg max-w-none">
                  <MarkdownRenderer>{issue.description}</MarkdownRenderer>
                </div>
              ) : (
                <div className="text-muted-foreground italic">
                  No description provided.
                </div>
              )}
            </div>
          </div>

          {/* Properties Sidebar */}
          <div className="w-80 border-l bg-muted/10 overflow-y-auto">
            <div className="p-6 space-y-6">
              <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Properties
              </div>

              {/* Status */}
              <div className="space-y-2">
                <div className="text-sm font-medium text-muted-foreground">Status</div>
                <Badge 
                  variant="outline"
                  className="text-sm font-medium w-fit"
                  style={{ 
                    borderColor: issue.state.color,
                    backgroundColor: `${issue.state.color}15`,
                    color: issue.state.color
                  }}
                >
                  <StateIconComponent className="h-4 w-4 mr-2" />
                  {issue.state.name}
                </Badge>
              </div>

              {/* Priority */}
              <div className="space-y-2">
                <div className="text-sm font-medium text-muted-foreground">Priority</div>
                <Badge 
                  variant="outline"
                  className="text-sm font-medium w-fit"
                  style={{ 
                    borderColor: priorityConfig.color,
                    backgroundColor: `${priorityConfig.color}15`,
                    color: priorityConfig.color
                  }}
                >
                  <priorityConfig.icon className="h-4 w-4 mr-2" />
                  {priorityConfig.label}
                </Badge>
              </div>

              {/* Assignee */}
              <div className="space-y-2">
                <div className="text-sm font-medium text-muted-foreground">Assignee</div>
                {issue.assignee ? (
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-sm font-medium">
                        {(issue.assignee.displayName || issue.assignee.name).charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="font-medium">{issue.assignee.displayName || issue.assignee.name}</span>
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
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-sm font-medium">
                      {(issue.creator.displayName || issue.creator.name).charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="font-medium">{issue.creator.displayName || issue.creator.name}</span>
                </div>
              </div>

              {/* Labels */}
              {issue.labels.length > 0 && (
                <div className="space-y-2">
                  <div className="text-sm font-medium text-muted-foreground">Labels</div>
                  <div className="flex flex-wrap gap-2">
                    {issue.labels.map((label) => (
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
              {issue.estimate && (
                <div className="space-y-2">
                  <div className="text-sm font-medium text-muted-foreground">Estimate</div>
                  <div className="text-sm font-semibold">
                    {issue.estimate} point{issue.estimate !== 1 ? 's' : ''}
                  </div>
                </div>
              )}

              {/* Dates */}
              <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">Created</div>
                  <div className="text-sm">
                    {(issue.createdAt instanceof Date ? issue.createdAt : new Date(issue.createdAt)).toLocaleDateString()}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {(issue.createdAt instanceof Date ? issue.createdAt : new Date(issue.createdAt)).toLocaleTimeString()}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">Updated</div>
                  <div className="text-sm">
                    {(issue.updatedAt instanceof Date ? issue.updatedAt : new Date(issue.updatedAt)).toLocaleDateString()}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {(issue.updatedAt instanceof Date ? issue.updatedAt : new Date(issue.updatedAt)).toLocaleTimeString()}
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