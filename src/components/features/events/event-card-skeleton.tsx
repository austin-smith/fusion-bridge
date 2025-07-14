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
  // Simple card size classes
  const cardSizeClass = (() => {
    switch (cardSize) {
      case 'small':
        return "min-h-[80px]";
      case 'medium':
        return "min-h-[120px]";
      case 'large':
      default:
        return "min-h-[140px]";
    }
  })();

  return (
    <Card className={cn("overflow-hidden flex flex-col border-l-4 border-transparent", cardSizeClass)}>
      <CardHeader className="p-3 flex-shrink-0">
        <Skeleton className="h-5 w-3/4 mb-1.5" />
        <Skeleton className="h-3 w-1/2" />
      </CardHeader>
      <CardContent className="p-3 pt-0 flex-grow flex flex-col justify-center items-center">
        <div className="aspect-video w-full bg-muted rounded-md flex items-center justify-center">
            <Skeleton className="h-10 w-10 rounded-full" />
        </div>
      </CardContent>
    </Card>
  );
}; 