'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { PlayIcon, ImageIcon, RefreshCwIcon } from 'lucide-react';
import { PikoVideoPlayer } from '@/components/features/piko/piko-video-player';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle } from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

import type { CameraInfo } from '@/hooks/use-device-camera-config';
import { CameraCarouselControls, CameraIndicator } from '@/components/features/common/camera-carousel';

export interface CameraMediaSectionProps {
  // Thumbnail configuration
  thumbnailMode: 'live-auto-refresh' | 'static-url';
  thumbnailUrl?: string; // For static mode
  
  // Auto-refresh config (for live mode)
  connectorId?: string;
  cameraId?: string;
  refreshInterval?: number;
  
  // Video playback config
  videoConfig: {
    connectorId: string;
    cameraId: string;
    pikoSystemId?: string;
    positionMs?: number; // undefined = live, number = historical
  };
  
  // UI options
  showManualRefresh?: boolean;
  showTimeAgo?: boolean;
  isPlayDisabled?: boolean;
  disableFullscreen?: boolean;
  className?: string;
  title?: string;
  titleElement?: React.ReactNode; // Optional React element for custom title rendering
  
  // NEW: Multi-camera support
  cameras?: CameraInfo[];
  selectedCameraIndex?: number;
  onCameraChange?: (index: number) => void;
  showCameraCarousel?: boolean;
  carouselLayout?: 'dots' | 'dropdown' | 'arrows-only';
}

// Time ago component for auto-refresh mode
const TimeAgoText = ({ refreshTime }: { refreshTime: Date }) => {
  const [timeText, setTimeText] = useState<string>('');

  useEffect(() => {
    const updateText = () => {
      const now = new Date();
      const secondsAgo = Math.round((now.getTime() - refreshTime.getTime()) / 1000);

      if (secondsAgo < 1) {
        setTimeText('Just now');
      } else if (secondsAgo < 60) {
        setTimeText(`${secondsAgo}s ago`);
      } else {
        setTimeText(`${Math.floor(secondsAgo / 60)}m ago`);
      }
    };

    updateText();
    const interval = setInterval(updateText, 1000);
    return () => clearInterval(interval);
  }, [refreshTime]);

  return <>{timeText}</>;
};

// Media thumbnail component with loading/error states
const MediaThumbnail = ({ 
  src, 
  isLoading, 
  error, 
  onPlayClick, 
  isPlayDisabled = false,
  onRefreshClick,
  showManualRefresh = false
}: {
  src: string;
  isLoading: boolean;
  error: string | null;
  onPlayClick?: () => void;
  isPlayDisabled?: boolean;
  onRefreshClick?: () => void;
  showManualRefresh?: boolean;
}) => {
  const [imageLoadError, setImageLoadError] = useState(false);
  const [previousSrc, setPreviousSrc] = useState<string | null>(null);
  const [fadeIn, setFadeIn] = useState(true);
  const [showPrevious, setShowPrevious] = useState(false);
  
  // Crossfade animation when src changes
  useEffect(() => {
    if (src && previousSrc !== src) {
      setShowPrevious(!!previousSrc);
      setFadeIn(false);
      setTimeout(() => {
        setFadeIn(true);
        setTimeout(() => {
          setShowPrevious(false);
        }, 500);
      }, 10);
      setPreviousSrc(src);
    }
  }, [src, previousSrc]);

  const handleImageError = () => {
    setImageLoadError(true);
  };
  
  useEffect(() => {
    setImageLoadError(false);
  }, [src]);

  return (
    <div className={cn(
      "relative w-full aspect-video bg-muted rounded-md overflow-hidden flex items-center justify-center group",
      onPlayClick && !isPlayDisabled ? "cursor-pointer" : ""
    )}>
      {/* Loading Skeleton */}
      {isLoading && !src && (
        <Skeleton className="absolute inset-0 animate-pulse" />
      )}
      
      {/* Error Message */}
      {!isLoading && (error || imageLoadError) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-destructive text-xs p-2 text-center">
          <AlertCircle className="h-6 w-6 mb-1" />
          <span>{error || "Could not load image"}</span>
        </div>
      )}
      
      {/* Previous Image (for crossfade) */}
      {!isLoading && !error && showPrevious && previousSrc && previousSrc !== src && (
        <Image 
          src={previousSrc}
          alt="Previous Thumbnail" 
          fill 
          className="absolute inset-0 w-full h-full object-contain z-10 pointer-events-none"
          unoptimized
          priority={false}
        />
      )} 
      
      {/* Current Image */}
      {!isLoading && !error && src && (
        <Image 
          src={src} 
          alt="Camera Thumbnail" 
          fill 
          className={cn(
            "absolute inset-0 w-full h-full object-contain transition-opacity duration-500 z-20 pointer-events-none",
            fadeIn ? 'opacity-100' : 'opacity-0',
            imageLoadError ? 'opacity-0' : undefined
          )}
          onError={handleImageError}
          onLoad={() => setImageLoadError(false)}
          unoptimized
          priority
        />
      )} 
      
      {/* Manual Refresh Button */}
      {showManualRefresh && onRefreshClick && !isLoading && !error && !imageLoadError && src && (
        <Button
          variant="secondary"
          size="sm" 
          className="absolute top-2 right-2 gap-1 text-xs opacity-80 hover:opacity-100 z-40"
          onClick={(e) => {
            e.stopPropagation();
            onRefreshClick();
          }}
        >
          <RefreshCwIcon className="w-3.5 h-3.5" />
          Refresh
        </Button>
      )}
      
      {/* Play Button Overlay */}
      {!isLoading && !error && !imageLoadError && src && onPlayClick && (
        <div 
          className={cn(
            "absolute inset-0 z-30 flex items-center justify-center transition-opacity duration-300",
            isPlayDisabled 
              ? "bg-black/30 opacity-40 pointer-events-none"
              : "bg-black/30 opacity-0 group-hover:opacity-100"
          )}
          onClick={onPlayClick}
          aria-label={isPlayDisabled ? "Live view unavailable for local connections" : "Play live video"}
        >
          <PlayIcon 
            className={cn(
              "h-12 w-12 transition-opacity duration-300",
              isPlayDisabled ? "text-white/60 fill-white/30" : "text-white/90 fill-white/60"
            )}
          />
        </div>
      )}
    </div>
  );
};

