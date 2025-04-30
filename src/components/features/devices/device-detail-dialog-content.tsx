import React, { useState, useEffect } from 'react';
// Remove the direct import of DeviceWithConnector if not needed elsewhere
// import { DeviceWithConnector } from '@/types'; 
import type { DisplayState, TypedDeviceInfo } from '@/lib/mappings/definitions';
import { getDisplayStateIcon } from '@/lib/mappings/presentation';
import { getDeviceTypeIcon } from "@/lib/mappings/presentation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, ChevronsUpDown, Loader2, InfoIcon, Copy, HelpCircle, PlayIcon, AlertCircle, Image as ImageIcon } from "lucide-react";
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
import { PikoVideoPlayer } from '@/components/features/piko/piko-video-player';
import { useFusionStore } from '@/stores/store'; // Import the store
import type { PikoConfig } from '@/services/drivers/piko'; // Import PikoConfig type

// Define the shape of the expected prop, compatible with DisplayedDevice from page.tsx
// It needs all fields used internally, *excluding* the original 'status' field.
export interface DeviceDetailProps {
  id: string; // Internal ID used for keys?
  deviceId: string;
  connectorId: string;
  name: string;
  connectorName: string;
  connectorCategory: string;
  deviceTypeInfo?: TypedDeviceInfo;
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

export const DeviceDetailDialogContent: React.FC<DeviceDetailDialogContentProps> = ({ device }) => {
  // Get connectors from the store
  const connectors = useFusionStore((state) => state.connectors);

  // No need for internal casting anymore
  // const displayDevice = device as ...;

  // --- State for Associations ---
  // For YoLink -> Piko associations
  const [availablePikoCameras, setAvailablePikoCameras] = useState<DeviceOption[]>([]);
  const [selectedPikoCameraIds, setSelectedPikoCameraIds] = useState<Set<string>>(new Set());
  // For Piko -> YoLink associations
  const [availableYoLinkDevices, setAvailableYoLinkDevices] = useState<DeviceOption[]>([]);
  const [selectedYoLinkDeviceIds, setSelectedYoLinkDeviceIds] = useState<Set<string>>(new Set());
  
  const [isLoadingAssociations, setIsLoadingAssociations] = useState(false);
  const [isSavingAssociations, setIsSavingAssociations] = useState(false);
  const [associationError, setAssociationError] = useState<string | null>(null);
  
  // Separate popover states for each type
  const [pikoCameraPopoverOpen, setPikoCameraPopoverOpen] = useState(false);
  const [yolinkDevicePopoverOpen, setYolinkDevicePopoverOpen] = useState(false);

  // --- State for Thumbnail & Live Video --- 
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [isThumbnailLoading, setIsThumbnailLoading] = useState(false);
  const [thumbnailError, setThumbnailError] = useState<string | null>(null);
  const [showLiveVideo, setShowLiveVideo] = useState(false);

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

  // Debug logging for state changes
  useEffect(() => {
    console.log('Available Piko Cameras:', availablePikoCameras);
    console.log('Selected Piko Camera IDs:', Array.from(selectedPikoCameraIds));
    console.log('Available YoLink Devices:', availableYoLinkDevices);
    console.log('Selected YoLink Device IDs:', Array.from(selectedYoLinkDeviceIds));
    console.log('Loading State:', isLoadingAssociations);
  }, [availablePikoCameras, selectedPikoCameraIds, availableYoLinkDevices, selectedYoLinkDeviceIds, isLoadingAssociations]);

  // Fetch available devices and current associations
  useEffect(() => {
    // Use device directly
    if (device.connectorCategory !== 'yolink' && device.connectorCategory !== 'piko') return;

    const fetchData = async () => {
      setIsLoadingAssociations(true);
      setAssociationError(null);
      
      // Reset selections
      setSelectedPikoCameraIds(new Set());
      setAvailablePikoCameras([]);
      setSelectedYoLinkDeviceIds(new Set());
      setAvailableYoLinkDevices([]);

      try {
        // 1. Fetch all devices
        const allDevicesResponse = await fetch('/api/devices');
        if (!allDevicesResponse.ok) throw new Error('Failed to fetch device list');
        const allDevicesData = await allDevicesResponse.json();
        if (!allDevicesData.success) throw new Error(allDevicesData.error || 'Failed to fetch device list data');
        
        const allDevices = allDevicesData.data || [];
        
        // Filter for either Piko cameras or YoLink devices based on the current device type
        if (device.connectorCategory === 'yolink') {
          // Get Piko cameras when viewing a YoLink device
          const pikoCameras = allDevices
            .filter((d: DeviceDetailProps) => d.connectorCategory === 'piko' && d.deviceTypeInfo?.type === 'Camera') 
            .map((d: DeviceDetailProps): DeviceOption => ({ value: d.deviceId, label: d.name }))
            .sort((a: DeviceOption, b: DeviceOption) => a.label.localeCompare(b.label));
          setAvailablePikoCameras(pikoCameras);
          
          // 2. Fetch current associations for this device
          const associationsResponse = await fetch(`/api/device-associations?deviceId=${device.deviceId}`);
          if (!associationsResponse.ok) throw new Error('Failed to fetch current associations');
          const associationsData = await associationsResponse.json();
          if (!associationsData.success) throw new Error(associationsData.error || 'Failed to fetch current associations data');
          
          // The API returns an array of Piko Camera IDs for a specific YoLink device
          setSelectedPikoCameraIds(new Set(associationsData.data || []));
        } 
        else if (device.connectorCategory === 'piko') {
          // Get YoLink devices when viewing any Piko device
          const yolinkDevices = allDevices
            .filter((d: DeviceDetailProps) => d.connectorCategory === 'yolink')
            .map((d: DeviceDetailProps): DeviceOption => ({ value: d.deviceId, label: d.name }))
            .sort((a: DeviceOption, b: DeviceOption) => a.label.localeCompare(b.label));
          setAvailableYoLinkDevices(yolinkDevices);
          
          // 2. Fetch associated YoLink device IDs using the pikoCameraId
          console.log(`UI: Fetching YoLink associations for Piko device ${device.deviceId}`);
          const associationsResponse = await fetch(`/api/device-associations?pikoCameraId=${device.deviceId}`);
          if (!associationsResponse.ok) throw new Error('Failed to fetch associations');
          const associationsData = await associationsResponse.json();
          if (!associationsData.success) throw new Error(associationsData.error || 'Failed to fetch associations data');
          
          // The API now directly returns an array of YoLink device IDs
          const yolinkDeviceIds = associationsData.data || [];
          console.log(`UI: Received ${yolinkDeviceIds.length} associated YoLink device IDs.`);
          setSelectedYoLinkDeviceIds(new Set(yolinkDeviceIds));
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

  // Fetch Thumbnail when dialog opens for Piko cameras
  useEffect(() => {
    if (device.connectorCategory === 'piko' && device.deviceTypeInfo?.type === 'Camera') {
      setIsThumbnailLoading(true);
      setThumbnailError(null);
      setThumbnailUrl(null);
      setShowLiveVideo(false); // Reset video player view on device change

      const fetchThumbnail = async () => {
        try {
          // Construct URL for thumbnail API
          const apiUrl = new URL('/api/piko/device-thumbnail', window.location.origin);
          apiUrl.searchParams.append('connectorId', device.connectorId);
          apiUrl.searchParams.append('deviceId', device.deviceId);
          // ADDED: Request a smaller size
          apiUrl.searchParams.append('size', '640x480'); 

          console.log(`[DeviceDetail] Fetching thumbnail: ${apiUrl.toString()}`); // Log the URL

          const response = await fetch(apiUrl.toString());
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({})); // Try to parse error
            throw new Error(errorData.error || `Failed to fetch thumbnail (${response.status})`);
          }
          const blob = await response.blob();
          const objectUrl = URL.createObjectURL(blob);
          setThumbnailUrl(objectUrl);
        } catch (err: unknown) {
          console.error("Error fetching device thumbnail:", err);
          const message = err instanceof Error ? err.message : 'Failed to load thumbnail';
          setThumbnailError(message);
          toast.error(message);
        } finally {
          setIsThumbnailLoading(false);
        }
      };

      fetchThumbnail();

      // Cleanup object URL on component unmount or device change
      return () => {
        if (thumbnailUrl) {
          URL.revokeObjectURL(thumbnailUrl);
        }
      };
    }
  }, [device.connectorId, device.deviceId, device.connectorCategory, device.deviceTypeInfo?.type, thumbnailUrl]); // Rerun if device changes or thumbnailUrl changes

  // --- Handle Saving Associations ---
  const handleSaveAssociations = async () => {
    setIsSavingAssociations(true);
    setAssociationError(null);
    try {
      let response;
      
      if (device.connectorCategory === 'yolink') {
        // Save YoLink -> Piko associations
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
        const currentlySelectedYoLinkIds = Array.from(selectedYoLinkDeviceIds);
        console.log(`UI: Currently selected YoLink devices: [${currentlySelectedYoLinkIds.join(', ')}]`);
        
        // Fetch initial state to determine diffs
        const initialAssocResponse = await fetch(`/api/device-associations?pikoCameraId=${pikoDeviceId}`);
        if (!initialAssocResponse.ok) throw new Error('Failed to fetch initial associations for Piko camera');
        const initialAssocData = await initialAssocResponse.json();
        const initialYoLinkDeviceIds = new Set<string>(initialAssocData.data || []);
        
        const updates: { deviceId: string, pikoCameraIds: string[] }[] = [];

        // Devices to ADD this Piko camera association to:
        for (const yolinkId of currentlySelectedYoLinkIds) {
          if (!initialYoLinkDeviceIds.has(yolinkId)) {
            const currentPikoAssocRes = await fetch(`/api/device-associations?deviceId=${yolinkId}`);
            const currentPikoAssocData = currentPikoAssocRes.ok ? await currentPikoAssocRes.json() : { data: [] };
            const currentPikoIds = new Set<string>(currentPikoAssocData.data || []);
            currentPikoIds.add(pikoDeviceId);
            updates.push({ deviceId: yolinkId, pikoCameraIds: Array.from(currentPikoIds).sort() });
          }
        }

        // Devices to REMOVE this Piko camera association from:
        for (const yolinkId of initialYoLinkDeviceIds) {
          if (!selectedYoLinkDeviceIds.has(yolinkId)) {
            const currentPikoAssocRes = await fetch(`/api/device-associations?deviceId=${yolinkId}`);
            const currentPikoAssocData = currentPikoAssocRes.ok ? await currentPikoAssocRes.json() : { data: [] };
            const currentPikoIds = new Set<string>(currentPikoAssocData.data || []);
            currentPikoIds.delete(pikoDeviceId);
            updates.push({ deviceId: yolinkId, pikoCameraIds: Array.from(currentPikoIds).sort() });
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
      setPikoCameraPopoverOpen(false);
      setYolinkDevicePopoverOpen(false);
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
  const DeviceIcon = device.deviceTypeInfo?.type 
    ? getDeviceTypeIcon(device.deviceTypeInfo.type) 
    : HelpCircle; // Use HelpCircle if type is missing

  // --- Handle clicking the thumbnail to show video --- 
  const handleThumbnailClick = () => {
    if (thumbnailUrl && !thumbnailError) {
        setShowLiveVideo(true);
    }
  };

  // --- Simple Media Thumbnail Component --- 
  const MediaThumbnail: React.FC<{ 
      src: string; 
      isLoading: boolean; 
      error: string | null; 
      onPlayClick: () => void; 
      isPlayDisabled?: boolean; // Added optional prop
  }> = 
    ({ src, isLoading, error, onPlayClick, isPlayDisabled = false }) => {
    const [imageLoadError, setImageLoadError] = useState(false);

    const handleImageError = () => setImageLoadError(true);
    const handleImageLoad = () => setImageLoadError(false); // Reset error on successful load

    useEffect(() => {
      // Reset image error state when src changes
      setImageLoadError(false);
    }, [src]);

    return (
      <div className="relative w-full aspect-video bg-muted rounded-md overflow-hidden flex items-center justify-center group">
        {/* Loading Skeleton */}
        {isLoading && (
          <Skeleton className="absolute inset-0 animate-pulse" />
        )}
        {/* Error Message (API error or Image load error) */}
        {!isLoading && (error || imageLoadError) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-destructive text-xs p-2 text-center">
            <AlertCircle className="h-6 w-6 mb-1" />
            <span>{error || "Could not load image"}</span>
          </div>
        )}
        {/* Image (only render if not loading and no API error) */}
        {!isLoading && !error && src && (
          <Image
            src={src}
            alt="Device Thumbnail"
            fill // Use fill layout
            className={cn(
              "absolute inset-0 w-full h-full object-contain transition-opacity duration-300",
              imageLoadError ? 'opacity-0' : 'opacity-100'
            )}
            onError={handleImageError}
            onLoad={handleImageLoad} // Reset error on successful load
            unoptimized // Assuming thumbnails might not be static build images
          />
        )}
        {/* Play Button Overlay (Show only when image is loaded successfully AND not disabled) */}
        {!isLoading && !error && !imageLoadError && src && (
          <button
            onClick={!isPlayDisabled ? onPlayClick : undefined} // Conditionally attach handler
            disabled={isPlayDisabled} // Disable the button
            className={cn(
              "absolute inset-0 flex items-center justify-center bg-black/30 transition-opacity duration-200 z-10",
              isPlayDisabled 
                ? "opacity-50 cursor-not-allowed" // Style for disabled
                : "opacity-0 group-hover:opacity-100 cursor-pointer" // Normal hover effect
            )}
            aria-label={isPlayDisabled ? "Live view unavailable for local connections" : "Play live video"}
          >
            <PlayIcon 
              className={cn(
                "h-12 w-12 text-white/80",
                isPlayDisabled ? "fill-white/30" : "fill-white/60" // Dim icon when disabled
              )} 
            />
          </button>
        )}
      </div>
    );
  };

  return (
    <>
      <DialogHeader className="pb-4 border-b">
        <div className="flex items-center gap-2">
          <DeviceIcon className="h-5 w-5 text-muted-foreground" /> 
          <DialogTitle>{device.name}</DialogTitle>
          {device.displayState ? (
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className="px-1.5 py-0.5">
                 {getDisplayStateIcon(device.displayState) && (
                     React.createElement(getDisplayStateIcon(device.displayState)!, { className: "h-3 w-3" })
                 )}
              </Badge>
              <span className="text-sm text-muted-foreground">{device.displayState}</span>
            </div>
          ) : (
            <Badge variant="outline">Unknown State</Badge>
          )}
        </div>
        <DialogDescription className="pt-1" asChild>
          <div>
            <div className="flex items-center gap-2">
              {/* 1. Connector Badge */}
              <Badge variant="outline" className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 font-normal">
                <ConnectorIcon connectorCategory={device.connectorCategory} size={12} />
                <span className="text-xs">{device.connectorName}</span>
              </Badge>
              {/* 2. Device Type/Subtype Badge - Conditional rendering */}
              {device.deviceTypeInfo?.type && (
                <Badge variant="secondary" className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 font-normal">
                  <DeviceIcon className="h-3 w-3 text-muted-foreground" /> 
                  <span className="text-xs">
                    {device.deviceTypeInfo.type}
                    {device.deviceTypeInfo.subtype && (
                      <span className="text-muted-foreground ml-1">/ {device.deviceTypeInfo.subtype}</span>
                    )}
                  </span>
                </Badge>
              )}
            </div>
          </div>
        </DialogDescription>
      </DialogHeader>
      
      <div className="py-4 space-y-4 max-h-[70vh] overflow-y-auto pr-2">
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
                <PikoVideoPlayer
                  connectorId={device.connectorId}
                  cameraId={device.deviceId}
                  pikoSystemId={pikoSystemIdForVideo}
                  className="w-full"
                />
             ) : (
                <MediaThumbnail 
                  src={thumbnailUrl || ''} 
                  isLoading={isThumbnailLoading} 
                  error={thumbnailError}
                  onPlayClick={handleThumbnailClick}
                  isPlayDisabled={isPikoLocalConnection} // Pass the flag
                />
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
                    <DeviceIcon className="h-3 w-3 text-muted-foreground" /> 
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
            <DetailRow label="Model" value={device.model || "—"} />
            {device.connectorCategory === 'piko' && device.vendor && (
              <DetailRow label="Vendor" value={device.vendor} />
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
          {/* YoLink Device Association Section (Conditional) */}
          {device.connectorCategory === 'yolink' && (
            <AccordionItem value="yolink-associations">
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
                      Select Piko cameras related to this YoLink device.
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <Popover open={pikoCameraPopoverOpen} onOpenChange={setPikoCameraPopoverOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={pikoCameraPopoverOpen}
                            className="w-full sm:w-[300px] justify-between"
                            disabled={availablePikoCameras.length === 0}
                          >
                            {selectedPikoCameraIds.size > 0
                              ? `${selectedPikoCameraIds.size} camera${selectedPikoCameraIds.size > 1 ? 's' : ''} selected`
                              : (availablePikoCameras.length === 0 ? "No Piko cameras found" : "Select Piko cameras...")}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[300px] p-0">
                          <Command>
                            <CommandInput placeholder="Search Piko cameras..." />
                            <CommandList>
                              <CommandEmpty>No cameras found.</CommandEmpty>
                              <CommandGroup>
                                {availablePikoCameras.map((camera) => (
                                  <CommandItem
                                    key={camera.value}
                                    value={camera.value}
                                    onSelect={(currentValue: string) => {
                                      setSelectedPikoCameraIds(prev => {
                                        const next = new Set(prev);
                                        if (next.has(currentValue)) {
                                          next.delete(currentValue);
                                        } else {
                                          next.add(currentValue);
                                        }
                                        return next;
                                      });
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        selectedPikoCameraIds.has(camera.value) ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    {camera.label}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
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
                          return camera ? (
                            <Badge key={id} variant="secondary" className="px-2 py-1">
                              {camera.label}
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
            <AccordionItem value="piko-associations">
              <AccordionTrigger className="text-sm font-medium">
                <div className="flex items-center">
                  Associated YoLink Devices
                  {!isLoadingAssociations && (
                    <Badge 
                      variant={selectedYoLinkDeviceIds.size > 0 ? "secondary" : "outline"} 
                      className="ml-2 text-xs font-normal px-2 py-0.5"
                    >
                      {selectedYoLinkDeviceIds.size}
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
                      Select YoLink devices related to this device.
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <Popover open={yolinkDevicePopoverOpen} onOpenChange={setYolinkDevicePopoverOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={yolinkDevicePopoverOpen}
                            className="w-full sm:w-[300px] justify-between"
                            disabled={availableYoLinkDevices.length === 0}
                          >
                            {selectedYoLinkDeviceIds.size > 0
                              ? `${selectedYoLinkDeviceIds.size} device${selectedYoLinkDeviceIds.size > 1 ? 's' : ''} selected`
                              : (availableYoLinkDevices.length === 0 ? "No YoLink devices found" : "Select YoLink devices...")}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[300px] p-0">
                          <Command>
                            <CommandInput placeholder="Search YoLink devices..." />
                            <CommandList>
                              <CommandEmpty>No devices found.</CommandEmpty>
                              <CommandGroup>
                                {availableYoLinkDevices.map((yolink) => (
                                  <CommandItem
                                    key={yolink.value}
                                    value={yolink.value}
                                    onSelect={(currentValue: string) => {
                                      setSelectedYoLinkDeviceIds(prev => {
                                        const next = new Set(prev);
                                        if (next.has(currentValue)) {
                                          next.delete(currentValue);
                                        } else {
                                          next.add(currentValue);
                                        }
                                        return next;
                                      });
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        selectedYoLinkDeviceIds.has(yolink.value) ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    {yolink.label}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      <Button 
                        onClick={handleSaveAssociations} 
                        disabled={isLoadingAssociations || isSavingAssociations}
                        className="w-full sm:w-auto"
                      >
                        {isSavingAssociations && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save
                      </Button>
                    </div>
                    
                    {selectedYoLinkDeviceIds.size > 0 && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {Array.from(selectedYoLinkDeviceIds).map(id => {
                          const yolink = availableYoLinkDevices.find(d => d.value === id);
                          return yolink ? (
                            <Badge key={id} variant="secondary" className="px-2 py-1">
                              {yolink.label}
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
    </>
  );
}; 