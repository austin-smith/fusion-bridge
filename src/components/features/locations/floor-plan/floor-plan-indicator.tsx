'use client';

import React, { useState, useEffect } from 'react';
import { Map } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
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
        {hasFloorPlan ? (
          <Link
            href={`/locations/${locationId}/floor-plans`}
            className={cn("inline-flex items-center justify-center h-7 w-7 rounded-md hover:bg-muted", className)}
            aria-label="View floor plan"
          >
            <Map className="h-4 w-4" />
          </Link>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-7 w-7", className)}
            onClick={onUploadFloorPlan}
          >
            <Map className="h-4 w-4 text-muted-foreground" />
            <span className="sr-only">Add floor plan</span>
          </Button>
        )}
      </TooltipTrigger>
      <TooltipContent>
        <p>{hasFloorPlan ? 'View floor plan' : 'Add floor plan'}</p>
      </TooltipContent>
    </Tooltip>
  );
}