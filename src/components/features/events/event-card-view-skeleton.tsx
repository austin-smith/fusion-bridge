'use client';

import React, { useMemo } from 'react';
import { EventCardSkeleton } from './event-card-skeleton';
import { Skeleton } from "@/components/ui/skeleton";

type CardSize = 'small' | 'medium' | 'large';

interface EventCardViewSkeletonProps {
  segmentCount?: number;
  cardsPerSegment?: number;
  cardSize?: CardSize;
}

export const EventCardViewSkeleton: React.FC<EventCardViewSkeletonProps> = ({ 
  segmentCount = 2,
  cardsPerSegment = 4,
  cardSize = 'large'
}) => {
  // Grid layout classes matching the real EventCardView component
  const gridClasses = useMemo(() => {
    switch (cardSize) {
      case 'small':
        return 'grid grid-cols-1 gap-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8';
      case 'medium':
        return 'grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5';
      case 'large':
      default:
        return 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
    }
  }, [cardSize]);

  return (
    <div className="p-4 space-y-6">
      {[...Array(segmentCount)].map((_, segIndex) => (
        <div key={`segment-skeleton-${segIndex}`}>
          <Skeleton className="h-5 w-1/4 mb-3" />
          <div className={gridClasses}>
            {[...Array(cardsPerSegment)].map((_, cardIndex) => (
              <EventCardSkeleton key={`card-skeleton-${segIndex}-${cardIndex}`} cardSize={cardSize} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}; 