'use client';

import React from 'react';
import { PencilRuler } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { FloorPlanData } from '@/lib/storage/file-storage';

interface FloorPlanIndicatorProps {
  floorPlan: FloorPlanData | null;
  onViewFloorPlan: () => void;
  onUploadFloorPlan: () => void;
  className?: string;
}

export function FloorPlanIndicator({
  floorPlan,
  onViewFloorPlan,
  onUploadFloorPlan,
  className
}: FloorPlanIndicatorProps) {
  const hasFloorPlan = !!floorPlan;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("h-7 w-7", className)}
          onClick={hasFloorPlan ? onViewFloorPlan : onUploadFloorPlan}
        >
          {hasFloorPlan ? (
            <PencilRuler className="h-4 w-4" />
          ) : (
            <PencilRuler className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="sr-only">
            {hasFloorPlan ? 'View floor plan' : 'Add floor plan'}
          </span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{hasFloorPlan ? 'View floor plan' : 'Add floor plan'}</p>
      </TooltipContent>
    </Tooltip>
  );
}