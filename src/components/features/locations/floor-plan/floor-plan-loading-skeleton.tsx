'use client';

import { Skeleton } from '@/components/ui/skeleton';

export function FloorPlanLoadingSkeleton() {
  return (
    <div className="space-y-4">
      {/* Tabs skeleton */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-28" />
        </div>
        <Skeleton className="h-8 w-32" />
      </div>
      
      {/* Main content skeleton */}
      <div className="space-y-4">
        {/* Toolbar skeleton */}
        <div className="flex items-center justify-between p-4 border rounded-lg">
          <div className="flex gap-2">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-16" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-8 w-8" />
          </div>
        </div>
        
        {/* Floor plan canvas skeleton */}
        <div className="border rounded-lg p-4">
          <Skeleton className="w-full h-96" />
        </div>
      </div>
    </div>
  );
}