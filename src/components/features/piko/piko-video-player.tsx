"use client";

import React, { useState, useEffect, useRef } from 'react';
import Hls from 'hls.js';
import { Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

// Define structure for the getInfo API response
interface MediaInfoResponse {
  mediaType: 'hls' | 'webm' | 'mp4';
  streamUrl: string;
  // resolution?: string; // Remove resolution field
}

interface PikoVideoPlayerProps {
  connectorId: string; // Always required now
  pikoSystemId?: string; // Optional - only for cloud
  cameraId: string; // Always required now
  positionMs?: number; // MODIFIED: Now optional for live stream
  className?: string; // Allow custom styling
}

export const PikoVideoPlayer: React.FC<PikoVideoPlayerProps> = ({
  connectorId,
  pikoSystemId,
  cameraId,
  positionMs, // Will be undefined for live stream
  className
}) => {
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'hls' | 'webm' | 'mp4' | null>(null);
  const [isLoadingMediaInfo, setIsLoadingMediaInfo] = useState(true); // Start loading immediately
  const [mediaInfoError, setMediaInfoError] = useState<string | null>(null);
  const [retryAttempt, setRetryAttempt] = useState(0); // <-- NEW: State for retry attempts

  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  // Effect to fetch media info when props or retryAttempt change
  useEffect(() => {
    console.log("PikoVideoPlayer: Media info useEffect triggered. RetryAttempt:", retryAttempt, "Props:", {connectorId, cameraId, positionMs});
    
    // 1. Signal a reset by nullifying streamUrl and mediaType.
    // This will trigger the cleanup in the HLS setup useEffect.
    setStreamUrl(null);
    setMediaType(null);
    
    // 2. Set loading/error states for the new fetch attempt
    setIsLoadingMediaInfo(true);
    setMediaInfoError(null);

    // 3. Validate props
    if (!connectorId || !cameraId) {
      console.error("PikoVideoPlayer: Missing required props (connectorId, cameraId). Halting fetch.");
      setMediaInfoError("Required information missing to load video.");
      setIsLoadingMediaInfo(false);
      return; 
    }

    // 4. Define and call fetchMediaInfo
    let isFetchCancelled = false; // Renamed from isCancelled to avoid confusion with a potential outer scope
    const infoApiUrl = new URL('/api/piko/media', window.location.origin);
    infoApiUrl.searchParams.append('connectorId', connectorId);
    if (pikoSystemId) {
        infoApiUrl.searchParams.append('pikoSystemId', pikoSystemId);
    }
    infoApiUrl.searchParams.append('cameraId', cameraId);
    if (positionMs !== undefined && positionMs !== null) {
        infoApiUrl.searchParams.append('positionMs', String(positionMs));
    }

    const fetchMediaInfo = async () => {
      console.log("PikoVideoPlayer: Fetching media info from:", infoApiUrl.toString());
      try {
        const response = await fetch(infoApiUrl.toString());
        if (isFetchCancelled) return;
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: `HTTP error ${response.status}` }));
          throw new Error(errorData.details || errorData.error || `Failed to fetch media info (${response.status})`);
        }
        const data: MediaInfoResponse = await response.json();
        if (isFetchCancelled) return;

        if (data.mediaType && data.streamUrl) {
            console.log(`PikoVideoPlayer: Media info received: Type=${data.mediaType}, URL=${data.streamUrl}`);
            setMediaType(data.mediaType);
            setStreamUrl(data.streamUrl);
        } else {
            throw new Error("Invalid media info received from API.");
        }
      } catch (error) {
          if (isFetchCancelled) return;
          console.error("PikoVideoPlayer: Failed to fetch media info:", error);
          const errorMsg = error instanceof Error ? error.message : "Unknown error fetching media info";
          setMediaInfoError(errorMsg);
          toast.error(`Error loading video: ${errorMsg}`);
          // Ensure streamUrl/mediaType remain null if fetch fails
          setStreamUrl(null); 
          setMediaType(null);
      } finally {
          if (isFetchCancelled) return;
          setIsLoadingMediaInfo(false);
      }
    };

    fetchMediaInfo();

    return () => {
        isFetchCancelled = true;
        console.log("PikoVideoPlayer: [MediaInfoEffect] fetchMediaInfo cancelled / effect cleanup.");
    };
  }, [connectorId, pikoSystemId, cameraId, positionMs, retryAttempt]);

  // Effect to setup hls.js or native player based on fetched info
  useEffect(() => {
    const videoElement = videoRef.current;
    let objectUrl: string | null = null; 

    const cleanup = () => {
      console.log("PikoVideoPlayer: [HLSEffect] Cleanup running.");
      if (hlsRef.current) {
        console.log("PikoVideoPlayer: [HLSEffect] Destroying HLS instance.");
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (objectUrl) {
        console.log("PikoVideoPlayer: [HLSEffect] Revoking Object URL.");
        URL.revokeObjectURL(objectUrl);
        objectUrl = null;
      }
      if (videoElement) {
        console.log("PikoVideoPlayer: [HLSEffect] Resetting video element src.");
        videoElement.removeAttribute('src');
        videoElement.load(); 
      }
    };

    // Only proceed if we have a valid streamUrl and mediaType
    if (videoElement && streamUrl && mediaType) {
      console.log(`PikoVideoPlayer: [HLSEffect] Setting up player: Type=${mediaType}, URL=${streamUrl}`);
      
      // No need to call cleanup() here explicitly at the start of the effect body,
      // because this effect re-runs when streamUrl/mediaType change. 
      // Its previous run's cleanup function would have already executed.

      if (mediaType === 'hls' && Hls.isSupported()) {
          // --- HLS Setup ---
          setIsLoadingMediaInfo(false); // HLS setup is synchronous for the element
          const hls = new Hls({
              debug: true,
              // OLD, DEPRECATED CONFIG:
              // fragLoadingMaxRetry: 2, 
              // fragLoadingTimeOut: 35000, 
              // NEW fragLoadPolicy based on HLS.js v1.6.2+ recommendations
              fragLoadPolicy: {
                default: {
                  maxTimeToFirstByteMs: 35000, // Wait up to 35s for the first byte
                  maxLoadTimeMs: 60000,      // Allow up to 60s for the whole fragment to load
                  timeoutRetry: {
                    maxNumRetry: 2,        // Retry 2 times on timeout
                    retryDelayMs: 1000,    // Wait 1s before first retry
                    maxRetryDelayMs: 5000  // Max delay for subsequent retries (if HLS.js uses backoff)
                  },
                  errorRetry: {
                    maxNumRetry: 2,        // Retry 2 times on other network/parsing errors
                    retryDelayMs: 1000,
                    maxRetryDelayMs: 5000
                  }
                }
              }
          });
          hls.loadSource(streamUrl); // streamUrl should be the direct M3U8 path or proxy
          hls.attachMedia(videoElement);
          hls.on(Hls.Events.ERROR, async (event, data) => {
              console.error('PikoVideoPlayer: HLS.js Error:', data);
              let detailedErrorMessage = `HLS Error: ${data.type} - ${data.details}`;
              let userFriendlyMessage = "A video playback error occurred.";

              if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                  userFriendlyMessage = "Network connection issue while streaming.";
                  if (data.details === Hls.ErrorDetails.FRAG_LOAD_TIMEOUT) {
                      userFriendlyMessage = "Video stream timed out. Check connection or try again.";
                  }
                  if (data.networkDetails?.status && data.networkDetails.status >= 400) {
                     // Try to get more specific error from response if possible
                     // (Note: Accessing responseText might depend on CORS and error type)
                     const responseText = (data.networkDetails as XMLHttpRequest)?.responseText;
                     if (responseText) {
                        try {
                            const errorJson = JSON.parse(responseText);
                            detailedErrorMessage = errorJson.details || errorJson.error || detailedErrorMessage;
                        } catch (parseError) { /* Keep original HLS error message */ }
                     } else {
                         detailedErrorMessage = `${detailedErrorMessage} (Status: ${data.networkDetails.status})`;
                     }
                  }
              } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                  userFriendlyMessage = "Error with video stream data.";
                  if (data.details === Hls.ErrorDetails.FRAG_PARSING_ERROR) {
                      userFriendlyMessage = "Problem decoding video data. The stream might be corrupted.";
                  }
              }
              
              toast.error(userFriendlyMessage);
              setMediaInfoError(userFriendlyMessage + (data.details ? ` (Details: ${data.details})` : ''));
              
              // Explicitly destroy HLS instance here before nulling out URL/type
              if (hlsRef.current) {
                console.log("PikoVideoPlayer: [HLS Error Handler] Explicitly destroying HLS instance.");
                hlsRef.current.destroy();
                hlsRef.current = null;
              }
              setStreamUrl(null); 
              setMediaType(null);
          });
          hlsRef.current = hls;
      } else if (mediaType === 'webm' || mediaType === 'mp4' || (mediaType === 'hls' && !Hls.isSupported())) {
          // --- Native Setup (WebM, MP4 or HLS fallback) ---
          if (mediaType === 'hls') {
              console.warn("PikoVideoPlayer: HLS stream detected but HLS.js not supported. Attempting native playback.");
          }
          
          setIsLoadingMediaInfo(true); 
          setMediaInfoError(null);
          console.log(`PikoVideoPlayer: Fetching ${mediaType} stream from:`, streamUrl);
          
          fetch(streamUrl) 
            .then(async response => {
                if (!response.ok) {
                    let errorData: { error?: string; details?: string } = {};
                    try {
                        // Attempt to parse JSON first, as our API route should return structured errors
                        errorData = await response.json(); 
                    } catch (parseError) {
                        // If JSON parsing fails, try to get text, then fall back to statusText
                        console.warn('PikoVideoPlayer: Could not parse error response as JSON for non-OK fetch.');
                        const rText = await response.text().catch(() => response.statusText);
                        errorData = { details: rText.substring(0, 200) }; // Use details for generic text
                    }
                    console.error(`PikoVideoPlayer: API returned error fetching ${mediaType} stream: Status ${response.status}`, errorData);
                    const message = errorData.details || errorData.error || `API error ${response.status}`;
                    throw new Error(message); 
                }
                // Check content type
                const contentType = response.headers.get('Content-Type');
                // MODIFIED: Simplified expected type check (no mpegts needed)
                const expectedContentTypePrefix = `video/${mediaType}`;
                
                if (!contentType || !contentType.startsWith(expectedContentTypePrefix)) {
                     console.error(`PikoVideoPlayer: Unexpected Content-Type for ${mediaType} stream: ${contentType}`);
                    throw new Error(`Expected ${expectedContentTypePrefix} stream, but received ${contentType || 'unknown type'}`);
                }
                return response.blob();
            })
            .then(blob => {
                objectUrl = URL.createObjectURL(blob);
                console.log(`PikoVideoPlayer: ${mediaType} stream fetched, setting object URL:`, objectUrl);
                if (videoElement) { 
                    videoElement.src = objectUrl;
                }
                setMediaInfoError(null);
            })
            .catch(error => {
                console.error(`PikoVideoPlayer: Failed to fetch or process ${mediaType} stream:`, error);
                const errorMsg = error instanceof Error ? error.message : `Unknown error loading ${mediaType} video`; // Added type to error
                setMediaInfoError(errorMsg);
                toast.error(`Error loading video: ${errorMsg}`);
                setStreamUrl(null); 
                setMediaType(null);
            })
            .finally(() => {
                setIsLoadingMediaInfo(false); 
            });

      } else {
          // --- Unsupported Type --- 
          console.error(`PikoVideoPlayer: Unsupported media type received: ${mediaType}`);
          setMediaInfoError(`Unsupported media type: ${mediaType}`);
          setIsLoadingMediaInfo(false);
      }
    } else {
        // If streamUrl or mediaType becomes null (e.g., after error), ensure cleanup
        cleanup();
    }

    // Cleanup on unmount or if dependencies change triggering cleanup
    return cleanup;

  }, [streamUrl, mediaType]); // Depend on the fetched stream URL and type


  // --- Rendering ---
  return (
    <div className={`relative aspect-video bg-muted rounded-md overflow-hidden flex items-center justify-center ${className}`}>
        {/* Loading State (while fetching media info) */}
        {isLoadingMediaInfo && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground z-10">
            <Loader2 className="h-8 w-8 mb-2 animate-spin" />
            <span>Loading video info...</span>
          </div>
        )}
        {/* Error State (info fetch or playback error) */}
        {!isLoadingMediaInfo && mediaInfoError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-destructive text-center p-4 z-10 bg-muted">
            <AlertCircle className="h-8 w-8 mb-2" />
            <span className="text-sm mt-1 font-medium">{mediaInfoError}</span>
            <Button 
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => {
                console.log("PikoVideoPlayer: Retry button clicked.");
                setRetryAttempt(prev => prev + 1);
                // Reset error and loading here to show loading spinner immediately on retry
                setMediaInfoError(null);
                setIsLoadingMediaInfo(true);
              }}
            >
              Retry Playback
            </Button>
          </div>
        )}
        {/* Video Element (render if info loaded successfully, source set by useEffect) */}
        {/* Keep video element mounted but hidden during load/error for refs */}
        <video
            ref={videoRef}
            controls
            autoPlay
            preload="auto"
            // Revert back to object-contain as it accurately displays the source frame
            className={`absolute inset-0 w-full h-full z-0 bg-black object-contain ${isLoadingMediaInfo || mediaInfoError ? 'opacity-0' : 'opacity-100'}`}
            onError={(e) => {
                // Native error (e.g., WebM fails, or native HLS fails)
                if (!hlsRef.current) { // Don't log if HLS.js might be handling it
                    console.error("PikoVideoPlayer: Native video element error:", e);
                    const videoElement = e.target as HTMLVideoElement;
                    // Use a more generic message as we cannot access backend error details here.
                    const errorMsg = "Error loading video";
                    
                    // Display the generic message
                    toast.error(errorMsg);
                    setMediaInfoError(errorMsg); // Show the generic error in the player UI
                    setStreamUrl(null); // Prevent retry loops
                    setMediaType(null);
                }
            }}
        />
    </div>
  );
}; 