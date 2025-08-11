'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import type { FloorPlanCanvasProps } from './floor-plan-canvas';

// Dynamically import the FloorPlanCanvas to avoid SSR issues
const FloorPlanCanvas = dynamic(
  () => import('./floor-plan-canvas').then(mod => ({ default: mod.FloorPlanCanvas })),
  {
    ssr: false,
    loading: () => (
        <div className="relative w-full">
          <div className="flex min-h-[600px] items-center justify-center p-8">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Loading canvas...</p>
            </div>
          </div>
        </div>
    )
  }
);

export function FloorPlanCanvasDynamic(props: FloorPlanCanvasProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return (
      <div className="relative w-full">
        <div className="flex min-h-[600px] items-center justify-center p-8">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Preparing canvas...</p>
          </div>
        </div>
      </div>
    );
  }

  return <FloorPlanCanvas {...props} />;
}