export const CameraMediaSection: React.FC<CameraMediaSectionProps> = ({
  thumbnailMode,
  thumbnailUrl: staticThumbnailUrl,
  connectorId,
  cameraId,
  refreshInterval = 10000,
  videoConfig,
  showManualRefresh = false,
  showTimeAgo = false,
  isPlayDisabled = false,
  disableFullscreen = false,
  className,
  title = "LIVE VIEW",
  titleElement,
  // NEW: Multi-camera props
  cameras = [],
  selectedCameraIndex = 0,
  onCameraChange,
  showCameraCarousel = false,
  carouselLayout = 'dots'
}) => {
  // State for live auto-refresh mode
  const [liveThumbnailUrl, setLiveThumbnailUrl] = useState<string | null>(null);
  const [isThumbnailLoading, setIsThumbnailLoading] = useState(false);
  const [thumbnailError, setThumbnailError] = useState<string | null>(null);
  const [lastThumbnailRefreshTime, setLastThumbnailRefreshTime] = useState<Date | null>(null);
  const [showLiveVideo, setShowLiveVideo] = useState(false);
  
  // Refs for preloading strategy (live mode)
  const preloaderImgRef = useRef<HTMLImageElement | null>(null);
  const preloadingUrlRef = useRef<string | null>(null);
  const urlToRevokeRef = useRef<string | null>(null);
  const currentThumbnailUrlRef = useRef<string | null>(null);
  
  // Refs for cleanup on unmount
  const latestThumbnailUrlForUnmountRef = useRef<string | null>(null);
  const latestPreloadingUrlForUnmountRef = useRef<string | null>(null);
  const latestUrlToRevokeForUnmountRef = useRef<string | null>(null);

  useEffect(() => {
    currentThumbnailUrlRef.current = liveThumbnailUrl;
  }, [liveThumbnailUrl]);

  useEffect(() => {
    latestThumbnailUrlForUnmountRef.current = liveThumbnailUrl;
    latestPreloadingUrlForUnmountRef.current = preloadingUrlRef.current;
    latestUrlToRevokeForUnmountRef.current = urlToRevokeRef.current;
  });

  // Preloader event handlers
  const handlePreloadComplete = useCallback(() => {
    if (!preloadingUrlRef.current) return;
    
    if (urlToRevokeRef.current) {
      URL.revokeObjectURL(urlToRevokeRef.current);
      urlToRevokeRef.current = null;
    }

    setLiveThumbnailUrl(preloadingUrlRef.current);
    preloadingUrlRef.current = null;
    if (preloaderImgRef.current) {
      preloaderImgRef.current.src = '';
    }
    setIsThumbnailLoading(false);
  }, []);

  const handlePreloadError = useCallback(() => {
    if (!preloadingUrlRef.current) return;
    setThumbnailError('Failed to preload thumbnail.');
    
    URL.revokeObjectURL(preloadingUrlRef.current);
    preloadingUrlRef.current = null;
    urlToRevokeRef.current = null;
    
    if (preloaderImgRef.current) {
      preloaderImgRef.current.src = '';
    }
    setIsThumbnailLoading(false);
  }, []);

  // Attach preloader event listeners
  useEffect(() => {
    const img = preloaderImgRef.current;
    if (img) {
      img.addEventListener('load', handlePreloadComplete);
      img.addEventListener('error', handlePreloadError);
      return () => {
        img.removeEventListener('load', handlePreloadComplete);
        img.removeEventListener('error', handlePreloadError);
      };
    }
  }, [handlePreloadComplete, handlePreloadError]);

  // Fetch live thumbnail function
  const fetchLiveThumbnail = useCallback(async () => {
    if (thumbnailMode !== 'live-auto-refresh' || !connectorId || !cameraId) {
      return;
    }

    // Skip fetching if video is being played
    if (showLiveVideo) {
      return;
    }

    setIsThumbnailLoading(true);
    setThumbnailError(null);

    try {
      const apiUrl = new URL('/api/piko/device-thumbnail', window.location.origin);
      apiUrl.searchParams.append('connectorId', connectorId);
      apiUrl.searchParams.append('cameraId', cameraId);
      apiUrl.searchParams.append('size', '640x480');

      const response = await fetch(apiUrl.toString());
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to fetch thumbnail (${response.status})`);
      }
      
      const blob = await response.blob();
      const newObjectUrl = URL.createObjectURL(blob);

      urlToRevokeRef.current = currentThumbnailUrlRef.current;
      preloadingUrlRef.current = newObjectUrl;

      if (preloaderImgRef.current) {
        preloaderImgRef.current.src = newObjectUrl;
      } else {
        URL.revokeObjectURL(newObjectUrl);
        preloadingUrlRef.current = null;
        urlToRevokeRef.current = null;
        setIsThumbnailLoading(false);
        setThumbnailError("Internal error: Preloader not ready.");
      }

      setLastThumbnailRefreshTime(new Date());

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load thumbnail';
      setThumbnailError(message);
      setIsThumbnailLoading(false);
      
      if (preloadingUrlRef.current) URL.revokeObjectURL(preloadingUrlRef.current);
      if (urlToRevokeRef.current) URL.revokeObjectURL(urlToRevokeRef.current);
      preloadingUrlRef.current = null;
      urlToRevokeRef.current = null;
    }
  }, [thumbnailMode, connectorId, cameraId, showLiveVideo]);

  // Auto-refresh effect for live mode
  useEffect(() => {
    if (thumbnailMode !== 'live-auto-refresh' || !connectorId || !cameraId) {
      return;
    }

    if (showLiveVideo) {
      return;
    }

    // Initial fetch
    fetchLiveThumbnail();

    // Set up auto-refresh interval
    const intervalId = setInterval(fetchLiveThumbnail, refreshInterval);
    
    return () => {
      clearInterval(intervalId);
      if (preloadingUrlRef.current) {
        URL.revokeObjectURL(preloadingUrlRef.current);
        preloadingUrlRef.current = null;
      }
    };
  }, [thumbnailMode, connectorId, cameraId, showLiveVideo, fetchLiveThumbnail, refreshInterval]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const finalThumbnail = latestThumbnailUrlForUnmountRef.current;
      const finalPreloading = latestPreloadingUrlForUnmountRef.current;
      const finalToRevoke = latestUrlToRevokeForUnmountRef.current;

      if (finalThumbnail) {
        URL.revokeObjectURL(finalThumbnail);
      }
      if (finalPreloading && finalPreloading !== finalThumbnail) {
        URL.revokeObjectURL(finalPreloading);
      }
      if (finalToRevoke && finalToRevoke !== finalThumbnail && finalToRevoke !== finalPreloading) {
        URL.revokeObjectURL(finalToRevoke);
      }
    };
  }, []);

  // Determine which thumbnail URL to use
  const currentThumbnailUrl = thumbnailMode === 'live-auto-refresh' ? liveThumbnailUrl : staticThumbnailUrl;
  
  // Handle thumbnail click to show video
  const handleThumbnailClick = () => {
    if (currentThumbnailUrl && !thumbnailError && !isPlayDisabled) {
      setShowLiveVideo(true);
    }
  };

  // Handle manual refresh
  const handleManualRefresh = () => {
    if (thumbnailMode === 'live-auto-refresh') {
      fetchLiveThumbnail();
    }
  };

  return (
    <div className={className}>
      {/* Hidden image for preloading (live mode only) */}
      {thumbnailMode === 'live-auto-refresh' && (
        // eslint-disable-next-line @next/next/no-img-element
        <img ref={preloaderImgRef} alt="" style={{ display: 'none' }} />
      )}

      <div className="flex items-center justify-between py-2">
        <div className="flex items-center space-x-2">
          {titleElement ? (
            <div className="text-xs font-medium text-muted-foreground">{titleElement}</div>
          ) : (
            <>
              <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">{title}</span>
            </>
          )}
        </div>
        
        {/* Camera Carousel Controls */}
        {showCameraCarousel && cameras.length > 1 && onCameraChange && (
          <CameraCarouselControls
            cameras={cameras}
            selectedIndex={selectedCameraIndex}
            onCameraChange={onCameraChange}
            layout={carouselLayout}
            size="sm"
          />
        )}
        
        {!showCameraCarousel && (
          <div className="h-px grow bg-border ml-2"></div>
        )}
      </div>
      
      {/* Conditionally render Player or Thumbnail */}
      {showLiveVideo ? (
        <div className="relative">
          <PikoVideoPlayer
            connectorId={videoConfig.connectorId}
            pikoSystemId={videoConfig.pikoSystemId}
            cameraId={videoConfig.cameraId}
            positionMs={videoConfig.positionMs}
            className="w-full"
            disableFullscreen={disableFullscreen}
          />
          {/* Back to thumbnail button */}
          <Button
            variant="secondary"
            size="sm"
            className="absolute top-2 left-2 gap-1 text-xs opacity-80 hover:opacity-100"
            onClick={() => setShowLiveVideo(false)}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-3.5 h-3.5"
            >
              <path
                fillRule="evenodd"
                d="M18 10a.75.75 0 01-.75.75H4.66l2.1 1.95a.75.75 0 11-1.02 1.1l-3.5-3.25a.75.75 0 010-1.1l3.5-3.25a.75.75 0 111.02 1.1l-2.1 1.95h12.59A.75.75 0 0118 10z"
                clipRule="evenodd"
              />
            </svg>
            Back to thumbnail
          </Button>
          {/* Live indicator when positionMs is undefined (live video) */}
          {videoConfig.positionMs === undefined && (
            <div className="absolute top-2 right-2 flex items-center gap-1.5 px-2 py-1 bg-black/60 rounded text-white text-xs font-medium">
              <div className="w-2 h-2 bg-red-500 rounded-full"></div>
              LIVE
            </div>
          )}
        </div>
      ) : (
        <div className="relative">
          <MediaThumbnail 
            src={currentThumbnailUrl || ''} 
            isLoading={thumbnailMode === 'live-auto-refresh' ? (isThumbnailLoading && !liveThumbnailUrl) : false}
            error={thumbnailMode === 'live-auto-refresh' ? thumbnailError : null}
            onPlayClick={handleThumbnailClick}
            isPlayDisabled={isPlayDisabled}
            onRefreshClick={showManualRefresh ? handleManualRefresh : undefined}
            showManualRefresh={showManualRefresh}
          />
          
          {/* TimeAgo badge for live mode */}
          {showTimeAgo && lastThumbnailRefreshTime && (
            <div className="absolute bottom-1 left-1 z-50 px-1.5 py-0.5 rounded bg-black/50 text-white text-[10px] font-medium min-w-[50px] text-center pointer-events-none">
              <TimeAgoText refreshTime={lastThumbnailRefreshTime} />
            </div>
          )}
        </div>
      )}
      

    </div>
  );
}; 