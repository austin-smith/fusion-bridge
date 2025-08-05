'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { FloorPlanCanvasProps } from './floor-plan-canvas';

// Dynamically import the FloorPlanCanvas to avoid SSR issues
const FloorPlanCanvas = dynamic(
  () => import('./floor-plan-canvas').then(mod => ({ default: mod.FloorPlanCanvas })),
  {
    ssr: false,
    loading: () => (
      <Card className="flex items-center justify-center min-h-[400px]">
        <CardContent className="flex flex-col items-center gap-4 p-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">
            Loading canvas...
          </p>
        </CardContent>
      </Card>
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
      <Card className="flex items-center justify-center min-h-[400px]">
        <CardContent className="flex flex-col items-center gap-4 p-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">
            Preparing canvas...
          </p>
        </CardContent>
      </Card>
    );
  }

  return <FloorPlanCanvas {...props} />;
}