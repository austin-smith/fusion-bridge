import React, { useState, useEffect } from 'react';
import { DeviceWithConnector, PikoServer } from '@/types'; 
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Check, ChevronsUpDown, Loader2, InfoIcon, Copy } from "lucide-react";
import {
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
  DialogDescription,
} from "@/components/ui/dialog";
import { formatConnectorCategory, cn } from "@/lib/utils";
import { getDeviceTypeIcon } from "@/lib/device-mapping";
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

interface DeviceDetailDialogContentProps {
  device: DeviceWithConnector;
}

// List of known badge variant names
const knownBadgeVariants = ['default', 'secondary', 'destructive', 'outline'];

// Interface for device selection
interface DeviceOption {
  value: string; // deviceId
  label: string; // name
}

interface AssociationResponse {
  success: boolean;
  error?: string;
  data?: string[];
}

export const DeviceDetailDialogContent: React.FC<DeviceDetailDialogContentProps> = ({ device }) => {

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
    // Run for YoLink devices or ANY Piko device
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
            .filter((d: DeviceWithConnector) => d.connectorCategory === 'piko' && d.deviceTypeInfo.type === 'Camera') // Use mapped type for check
            .map((d: DeviceWithConnector): DeviceOption => ({ value: d.deviceId, label: d.name }))
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
            .filter((d: DeviceWithConnector) => d.connectorCategory === 'yolink')
            .map((d: DeviceWithConnector): DeviceOption => ({ value: d.deviceId, label: d.name }))
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

      } catch (err: any) {
        console.error("Error fetching association data:", err);
        setAssociationError(err.message || 'Failed to load association data.');
        toast.error(err.message || 'Failed to load association data.');
      } finally {
        setIsLoadingAssociations(false);
      }
    };

    fetchData();

  }, [device.deviceId, device.connectorCategory, device.type, device.deviceTypeInfo.type]); // Added deviceTypeInfo.type dependency

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
    } catch (err: any) {
      console.error("Error saving associations:", err);
      setAssociationError(err.message || 'Failed to save associations.');
      toast.error(err.message || 'Failed to save associations.');
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

  // Function to render a status badge conditionally
  const renderStatusBadge = (status: string | null | undefined, entityType: 'device' | 'server') => {
    if (!status) return 'N/A';
    const styleValue = getStatusBadgeStyle(status, entityType);
    const isKnownVariant = knownBadgeVariants.includes(styleValue as string);
    return (
      <Badge 
        variant={isKnownVariant ? styleValue as VariantProps<typeof badgeVariants>["variant"] : 'outline'} 
        className={cn(!isKnownVariant ? styleValue : undefined)}
      >
        {status}
      </Badge>
    );
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

  // Get the icon component for the current device type
  const DeviceIcon = getDeviceTypeIcon(device.deviceTypeInfo.type);

  return (
    <>
      <DialogHeader className="pb-4 border-b">
        <div className="flex items-center gap-2">
          <DeviceIcon className="h-5 w-5 text-muted-foreground" /> 
          <DialogTitle>{device.name}</DialogTitle>
          {device.status && (
            <div>{renderStatusBadge(device.status, 'device')}</div>
          )}
        </div>
        <DialogDescription className="pt-1">
          {device.deviceTypeInfo.type}{device.deviceTypeInfo.subtype ? ` (${device.deviceTypeInfo.subtype})` : ''} · {formatConnectorCategory(device.connectorCategory)}
        </DialogDescription>
      </DialogHeader>
      
      <div className="py-6 space-y-6 max-h-[70vh] overflow-y-auto">
        <Accordion type="single" collapsible defaultValue="device-info" className="w-full">
          {/* Device Information Section */}
          <AccordionItem value="device-info">
            <AccordionTrigger className="text-sm font-medium">
              Device Information
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-0.5 rounded-md border">
                <DetailRow label="Name" value={device.name} />
                {/* Combined Type / Subtype with Icon */}
                <DetailRow 
                    label="Type" 
                    value={( 
                      <div className="flex items-center gap-2"> 
                        <DeviceIcon className="h-4 w-4 text-muted-foreground" /> 
                        <span>
                          {device.deviceTypeInfo.type}
                          {device.deviceTypeInfo.subtype && (
                            <span className="text-muted-foreground"> / {device.deviceTypeInfo.subtype}</span>
                          )}
                        </span>
                      </div> 
                    )} 
                />
                <DetailRow label="Model" value={device.model || "—"} />
                {device.connectorCategory === 'piko' && device.vendor && (
                  <DetailRow label="Vendor" value={device.vendor} />
                )}
                {/* Raw Identifier */}
                <DetailRow label="Identifier" value={device.type} monospace />
                {/* External ID with Copy Button */}
                <DetailRow 
                  label="External ID" 
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
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Connector Information Section */}
          <AccordionItem value="connector-info">
            <AccordionTrigger className="text-sm font-medium">
              Connector Information
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-0.5 rounded-md border">
                <DetailRow label="Type" value={formatConnectorCategory(device.connectorCategory)} />
                <DetailRow label="Name" value={device.connectorName} />
                <DetailRow label="Connector ID" value={device.connectorId} monospace breakAll />
              </div>
            </AccordionContent>
          </AccordionItem>

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
          {device.connectorCategory === 'piko' && (device.pikoServerDetails) && (
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
                      value={renderStatusBadge(device.pikoServerDetails.status, 'server')} 
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