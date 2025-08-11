'use client';

import React from 'react';
import { Card, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type CardSize = 'small' | 'medium' | 'large';

interface EventCardSkeletonProps {
  cardSize?: CardSize;
}

export const EventCardSkeleton: React.FC<EventCardSkeletonProps> = ({ cardSize = 'large' }) => {
  // Static aspect ratio matching real card behavior
  const mediaAspectClass = 'aspect-video';

  return (
    <Card className={cn("overflow-hidden flex flex-col border-l-4 border-transparent")}>
      <CardHeader className="p-3 shrink-0">
        <Skeleton className="h-5 w-3/4 mb-1.5" />
        <Skeleton className="h-3 w-1/2" />
      </CardHeader>
      <div className={cn("relative w-full overflow-hidden", mediaAspectClass)}>
        <div className="absolute inset-0 bg-muted flex items-center justify-center">
          <Skeleton className="h-10 w-10 rounded-full" />
        </div>
      </div>
    </Card>
  );
}; 