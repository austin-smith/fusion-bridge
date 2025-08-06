'use client';

import React, { useState, useEffect } from 'react';
import { PencilRuler } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface FloorPlanIndicatorProps {
  locationId: string;
  onViewFloorPlan: () => void;
  onUploadFloorPlan: () => void;
  className?: string;
}

export function FloorPlanIndicator({
  locationId,
  onViewFloorPlan,
  onUploadFloorPlan,
  className
}: FloorPlanIndicatorProps) {
  const [hasFloorPlans, setHasFloorPlans] = useState<boolean>(false);

  useEffect(() => {
    // Quick check without loading state to avoid UI flicker
    fetch(`/api/locations/${locationId}/floor-plans`)
      .then(response => response.json())
      .then(data => {
        setHasFloorPlans(data.success && data.floorPlans && data.floorPlans.length > 0);
      })
      .catch(() => setHasFloorPlans(false));
  }, [locationId]);

  const hasFloorPlan = hasFloorPlans;

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