'use client';

import React from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { getDeviceTypeIcon, getDisplayStateIcon, getDisplayStateColorClass } from '@/lib/mappings/presentation';
import { Cpu, Trash2, FileJson, Copy, Check, Building, Box, Shield } from 'lucide-react';
import type { DeviceOverlayWithDevice } from '@/types/device-overlay';
import { cn } from '@/lib/utils';
import { ConnectorIcon } from '@/components/features/connectors/connector-icon';
import { DeviceType, type DisplayState } from '@/lib/mappings/definitions';
import { useFusionStore } from '@/stores/store';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useDeviceCameraConfig } from '@/hooks/use-device-camera-config';
import { CameraMediaSection } from '@/components/features/common/CameraMediaSection';
import { QuickDeviceActions } from '@/components/features/devices/QuickDeviceActions';
import { FloorPlanOtherSpacesList } from './floor-plan-other-spaces-list';

export interface FloorPlanDeviceDetailSheetProps {
  overlay: DeviceOverlayWithDevice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete?: (overlayId: string) => Promise<void> | void;
  className?: string;
}

export function FloorPlanDeviceDetailSheet({
  overlay,
  open,
  onOpenChange,
  onDelete,
  className,
}: FloorPlanDeviceDetailSheetProps) {
  const device = overlay?.device;
  const resolvedDeviceType: DeviceType = device?.standardizedDeviceType && (Object.values(DeviceType) as string[]).includes(device.standardizedDeviceType)
    ? (device.standardizedDeviceType as unknown as DeviceType)
    : DeviceType.Unmapped;
  const DeviceIcon = getDeviceTypeIcon(resolvedDeviceType) || Cpu;
  const displayState: DisplayState | undefined = device?.status as DisplayState | undefined;
  const StateIcon = getDisplayStateIcon(displayState);
  const stateColorClass = getDisplayStateColorClass(displayState);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [isRawDialogOpen, setIsRawDialogOpen] = React.useState(false);
  const [isRawLoading, setIsRawLoading] = React.useState(false);
  const [rawDeviceData, setRawDeviceData] = React.useState<any | null>(null);
  const [isCopied, setIsCopied] = React.useState(false);

  const openRawDetails = async () => {
    if (!device?.id) return;
    setIsRawDialogOpen(true);
    setIsRawLoading(true);
    setRawDeviceData(null);
    try {
      const res = await fetch(`/api/devices?id=${device.id}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to fetch device');
      }
      const json = await res.json();
      setRawDeviceData(json?.data ?? json);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load raw device details');
    } finally {
      setIsRawLoading(false);
    }
  };

  const handleCopyJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(rawDeviceData || {}, null, 2));
      setIsCopied(true);
      toast.success('Copied JSON to clipboard!');
      setTimeout(() => setIsCopied(false), 1500);
    } catch (e) {
      toast.error('Failed to copy JSON');
    }
  };

  // Derive location, space, and alarm zone from store (mirror devices dialog approach)
  const spaces = useFusionStore((state) => state.spaces);
  const alarmZones = useFusionStore((state) => state.alarmZones);
  const locations = useFusionStore((state) => state.locations);
  const allDevices = useFusionStore((state) => state.allDevices);

  const internalDeviceId = device?.id;
  const deviceSpace = internalDeviceId ? spaces.find(s => s.deviceIds?.includes(internalDeviceId)) : undefined;
  const deviceAlarmZone = internalDeviceId ? alarmZones.find(z => z.deviceIds?.includes(internalDeviceId)) : undefined;
  const deviceLocation = deviceSpace
    ? locations.find(l => l.id === deviceSpace.locationId)
    : deviceAlarmZone
      ? locations.find(l => l.id === deviceAlarmZone.locationId)
      : undefined;

  const actualDevice = React.useMemo(() => {
    if (!internalDeviceId) return null;
    return allDevices.find(d => d.id === internalDeviceId) || null;
  }, [allDevices, internalDeviceId]);

  const { shouldShowMedia, cameras, selectedCameraIndex, mediaConfig, selectCamera } = useDeviceCameraConfig(actualDevice, {
    spaceName: deviceSpace?.name || null,
  });

  const otherDevicesInSpace = React.useMemo(() => {
    if (!deviceSpace?.deviceIds || deviceSpace.deviceIds.length === 0) return [] as typeof allDevices;
    const deviceIdsInSpace = new Set(deviceSpace.deviceIds);
    if (internalDeviceId) {
      deviceIdsInSpace.delete(internalDeviceId);
    }
    const devices = allDevices.filter(d => deviceIdsInSpace.has(d.id));
    devices.sort((a, b) => a.name.localeCompare(b.name));
    return devices;
  }, [deviceSpace?.deviceIds, allDevices, internalDeviceId]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
      <SheetContent
        side="left"
        className={cn(
          // Override default sm:max-w-sm and w-3/4 from the Sheet component
          'sm:max-w-none md:max-w-none !w-[420px] sm:!w-[500px] !shadow-2xl ring-2 ring-border ring-offset-1 ring-offset-background',
          className
        )}
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <DeviceIcon className="h-5 w-5 text-muted-foreground" />
            {device?.name || 'Device'}
          </SheetTitle>
        </SheetHeader>

        {overlay && device && (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-3 gap-x-3 gap-y-2 text-sm">
              {/* Connector first */}
              <div className="col-span-1 text-muted-foreground">Connector</div>
              <div className="col-span-2">
                <Badge variant="secondary" className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 font-normal">
                  <ConnectorIcon connectorCategory={device.connectorCategory} size={12} />
                  <span className="text-xs max-w-[160px] overflow-hidden text-ellipsis whitespace-nowrap">
                    {device.connectorName || 'Unknown'}
                  </span>
                </Badge>
              </div>

              {/* Device Type second */}
              <div className="col-span-1 text-muted-foreground">Type</div>
              <div className="col-span-2">
                <Badge variant="secondary" className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 font-normal">
                  <DeviceIcon className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs max-w-[160px] overflow-hidden text-ellipsis whitespace-nowrap">
                    {device.standardizedDeviceType || device.type}
                    {device.standardizedDeviceSubtype && (
                      <span className="text-muted-foreground ml-1">/ {device.standardizedDeviceSubtype}</span>
                    )}
                  </span>
                </Badge>
              </div>

              <div className="col-span-1 text-muted-foreground">Status</div>
              <div className="col-span-2">
                <Badge variant="outline" className="inline-flex items-center gap-1 px-2 py-0.5 font-normal">
                  <StateIcon className={cn('h-3 w-3', stateColorClass)} />
                  <span className="text-xs">{displayState || 'Unknown'}</span>
                </Badge>
              </div>

              {/* Divider between device info and assignment context */}
              <div className="col-span-3"><Separator className="my-1" /></div>

              {deviceLocation && (
                <>
                  <div className="col-span-1 text-muted-foreground">Location</div>
                  <div className="col-span-2">
                    <Badge variant="outline" className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 font-normal">
                      <Building className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs">{deviceLocation.name}</span>
                    </Badge>
                  </div>
                </>
              )}

              {deviceSpace && (
                <>
                  <div className="col-span-1 text-muted-foreground">Space</div>
                  <div className="col-span-2">
                    <Badge variant="outline" className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 font-normal">
                      <Box className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs">{deviceSpace.name}</span>
                    </Badge>
                  </div>
                </>
              )}

              {deviceAlarmZone && (
                <>
                  <div className="col-span-1 text-muted-foreground">Alarm Zone</div>
                  <div className="col-span-2">
                    <Badge variant="outline" className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 font-normal">
                      <Shield className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs">{deviceAlarmZone.name}</span>
                    </Badge>
                  </div>
                </>
              )}
            </div>

            <Separator className="my-2" />

            {/* Quick actions (explicit actions; not conditional on current status) */}
            {(() => {
              if (!device?.id) return null;
              const isYoLinkSwitchOrOutlet =
                device.connectorCategory === 'yolink' &&
                (resolvedDeviceType === DeviceType.Switch || resolvedDeviceType === DeviceType.Outlet);
              const isGeneaDoor = device.connectorCategory === 'genea' && resolvedDeviceType === DeviceType.Door;
              const hasQuickActions = isYoLinkSwitchOrOutlet || isGeneaDoor;
              if (!hasQuickActions) return null;
              return (
                <div className="mt-2">
                  <div className="text-xs font-medium text-muted-foreground mb-2">Quick actions</div>
                  <QuickDeviceActions
                    internalDeviceId={device.id}
                    connectorCategory={device.connectorCategory}
                    deviceType={resolvedDeviceType}
                  />
                </div>
              );
            })()}

            <Separator className="my-2" />

            {/* Space Cameras section (auto-refresh thumbnails with inline live playback) */}
            {shouldShowMedia && mediaConfig && (
              <div className="mt-2">
                <div className="text-xs font-medium text-muted-foreground mb-2">Space Cameras</div>
                <CameraMediaSection
                  thumbnailMode={mediaConfig.thumbnailMode}
                  thumbnailUrl={mediaConfig.thumbnailUrl}
                  connectorId={mediaConfig.connectorId}
                  cameraId={mediaConfig.cameraId}
                  videoConfig={mediaConfig.videoConfig}
                  refreshInterval={mediaConfig.refreshInterval}
                  showManualRefresh={false}
                  showTimeAgo={mediaConfig.thumbnailMode === 'live-auto-refresh'}
                  className="mb-2"
                  titleElement={(() => {
                    const CameraIcon = getDeviceTypeIcon(DeviceType.Camera);
                    return (
                      <span className="flex items-center gap-1.5">
                        {CameraIcon && <CameraIcon className="h-3 w-3" />}
                        {cameras.length > 0 ? cameras[selectedCameraIndex]?.name : 'Camera'}
                      </span>
                    );
                  })()}
                  cameras={cameras}
                  selectedCameraIndex={selectedCameraIndex}
                  onCameraChange={selectCamera}
                  showCameraCarousel
                  carouselLayout="dots"
                />
              </div>
            )}

            {/* Other devices in the same space */}
            {deviceSpace && otherDevicesInSpace.length > 0 && (
              <FloorPlanOtherSpacesList devices={otherDevicesInSpace} />
            )}

            <Separator />

            <div className="flex justify-end gap-2">
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label="View raw device details"
                      onClick={openRawDetails}
                      disabled={!device?.id}
                    >
                      <FileJson className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">View raw device details</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="destructive"
                      size="icon"
                      className="h-8 w-8"
                      aria-label="Remove from floor plan"
                      onClick={() => setConfirmOpen(true)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Remove from floor plan</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        )}
      </SheetContent>
      {/* Confirm removal dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove device from floor plan?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the position for
              <span className="inline-flex items-center gap-1 mx-1 align-middle">
                <DeviceIcon className="h-4 w-4 text-muted-foreground" />
                <span className="font-semibold">{device?.name || 'this device'}</span>
              </span>
              from this floor plan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (overlay && onDelete) {
                  await onDelete(overlay.id);
                }
                setConfirmOpen(false);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Raw details dialog */}
      <Dialog open={isRawDialogOpen} onOpenChange={setIsRawDialogOpen}>
        <DialogContent className="sm:max-w-[720px] sm:max-h-[90vh]" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Raw Device Details</DialogTitle>
            <DialogDescription asChild>
              <div className="flex items-center gap-2 pt-1">
                <DeviceIcon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{device?.name || 'Device'}</span>
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="relative mt-2">
            {!isRawLoading && rawDeviceData && (
              <Button
                size="icon"
                variant="ghost"
                className="absolute top-2 right-2 h-7 w-7 z-10"
                onClick={handleCopyJson}
                disabled={isCopied}
              >
                {isCopied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                <span className="sr-only">{isCopied ? 'Copied' : 'Copy JSON'}</span>
              </Button>
            )}
            {isRawLoading ? (
              <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">Loading…</div>
            ) : rawDeviceData ? (
              <SyntaxHighlighter
                language="json"
                style={atomDark}
                wrapLongLines
                codeTagProps={{
                  style: { whiteSpace: 'pre-wrap', wordBreak: 'break-all' }
                }}
                customStyle={{
                  maxHeight: '80vh',
                  overflowY: 'auto',
                  borderRadius: '6px',
                  fontSize: '13px',
                }}
              >
                {JSON.stringify(rawDeviceData || {}, null, 2)}
              </SyntaxHighlighter>
            ) : (
              <div className="text-sm text-muted-foreground">No data available.</div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}

export default FloorPlanDeviceDetailSheet;