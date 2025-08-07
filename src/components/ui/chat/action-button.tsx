'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Loader2 } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChatAction, DeviceActionMetadata, AlarmZoneActionMetadata } from '@/types/ai/chat-actions';

interface ActionButtonProps {
  action: ChatAction;
  onExecute: (action: ChatAction) => Promise<void>;
  disabled?: boolean;
  className?: string;
}

/**
 * Individual action button that appears in chat messages
 * Features:
 * - Keyboard accessible (Enter/Space)
 * - Loading states with spinner
 * - Tooltips showing current state
 * - Proper ARIA labels
 * - Dynamic lucide-react icons
 */
export function ActionButton({ 
  action, 
  onExecute, 
  disabled = false, 
  className 
}: ActionButtonProps) {
  const [isExecuting, setIsExecuting] = useState(false);

  // Get the lucide icon component dynamically
  const IconComponent = (LucideIcons as any)[action.icon] || LucideIcons.HelpCircle;

  // Generate tooltip content based on action type
  const getTooltipContent = () => {
    if (action.disabled) {
      return action.disabledReason || 'Action not available';
    }

    if (action.type === 'device') {
      const metadata = action.metadata as DeviceActionMetadata;
      const currentStateText = metadata.currentState 
        ? ` (currently ${metadata.currentState})` 
        : '';
      return `${action.label}${currentStateText}`;
    }

    if (action.type === 'alarm-zone') {
      const metadata = action.metadata as AlarmZoneActionMetadata;
      const currentStateText = metadata.currentState 
        ? ` (currently ${metadata.currentState})` 
        : '';
      return `${action.label}${currentStateText}`;
    }

    return action.label;
  };

  const handleClick = async () => {
    if (isExecuting || disabled || action.disabled) return;

    setIsExecuting(true);
    try {
      await onExecute(action);
    } catch (error) {
      console.error('Action execution failed:', error);
      // Error handling is done in the onExecute function
    } finally {
      setIsExecuting(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleClick();
    }
  };

  const isDisabled = disabled || action.disabled || isExecuting;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          disabled={isDisabled}
          aria-label={action.label}
          aria-describedby={`action-${action.id}-tooltip`}
          className={cn(
            "h-auto px-3 py-2 hover:bg-accent focus:bg-accent",
            "transition-all duration-200 flex items-center gap-2",
            // Let flexbox handle sizing naturally within flex-wrap container
            // Ensure text can truncate but maintain minimum usable width
            "flex-shrink min-w-0 max-w-full",
            isExecuting && "cursor-not-allowed",
            className
          )}
        >
          {isExecuting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-xs">Loading...</span>
            </>
          ) : (
            <>
              <IconComponent className="h-4 w-4 flex-shrink-0" />
              <span className="text-xs font-medium truncate min-w-0">{action.label}</span>
            </>
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent 
        id={`action-${action.id}-tooltip`}
        side="top"
        className="max-w-xs"
      >
        <p>{getTooltipContent()}</p>
      </TooltipContent>
    </Tooltip>
  );
} 