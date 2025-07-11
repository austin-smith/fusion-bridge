'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeviceType } from '@/lib/mappings/definitions';
import { PikoVideoPlayer } from '@/components/features/piko/piko-video-player';
import { Responsive, WidthProvider, type Layouts } from 'react-grid-layout';
import type { DeviceWithConnector } from '@/types';

// Make the layout responsive
const ResponsiveGridLayout = WidthProvider(Responsive);

interface SpaceCameraGridProps {
  cameraDevices: DeviceWithConnector[];
}

interface SpaceCameraWallDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  spaceName?: string;
  cameraDevices: DeviceWithConnector[];
}

const SpaceCameraGrid: React.FC<SpaceCameraGridProps> = ({ cameraDevices }) => {
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

  // --- Grid Properties ---
  const breakpoints = useMemo(() => ({ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }), []);
  const cols = useMemo(() => ({ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }), []);
  const rowHeight = 100; // Adjust this for desired aspect ratio based on width
  const margin: [number, number] = useMemo(() => [10, 10], []);

  // --- Generate Initial Layout ---
  useEffect(() => {
    if (validPikoCameras.length > 0 && !isInitialLayoutGenerated) {
      const initialLayout = validPikoCameras.map((device, index) => {
        const colsPerBreakpoint = cols.lg;
        const itemsPerRow = Math.floor(colsPerBreakpoint / 4); // 4 columns per item (adjust as needed)
        const row = Math.floor(index / itemsPerRow);
        const col = (index % itemsPerRow) * 4;
        
        return {
          i: device.id,
          x: col,
          y: row,
          w: 4, // Width in grid units
          h: 3, // Height in grid units
        };
      });

      const newLayouts: Layouts = {};
      Object.keys(breakpoints).forEach(breakpoint => {
        const colsForBreakpoint = cols[breakpoint as keyof typeof cols];
        const itemsPerRow = Math.floor(colsForBreakpoint / 4);
        
        newLayouts[breakpoint] = validPikoCameras.map((device, index) => {
          const row = Math.floor(index / itemsPerRow);
          const col = (index % itemsPerRow) * 4;
          
          return {
            i: device.id,
            x: col,
            y: row,
            w: 4, // Width in grid units
            h: 3, // Height in grid units
          };
        });
      });

      setLayouts(newLayouts);
      setIsInitialLayoutGenerated(true);
    }
  }, [validPikoCameras, cols, breakpoints, isInitialLayoutGenerated]);

  // --- Layout Change Handler ---
  const onLayoutChange = (layout: any, allLayouts: Layouts) => {
    setLayouts(allLayouts);
  };

  // --- Render ---
  if (validPikoCameras.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <p>No Piko cameras found in this space.</p>
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

export const SpaceCameraWallDialog: React.FC<SpaceCameraWallDialogProps> = ({ 
  isOpen, 
  onOpenChange, 
  spaceName = "Space", 
  cameraDevices 
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent 
        className="max-w-none w-[95vw] h-[90vh] flex flex-col p-4 sm:p-6"
        onOpenAutoFocus={(e) => e.preventDefault()} // Prevent focus trap issues on first element
      >
        <DialogHeader className="flex-shrink-0 pb-2 border-b mb-4">
          <DialogTitle>Camera Wall: {spaceName}</DialogTitle>
        </DialogHeader>
        
        <div className="flex-grow overflow-y-auto pr-2 -mr-2"> {/* Allow content to scroll */} 
          <SpaceCameraGrid cameraDevices={cameraDevices} />
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