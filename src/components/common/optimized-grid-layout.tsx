'use client';

import { lazy, Suspense, memo } from 'react';
import { Loader2 } from 'lucide-react';

// Lazy load React Grid Layout (CSS should be imported in the component that uses this)
const ResponsiveGridLayout = lazy(async () => {
  const RGL = await import('react-grid-layout');
  return {
    default: RGL.WidthProvider(RGL.Responsive)
  };
});

interface OptimizedGridLayoutProps {
  children: React.ReactNode;
  layouts: any;
  breakpoints: { [key: string]: number };
  cols: { [key: string]: number };
  rowHeight: number;
  margin: [number, number];
  className?: string;
  isDraggable?: boolean;
  isResizable?: boolean;
  onLayoutChange?: (currentLayout: any[], allLayouts: any) => void;
  containerPadding?: [number, number];
}

// Loading skeleton for grid layout
const GridLayoutSkeleton = () => (
  <div className="flex flex-col items-center justify-center p-10 text-center bg-muted/50 rounded-md">
    <Loader2 className="h-10 w-10 text-muted-foreground mb-4 animate-spin" />
    <p className="text-lg font-semibold">Loading Grid Layout...</p>
  </div>
);

const OptimizedGridLayout = memo((props: OptimizedGridLayoutProps) => {
  return (
    <Suspense fallback={<GridLayoutSkeleton />}>
      <ResponsiveGridLayout {...props} />
    </Suspense>
  );
});

OptimizedGridLayout.displayName = 'OptimizedGridLayout';

export { OptimizedGridLayout };