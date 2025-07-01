'use client';

import React from 'react';
import { EventCardSkeleton } from './event-card-skeleton';
import { Skeleton } from "@/components/ui/skeleton";

interface EventCardViewSkeletonProps {
  segmentCount?: number;
  cardsPerSegment?: number;
}

export const EventCardViewSkeleton: React.FC<EventCardViewSkeletonProps> = ({ 
  segmentCount = 2,
  cardsPerSegment = 4
}) => {
  return (
    <div className="p-4 space-y-6">
      {[...Array(segmentCount)].map((_, segIndex) => (
        <div key={`segment-skeleton-${segIndex}`}>
          <Skeleton className="h-5 w-1/4 mb-3" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[...Array(cardsPerSegment)].map((_, cardIndex) => (
              <EventCardSkeleton key={`card-skeleton-${segIndex}-${cardIndex}`} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}; 