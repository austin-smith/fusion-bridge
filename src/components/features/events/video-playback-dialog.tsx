'use client';

import React from 'react';
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
  disableFullscreen = false
}) => {
  // Prevent rendering if critical IDs are missing or dialog is not open
  if (!isOpen || !connectorId || !cameraId) return null;

  console.log('[VideoPlaybackDialog] Rendering. isOpen:', isOpen, 'ConnectorId:', connectorId, 'CameraId:', cameraId);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      {/* Increased width for video, aspect ratio handled by player */}
      <DialogContent className="sm:max-w-[80vw] md:max-w-[70vw] lg:max-w-[60vw] xl:max-w-[50vw] p-0 flex flex-col max-h-[90vh]">
        <DialogHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Video className="h-5 w-5 text-muted-foreground"/>
            <DialogTitle className="text-lg font-medium">{title}</DialogTitle>
          </div>
          <DialogClose />
        </DialogHeader>
        {deviceName && (
            <DialogDescription className="px-4 text-xs text-muted-foreground -mt-1 mb-2">
                Camera: {deviceName}
            </DialogDescription>
        )}
        <div className="relative flex-grow w-full min-h-0 px-4"> {/* Ensure player can take space and scroll if needed */}
          <PikoVideoPlayer 
            connectorId={connectorId}
            pikoSystemId={pikoSystemId || undefined} // Pass undefined if null
            cameraId={cameraId}
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