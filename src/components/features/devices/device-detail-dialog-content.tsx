import React, { useState, useEffect, useRef, useCallback, memo, useMemo } from 'react';
// Remove the direct import of DeviceWithConnector if not needed elsewhere
// import { DeviceWithConnector } from '@/types';
import type { DisplayState, TypedDeviceInfo } from '@/lib/mappings/definitions';
import { ActionableState } from '@/lib/mappings/definitions';
import { DeviceType, ON, OFF } from '@/lib/mappings/definitions';
import { getDisplayStateIcon, getBatteryIcon, getBatteryColorClass } from '@/lib/mappings/presentation';
import { getDeviceTypeIcon } from "@/lib/mappings/presentation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, ChevronsUpDown, Loader2, InfoIcon, Copy, HelpCircle, PlayIcon, AlertCircle, Image as ImageIcon, PowerIcon, PowerOffIcon, X, Building, Box, Shield, Pencil } from "lucide-react";
import { isRenameSupported } from "@/lib/device-actions/capabilities";
import { cn } from "@/lib/utils";
import {
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
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
import { useFusionStore } from '@/stores/store'; // Import the store
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'; // Import Tooltip
import type { PikoConfig } from '@/services/drivers/piko'; // Import PikoConfig type
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { CameraMediaSection } from '@/components/features/common/CameraMediaSection';
import { useDeviceCameraConfig } from '@/hooks/use-device-camera-config';


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
  rawDeviceData?: Record<string, unknown> | null;
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
      return 'outline'; 
  }
};

// List of known badge variant names
const knownBadgeVariants = ['default', 'secondary', 'destructive', 'outline'];





