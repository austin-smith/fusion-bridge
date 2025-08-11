'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogClose
} from '@/components/ui/dialog';
import { PikoVideoPlayer } from '@/components/features/piko/piko-video-player';
import { Button } from '@/components/ui/button';
import { XIcon, Video } from 'lucide-react';
import { CameraCarouselControls } from '@/components/features/common/camera-carousel';
import type { CameraInfo } from '@/hooks/use-device-camera-config';

export interface VideoPlaybackDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  connectorId?: string | null;
  pikoSystemId?: string | null;
  cameraId?: string | null;
  positionMs?: number | null;
  title?: string;
  deviceName?: string | null;
  disableFullscreen?: boolean;
  // Enhanced: Multi-camera support
  cameras?: CameraInfo[];
  initialCameraIndex?: number;
}

// Wrap the component with React.memo
export const VideoPlaybackDialog: React.FC<VideoPlaybackDialogProps> = React.memo(({
  isOpen, 
  onOpenChange, 
  connectorId, 
  pikoSystemId,
  cameraId, 
  positionMs,
  title = 'Video Playback',
  deviceName,
  disableFullscreen = false,
  // Enhanced: Multi-camera props
  cameras = [],
  initialCameraIndex = 0
}) => {
  // Camera selection state for carousel
  const [selectedCameraIndex, setSelectedCameraIndex] = useState(initialCameraIndex);
  
  // Update selected camera index when initialCameraIndex changes
  useEffect(() => {
    setSelectedCameraIndex(initialCameraIndex);
  }, [initialCameraIndex]);

  // Get current camera info - either from carousel or fallback to props
  const hasMultipleCameras = cameras.length > 1;
  const currentCamera = hasMultipleCameras && cameras[selectedCameraIndex] ? cameras[selectedCameraIndex] : null;
  
  // Use camera from carousel if available, otherwise fallback to props
  const activeConnectorId = currentCamera?.connectorId || connectorId;
  const activePikoSystemId = currentCamera?.pikoSystemId || pikoSystemId;
  const activeCameraId = currentCamera?.cameraId || cameraId;
  const activeDeviceName = currentCamera?.name || deviceName;

  // Prevent rendering if critical IDs are missing or dialog is not open
  if (!isOpen || !activeConnectorId || !activeCameraId) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      {/* Increased width for video, aspect ratio handled by player */}
      <DialogContent className="sm:max-w-[80vw] md:max-w-[70vw] lg:max-w-[60vw] xl:max-w-[50vw] p-0 flex flex-col max-h-[90vh]">
        <DialogHeader className="p-4 pb-2 space-y-0 shrink-0">
          <div className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Video className="h-5 w-5 text-muted-foreground"/>
              <DialogTitle className="text-lg font-medium">{title}</DialogTitle>
            </div>
            <DialogClose />
          </div>
        </DialogHeader>
        {activeDeviceName && (
          <div className="px-4 -mt-1 mb-2 flex items-center justify-between">
            <DialogDescription className="text-xs text-muted-foreground">
              Camera: {activeDeviceName}
            </DialogDescription>
            {/* Camera Carousel Controls - Same line as camera name */}
            {hasMultipleCameras && (
              <CameraCarouselControls
                cameras={cameras}
                selectedIndex={selectedCameraIndex}
                onCameraChange={setSelectedCameraIndex}
                layout={cameras.length > 6 ? 'dropdown' : 'dots'}
                size="sm"
              />
            )}
          </div>
        )}
        <div className="relative grow w-full min-h-0 px-4"> {/* Ensure player can take space and scroll if needed */}
          <PikoVideoPlayer 
            connectorId={activeConnectorId}
            pikoSystemId={activePikoSystemId || undefined} // Pass undefined if null
            cameraId={activeCameraId}
            positionMs={positionMs || undefined} // Pass undefined if null (for live)
            className="w-full h-full" // Player itself will manage aspect ratio
            disableFullscreen={disableFullscreen}
          />
        </div>
        <div className="p-4 border-t flex justify-end">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
});

// Add a display name for better debugging in React DevTools
VideoPlaybackDialog.displayName = 'VideoPlaybackDialog (Memo)'; 