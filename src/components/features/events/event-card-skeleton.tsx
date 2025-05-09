'use client';

import React from 'react';
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const EventCardSkeleton = () => {
  return (
    <Card className="overflow-hidden flex flex-col border-l-4 border-transparent min-h-[140px]">
      <CardHeader className="p-3 flex-shrink-0">
        <Skeleton className="h-5 w-3/4 mb-1.5" /> {/* Title placeholder */}
        <Skeleton className="h-3 w-1/2" />      {/* Description placeholder */}
      </CardHeader>
      <CardContent className="p-3 pt-0 flex-grow flex flex-col justify-center items-center">
        {/* Placeholder for thumbnail or list content area */}
        <div className="aspect-video w-full bg-muted rounded-md flex items-center justify-center">
            <Skeleton className="h-10 w-10 rounded-full" /> {/* Central icon placeholder */}
        </div>
      </CardContent>
    </Card>
  );
}; 