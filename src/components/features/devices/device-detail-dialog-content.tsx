import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
// Remove the direct import of DeviceWithConnector if not needed elsewhere
// import { DeviceWithConnector } from '@/types';
import type { DisplayState, TypedDeviceInfo } from '@/lib/mappings/definitions';
import { ActionableState } from '@/lib/mappings/definitions';
import { DeviceType, ON, OFF } from '@/lib/mappings/definitions';
import { getDisplayStateIcon, getBatteryIcon, getBatteryColorClass } from '@/lib/mappings/presentation';
import { getDeviceTypeIcon } from "@/lib/mappings/presentation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, ChevronsUpDown, Loader2, InfoIcon, Copy, HelpCircle, PlayIcon, AlertCircle, Image as ImageIcon, PowerIcon, PowerOffIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
  DialogDescription,
} from "@/components/ui/dialog";
import { type VariantProps } from "class-variance-authority";
import { badgeVariants } from "@/components/ui/badge";
import { toast } from 'sonner';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ConnectorIcon } from "@/components/features/connectors/connector-icon";
import type { PikoServer } from '@/types'; // Keep if pikoServerDetails is used
import { Skeleton } from "@/components/ui/skeleton";
import Image from 'next/image';
import dynamic from 'next/dynamic';
// Import the PikoVideoPlayer dynamically to prevent SSR issues with WebRTC
const PikoVideoPlayer = dynamic(
  () => import('@/components/features/piko/piko-video-player').then(mod => mod.PikoVideoPlayer),
  { ssr: false }
);
import { useFusionStore } from '@/stores/store'; // Import the store
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'; // Import Tooltip
import type { PikoConfig } from '@/services/drivers/piko'; // Import PikoConfig type
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { MultiSelectComboBox } from '@/components/ui/multi-select-combobox';

// Define the shape of the expected prop, compatible with DisplayedDevice from page.tsx
// It needs all fields used internally, *excluding* the original 'status' field.
export interface DeviceDetailProps {
  internalId: string; // Use internal database ID
  deviceId: string;
  connectorId: string;
  name: string;
  connectorName: string;
  connectorCategory: string;
  deviceTypeInfo: TypedDeviceInfo;
  displayState?: DisplayState;
  lastSeen?: Date;
  associationCount?: number | null;
  type: string; // Raw type string
  url?: string;
  model?: string;
  vendor?: string;
  serverName?: string;
  serverId?: string;
  pikoServerDetails?: PikoServer;
  batteryPercentage?: number | null; // Add battery percentage
  createdAt: Date;
  updatedAt: Date;
  spaceId?: string | null; // Add space ID
  spaceName?: string | null; // Add space name
  // Add lastStateEvent / lastStatusEvent if needed in dialog?
}

// Define the component's Props interface using the new type
interface DeviceDetailDialogContentProps {
  device: DeviceDetailProps; // Use the new interface
}

// Helper function requires entity type for context
// Returns EITHER a valid variant name OR a specific Tailwind class string
const getStatusBadgeStyle = (
  status: string | null | undefined, 
  entityType: 'device' | 'server' | 'unknown' = 'unknown' 
): VariantProps<typeof badgeVariants>["variant"] | string => { // More specific return type
  if (!status) return 'outline';
  const lowerStatus = status.toLowerCase();
  
  switch (lowerStatus) {
    case 'online': 
      if (entityType === 'server') {
        return 'default'; // Server Online = default (greenish)
      } else {
        // Device Online = return Tailwind classes for Yellow
        return 'border-transparent bg-yellow-100 text-yellow-800 hover:bg-yellow-100/80 dark:bg-yellow-900 dark:text-yellow-50 dark:hover:bg-yellow-900/80';
      }
    case 'offline': return 'destructive';
    case 'recording': return 'default'; 
    case 'incompatible': return 'destructive';
    case 'mismatchedcertificate': return 'destructive';
    case 'unauthorized': return 'destructive';
    case 'notdefined': return 'outline'; 
    default: 
      console.warn(`Unexpected status value encountered: ${status} for ${entityType}`);
      return 'outline'; 
  }
};

// List of known badge variant names
const knownBadgeVariants = ['default', 'secondary', 'destructive', 'outline'];

// Interface for device selection
interface DeviceOption {
  value: string; // deviceId
  label: string; // name
}

// Create a new TimeAgoText component just for the text content
// Component that ONLY updates the text, not the container
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