export const DeviceDetailDialogContent: React.FC<DeviceDetailDialogContentProps> = ({ device }) => {
  // Get store state and actions
  const connectors = useFusionStore((state) => state.connectors);
  const deviceStates = useFusionStore((state) => state.deviceStates);
  const allDevices = useFusionStore((state) => state.allDevices);
  const executeDeviceAction = useFusionStore(state => state.executeDeviceAction);
  const deviceActionLoading = useFusionStore(state => state.deviceActionLoading);
  const renameDevice = useFusionStore((state) => state.renameDevice);
  const deviceRenameLoading = useFusionStore((state) => state.deviceRenameLoading);

  // Get spaces, alarm zones, and locations for UI display
  const spaces = useFusionStore((state) => state.spaces);
  const alarmZones = useFusionStore((state) => state.alarmZones);
  const locations = useFusionStore((state) => state.locations);

  // Find the actual device object from store
  const actualDevice = allDevices.find(d => d.id === device.internalId);

  // Find which space contains this device
  const deviceSpace = spaces.find(space => space.deviceIds?.includes(device.internalId));
  
  // Find which alarm zone contains this device
  const deviceAlarmZone = alarmZones.find(zone => zone.deviceIds?.includes(device.internalId));
  
  // Get location information from space or alarm zone
  const deviceLocation = deviceSpace 
    ? locations.find(loc => loc.id === deviceSpace.locationId)
    : deviceAlarmZone 
      ? locations.find(loc => loc.id === deviceAlarmZone.locationId)
      : null;

  // Use shared hook for camera configuration
  const { shouldShowMedia, mediaConfig } = useDeviceCameraConfig(actualDevice || null, {
    spaceName: deviceSpace?.name || null
  });

  // Check if this is a local Piko connection (for disabling video play)
  let isPikoLocalConnection = false;
  if (device.connectorCategory === 'piko') {
    const connector = connectors.find(c => c.id === device.connectorId);
    if (connector?.config) {
      try {
        const pikoConfig = connector.config as PikoConfig;
        isPikoLocalConnection = pikoConfig.type === 'local';
      } catch (e) {
        console.error("Error parsing connector config:", e);
      }
    }
  }

  // Subscribe to device state changes from the store
  const deviceStateKey = `${device.connectorId}:${device.deviceId}`;
  const currentDeviceState = deviceStates.get(deviceStateKey);
  
  // Use the latest state from the store, falling back to the prop when not available
  const displayState = currentDeviceState?.displayState || device.displayState;
  const isOn = displayState === ON;
  const isOff = displayState === OFF;
  
  // No need for internal casting anymore
  // const displayDevice = device as ...;


  


  const pikoServerDetails = device.pikoServerDetails;



  // --- Copy State & Handler ---
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = async (text: string, type: 'id' | 'json' = 'id') => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setIsCopied(true);
      const message = type === 'json' ? "Copied JSON to clipboard!" : "Copied ID to clipboard!";
      toast.success(message);
      setTimeout(() => setIsCopied(false), 2000); // Reset icon after 2 seconds
    } catch (err) {
      console.error(`Failed to copy ${type}: `, err);
      const errorMessage = type === 'json' ? "Failed to copy JSON." : "Failed to copy ID.";
      toast.error(errorMessage);
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
  const isRenaming = deviceRenameLoading.get(device.internalId) ?? false;

  // Local state for inline name editing (Piko only)
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(actualDevice?.name ?? device.name);
  // --- END Action Button Logic --- 



  // --- BEGIN Status Badge Component --- //
  const DeviceStatusBadge = () => {
    // Only show simple status badge for non-actionable devices
    if (isActionable) return null;
    
    return displayState ? (
      <Badge variant="outline" className="inline-flex items-center gap-1 px-2 py-0.5 font-normal">
        {React.createElement(getDisplayStateIcon(displayState)!, { className: "h-3 w-3 shrink-0" })}
        <span className="text-xs">{displayState}</span>
      </Badge>
    ) : (
      <Badge variant="outline">Unknown State</Badge>
    );
  };
  // --- END Status Badge Component --- //





  return (
    <TooltipProvider delayDuration={300}> 

      <DialogHeader className="pb-4 border-b">
        {/* First Row: Icon, Title, Status */}
        <div className="flex items-center gap-2">
          <IconComponent className="h-5 w-5 text-muted-foreground" /> 
          <DialogTitle>
            {isRenameSupported(device.connectorCategory) ? (
              <span
                className="group cursor-pointer"
                onClick={() => { setTempName(actualDevice?.name ?? device.name); setIsEditingName(true); }}
              >
                {isEditingName ? (
                  <div className="flex items-center gap-1">
                    <Input
                      className="h-7 w-48"
                      value={tempName}
                      autoFocus
                      onChange={(e) => setTempName(e.target.value)}
                      onKeyDown={async (e) => {
                        const trimmedName = tempName.trim();
                        if (e.key === 'Enter') {
                          const ok = await renameDevice(device.internalId, trimmedName);
                          if (ok) setIsEditingName(false);
                        } else if (e.key === 'Escape') {
                          setIsEditingName(false);
                          setTempName(actualDevice?.name ?? device.name);
                        }
                      }}
                      onBlur={async () => {
                        const trimmedName = tempName.trim();
                        if (trimmedName && trimmedName !== (actualDevice?.name ?? device.name)) {
                          const ok = await renameDevice(device.internalId, trimmedName);
                          if (ok) {
                            setIsEditingName(false);
                          } else {
                            toast.error('Failed to rename device. Please try again.');
                          }
                        } else {
                          setIsEditingName(false);
                        }
                      }}
                      disabled={isRenaming}
                    />
                  </div>
                ) : (
                  <span className="border-b border-transparent group-hover:border-dotted group-hover:border-muted-foreground transition-colors">
                    {actualDevice?.name ?? device.name}
                  </span>
                )}
              </span>
            ) : (
              <>{actualDevice?.name ?? device.name}</>
            )}
          </DialogTitle>
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
              <div className="shrink-0">
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
      
             <Tabs defaultValue="device-details" className="mt-4">
         <TabsList className="grid w-full grid-cols-2">
           <TabsTrigger value="device-details">Device Details</TabsTrigger>
           <TabsTrigger value="raw-json">Raw JSON</TabsTrigger>
         </TabsList>

         <TabsContent value="device-details" className="mt-4">
           <div className="py-4 space-y-4 max-h-[60vh] overflow-y-auto pr-2">
             {/* Power Control Section - REMOVED */}
             
             {/* --- START: Media Section --- */}
             {shouldShowMedia && mediaConfig && (
                <CameraMediaSection
                  thumbnailMode={mediaConfig.thumbnailMode}
                  thumbnailUrl={mediaConfig.thumbnailUrl}
                  connectorId={mediaConfig.connectorId}
                  cameraId={mediaConfig.cameraId}
                  refreshInterval={mediaConfig.refreshInterval}
                  videoConfig={mediaConfig.videoConfig}
                  showManualRefresh={false}
                  showTimeAgo={mediaConfig.thumbnailMode === 'live-auto-refresh'}
                  isPlayDisabled={isPikoLocalConnection}
                  className="mb-4"
                  title={mediaConfig.title}
                  titleElement={mediaConfig.titleElement}
                />
             )}
             {/* --- END: Media Section --- */}

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
                 {/* Location Information - Conditional Rendering */}
                 {deviceLocation && (
                   <DetailRow 
                     label="Location" 
                     value={
                       <Badge variant="outline" className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 font-normal">
                         <Building className="h-3 w-3 text-muted-foreground" />
                         <span className="text-xs">{deviceLocation.name}</span>
                       </Badge>
                     }
                   />
                 )}
                 {/* Space Information - Conditional Rendering */}
                 {deviceSpace && (
                   <DetailRow 
                     label="Space" 
                     value={
                       <Badge variant="outline" className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 font-normal">
                         <Box className="h-3 w-3 text-muted-foreground" />
                         <span className="text-xs">{deviceSpace.name}</span>
                       </Badge>
                     }
                   />
                 )}
                 {/* Alarm Zone Information - Conditional Rendering */}
                 {deviceAlarmZone && (
                   <DetailRow 
                     label="Alarm Zone" 
                     value={
                       <Badge variant="outline" className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 font-normal">
                         <Shield className="h-3 w-3 text-muted-foreground" />
                         <span className="text-xs">{deviceAlarmZone.name}</span>
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
                       <span className="grow break-all">{device.deviceId}</span> 
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
         </TabsContent>

         <TabsContent value="raw-json" className="mt-4">
           <div className="relative">
                           <Button
                size="icon"
                variant="ghost"
                className="absolute top-2 right-2 h-7 w-7 z-50"
                onClick={() => handleCopy(JSON.stringify(device.rawDeviceData || {}, null, 2), 'json')}
                disabled={isCopied}
              >
               {isCopied ?
                 <Check className="h-4 w-4 text-green-500" /> :
                 <Copy className="h-4 w-4 text-neutral-400" />
               }
               <span className="sr-only">{isCopied ? 'Copied' : 'Copy JSON'}</span>
             </Button>
             <SyntaxHighlighter
               language="json"
               style={atomDark}
               wrapLongLines={true}
               codeTagProps={{
                 style: {
                   whiteSpace: 'pre-wrap',
                   wordBreak: 'break-all',
                 }
               }}
               customStyle={{
                 maxHeight: '24rem',
                 overflowY: 'auto',
                 borderRadius: '6px',
                 fontSize: '13px',
               }}
             >
               {JSON.stringify(device.rawDeviceData || {}, null, 2)}
             </SyntaxHighlighter>
           </div>
         </TabsContent>
       </Tabs>

      <DialogFooter className="pt-4 border-t">
        <DialogClose asChild>
          <Button type="button" variant="secondary">Close</Button>
        </DialogClose>
      </DialogFooter>
    </TooltipProvider>
  );
}; 