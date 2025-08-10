'use client';

import React from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { getDeviceTypeIcon, getDisplayStateIcon, getDisplayStateColorClass } from '@/lib/mappings/presentation';
import { Cpu, Trash2, FileJson, Copy, Check, Building, Box, Shield, Cog, Zap } from 'lucide-react';
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
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
// no debounce needed; we commit on pointer-up
import type { UpdateDeviceOverlayPayload } from '@/types/device-overlay';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { findSpaceCameras } from '@/services/event-thumbnail-resolver';
import { FloorPlanDeviceEventsTab } from '@/components/features/locations/floor-plan/floor-plan-device-events-tab';

function Section({
  title,
  icon: Icon,
  className,
  headerRight,
  children,
}: {
  title: string;
  icon?: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  className?: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className={cn('rounded-md border bg-card/50 shadow-sm', className)}>
      <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2">
        <div className="flex items-center gap-2">
          {Icon ? <Icon className="h-3.5 w-3.5 text-muted-foreground" /> : null}
          <h3 className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{title}</h3>
        </div>
        {headerRight}
      </div>
      <div className="p-3">{children}</div>
    </section>
  );
}

function InfoGrid({ children, className }: React.PropsWithChildren<{ className?: string }>) {
  return (
    <dl className={cn('grid grid-cols-3 text-sm', className)}>
      {children}
    </dl>
  );
}

function InfoRow({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="contents">
      <dt className="col-span-1 py-2 text-muted-foreground">{label}</dt>
      <dd className="col-span-2 py-2">{children}</dd>
    </div>
  );
}

export interface FloorPlanDeviceDetailSheetProps {
  overlay: DeviceOverlayWithDevice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete?: (overlayId: string) => Promise<void> | void;
  className?: string;
  // Allow parent to pass updater to persist overlay changes
  onUpdateOverlay?: (overlayId: string, updates: UpdateDeviceOverlayPayload) => Promise<void> | void;
  // Expose the rendered SheetContent element to parent for layout measurements
  onSheetElementRef?: (el: HTMLDivElement | null) => void;
}

