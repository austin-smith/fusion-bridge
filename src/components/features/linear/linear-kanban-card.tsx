'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { 
  User,
  ExternalLink
} from 'lucide-react';
import type { LinearIssue } from '@/services/drivers/linear';
import { getLinearPriorityConfig } from '@/services/drivers/linear';

interface LinearKanbanCardProps {
  issue: LinearIssue;
  onClick?: () => void;
}

export function LinearKanbanCard({ issue }: LinearKanbanCardProps) {
  const priorityConfig = getLinearPriorityConfig(issue.priority);
  const PriorityIcon = priorityConfig.icon;

  const handleExternalLinkClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click
    window.open(issue.url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="w-full">
      {/* Header with issue ID and external link */}
      <div className="flex items-center justify-between mb-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="font-mono text-xs text-muted-foreground font-medium">
                {issue.identifier}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>Issue ID: {issue.identifier}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className="h-auto p-0 text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={handleExternalLinkClick}
              >
                <ExternalLink className="h-3 w-3" />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>Open in Linear</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Issue title */}
      <h3 className="text-sm font-medium leading-5 mb-3 line-clamp-3">
        {issue.title}
      </h3>

      {/* Priority badge */}
      <div className="flex items-center gap-2 mb-3">
        <Badge 
          variant="outline"
          className="text-xs font-medium h-5"
          style={{ 
            borderColor: priorityConfig.color,
            backgroundColor: `${priorityConfig.color}15`,
            color: priorityConfig.color
          }}
        >
          <PriorityIcon 
            className="h-3 w-3 mr-1" 
            style={{ fill: priorityConfig.color }}
          />
          {priorityConfig.label}
        </Badge>
      </div>

      {/* Labels */}
      {issue.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {issue.labels.slice(0, 2).map((label) => (
            <Badge 
              key={label.id} 
              variant="outline" 
              className="text-xs h-5"
              style={{ 
                borderColor: label.color,
                backgroundColor: `${label.color}15`,
                color: label.color
              }}
            >
              {label.name}
            </Badge>
          ))}
          {issue.labels.length > 2 && (
            <Badge variant="outline" className="text-xs h-5 text-muted-foreground">
              +{issue.labels.length - 2}
            </Badge>
          )}
        </div>
      )}

      {/* Assignee */}
      <div className="flex items-center gap-2">
        {issue.assignee ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2">
                  <Avatar className="h-5 w-5">
                    {issue.assignee.avatarUrl && (
                      <AvatarImage src={issue.assignee.avatarUrl} alt={issue.assignee.name} />
                    )}
                    <AvatarFallback className="text-xs font-medium">
                      {issue.assignee.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-xs text-muted-foreground truncate max-w-24">
                    {issue.assignee.name}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Assigned to: {issue.assignee.name}</p>
                <p className="text-xs opacity-80">{issue.assignee.email}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <div className="flex items-center gap-2">
            <Avatar className="h-5 w-5">
              <AvatarFallback className="bg-muted">
                <User className="h-3 w-3" />
              </AvatarFallback>
            </Avatar>
            <span className="text-xs text-muted-foreground">Unassigned</span>
          </div>
        )}

        {/* Updated time */}
        <span className="text-xs text-muted-foreground ml-auto">
          {(() => {
            const date = issue.updatedAt instanceof Date ? issue.updatedAt : new Date(issue.updatedAt);
            const now = new Date();
            const diffMs = now.getTime() - date.getTime();
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            
            if (diffDays === 0) return 'Today';
            if (diffDays === 1) return 'Yesterday';
            if (diffDays < 7) return `${diffDays}d ago`;
            return new Intl.DateTimeFormat('en-US', {
              month: 'short', 
              day: 'numeric'
            }).format(date);
          })()}
        </span>
      </div>
    </div>
  );
}