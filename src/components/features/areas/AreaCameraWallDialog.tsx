import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { DeviceWithConnector } from '@/types/index';
import { DeviceType } from '@/lib/mappings/definitions';
import { PikoVideoPlayer } from '@/components/features/piko/piko-video-player';
import { cn } from '@/lib/utils';
import { AlertCircle, Loader2 } from 'lucide-react';

// --- React Grid Layout Imports ---
import { Responsive, WidthProvider, Layout, Layouts } from 'react-grid-layout';

// Import required CSS
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

// --- Shadcn Card Imports ---
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
// --- End Shadcn Card Imports ---

const ResponsiveGridLayout = WidthProvider(Responsive);
// --- End React Grid Layout Imports ---

// --- Internal Grid Component --- 
interface AreaCameraGridProps {
  cameraDevices: DeviceWithConnector[];
}

const AreaCameraGrid: React.FC<AreaCameraGridProps> = ({ cameraDevices }) => {
  // Filter again for safety and to ensure we only have Piko cameras (as player only supports Piko for now)
  const validPikoCameras = cameraDevices.filter(
    device => 
      device.connectorCategory === 'piko' && 
      device.deviceTypeInfo?.type === DeviceType.Camera &&
      device.deviceId &&
      device.connectorId
  );

  // --- State for Layout ---
  const [layouts, setLayouts] = useState<Layouts>({});
  const [isInitialLayoutGenerated, setIsInitialLayoutGenerated] = useState(false);

  // --- Generate Initial Layout ---
  useEffect(() => {
    if (validPikoCameras.length > 0 && !isInitialLayoutGenerated) {
      console.log('[AreaCameraGrid] Generating initial layouts for all breakpoints...');
      const initialLayouts: Layouts = {};
      const itemWidth = 4; // Default item width (adjust based on largest cols?)
      const itemHeight = 3; // Default item height 

      // Define desired resize handles (all corners and sides)
      const resizeHandles = ['se', 'sw', 'ne', 'nw', 'e', 'w', 'n', 's'];

      Object.keys(cols).forEach(breakpoint => {
        const colsForBreakpoint = cols[breakpoint as keyof typeof cols];
        const itemsPerRow = Math.max(1, Math.floor(colsForBreakpoint / itemWidth)); // Ensure at least 1 item per row

        initialLayouts[breakpoint] = validPikoCameras.map((device, index) => {
          const adjustedItemWidth = Math.min(itemWidth, colsForBreakpoint); // Don't exceed total cols
          return {
            i: device.id, 
            x: (index % itemsPerRow) * adjustedItemWidth,
            y: Math.floor(index / itemsPerRow) * itemHeight,
            w: adjustedItemWidth,
            h: itemHeight,
            minW: 2, 
            minH: 2, 
            resizeHandles: resizeHandles,
          } as Layout;
        });
      });

      setLayouts(initialLayouts); // Set layouts for ALL breakpoints
      setIsInitialLayoutGenerated(true); // Mark as generated
      console.log('[AreaCameraGrid] Initial layouts generated (with all resize handles): ', initialLayouts);
    }
    // Reset flag if cameras change significantly (e.g., becomes empty)
    if (validPikoCameras.length === 0 && isInitialLayoutGenerated) {
        setIsInitialLayoutGenerated(false);
        setLayouts({});
    }
  }, [validPikoCameras, isInitialLayoutGenerated]); // Rerun when cameras change or flag changes

  // --- Layout Change Handler ---
  const onLayoutChange = (currentLayout: Layout[], allLayouts: Layouts) => {
    console.log('[AreaCameraGrid] Layout changed, updating state...', allLayouts);
    // Only update state if the layout actually differs to prevent loops
    // Note: Deep comparison might be needed for complex scenarios, but shallow should suffice here
    if (JSON.stringify(layouts) !== JSON.stringify(allLayouts)) {
        setLayouts(allLayouts);
    }
  };

  // --- Grid Properties ---
  const breakpoints = { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 };
  const cols = { lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 };
  const rowHeight = 100; // Adjust this for desired aspect ratio based on width
  const margin: [number, number] = [10, 10];

  if (validPikoCameras.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-10 text-center bg-muted/50 rounded-md">
        <AlertCircle className="h-10 w-10 text-muted-foreground mb-4" />
        <p className="text-lg font-semibold">No Piko Cameras Found</p>
        <p className="text-sm text-muted-foreground mt-1">
          There are no Piko cameras assigned to this area to display in the wall.
        </p>
      </div>
    );
  }

  // Show loading state while initial layout is generating
  if (!isInitialLayoutGenerated) {
      return (
        <div className="flex flex-col items-center justify-center p-10 text-center bg-muted/50 rounded-md">
          <Loader2 className="h-10 w-10 text-muted-foreground mb-4 animate-spin" />
          <p className="text-lg font-semibold">Generating Layout...</p>
        </div>
      );
  }
  
  return (
    <ResponsiveGridLayout
      className="layout camera-wall-grid"
      layouts={layouts}
      breakpoints={breakpoints}
      cols={cols}
      rowHeight={rowHeight}
      margin={margin}
      containerPadding={[0, 0]} // No padding inside the grid container itself
      isDraggable
      isResizable
      onLayoutChange={onLayoutChange}
      // Prevent breaking changes from new versions
      // useCSSTransforms={true} 
      // measureBeforeMount={false}
    >
       {validPikoCameras.map((device) => {
         return (
           <div key={device.id} className="overflow-hidden grid-item-container">
             <Card className="h-full w-full flex flex-col">
               <CardHeader className="p-1.5 flex-shrink-0 border-b bg-muted/30 rounded-t-lg">
                 <CardTitle 
                   className="text-xs font-medium truncate text-center" 
                   title={device.name}
                 >
                   {device.name}
                 </CardTitle>
               </CardHeader>
               <CardContent className="p-0 flex-grow relative overflow-hidden rounded-b-lg"> 
                 <div className="absolute inset-0 p-2">
                   <PikoVideoPlayer
                     connectorId={device.connectorId}
                     cameraId={device.deviceId}
                     className="w-full h-full"
                   />
                 </div>
               </CardContent>
             </Card>
           </div>
         );
       })}
    </ResponsiveGridLayout>
  );
};

// --- Main Dialog Component --- 
interface AreaCameraWallDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  areaName?: string;
  cameraDevices: DeviceWithConnector[];
}

export const AreaCameraWallDialog: React.FC<AreaCameraWallDialogProps> = ({ 
  isOpen, 
  onOpenChange, 
  areaName = "Area", 
  cameraDevices 
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent 
        className="max-w-none w-[95vw] h-[90vh] flex flex-col p-4 sm:p-6"
        onOpenAutoFocus={(e) => e.preventDefault()} // Prevent focus trap issues on first element
      >
        <DialogHeader className="flex-shrink-0 pb-2 border-b mb-4">
          <DialogTitle>Camera Wall: {areaName}</DialogTitle>
        </DialogHeader>
        
        <div className="flex-grow overflow-y-auto pr-2 -mr-2"> {/* Allow content to scroll */} 
          <AreaCameraGrid cameraDevices={cameraDevices} />
        </div>

        <DialogFooter className="flex-shrink-0 pt-4 border-t mt-4">
          <DialogClose asChild>
            <Button type="button" variant="secondary">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}; 