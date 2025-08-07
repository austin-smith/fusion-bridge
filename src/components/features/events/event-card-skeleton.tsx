'use client';

import React from 'react';
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type CardSize = 'small' | 'medium' | 'large';

interface EventCardSkeletonProps {
  cardSize?: CardSize;
}

export const EventCardSkeleton: React.FC<EventCardSkeletonProps> = ({ cardSize = 'large' }) => {
  // Card size classes for full-width thumbnail layout
  const cardSizeClass = (() => {
    switch (cardSize) {
      case 'small':
        return "min-h-[160px]"; // Reduced for better image aspect ratio
      case 'medium':
        return "min-h-[200px]"; // Reduced for better image aspect ratio
      case 'large':
      default:
        return "min-h-[200px]"; // Reduced for better image aspect ratio
    }
  })();

  return (
    <Card className={cn("overflow-hidden flex flex-col border-l-4 border-transparent", cardSizeClass)}>
      <CardHeader className="p-3 flex-shrink-0">
        <Skeleton className="h-5 w-3/4 mb-1.5" />
        <Skeleton className="h-3 w-1/2" />
      </CardHeader>
      <div className="relative flex-grow flex flex-col overflow-hidden">
        <div className="absolute inset-0 bg-muted flex items-center justify-center">
            <Skeleton className="h-10 w-10 rounded-full" />
        </div>
      </div>
    </Card>
  );
}; 