// Isolated Play Button component that won't re-render on parent changes
const PlayButton = memo(({ onPlayClick, isDisabled }: { 
  onPlayClick: () => void; 
  isDisabled?: boolean;
}) => {
  // Use callback ref to attach event listeners directly to DOM, bypassing React's event system
  const overlayRef = useRef<HTMLDivElement>(null);
  
  // Set up event listeners once when component mounts
  useEffect(() => {
    // This is the element that won't be affected by React re-renders
    const overlay = overlayRef.current;
    if (!overlay || isDisabled) return;
    
    // Instead of relying on React's synthetic events or CSS hover,
    // directly manage the hover state with DOM event listeners
    const handleMouseEnter = () => {
      overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.3)';
      const playIcon = overlay.querySelector('.play-icon') as HTMLElement;
      if (playIcon) playIcon.style.opacity = '1';
    };
    
    const handleMouseLeave = () => {
      overlay.style.backgroundColor = 'rgba(0, 0, 0, 0)';
      const playIcon = overlay.querySelector('.play-icon') as HTMLElement;
      if (playIcon) playIcon.style.opacity = '0';
    };
    
    // Add event listeners directly to the DOM element
    overlay.addEventListener('mouseenter', handleMouseEnter);
    overlay.addEventListener('mouseleave', handleMouseLeave);
    
    // Clean up
    return () => {
      overlay.removeEventListener('mouseenter', handleMouseEnter);
      overlay.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [isDisabled]);
  
  return (
    <div 
      ref={overlayRef}
      onClick={!isDisabled ? onPlayClick : undefined}
      className={cn(
        "absolute inset-0 z-30 transition-colors duration-300",
        isDisabled ? "pointer-events-none bg-black/30 opacity-40" : "cursor-pointer"
      )}
      aria-label={isDisabled ? "Live view unavailable for local connections" : "Play live video"}
    >
      <div className="absolute inset-0 flex items-center justify-center">
        <PlayIcon 
          className={cn(
            "play-icon h-12 w-12 transition-opacity duration-300",
            isDisabled 
              ? "text-white/60 fill-white/30" 
              : "text-white/90 fill-white/60 opacity-0"
          )} 
        />
      </div>
    </div>
  );
});

PlayButton.displayName = 'PlayButton';

export const DeviceDetailDialogContent: React.FC<DeviceDetailDialogContentProps> = ({ device }) => {
  // Get store state and actions
  const connectors = useFusionStore((state) => state.connectors);
  const deviceStates = useFusionStore((state) => state.deviceStates);
  const { executeDeviceAction, deviceActionLoading } = useFusionStore(state => ({
    executeDeviceAction: state.executeDeviceAction,
    deviceActionLoading: state.deviceActionLoading,
  }));

  // Subscribe to device state changes from the store
  const deviceStateKey = `${device.connectorId}:${device.deviceId}`;
  const currentDeviceState = deviceStates.get(deviceStateKey);
  
  // Use the latest state from the store, falling back to the prop when not available
  const displayState = currentDeviceState?.displayState || device.displayState;
  const isOn = displayState === ON;
  const isOff = displayState === OFF;
  
  // No need for internal casting anymore
  // const displayDevice = device as ...;

  // --- State for Associations ---
  // For device -> Piko associations
  const [availablePikoCameras, setAvailablePikoCameras] = useState<DeviceOption[]>([]);
  const [selectedPikoCameraIds, setSelectedPikoCameraIds] = useState<Set<string>>(new Set());
  // For device associations
  const [availableLinkedDevices, setAvailableLinkedDevices] = useState<DeviceOption[]>([]);
  const [selectedLinkedDeviceIds, setSelectedLinkedDeviceIds] = useState<Set<string>>(new Set());
  const [fetchedAllDevices, setFetchedAllDevices] = useState<DeviceDetailProps[]>([]); // Added state for all devices
  
  const [isLoadingAssociations, setIsLoadingAssociations] = useState(false);
  const [isSavingAssociations, setIsSavingAssociations] = useState(false);
  const [associationError, setAssociationError] = useState<string | null>(null);
  
  // --- State for Thumbnail & Live Video --- 
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [isThumbnailLoading, setIsThumbnailLoading] = useState(false);
  const [thumbnailError, setThumbnailError] = useState<string | null>(null);
  const [showLiveVideo, setShowLiveVideo] = useState(false);
  const [lastThumbnailRefreshTime, setLastThumbnailRefreshTime] = useState<Date | null>(null);
  
  // Refs for double-buffering/preloading strategy
  const preloaderImgRef = useRef<HTMLImageElement | null>(null);
  const preloadingUrlRef = useRef<string | null>(null);
  const urlToRevokeRef = useRef<string | null>(null);

  // --- Ref for current thumbnailUrl, to stabilize fetchThumbnail ---
  const currentThumbnailUrlRef = useRef<string | null>(null);
  useEffect(() => {
    currentThumbnailUrlRef.current = thumbnailUrl;
  }, [thumbnailUrl]);

  // Refs to hold latest values for unmount cleanup
  const latestThumbnailUrlForUnmountRef = useRef<string | null>(null);
  const latestPreloadingUrlForUnmountRef = useRef<string | null>(null);
  const latestUrlToRevokeForUnmountRef = useRef<string | null>(null);

  useEffect(() => {
    latestThumbnailUrlForUnmountRef.current = thumbnailUrl;
    latestPreloadingUrlForUnmountRef.current = preloadingUrlRef.current;
    latestUrlToRevokeForUnmountRef.current = urlToRevokeRef.current;
  }); // No dependency array, runs after every render to capture latest values

  // --- START: Logic to get Piko System ID and Connection Type ---
  let pikoSystemIdForVideo: string | undefined = undefined;
  let isPikoLocalConnection = false; // Flag for local connection
  if (device.connectorCategory === 'piko') {
      const connector = connectors.find(c => c.id === device.connectorId);
      if (connector && connector.config) {
          try {
              const pikoConfig = connector.config as PikoConfig;
              if (pikoConfig.type === 'cloud') {
                  pikoSystemIdForVideo = pikoConfig.selectedSystem;
              } else if (pikoConfig.type === 'local') {
                  isPikoLocalConnection = true; // Set the flag
              }
          } catch (e) {
              console.error("Error parsing connector config:", e);
          }
      }
  }
  // --- END: Logic ---

  // Fetch available devices and current associations
  useEffect(() => {
    const fetchData = async () => {
      setIsLoadingAssociations(true);
      setAssociationError(null);
      
      // Reset selections based on current device type
      if (device.connectorCategory !== 'piko') { // For non-Piko devices (e.g., YoLink, and potentially others)
        setSelectedPikoCameraIds(new Set());
        setAvailablePikoCameras([]);
      }
      if (device.connectorCategory === 'piko') { // For Piko devices
        setSelectedLinkedDeviceIds(new Set());
        setAvailableLinkedDevices([]);
      }

      try {
        // 1. Fetch all devices
        const allDevicesResponse = await fetch('/api/devices');
        if (!allDevicesResponse.ok) throw new Error('Failed to fetch device list');
        const allDevicesData = await allDevicesResponse.json();
        if (!allDevicesData.success) throw new Error(allDevicesData.error || 'Failed to fetch device list data');
        
        const allDevicesList = allDevicesData.data || [];
        setFetchedAllDevices(allDevicesList); // Store all devices in state
        
        // Filter for either Piko cameras or other devices based on the current device type
        if (device.connectorCategory !== 'piko') { // Current device is NOT a Piko camera (e.g., YoLink, other sensors/switches)
          // Get Piko cameras to associate with the current non-Piko device
          const pikoCameras = allDevicesList
            .filter((d: DeviceDetailProps) => d.connectorCategory === 'piko' && d.deviceTypeInfo?.type === 'Camera') 
            .map((d: DeviceDetailProps): DeviceOption => ({ value: d.deviceId, label: d.name }))
            .sort((a: DeviceOption, b: DeviceOption) => a.label.localeCompare(b.label));
          setAvailablePikoCameras(pikoCameras);
          
          // 2. Fetch current associations for this device
          const associationsResponse = await fetch(`/api/device-associations?deviceId=${device.deviceId}`);
          if (!associationsResponse.ok) throw new Error('Failed to fetch current associations');
          const associationsData = await associationsResponse.json();
          if (!associationsData.success) throw new Error(associationsData.error || 'Failed to fetch current associations data');
          
          // The API returns an array of Piko Camera IDs for a specific device
          setSelectedPikoCameraIds(new Set(associationsData.data || []));
        } 
        else if (device.connectorCategory === 'piko') { // Current device IS a Piko camera
          // Get other devices to associate with this Piko camera
          const otherDevicesToAssociate = allDevicesList
            .filter((d: DeviceDetailProps) => d.deviceId !== device.deviceId) // Any device except itself
            .map((d: DeviceDetailProps): DeviceOption => ({ value: d.deviceId, label: d.name }))
            .sort((a: DeviceOption, b: DeviceOption) => a.label.localeCompare(b.label));
          setAvailableLinkedDevices(otherDevicesToAssociate);
          
          // 2. Fetch associated device IDs using the pikoCameraId
          console.log(`UI: Fetching associated devices for Piko device ${device.deviceId}`);
          const associationsResponse = await fetch(`/api/device-associations?pikoCameraId=${device.deviceId}`);
          if (!associationsResponse.ok) throw new Error('Failed to fetch associations');
          const associationsData = await associationsResponse.json();
          if (!associationsData.success) throw new Error(associationsData.error || 'Failed to fetch associations data');
          
          // The API now directly returns an array of device IDs
          const linkedDeviceIds = associationsData.data || [];
          console.log(`UI: Received ${linkedDeviceIds.length} associated device IDs.`);
          setSelectedLinkedDeviceIds(new Set(linkedDeviceIds));
        }

      } catch (err: unknown) {
        console.error("Error fetching association data:", err);
        const errorMessage = err instanceof Error ? err.message : 'Failed to load association data.';
        setAssociationError(errorMessage);
        toast.error(errorMessage);
      } finally {
        setIsLoadingAssociations(false);
      }
    };

    fetchData();

  }, [device.deviceId, device.connectorCategory, device.deviceTypeInfo?.type]); // Updated dependency

  const pikoServerDetails = device.pikoServerDetails;

  // Handlers for preloading image
  const handlePreloadComplete = useCallback(() => {
    if (!preloadingUrlRef.current) return; // Should not happen, but safeguard
    console.log('[Preloader] onLoad success for:', preloadingUrlRef.current);

    // 1. Revoke the *previously* displayed URL (now stored in urlToRevokeRef)
    if (urlToRevokeRef.current) {
      console.log('[Preloader] Revoking old URL:', urlToRevokeRef.current);
      URL.revokeObjectURL(urlToRevokeRef.current);
      urlToRevokeRef.current = null;
    }

    // 2. Update the visible image state with the preloaded URL
    setThumbnailUrl(preloadingUrlRef.current);

    // 3. Clear preloader state
    preloadingUrlRef.current = null;
    if (preloaderImgRef.current) {
      preloaderImgRef.current.src = ''; // Clear src of hidden img
    }
    setIsThumbnailLoading(false); // Finished loading sequence
    // Don't disrupt video playback
  }, [preloadingUrlRef, urlToRevokeRef, preloaderImgRef, setThumbnailUrl, setIsThumbnailLoading]);

  // Handler for errors on the hidden preloader image
  const handlePreloadError = useCallback(() => {
    if (!preloadingUrlRef.current) return;
    console.error('[Preloader] onError for:', preloadingUrlRef.current);
    setThumbnailError(`Failed to preload thumbnail.`);
    
    // 1. Revoke the URL that failed to preload
    URL.revokeObjectURL(preloadingUrlRef.current);
    preloadingUrlRef.current = null;
    
    // 2. Clear any pending revocation for the old URL (it remains displayed)
    urlToRevokeRef.current = null; 
    
    // 3. Clear hidden image src
    if (preloaderImgRef.current) {
      preloaderImgRef.current.src = '';
    }
    setIsThumbnailLoading(false); // Finished loading sequence (with error)
  }, [preloadingUrlRef, urlToRevokeRef, preloaderImgRef, setThumbnailError, setIsThumbnailLoading]);

  // Attach event listeners to the hidden image element (TOP LEVEL HOOK)
  useEffect(() => {
    const img = preloaderImgRef.current;
    if (img) {
      console.log('[Preloader] Attaching listeners');
      img.addEventListener('load', handlePreloadComplete);
      img.addEventListener('error', handlePreloadError);
      // Cleanup listeners on unmount or ref change
      return () => {
        console.log('[Preloader] Removing listeners');
        img.removeEventListener('load', handlePreloadComplete);
        img.removeEventListener('error', handlePreloadError);
      };
    }
  }, [preloaderImgRef, handlePreloadComplete, handlePreloadError]); // Include handler functions

  // Fetch Thumbnail, manage preloading and refresh interval
  const fetchThumbnail = useCallback(async () => {
    if (device.connectorCategory !== 'piko' || device.deviceTypeInfo?.type !== 'Camera') {
       // Not a Piko camera, clear any existing timer/state if necessary
       setThumbnailUrl(null);
       setLastThumbnailRefreshTime(null);
       // Ensure refs are clear too
       if (preloadingUrlRef.current) URL.revokeObjectURL(preloadingUrlRef.current);
       if (urlToRevokeRef.current) URL.revokeObjectURL(urlToRevokeRef.current);
       preloadingUrlRef.current = null;
       urlToRevokeRef.current = null;
       return;
    }

    // Skip fetching if video is being played
    if (showLiveVideo) {
      console.log('[Fetch] Skipping thumbnail refresh while video is playing');
      return;
    }

    setIsThumbnailLoading(true);
    setThumbnailError(null);

    try {
      const apiUrl = new URL('/api/piko/device-thumbnail', window.location.origin);
      apiUrl.searchParams.append('connectorId', device.connectorId);
      apiUrl.searchParams.append('cameraId', device.deviceId);
      apiUrl.searchParams.append('size', '640x480');

      const response = await fetch(apiUrl.toString());
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to fetch thumbnail (${response.status})`);
      }
      const blob = await response.blob();
      const newObjectUrl = URL.createObjectURL(blob);
      console.log('[Fetch] New blob URL created:', newObjectUrl);

      // Store the currently displayed URL for later revocation
      urlToRevokeRef.current = currentThumbnailUrlRef.current;
      // Store the new URL being preloaded
      preloadingUrlRef.current = newObjectUrl;

      // Assign to hidden image src to start loading
      if (preloaderImgRef.current) {
        console.log('[Fetch] Assigning to preloader src:', newObjectUrl);
        preloaderImgRef.current.src = newObjectUrl;
      } else {
        console.error('[Fetch] Preloader img ref not available! Cannot preload.');
        // Fallback: Directly set the image, potentially causing flicker
        URL.revokeObjectURL(newObjectUrl);
        preloadingUrlRef.current = null;
        urlToRevokeRef.current = null;
        setIsThumbnailLoading(false);
        setThumbnailError("Internal error: Preloader not ready.");
        // Or maybe try setting it directly?
        // setThumbnailUrl(newObjectUrl);
        // urlToRevokeRef.current = null; // No old one to revoke now
      }

      // State updated via preload handlers now
      setLastThumbnailRefreshTime(new Date());
      // Only switch to thumbnail view if not already showing video
      // This prevents interrupting video playback

    } catch (err: unknown) {
      console.error("Error fetching device thumbnail:", err);
      const message = err instanceof Error ? err.message : 'Failed to load thumbnail';
      setThumbnailError(message);
      setIsThumbnailLoading(false);
      // Clean up refs if fetch fails
      if (preloadingUrlRef.current) URL.revokeObjectURL(preloadingUrlRef.current);
      if (urlToRevokeRef.current) URL.revokeObjectURL(urlToRevokeRef.current); // Or maybe keep the old one?
      preloadingUrlRef.current = null;
      urlToRevokeRef.current = null;
    }
    // No finally block for setIsThumbnailLoading(false) - handled by preload events
  }, [device.connectorCategory, device.deviceTypeInfo, device.connectorId, device.deviceId, showLiveVideo, preloaderImgRef, setThumbnailUrl, setLastThumbnailRefreshTime, preloadingUrlRef, urlToRevokeRef, setIsThumbnailLoading, setThumbnailError, currentThumbnailUrlRef]);

  useEffect(() => {
    if (device.connectorCategory !== 'piko' || device.deviceTypeInfo?.type !== 'Camera') {
      // Not a Piko camera, clear any existing state if necessary
      return;
    }

    // Skip thumbnail fetching when live video is being shown
    if (showLiveVideo) {
      console.log('Thumbnail refreshing paused while live video is playing');
      return;
    }

    // Initial fetch
    fetchThumbnail();

    // Set up auto-refresh interval
    const intervalId = setInterval(fetchThumbnail, 10000);
    return () => {
      clearInterval(intervalId);
      // When this effect cleans up (e.g., showLiveVideo becomes true, device changes, or unmount),
      // any URL that was in the process of being preloaded should be revoked.
      if (preloadingUrlRef.current) {
        URL.revokeObjectURL(preloadingUrlRef.current);
        console.log(`[Auto-Refresh Cleanup] Revoked preloadingUrl: ${preloadingUrlRef.current}`);
        preloadingUrlRef.current = null; // Clear the ref
      }
      // The `currentThumbnailUrlRef.current` (which is the `thumbnailUrl` state) and
      // `urlToRevokeRef.current` (which was the `thumbnailUrl` before the pending preload)
      // should NOT be revoked here. Their lifecycle is managed by the preloading
      // success/error handlers (which update `thumbnailUrl` state and revoke old URLs)
      // and the component's final unmount cleanup.
    };
  }, [device.connectorCategory, device.deviceTypeInfo?.type, showLiveVideo, fetchThumbnail, device.connectorId, device.deviceId]);

  // Final unmount cleanup for any remaining object URLs
  useEffect(() => {
    return () => {
      const finalThumbnail = latestThumbnailUrlForUnmountRef.current;
      const finalPreloading = latestPreloadingUrlForUnmountRef.current;
      const finalToRevoke = latestUrlToRevokeForUnmountRef.current;

      // Revoke the last successfully displayed thumbnail
      if (finalThumbnail) {
        URL.revokeObjectURL(finalThumbnail);
        console.log(`[Component Unmount] Revoked final thumbnailUrl: ${finalThumbnail}`);
      }
      // Revoke any URL that was being preloaded, if different from the final displayed one
      if (finalPreloading && finalPreloading !== finalThumbnail) {
        URL.revokeObjectURL(finalPreloading);
        console.log(`[Component Unmount] Revoked final preloadingUrl: ${finalPreloading}`);
      }
      // Fallback for urlToRevokeRef, if it's an orphaned URL (should ideally be null or same as finalThumbnail/finalPreloading)
      if (finalToRevoke && finalToRevoke !== finalThumbnail && finalToRevoke !== finalPreloading) {
        URL.revokeObjectURL(finalToRevoke);
        console.log(`[Component Unmount] Revoked final urlToRevoke: ${finalToRevoke}`);
      }
    };
  }, []); // Empty dependency array ensures this runs only on unmount

  // --- Handle Saving Associations ---
  const handleSaveAssociations = async () => {
    setIsSavingAssociations(true);
    setAssociationError(null);
    try {
      let response;
      
      if (device.connectorCategory !== 'piko') { // Current device is non-Piko (e.g. YoLink)
        // Save associations: current non-Piko device -> selected Piko cameras
        response = await fetch('/api/device-associations', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            deviceId: device.deviceId,
            pikoCameraIds: Array.from(selectedPikoCameraIds),
          }),
        });
      } else if (device.connectorCategory === 'piko') {
        console.log(`UI: Saving associations for Piko device ${device.deviceId}`);
        
        const pikoDeviceId = device.deviceId;
        const currentlySelectedLinkedDeviceIds = Array.from(selectedLinkedDeviceIds);
        console.log(`UI: Currently selected linked devices: [${currentlySelectedLinkedDeviceIds.join(', ')}]`);
        
        // Fetch initial state to determine diffs
        const initialAssocResponse = await fetch(`/api/device-associations?pikoCameraId=${pikoDeviceId}`);
        if (!initialAssocResponse.ok) throw new Error('Failed to fetch initial associations for Piko camera');
        const initialAssocData = await initialAssocResponse.json();
        const initialAssociatedDeviceIds = new Set<string>(initialAssocData.data || []);
        
        const updates: { deviceId: string, pikoCameraIds: string[] }[] = [];

        // Devices to ADD this Piko camera association to:
        for (const associatedDevId of currentlySelectedLinkedDeviceIds) {
          if (!initialAssociatedDeviceIds.has(associatedDevId)) {
            const currentPikoAssocRes = await fetch(`/api/device-associations?deviceId=${associatedDevId}`);
            const currentPikoAssocData = currentPikoAssocRes.ok ? await currentPikoAssocRes.json() : { data: [] };
            const currentPikoIds = new Set<string>(currentPikoAssocData.data || []);
            currentPikoIds.add(pikoDeviceId);
            updates.push({ deviceId: associatedDevId, pikoCameraIds: Array.from(currentPikoIds).sort() });
          }
        }

        // Devices to REMOVE this Piko camera association from:
        for (const associatedDevId of initialAssociatedDeviceIds) {
          if (!selectedLinkedDeviceIds.has(associatedDevId)) {
            const currentPikoAssocRes = await fetch(`/api/device-associations?deviceId=${associatedDevId}`);
            const currentPikoAssocData = currentPikoAssocRes.ok ? await currentPikoAssocRes.json() : { data: [] };
            const currentPikoIds = new Set<string>(currentPikoAssocData.data || []);
            currentPikoIds.delete(pikoDeviceId);
            updates.push({ deviceId: associatedDevId, pikoCameraIds: Array.from(currentPikoIds).sort() });
          }
        }
        
        if (updates.length > 0) {
          console.log('UI: Attempting batch update:', updates);
          response = await fetch('/api/device-associations/batch', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ updates }),
          });

          if (!response.ok) {
              const errorData = await response.json().catch(() => ({}));
              throw new Error(errorData.error || `Batch update failed with status ${response.status}`);
          }
        } else {
           console.log('UI: No association updates required.');
           response = new Response(JSON.stringify({ success: true }), { status: 200 });
        }
      } else {
        throw new Error('Invalid device type for association');
      }
      
      const data = await response.json();
      if (!response.ok || !data.success) {
        const errorMsg = data.error || 'Failed to save associations (check server logs)';
        console.error('UI Save Error:', errorMsg, 'Status:', response.status);
        throw new Error(errorMsg);
      }
      toast.success('Device associations saved successfully!');
    } catch (err: unknown) {
      console.error("Error saving associations:", err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to save associations.';
      setAssociationError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsSavingAssociations(false);
    }
  };

  // --- Copy State & Handler ---
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = async (text: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setIsCopied(true);
      toast.success("Copied ID to clipboard!");
      setTimeout(() => setIsCopied(false), 2000); // Reset icon after 2 seconds
    } catch (err) {
      console.error('Failed to copy ID: ', err);
      toast.error("Failed to copy ID.");
    }
  };

  // Function to render a detail row with label and value
  const DetailRow = ({label, value, monospace = false, breakAll = false}: {label: string, value: React.ReactNode, monospace?: boolean, breakAll?: boolean}) => (
    <div className="flex flex-row py-1.5 border-b border-muted/40 last:border-0">
      <div className="w-1/3 font-medium text-muted-foreground pl-2">{label}</div>
      <div className={cn("w-2/3 pr-2",
        monospace && "font-mono text-xs", 
        breakAll && "break-all"
      )}>
        {value}
      </div>
    </div>
  );

  // Get the icon component for the current device type, with fallback
  const IconComponent = getDeviceTypeIcon(device.deviceTypeInfo?.type ?? DeviceType.Unmapped);

  // --- BEGIN Action Button Logic --- 
  const isActionable = 
    device.connectorCategory === 'yolink' && 
    (device.deviceTypeInfo.type === DeviceType.Switch || device.deviceTypeInfo.type === DeviceType.Outlet);
  
  const isLoadingAction = deviceActionLoading.get(device.internalId) ?? false;
  // --- END Action Button Logic --- 

  // --- Handle clicking the thumbnail to show video --- 
  const handleThumbnailClick = () => {
    if (thumbnailUrl && !thumbnailError) {
        setShowLiveVideo(true);
    }
  };

  // --- BEGIN Status Badge Component --- //
  const DeviceStatusBadge = () => {
    // Only show simple status badge for non-actionable devices
    if (isActionable) return null;
    
    return displayState ? (
      <Badge variant="outline" className="inline-flex items-center gap-1 px-2 py-0.5 font-normal">
        {React.createElement(getDisplayStateIcon(displayState)!, { className: "h-3 w-3 flex-shrink-0" })}
        <span className="text-xs">{displayState}</span>
      </Badge>
    ) : (
      <Badge variant="outline">Unknown State</Badge>
    );
  };
  // --- END Status Badge Component --- //

  // --- Simple Media Thumbnail Component ---
  const MediaThumbnail: React.FC<{ 
      src: string; 
      isLoading: boolean; 
      error: string | null; 
      onPlayClick?: () => void;
      isPlayDisabled?: boolean;
  }> = 
    ({ src, isLoading, error, onPlayClick, isPlayDisabled = false }) => {
    const [imageLoadError, setImageLoadError] = useState(false);
    // Track both current and previous image for crossfade
    const [previousSrc, setPreviousSrc] = useState<string | null>(null);
    const [fadeIn, setFadeIn] = useState(true); // Controls when to fade in
    const [showPrevious, setShowPrevious] = useState(false); // Controls when previous is visible
    
    // When src changes, setup crossfade
    useEffect(() => {
      if (src && previousSrc !== src) {
        // Keep previous image showing during fade
        setShowPrevious(!!previousSrc);
        // Start new image faded out
        setFadeIn(false);
        // Trigger fade-in after a very short delay (for next paint)
        setTimeout(() => {
          setFadeIn(true);
          // After transition duration, remove previous image
          setTimeout(() => {
            setShowPrevious(false);
          }, 500); // Should match duration-500
        }, 10);
        // Remember current as previous for next change
        setPreviousSrc(src);
      }
    }, [src, previousSrc]);

    const handleImageError = () => {
       console.error('[MediaThumbnail] Image onError triggered for src:', src);
       setImageLoadError(true);
    };
    
    // Reset image error state when src changes
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
         {/* Current Image - with fade in effect */}
         {!isLoading && !error && src && (
           <Image 
             src={src} 
             alt="Device Thumbnail" 
             fill 
             className={cn(
               "absolute inset-0 w-full h-full object-contain transition-opacity duration-500 z-20 pointer-events-none",
               fadeIn ? 'opacity-100' : 'opacity-0',
               imageLoadError ? 'opacity-0' : undefined
             )}
             onError={handleImageError}
             onLoad={() => setImageLoadError(false)}
             unoptimized
             priority // Load with priority
           />
         )} 
         {/* Pure CSS Play Button Overlay */}
         {!isLoading && !error && !imageLoadError && src && onPlayClick && (
           <div 
             className={cn(
               "absolute inset-0 z-30 flex items-center justify-center transition-opacity duration-300",
               isPlayDisabled 
                 ? "bg-black/30 opacity-40 pointer-events-none" // Always visible if disabled
                 : "bg-black/30 opacity-0 group-hover:opacity-100" // Show on hover if enabled
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

  // Function to handle removing a single association 
  const handleRemoveAssociation = (idToRemove: string, context: 'currentDeviceLinksToPikoCam' | 'pikoCamLinksToDevice') => {
    if (context === 'currentDeviceLinksToPikoCam') { // Current device is non-Piko, removing a Piko cam from its list
      const updatedSelections = new Set(selectedPikoCameraIds);
      updatedSelections.delete(idToRemove);
      setSelectedPikoCameraIds(updatedSelections);
    } else { // Current device is Piko, removing an associated device from its list
      const updatedSelections = new Set(selectedLinkedDeviceIds);
      updatedSelections.delete(idToRemove);
      setSelectedLinkedDeviceIds(updatedSelections);
    }
  };

  return (
    <TooltipProvider delayDuration={300}>
      {/* Add hidden image for preloading */} 
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={preloaderImgRef} alt="" style={{ display: 'none' }} /> 

      <DialogHeader className="pb-4 border-b">
        {/* First Row: Icon, Title, Status */}
        <div className="flex items-center gap-2">
          <IconComponent className="h-5 w-5 text-muted-foreground" /> 
          <DialogTitle>{device.name}</DialogTitle>
          <DeviceStatusBadge />
        </div>
        {/* Second Row (Description Area): Badges and Action Switch */}
        <DialogDescription className="pt-1" asChild>
          <div className="flex items-center justify-between gap-4">
            {/* Left side: Badges */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* 1. Connector Badge */}
              <Badge variant="outline" className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 font-normal">
                <ConnectorIcon connectorCategory={device.connectorCategory} size={12} />
                <span className="text-xs">{device.connectorName}</span>
              </Badge>
              {/* 2. Device Type/Subtype Badge - Conditional rendering */}
              {device.deviceTypeInfo?.type && (
                <Badge variant="secondary" className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 font-normal">
                  <IconComponent className="h-3 w-3 text-muted-foreground" /> 
                  <span className="text-xs">
                    {device.deviceTypeInfo.type}
                    {device.deviceTypeInfo.subtype && (
                      <span className="text-muted-foreground ml-1">/ {device.deviceTypeInfo.subtype}</span>
                    )}
                  </span>
                </Badge>
              )}
            </div>
            {/* Right side: Action Switch (Conditional) */}
            {isActionable && (
              <div className="flex-shrink-0">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-2">
                      {isLoadingAction && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />} 
                      <Switch
                        id={`header-action-switch-${device.internalId}`}
                        checked={isOn}
                        onCheckedChange={(checked) => {
                          executeDeviceAction(
                            device.internalId,
                            checked ? ActionableState.SET_ON : ActionableState.SET_OFF
                          );
                        }}
                        disabled={isLoadingAction}
                        aria-label={isLoadingAction ? 'Processing' : (isOn ? 'Turn Off' : 'Turn On')}
                      />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{isLoadingAction ? 'Processing...' : (isOn ? 'Turn Off' : 'Turn On')}</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            )}
          </div>
        </DialogDescription>
      </DialogHeader>
      
      <div className="py-4 space-y-4 max-h-[70vh] overflow-y-auto pr-2">
        {/* Power Control Section - REMOVED */}
        
        {/* --- START: Piko Camera Media Section --- */}
        {device.connectorCategory === 'piko' && device.deviceTypeInfo?.type === 'Camera' && (
           <div className="mb-4">
             <div className="flex items-center space-x-2 py-2">
               <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
               <span className="text-xs font-medium text-muted-foreground">LIVE VIEW</span>
               <div className="h-px grow bg-border"></div>
             </div>
             {/* Conditionally render Player or Thumbnail */}
             {showLiveVideo ? (
                <div className="relative">
                  <PikoVideoPlayer
                    connectorId={device.connectorId}
                    cameraId={device.deviceId}
                    pikoSystemId={pikoSystemIdForVideo}
                    className="w-full"
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
                </div>
             ) : (
                <div className="relative">
                  {/* MediaThumbnail without TimeAgo */}
                  <MediaThumbnail 
                    src={thumbnailUrl || ''} 
                    isLoading={isThumbnailLoading && !thumbnailUrl}
                    error={thumbnailError}
                    onPlayClick={!isPikoLocalConnection ? handleThumbnailClick : undefined}
                    isPlayDisabled={isPikoLocalConnection}
                  />
                  
                  {/* TimeAgo badge rendered separately from MediaThumbnail */}
                  {lastThumbnailRefreshTime && (
                    <div className="absolute bottom-1 left-1 z-50 px-1.5 py-0.5 rounded bg-black/50 text-white text-[10px] font-medium min-w-[50px] text-center pointer-events-none">
                      <TimeAgoText refreshTime={lastThumbnailRefreshTime} />
                    </div>
                  )}
                </div>
             )}
           </div>
        )}
        {/* --- END: Piko Camera Media Section --- */}

        {/* Device Information Section - Always Visible */}
        <div>
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">Device Information</h3>
          <div className="rounded-md border text-sm">
            <div className="py-2">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-medium text-muted-foreground pl-2">GENERAL</span>
                <div className="h-px grow bg-border"></div>
              </div>
            </div>
            
            <DetailRow label="Name" value={device.name} />
            {/* Combined Type / Subtype with Icon - Conditional Rendering */}
            <DetailRow 
                label="Type" 
                value={device.deviceTypeInfo?.type ? ( 
                  <Badge variant="secondary" className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 font-normal">
                    <IconComponent className="h-3 w-3 text-muted-foreground" /> 
                    <span className="text-xs">
                      {device.deviceTypeInfo.type}
                      {device.deviceTypeInfo.subtype && (
                        <span className="text-muted-foreground ml-1">/ {device.deviceTypeInfo.subtype}</span>
                      )}
                    </span>
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">Unknown</span>
                )}
            />
            {/* Battery Information - Conditional Rendering */}
            {device.batteryPercentage !== null && device.batteryPercentage !== undefined && (
              <DetailRow 
                label="Battery" 
                value={
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex items-center cursor-default">
                        {(() => {
                          const BatteryIcon = getBatteryIcon(device.batteryPercentage);
                          const colorClass = getBatteryColorClass(device.batteryPercentage);
                          return <BatteryIcon className={`h-6 w-6 ${colorClass}`} />;
                        })()}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent 
                      side="top" 
                      align="center"
                      sideOffset={5}
                      alignOffset={0}
                      avoidCollisions={false}
                    >
                      <p>{device.batteryPercentage}%</p>
                    </TooltipContent>
                  </Tooltip>
                }
              />
            )}
            <DetailRow label="Model" value={device.model || "—"} />
            {device.connectorCategory === 'piko' && device.vendor && (
              <DetailRow label="Vendor" value={device.vendor} />
            )}
            {/* Space Information - Conditional Rendering */}
            {device.spaceName && (
              <DetailRow 
                label="Space" 
                value={
                  <Badge variant="outline" className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 font-normal">
                    <span className="text-xs">{device.spaceName}</span>
                  </Badge>
                }
              />
            )}
            
            <div className="py-2">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-medium text-muted-foreground pl-2">EXTERNAL IDENTIFIERS</span>
                <div className="h-px grow bg-border"></div>
              </div>
            </div>

            {/* Raw Identifier */}
            <DetailRow label="Device Type ID" value={device.type} monospace />
            {/* External ID with Copy Button */}
            <DetailRow 
              label="Device ID" 
              monospace breakAll 
              value={( 
                <div className="flex items-center justify-between gap-2 w-full"> 
                  <span className="flex-grow break-all">{device.deviceId}</span> 
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-6 w-6 shrink-0" 
                    onClick={() => handleCopy(device.deviceId)} 
                    disabled={isCopied} 
                  > 
                    {isCopied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />} 
                    <span className="sr-only">{isCopied ? 'Copied' : 'Copy ID'}</span> 
                  </Button> 
                </div> 
              )} 
            />

            <DetailRow 
                label="Last Seen" 
                value={device.lastSeen ? new Date(device.lastSeen).toLocaleString() : 'Never'} 
            />
          </div>
        </div>

        {/* Accordion for other sections */}
        <Accordion type="single" collapsible className="w-full">
          {/* Device Association Section (Conditional) */}
          {device.connectorCategory !== 'piko' && (
            <AccordionItem value="device-to-piko-associations">
              <AccordionTrigger className="text-sm font-medium">
                <div className="flex items-center">
                  Associated Piko Cameras
                  {!isLoadingAssociations && (
                    <Badge 
                      variant={selectedPikoCameraIds.size > 0 ? "secondary" : "outline"} 
                      className="ml-2 text-xs font-normal px-2 py-0.5"
                    >
                      {selectedPikoCameraIds.size}
                    </Badge>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent>
                {isLoadingAssociations ? (
                  <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading camera associations...
                  </div>
                ) : associationError ? (
                  <div className="p-4 rounded-md bg-destructive/10 text-destructive text-sm">
                    <div className="flex items-start">
                      <InfoIcon className="h-4 w-4 mr-2 mt-0.5" />
                      <span>{associationError}</span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 py-1">
                    <div className="text-sm text-muted-foreground">
                      Select Piko cameras related to this device.
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <MultiSelectComboBox
                        options={availablePikoCameras} // DeviceOption matches MultiSelectOption structure
                        selected={Array.from(selectedPikoCameraIds)}
                        onChange={(newSelected) => setSelectedPikoCameraIds(new Set(newSelected))}
                        placeholder={availablePikoCameras.length === 0 ? "No Piko cameras found" : "Select Piko cameras..."}
                        emptyText={isLoadingAssociations ? "Loading..." : "No Piko cameras found."}
                        className="w-full sm:w-[300px]"
                        popoverContentClassName="w-[300px]" // Maintain consistent popover width
                      />
                      <Button 
                        onClick={handleSaveAssociations} 
                        disabled={isLoadingAssociations || isSavingAssociations}
                        className="w-full sm:w-auto"
                      >
                        {isSavingAssociations && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save
                      </Button>
                    </div>
                    
                    {selectedPikoCameraIds.size > 0 && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {Array.from(selectedPikoCameraIds).map(id => {
                          const camera = availablePikoCameras.find(c => c.value === id);
                          const cameraDetails = fetchedAllDevices.find(d => d.deviceId === id);
                          const CameraIcon = cameraDetails?.deviceTypeInfo?.type ? getDeviceTypeIcon(cameraDetails.deviceTypeInfo.type) : HelpCircle;
                          return camera ? (
                            <Badge key={id} variant="secondary" className="flex items-center gap-1.5 px-2 py-1"> {/* Increased gap slightly */}
                              <CameraIcon className="h-3.5 w-3.5 text-muted-foreground" /> {/* Icon with text-muted-foreground */}
                              <span>{camera.label}</span>
                              <Button 
                                type="button" 
                                variant="ghost" 
                                size="icon" 
                                className="h-4 w-4 p-0 ml-1 hover:bg-secondary-foreground/10 rounded-full"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleRemoveAssociation(id, 'currentDeviceLinksToPikoCam');
                                }}
                              >
                                <X className="h-3 w-3" />
                                <span className="sr-only">Remove {camera.label}</span>
                              </Button>
                            </Badge>
                          ) : null;
                        })}
                      </div>
                    )}
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          )}

          {/* Piko Device Association Section (Conditional) */}
          {device.connectorCategory === 'piko' && (
            <AccordionItem value="piko-to-device-associations">
              <AccordionTrigger className="text-sm font-medium">
                <div className="flex items-center">
                  Associated Devices
                  {!isLoadingAssociations && (
                    <Badge 
                      variant={selectedLinkedDeviceIds.size > 0 ? "secondary" : "outline"} 
                      className="ml-2 text-xs font-normal px-2 py-0.5"
                    >
                      {selectedLinkedDeviceIds.size}
                    </Badge>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent>
                {isLoadingAssociations ? (
                  <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading device associations...
                  </div>
                ) : associationError ? (
                  <div className="p-4 rounded-md bg-destructive/10 text-destructive text-sm">
                    <div className="flex items-start">
                      <InfoIcon className="h-4 w-4 mr-2 mt-0.5" />
                      <span>{associationError}</span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 py-1">
                    <div className="text-sm text-muted-foreground">
                      Select devices to associate with this Piko camera.
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <MultiSelectComboBox
                        options={availableLinkedDevices} 
                        selected={Array.from(selectedLinkedDeviceIds)}
                        onChange={(newSelected) => setSelectedLinkedDeviceIds(new Set(newSelected))}
                        placeholder={availableLinkedDevices.length === 0 ? "No devices found" : "Select devices..."}
                        emptyText={isLoadingAssociations ? "Loading..." : "No devices found."}
                        className="w-full sm:w-[300px]"
                        popoverContentClassName="w-[300px]" // Maintain consistent popover width
                      />
                      <Button 
                        onClick={handleSaveAssociations} 
                        disabled={isLoadingAssociations || isSavingAssociations}
                        className="w-full sm:w-auto"
                      >
                        {isSavingAssociations && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save
                      </Button>
                    </div>
                    
                    {selectedLinkedDeviceIds.size > 0 && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {Array.from(selectedLinkedDeviceIds).map(id => {
                          const linkedDevice = availableLinkedDevices.find(d => d.value === id);
                          const deviceDetailsForIcon = fetchedAllDevices.find(d => d.deviceId === id);
                          const DeviceIcon = deviceDetailsForIcon?.deviceTypeInfo?.type ? getDeviceTypeIcon(deviceDetailsForIcon.deviceTypeInfo.type) : HelpCircle;
                          return linkedDevice ? (
                            <Badge key={id} variant="secondary" className="flex items-center gap-1.5 px-2 py-1"> {/* Increased gap slightly */}
                              <DeviceIcon className="h-3.5 w-3.5 text-muted-foreground" /> {/* Icon with text-muted-foreground */}
                              <span>{linkedDevice.label}</span>
                              <Button 
                                type="button" 
                                variant="ghost" 
                                size="icon" 
                                className="h-4 w-4 p-0 ml-1 hover:bg-secondary-foreground/10 rounded-full"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleRemoveAssociation(id, 'pikoCamLinksToDevice');
                                }}
                              >
                                <X className="h-3 w-3" />
                                <span className="sr-only">Remove {linkedDevice.label}</span>
                              </Button>
                            </Badge>
                          ) : null;
                        })}
                      </div>
                    )}
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          )}

          {/* Piko Server Details Section (Conditional) */}
          {device.connectorCategory === 'piko' && device.pikoServerDetails && (
            <AccordionItem value="piko-server">
              <AccordionTrigger className="text-sm font-medium">
                Piko Server Details
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-0.5 rounded-md border">
                  <DetailRow 
                    label="Server Name" 
                    value={device.pikoServerDetails.name || device.serverName || "—"} 
                  />
                  
                  {device.pikoServerDetails.status && (
                    <DetailRow 
                      label="Server Status" 
                      value={<Badge variant={getStatusBadgeStyle(device.pikoServerDetails.status, 'server') as any}>{device.pikoServerDetails.status}</Badge>}
                    />
                  )}
                  
                  {device.pikoServerDetails.version && (
                    <DetailRow 
                      label="Server Version" 
                      value={device.pikoServerDetails.version} 
                    />
                  )}
                  
                  {device.pikoServerDetails.osPlatform && (
                    <DetailRow 
                      label="Server OS" 
                      value={`${device.pikoServerDetails.osPlatform}${device.pikoServerDetails.osVariantVersion ? ` (${device.pikoServerDetails.osVariantVersion})` : ''}`} 
                    />
                  )}
                  
                  {device.pikoServerDetails.url && (
                    <DetailRow 
                      label="Server URL" 
                      value={device.pikoServerDetails.url} 
                      breakAll 
                    />
                  )}
                  
                  {device.serverId && (
                    <DetailRow 
                      label="Server ID" 
                      value={device.serverId} 
                      monospace
                      breakAll 
                    />
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}
        </Accordion>
      </div>
      
      <DialogFooter className="pt-4 border-t">
        <DialogClose asChild>
          <Button type="button" variant="secondary">Close</Button>
        </DialogClose>
      </DialogFooter>
    </TooltipProvider>
  );
}; 