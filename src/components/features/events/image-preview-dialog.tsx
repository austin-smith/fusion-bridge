'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Download, ExternalLink, Image as ImageIcon, Cctv, Box, Building, Maximize, Minimize, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface ImagePreviewDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  imageUrl?: string | null;
  imageAlt?: string;
  title?: string; // deprecated in header rendering
  spaceName?: string;
  cameraName?: string;
  locationName?: string;
}

export const ImagePreviewDialog: React.FC<ImagePreviewDialogProps> = ({
  isOpen,
  onOpenChange,
  imageUrl,
  imageAlt = 'Preview',
  title = 'Image Preview',
  spaceName,
  cameraName,
  locationName,
}) => {
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const mediaContainerRef = useRef<HTMLDivElement | null>(null);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(document.fullscreenElement === mediaContainerRef.current);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const highResUrl = useMemo(() => {
    try {
      const base = imageUrl || '';
      const [path, query = ''] = base.split('?');
      if (!query) return base;
      const params = new URLSearchParams(query);
      params.delete('size');
      const qs = params.toString();
      return qs ? `${path}?${qs}` : path;
    } catch {
      return imageUrl || '';
    }
  }, [imageUrl]);

  if (!imageUrl) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) {
        setNaturalSize(null);
        // Ensure we exit fullscreen when closing the dialog
        const el = mediaContainerRef.current;
        if (document.fullscreenElement === el && document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        }
        setIsFullscreen(false);
        setLoadedUrl(null);
      }
      onOpenChange(open);
    }}>
      <DialogContent
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          mediaContainerRef.current?.focus();
        }}
        className="sm:max-w-[88vw] md:max-w-[78vw] lg:max-w-[68vw] xl:max-w-[58vw] flex flex-col overflow-hidden"
      >
        <DialogHeader className="p-2.5 pl-4 pr-10 border-b flex flex-row items-center justify-between space-y-0">
          <div className="min-w-0">
            {(() => {
              const showCamera = Boolean(cameraName && cameraName.trim().length > 0);
              const showSpace = Boolean(spaceName && spaceName.trim().length > 0);
              const showLocation = Boolean(locationName && locationName.trim().length > 0);
              if (!showCamera && !showSpace) {
                return (
                  <DialogTitle className="text-sm font-medium leading-tight pr-2 flex items-center gap-2">
                    <ImageIcon className="h-4 w-4 text-muted-foreground" />
                    <span className="truncate">Image</span>
                  </DialogTitle>
                );
              }
              return (
                  <DialogTitle className="text-sm font-medium leading-tight pr-2 flex items-center gap-2">
                    {showCamera ? (
                      <Cctv className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Box className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="truncate flex items-center gap-2 min-w-0">
                      {showCamera && (
                        <span className="truncate max-w-[40vw]">{cameraName}</span>
                      )}
                      {showCamera && showSpace && (
                        <span className="text-muted-foreground">•</span>
                      )}
                      {showSpace && (
                        <span className="inline-flex items-center gap-1 truncate max-w-[28vw] text-muted-foreground">
                          <Box className="h-3.5 w-3.5" />
                          <span className="truncate">{spaceName}</span>
                        </span>
                      )}
                      {(showLocation && (showCamera || showSpace)) && (
                        <span className="text-muted-foreground">•</span>
                      )}
                      {showLocation && (
                        <span className="inline-flex items-center gap-1 truncate max-w-[22vw] text-muted-foreground">
                          <Building className="h-3.5 w-3.5" />
                          <span className="truncate">{locationName}</span>
                        </span>
                      )}
                    </span>
                  </DialogTitle>
              );
            })()}
          </div>
        </DialogHeader>

        <div ref={mediaContainerRef} tabIndex={-1} className="relative w-full aspect-video bg-background">
            <div className="relative h-full w-full">
          <div className="absolute inset-0 overflow-auto flex items-center justify-center">
              <Image
                src={highResUrl}
                alt={imageAlt}
                fill
                className="object-contain rounded-md shadow-md"
                unoptimized
                key={highResUrl}
                onLoad={(e) => {
                  const img = e.currentTarget as HTMLImageElement;
                  setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
                  setLoadedUrl(highResUrl);
                }}
                onError={() => {
                  setLoadedUrl(highResUrl);
                  toast.error('Failed to load image');
                }}
              />
            </div>
            {(!loadedUrl || loadedUrl !== highResUrl) && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>

          {/* Floating toolbar (top-right) */}
          <div className="absolute top-2 right-3 z-61 pointer-events-none">
            <TooltipProvider>
              <div className="pointer-events-auto inline-flex items-center gap-1 rounded-md bg-background/80 backdrop-blur-sm border px-1.5 py-1">
                
                <Tooltip>
                  <TooltipTrigger asChild>
                    <a href={highResUrl} target="_blank" rel="noopener noreferrer">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </a>
                  </TooltipTrigger>
                  <TooltipContent>Open in new tab</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <a href={highResUrl} download>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <Download className="h-4 w-4" />
                      </Button>
                    </a>
                  </TooltipTrigger>
                  <TooltipContent>Download image</TooltipContent>
                </Tooltip>
                <div className="h-5 w-px bg-border mx-0.5" />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className="h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-accent"
                      onClick={() => {
                        const el = mediaContainerRef.current;
                        if (!el) return;
                        if (isFullscreen) {
                          document.exitFullscreen().catch(() => {});
                          setIsFullscreen(false);
                        } else {
                          el.requestFullscreen().then(() => {
                            setIsFullscreen(true);
                          }).catch(() => {
                            toast.error('Fullscreen not allowed');
                          });
                        }
                      }}
                    >
                      {isFullscreen ? (
                        <Minimize className="h-4 w-4" />
                      ) : (
                        <Maximize className="h-4 w-4" />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}</TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          </div>

          <div className="pointer-events-none absolute bottom-2 left-3 right-3 flex items-center justify-between text-xs text-muted-foreground">
            <div className="pointer-events-auto inline-flex items-center gap-2 rounded-md bg-background/80 backdrop-blur-sm border px-2 py-1">
              {naturalSize && (
                <span>{naturalSize.width}x{naturalSize.height}</span>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};