export function FloorPlanDeviceDetailSheet({
  overlay,
  open,
  onOpenChange,
  onDelete,
  className,
  onUpdateOverlay,
  onSheetElementRef,
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

  // Tabs state
  const [activeTab, setActiveTab] = React.useState<'details' | 'events'>('details');

  // Events fetching is encapsulated in FloorPlanDeviceEventsTab

  // Guarded auto-refresh when switching devices while Events tab is active
  // Intentionally no effects for fetching; fetch is driven by user actions (tab select, manual refresh)

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

  // Resolve space cameras once for thumbnail resolver (delegates best-shot/fallback selection)
  const spaceCameras = React.useMemo(() => {
    return findSpaceCameras(deviceSpace?.id, allDevices as any, spaces);
  }, [deviceSpace?.id, allDevices, spaces]);

  // No client-side filtering in parent

  // Camera configuration (FOV & rotation) controls when device is a camera
  const isCamera = resolvedDeviceType === DeviceType.Camera;
  const initialFov = (overlay as any)?.props?.camera?.fovDeg ?? 90;
  const initialRotation = (overlay as any)?.props?.camera?.rotationDeg ?? 0;
  const [fov, setFov] = React.useState<number>(initialFov);
  const [rotation, setRotation] = React.useState<number>(initialRotation);

  // Keep local state in sync when selection changes
  React.useEffect(() => {
    setFov((overlay as any)?.props?.camera?.fovDeg ?? 90);
    setRotation((overlay as any)?.props?.camera?.rotationDeg ?? 0);
  }, [overlay]);

  const commitUpdate = React.useCallback((next: { fov?: number; rotation?: number }) => {
    if (!overlay?.id || !onUpdateOverlay) return;
    const nextFov = typeof next.fov === 'number' ? next.fov : fov;
    const nextRotation = typeof next.rotation === 'number' ? next.rotation : rotation;
    const mergedProps = {
      ...(overlay as any).props,
      camera: {
        ...((overlay as any).props?.camera || {}),
        fovDeg: nextFov,
        rotationDeg: ((nextRotation % 360) + 360) % 360,
      },
    };
    onUpdateOverlay(overlay.id, { props: mergedProps });
  }, [overlay, onUpdateOverlay, fov, rotation]);

  // no debounce

  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
      <SheetContent
        side="left"
        ref={React.useCallback((el: HTMLDivElement | null) => {
          // Provide the element to the parent for occlusion/safe-area computations
          onSheetElementRef?.(el);
        }, [onSheetElementRef])}
        data-floorplan-detail-sheet="true"
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onKeyDownCapture={(e) => {
          if (e.key === 'Delete' || e.key === 'Backspace') {
            // Allow text editing in inputs/textareas, but prevent bubbling to window
            const target = e.target as HTMLElement | null;
            const tag = target?.tagName?.toLowerCase();
            const isEditable = tag === 'input' || tag === 'textarea' || (target as HTMLElement)?.isContentEditable;
            if (!isEditable) {
              e.stopPropagation();
              // Also stop native propagation so window listeners don't fire
              const nativeEvt = e.nativeEvent as KeyboardEvent;
              if (nativeEvt.stopImmediatePropagation) nativeEvt.stopImmediatePropagation();
              else nativeEvt.stopPropagation();
            }
          }
        }}
        className={cn(
          // Override default sm:max-w-sm and w-3/4 from the Sheet component
          'sm:max-w-none md:max-w-none !w-[420px] sm:!w-[500px] !shadow-2xl p-0 grid grid-rows-[auto,1fr] overflow-hidden',
          className
        )}
      >
        <SheetHeader className="p-3 pb-2">
          <SheetTitle className="flex items-center gap-2">
            <DeviceIcon className="h-5 w-5 text-muted-foreground" />
            {device?.name || 'Device'}
          </SheetTitle>
        </SheetHeader>

        <div className="overflow-y-auto overscroll-contain p-3 pt-0" onKeyDownCapture={(e) => {
          if (e.key === 'Delete' || e.key === 'Backspace') {
            const target = e.target as HTMLElement | null;
            const tag = target?.tagName?.toLowerCase();
            const isEditable = tag === 'input' || tag === 'textarea' || target?.isContentEditable;
            if (!isEditable) {
              e.stopPropagation();
              const nativeEvt = (e as any)?.nativeEvent;
              nativeEvt?.stopImmediatePropagation?.();
            }
          }
        }}>
        {overlay && device && (
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as 'details' | 'events')}
            className="space-y-3"
          >
            <div className="sticky top-0 z-20 -mx-3 px-3 py-2 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
              <TabsList>
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="events" disabled={!device?.id}>Events</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="details" className="m-0">
              <div className="space-y-4">
            <Section title="Device" icon={Cpu}>
              <InfoGrid className="gap-x-3">
                <InfoRow label="Connector">
                  <Badge variant="secondary" className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 font-normal">
                    <ConnectorIcon connectorCategory={device.connectorCategory} size={12} />
                    <span className="text-xs max-w-[160px] overflow-hidden text-ellipsis whitespace-nowrap">
                      {device.connectorName || 'Unknown'}
                    </span>
                  </Badge>
                </InfoRow>

                <InfoRow label="Type">
                  <Badge variant="secondary" className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 font-normal">
                    <DeviceIcon className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs max-w-[160px] overflow-hidden text-ellipsis whitespace-nowrap">
                      {device.standardizedDeviceType || device.type}
                      {device.standardizedDeviceSubtype && (
                        <span className="text-muted-foreground ml-1">/ {device.standardizedDeviceSubtype}</span>
                      )}
                    </span>
                  </Badge>
                </InfoRow>

                <InfoRow label="Status">
                  <Badge variant="outline" className="inline-flex items-center gap-1 px-2 py-0.5 font-normal">
                    <StateIcon className={cn('h-3 w-3', stateColorClass)} />
                    <span className="text-xs">{displayState || 'Unknown'}</span>
                  </Badge>
                </InfoRow>

                {/* Divider before location/space/alarm zone */}
                <div className="col-span-3">
                  <Separator className="my-1" />
                </div>

                {deviceLocation && (
                  <InfoRow label="Location">
                    <Badge variant="outline" className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 font-normal">
                      <Building className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs">{deviceLocation.name}</span>
                    </Badge>
                  </InfoRow>
                )}

                {deviceSpace && (
                  <InfoRow label="Space">
                    <Badge variant="outline" className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 font-normal">
                      <Box className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs">{deviceSpace.name}</span>
                    </Badge>
                  </InfoRow>
                )}

                {deviceAlarmZone && (
                  <InfoRow label="Alarm Zone">
                    <Badge variant="outline" className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 font-normal">
                      <Shield className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs">{deviceAlarmZone.name}</span>
                    </Badge>
                  </InfoRow>
                )}
              </InfoGrid>
              </Section>

            {isCamera && (
              <Section title="Camera Configuration" icon={Cog}>
                <div className="grid grid-cols-3 gap-x-3 gap-y-4 text-sm items-center">
                  <div className="col-span-1 text-muted-foreground">FOV °</div>
                  <div className="col-span-2">
                    <div className="flex items-center gap-3">
                      <Slider
                        min={0}
                        max={360}
                        step={1}
                        value={[fov]}
                        onValueChange={(v) => setFov(v[0] ?? 90)}
                        onValueCommit={(v) => commitUpdate({ fov: v[0] ?? 90 })}
                        className="w-full"
                      />
                      <Input
                        aria-label="Camera field of view (degrees)"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        className="h-7 w-12 text-right tabular-nums text-xs"
                        value={Number.isFinite(fov) ? Math.round(fov) : 0}
                        onChange={(e) => {
                          const raw = e.currentTarget.value;
                          const parsed = Number.parseFloat(raw);
                          if (Number.isNaN(parsed)) return;
                          const clamped = Math.min(360, Math.max(0, parsed));
                          setFov(clamped);
                        }}
                        onBlur={() => commitUpdate({ fov })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            commitUpdate({ fov });
                          }
                        }}
                      />
                    </div>
                  </div>

                  <div className="col-span-1 text-muted-foreground">Rotation °</div>
                  <div className="col-span-2">
                    <div className="flex items-center gap-3">
                      <Slider
                        min={0}
                        max={360}
                        step={1}
                        value={[rotation]}
                        onValueChange={(v) => setRotation(v[0] ?? 0)}
                        onValueCommit={(v) => commitUpdate({ rotation: v[0] ?? 0 })}
                        className="w-full"
                      />
                      <Input
                        aria-label="Camera rotation (degrees)"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        className="h-7 w-12 text-right tabular-nums text-xs"
                        value={Number.isFinite(rotation) ? Math.round(rotation) : 0}
                        onChange={(e) => {
                          const raw = e.currentTarget.value;
                          const parsed = Number.parseFloat(raw);
                          if (Number.isNaN(parsed)) return;
                          const clamped = Math.min(360, Math.max(0, parsed));
                          setRotation(clamped);
                        }}
                        onBlur={() => commitUpdate({ rotation })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            commitUpdate({ rotation });
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>
              </Section>
            )}

            {(() => {
              if (!device?.id) return null;
              const isYoLinkSwitchOrOutlet =
                device.connectorCategory === 'yolink' &&
                (resolvedDeviceType === DeviceType.Switch || resolvedDeviceType === DeviceType.Outlet);
              const isGeneaDoor = device.connectorCategory === 'genea' && resolvedDeviceType === DeviceType.Door;
              const hasQuickActions = isYoLinkSwitchOrOutlet || isGeneaDoor;
              if (!hasQuickActions) return null;
              return (
                <Section title="Quick Actions" icon={Zap}>
                  <QuickDeviceActions
                    internalDeviceId={device.id}
                    connectorCategory={device.connectorCategory}
                    deviceType={resolvedDeviceType}
                    displayState={displayState}
                    showSecondary
                    secondaryVariant="buttons"
                  />
                </Section>
              );
            })()}

              {shouldShowMedia && mediaConfig && (
              <Section title="Space Cameras" icon={getDeviceTypeIcon(DeviceType.Camera)}>
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
              </Section>
              )}

              {deviceSpace && otherDevicesInSpace.length > 0 && (
              <Section title="Other Devices in Space" icon={Box}>
                <FloorPlanOtherSpacesList devices={otherDevicesInSpace} title={null} />
              </Section>
            )}

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
            </TabsContent>

            <TabsContent value="events" className="m-0" key={`${device?.id || 'no-device'}`}>
              {device?.id ? (
                <FloorPlanDeviceEventsTab deviceId={device.id} spaceCameras={spaceCameras} />
              ) : null}
            </TabsContent>
          </Tabs>
        )}
        </div>
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