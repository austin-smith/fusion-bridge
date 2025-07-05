'use client';

import React from 'react';
import { Sunrise, Sunset } from 'lucide-react';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { format, parse, formatDistanceToNow } from 'date-fns';
import type { Location } from '@/types';

interface LocationSunTimesDisplayProps {
  location: Location;
}

export function LocationSunTimesDisplay({ location }: LocationSunTimesDisplayProps) {
  // Don't render if no sun times data
  if (!location.sunriseTime || !location.sunsetTime) {
    return null;
  }

  return (
    <TooltipProvider>
      <div className="border border-dashed rounded-md p-2.5 bg-transparent">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="space-y-0.5">
            <h4 className="text-sm font-medium text-muted-foreground">Sun Times</h4>
            <p className="text-xs text-muted-foreground/70">
              Used for time-of-day automation filters
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Tooltip>
              <TooltipTrigger asChild>
            <div className="flex items-center gap-1">
                  <Sunrise className="h-3.5 w-3.5 text-amber-500" />
                  <span className="text-sm font-medium">
                    {format(parse(location.sunriseTime, 'HH:mm', new Date()), 'h:mm a')}
                  </span>
            </div>
              </TooltipTrigger>
              <TooltipContent>
                <div className="text-xs space-y-1">
                  <p className="font-medium">Sunrise: {format(parse(location.sunriseTime, 'HH:mm', new Date()), 'h:mm a')}</p>
                  {location.sunTimesUpdatedAt && (
                    <p className="text-muted-foreground">
                      Updated {formatDistanceToNow(location.sunTimesUpdatedAt, { addSuffix: true })}
                    </p>
                  )}
            </div>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1">
                  <Sunset className="h-3.5 w-3.5 text-slate-500" />
                  <span className="text-sm font-medium">
                    {format(parse(location.sunsetTime, 'HH:mm', new Date()), 'h:mm a')}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <div className="text-xs space-y-1">
                  <p className="font-medium">Sunset: {format(parse(location.sunsetTime, 'HH:mm', new Date()), 'h:mm a')}</p>
                  {location.sunTimesUpdatedAt && (
                    <p className="text-muted-foreground">
                      Updated {formatDistanceToNow(location.sunTimesUpdatedAt, { addSuffix: true })}
                </p>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
} 