'use client';

import { Skeleton } from '@/components/ui/skeleton';

export function FloorPlanLoadingSkeleton() {
  return (
    <div className="space-y-4">
      {/* Header row with tabs on left and toolbar + Add Device on right */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-28" />
        </div>
        <div className="inline-flex items-center gap-2">
          <div className="inline-flex items-center gap-1 rounded-md bg-background/80 backdrop-blur-sm border px-1.5 py-1">
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-8 w-8" />
            <div className="h-5 w-px bg-border mx-0.5" />
            <Skeleton className="h-8 w-8" />
          </div>
          <Skeleton className="h-10 w-28" />
        </div>
      </div>

      {/* Floor plan canvas skeleton */}
      <div className="border rounded-lg overflow-hidden">
        <Skeleton className="w-full h-[600px]" />
      </div>
    </div>
  );
}