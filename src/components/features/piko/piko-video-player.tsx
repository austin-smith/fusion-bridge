"use client";

import React, { useState, useEffect, useRef } from 'react';
import Hls from 'hls.js';
import { Loader2, AlertCircle } from 'lucide-react';
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

  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  // Effect to fetch media info when props change
  useEffect(() => {
    // Reset state on prop change
    setStreamUrl(null);
    setMediaType(null);
    setIsLoadingMediaInfo(true);
    setMediaInfoError(null);

    // MODIFIED: Validate only required props. Live stream omits positionMs.
    if (!connectorId || !cameraId) {
      console.error("PikoVideoPlayer: Missing required props (connectorId, cameraId).");
      setMediaInfoError("Required information missing to load video.");
      setIsLoadingMediaInfo(false);
      return;
    }

    // Construct URL for the getInfo action
    const infoApiUrl = new URL('/api/piko/media', window.location.origin);
    infoApiUrl.searchParams.append('connectorId', connectorId);
    // Conditionally add pikoSystemId if present (indicates cloud)
    if (pikoSystemId) {
        infoApiUrl.searchParams.append('pikoSystemId', pikoSystemId);
    }
    infoApiUrl.searchParams.append('cameraId', cameraId);
    // MODIFIED: Only append positionMs if it's provided (for recorded video)
    if (positionMs !== undefined && positionMs !== null) {
        infoApiUrl.searchParams.append('positionMs', String(positionMs));
    } // If positionMs is missing, the API route will interpret as live HLS

    console.log("PikoVideoPlayer: Fetching media info from:", infoApiUrl.toString());

    let isCancelled = false;

    const fetchMediaInfo = async () => {
      try {
        const response = await fetch(infoApiUrl.toString());
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: `HTTP error ${response.status}` }));
          throw new Error(errorData.details || errorData.error || `Failed to fetch media info (${response.status})`);
        }
        const data: MediaInfoResponse = await response.json();

        if (!isCancelled) {
           if (data.mediaType && data.streamUrl) {
               console.log(`PikoVideoPlayer: Media info received: Type=${data.mediaType}, URL=${data.streamUrl}`);
               setMediaType(data.mediaType);
               // The streamUrl from getInfo already contains action=getStream and all necessary params
               setStreamUrl(data.streamUrl);
               setMediaInfoError(null);
           } else {
               throw new Error("Invalid media info received from API.");
           }
        }
      } catch (error) {
          if (!isCancelled) {
              console.error("PikoVideoPlayer: Failed to fetch media info:", error);
              const errorMsg = error instanceof Error ? error.message : "Unknown error fetching media info";
              setMediaInfoError(errorMsg);
              toast.error(`Error loading video: ${errorMsg}`);
              setStreamUrl(null);
              setMediaType(null);
          }
      } finally {
          if (!isCancelled) {
              setIsLoadingMediaInfo(false);
          }
      }
    };

    fetchMediaInfo();

    // Cleanup function
    return () => {
        isCancelled = true;
        console.log("PikoVideoPlayer: Cancelling media info fetch.");
         // Ensure HLS instance is destroyed on unmount or prop change cancel
         if (hlsRef.current) {
            hlsRef.current.destroy();
            hlsRef.current = null;
        }
    };
    // Re-run effect if any critical prop changes
  }, [connectorId, pikoSystemId, cameraId, positionMs]); // Keep positionMs in dependency array


  // Effect to setup hls.js or native player based on fetched info
  useEffect(() => {
    const videoElement = videoRef.current;
    let objectUrl: string | null = null; // Keep track of Object URL for cleanup

    const cleanup = () => {
      if (hlsRef.current) {
        console.log("PikoVideoPlayer: Destroying HLS instance.");
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (objectUrl) {
        console.log("PikoVideoPlayer: Revoking Object URL.");
        URL.revokeObjectURL(objectUrl);
        objectUrl = null;
      }
      if (videoElement) {
        videoElement.removeAttribute('src');
        videoElement.load(); // Reset video element state
      }
    };

    if (videoElement && streamUrl && mediaType) {
      cleanup(); // Clean previous instance/source before setting up new one

      console.log(`PikoVideoPlayer: Setting up player: Type=${mediaType}, URL=${streamUrl}`);

      if (mediaType === 'hls' && Hls.isSupported()) {
          // --- HLS Setup ---
          setIsLoadingMediaInfo(false); // HLS setup is synchronous for the element
          const hls = new Hls({ /* Add HLS config here if needed */ });
          hls.loadSource(streamUrl); // streamUrl should be the direct M3U8 path or proxy
          hls.attachMedia(videoElement);
          hls.on(Hls.Events.ERROR, async (event, data) => {
              console.error('PikoVideoPlayer: HLS.js Error:', data);
              let detailedErrorMessage = `HLS Error: ${data.type} - ${data.details}`;
              if (data.type === Hls.ErrorTypes.NETWORK_ERROR &&
                  (data.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR || data.details === Hls.ErrorDetails.MANIFEST_PARSING_ERROR) &&
                  data.networkDetails?.status &&
                  data.networkDetails.status >= 400)
              {
                  try {
                      const xhr = data.networkDetails as XMLHttpRequest;
                      if (xhr?.responseText) {
                           const errorJson = JSON.parse(xhr.responseText);
                           if (errorJson.details) {
                               detailedErrorMessage = `${errorJson.details}`; // Use the specific details
                           } else if (errorJson.error) {
                               detailedErrorMessage = `${errorJson.error}`; // Fallback to main error
                           }
                      }
                  } catch (parseError) { /* Keep default HLS error */ }
              }
              toast.error(`Video Error: ${detailedErrorMessage}`);
              setMediaInfoError(`Playback error: ${detailedErrorMessage}`); // Show error in UI
              setStreamUrl(null); // Clear stream URL
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
                    const errorData = await response.json().catch(() => ({ error: `HTTP error ${response.status}`, details: 'Could not parse error response.' }));
                    console.error(`PikoVideoPlayer: API returned error fetching ${mediaType} stream:`, errorData);
                    throw new Error(errorData.details || errorData.error || `API error ${response.status}`);
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