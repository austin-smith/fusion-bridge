"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import RGL, { WidthProvider, type Layout } from "react-grid-layout";
import type { DeviceWithConnector, Space, Location } from "@/types";
import { DewarpablePikoPlayer } from "@/components/features/piko/dewarp/DewarpablePikoPlayer";
import { DewarpMenuSub } from "@/components/features/piko/dewarp/DewarpMenuSub";
import { DewarpSettingsDialog } from "@/components/features/piko/dewarp/DewarpSettings";
import { useDewarpControls } from "@/hooks/use-dewarp-controls";
import { ZoomWindowTile } from "@/components/features/piko/zoom/ZoomWindowTile";
import { ZoomWindowOverlay } from "@/components/features/piko/zoom/ZoomWindowOverlay";
import { ZoomMenuItem } from "@/components/features/piko/zoom/ZoomMenuItem";
import { VideoRegistryProvider, useVideoRegistry } from "@/components/features/piko/zoom/VideoRegistryContext";
import type { ZoomWindow } from "@/types/zoom-window";
import type { DewarpSettings } from "@/types/video-dewarp";
import { useZoomWindows } from "@/hooks/use-zoom-windows";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

import {
  MoreHorizontal,
  Plus,
  Box,
  Building,
  Cctv,
  Trash2,
  Crop
} from "lucide-react";

const GridLayout = WidthProvider(RGL);

// Play grid metrics tuning (self-documenting constants)
const FPS_SMOOTHING_ALPHA = 0.2;
const FPS_CHANGE_THRESHOLD = 0.05; // fps; ignore tiny jitter
const FPS_THROTTLE_MS = 250; // ~4 updates/second

export interface PlayGridProps {
  devices: DeviceWithConnector[];
  onLayoutChange?: (l: Layout[]) => void;
  initialLayoutItems?: Layout[];
  onRemoveFromLayout?: (deviceId: string) => void;
  onAddCameras?: () => void;
  spaces: Space[];
  locations: Location[];
  overlayHeaders?: boolean;
  showInfo?: boolean;
  locked?: boolean;
  initialZoomWindows?: ZoomWindow[];
  onZoomWindowsChange?: (windows: ZoomWindow[]) => void;
  targetStream?: 'AUTO' | 'HIGH' | 'LOW';
}

export const PlayGridInner: React.FC<PlayGridProps> = ({
  devices,
  onLayoutChange,
  initialLayoutItems,
  onRemoveFromLayout,
  onAddCameras,
  spaces,
  locations,
  overlayHeaders = true,
  showInfo = false,
  locked = false,
  initialZoomWindows = [],
  onZoomWindowsChange,
  targetStream = 'AUTO',
}) => {
  const playableDevices = useMemo(
    () => devices.filter((d) => d.deviceId && d.connectorId),
    [devices]
  );

  const [layout, setLayout] = useState<Layout[]>([]);
  const zoomWindowManager = useZoomWindows({
    initialWindows: initialZoomWindows,
    onChange: onZoomWindowsChange,
  });
  const videoRegistry = useVideoRegistry();
  const [fpsById, setFpsById] = useState<Record<string, number>>({});
  const [resolutionById, setResolutionById] = useState<
    Record<string, { w: number; h: number }>
  >({});
  const lastFpsUpdateAtRef = React.useRef<Record<string, number>>({});
  const smoothAndThrottleFps = React.useCallback(
    (deviceId: string, nextFps: number) => {
      const now = performance.now();
      const lastAt = lastFpsUpdateAtRef.current[deviceId] ?? 0;
      // Throttle UI updates to ~4/sec
      if (now - lastAt < FPS_THROTTLE_MS) return;
      setFpsById((prev) => {
        const prevFps = prev[deviceId];
        // Exponential smoothing
        const alpha = FPS_SMOOTHING_ALPHA;
        const currentFps = typeof prevFps === "number" ? prevFps : nextFps;
        const smoothedFloat = currentFps + alpha * (nextFps - currentFps);
        // Round to one decimal place for visible, gentle movement
        const smoothed = Math.round(smoothedFloat * 10) / 10;
        if (
          typeof prevFps === "number" &&
          Math.abs(smoothed - prevFps) < FPS_CHANGE_THRESHOLD
        )
          return prev;
        lastFpsUpdateAtRef.current[deviceId] = now;
        return { ...prev, [deviceId]: smoothed };
      });
    },
    []
  );

  // Single, fluid 12-column grid
  const COLS = 12;
  const ROW_HEIGHT = 100;
  const MARGIN: [number, number] = [10, 10];

  // Lookup maps to resolve names like image-preview-dialog header style
  const spaceById = useMemo(() => {
    const m = new Map<string, Space>();
    for (const s of spaces) m.set(s.id, s);
    return m;
  }, [spaces]);

  const locationById = useMemo(() => {
    const m = new Map<string, Location>();
    for (const l of locations) m.set(l.id, l);
    return m;
  }, [locations]);

  useEffect(() => {
    const tileSpan = 4;
    const perRow = Math.max(1, Math.floor(COLS / tileSpan));

    // Map of saved positions from initialLayoutItems (when provided)
    const savedById: Record<string, Layout> = {};
    if (initialLayoutItems && initialLayoutItems.length > 0) {
      for (const item of initialLayoutItems) {
        if (!item || typeof item.i !== "string") continue;
        savedById[item.i] = {
          i: item.i,
          x: typeof item.x === "number" ? item.x : 0,
          y: typeof item.y === "number" ? item.y : 0,
          w: typeof item.w === "number" ? item.w : tileSpan,
          h: typeof item.h === "number" ? item.h : 3,
          static: !!item.static,
        };
      }
    }

    // IDs that should be present: playable device IDs + zoom window IDs
    const playableIds = new Set(playableDevices.map((d) => d.id));
    const shouldKeep = (id: string) => playableIds.has(id) || zoomWindowManager.windows.some(z => z.id === id);

    const nextLayout = layout.filter((it) => shouldKeep(it.i));
    const presentIds = new Set(nextLayout.map((it) => it.i));

    // Add missing devices to layout
    const toAddDevices = playableDevices.filter((d) => !presentIds.has(d.id));
    const deviceAdditions: Layout[] = toAddDevices.map((device, idx) => {
      const base: Layout = {
        i: device.id,
        x: ((nextLayout.length + idx) % perRow) * tileSpan,
        y: Math.floor((nextLayout.length + idx) / perRow),
        w: tileSpan,
        h: 3,
        static: false,
      };
      return savedById[device.id] ? { ...base, ...savedById[device.id] } : base;
    });

    // Use zoom window manager to augment layout with zoom windows
    const layoutWithDevices = [...nextLayout, ...deviceAdditions];
    const finalLayout = zoomWindowManager.augmentLayout(layoutWithDevices, COLS);

    if (finalLayout.length !== layout.length || !finalLayout.every((item, idx) => layout[idx]?.i === item.i)) {
      setLayout(finalLayout);
    }
  }, [playableDevices, zoomWindowManager.windows, initialLayoutItems, zoomWindowManager, layout]);

  // shared video registry API for ZoomWindowTile
  const getSharedVideoEl = React.useCallback((sourceDeviceId: string) => {
    return videoRegistry.get(sourceDeviceId);
  }, [videoRegistry]);

  const tileContentRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Per-tile dewarp state using reusable hook
  const dewarpState = useDewarpControls();
  const [dewarpSettingsDialog, setDewarpSettingsDialog] = useState<{ open: boolean; deviceId?: string }>({ open: false });

  if (playableDevices.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-sm text-muted-foreground">
          No cameras in this layout.
        </p>
        <Button size="sm" onClick={onAddCameras}>
          <Plus className="h-4 w-4" />
          Add Cameras
        </Button>
      </div>
    );
  }

  return (
    <>
    <GridLayout
      className="play-grid"
      cols={COLS}
      rowHeight={ROW_HEIGHT}
      margin={MARGIN}
      containerPadding={[0, 0]}
      isDraggable
      isResizable
      draggableCancel={'button, a, input, textarea, select, [role="menuitem"], .no-drag'}
      layout={layout}
      onLayoutChange={(l) => {
        setLayout(l);
        onLayoutChange?.(l);
      }}
    >
      {playableDevices.map((device) => {
        const resolvedSpaceName =
          device.spaceName ||
          (device.spaceId ? spaceById.get(device.spaceId)?.name : undefined);
        const resolvedLocationName = (() => {
          if (device.locationId)
            return locationById.get(device.locationId)?.name;
          if (device.spaceId) {
            const s = spaceById.get(device.spaceId);
            return s ? locationById.get(s.locationId)?.name : undefined;
          }
          return undefined;
        })();
        return (
          <div key={device.id} className="overflow-hidden grid-item-container">
            <Card className="h-full w-full flex flex-col overflow-hidden rounded-lg">
              {!overlayHeaders ? (
                <CardHeader className="px-2 py-1.5 shrink-0 bg-black text-white rounded-t-lg">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle
                        className="text-xs font-medium leading-tight truncate flex items-center gap-1.5"
                        title={device.name}
                      >
                        <Cctv className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="truncate">{device.name}</span>
                        {resolvedSpaceName ? (
                          <>
                            <span className="text-muted-foreground">•</span>
                            <span className="inline-flex items-center gap-1 truncate text-muted-foreground">
                              <Box className="h-3.5 w-3.5" />
                              <span className="truncate">
                                {resolvedSpaceName}
                              </span>
                            </span>
                          </>
                        ) : null}
                        {resolvedLocationName ? (
                          <>
                            <span className="text-muted-foreground">•</span>
                            <span className="inline-flex items-center gap-1 truncate text-muted-foreground">
                              <Building className="h-3.5 w-3.5" />
                              <span className="truncate">
                                {resolvedLocationName}
                              </span>
                            </span>
                          </>
                        ) : null}
                      </CardTitle>
                    </div>
                    {onRemoveFromLayout ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 no-drag"
                            aria-label="Tile options"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="no-drag">
                          <DewarpMenuSub
                            enabled={dewarpState.isEnabled(device.id)}
                            onToggleEnabled={() => dewarpState.toggleDewarp(device.id)}
                            onOpenSettings={() => setDewarpSettingsDialog({ open: true, deviceId: device.id })}
                          />
                          <ZoomMenuItem
                            disabled={locked}
                            onSelect={() => {
                              if (!locked) zoomWindowManager.beginDraw(device.id);
                            }}
                          />
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              onRemoveFromLayout(device.id);
                            }}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Remove
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </div>
                </CardHeader>
              ) : null}
              <CardContent className="p-0 grow relative overflow-hidden rounded-b-lg">
                <div ref={(el) => { tileContentRefs.current[device.id] = el; }} className={`absolute inset-0 ${dewarpState.isEnabled(device.id) ? 'no-drag' : ''}`}>
                  <DewarpablePikoPlayer
                    connectorId={device.connectorId}
                    cameraId={device.deviceId!}
                    className="w-full h-full"
                    dewarpEnabled={dewarpState.isEnabled(device.id)}
                    settings={dewarpState.getSettings(device.id)}
                    editOverlayTopOffsetPx={overlayHeaders ? 48 : 0}
                    onDewarpSettingsChange={(newSettings) => dewarpState.updateSettings(device.id, newSettings)}
                    enableStats={showInfo}
                    onStats={
                      showInfo
                        ? ({ fps, width, height }) => {
                            smoothAndThrottleFps(device.id, fps);
                            if (width && height) {
                              setResolutionById((prev) => {
                                const cur = prev[device.id];
                                if (cur && cur.w === width && cur.h === height)
                                  return prev;
                                return {
                                  ...prev,
                                  [device.id]: { w: width, h: height },
                                };
                              });
                            }
                          }
                        : undefined
                    }
                    thumbnailSize="320x0"
                    targetStream={targetStream}
                    // Expose the playing <video> so Zoom windows can sample it
                    exposeVideoRef={(el) => {
                      videoRegistry.register(device.id, el);
                    }}
                  />
                  {zoomWindowManager.drawingFor === device.id && !locked ? (
                    <ZoomWindowOverlay
                      mode="create"
                      deviceId={device.id}
                      connectorId={device.connectorId}
                      cameraId={device.deviceId!}
                      containerRef={{ current: tileContentRefs.current[device.id] as HTMLDivElement | null }}
                      getVideoSize={() => videoRegistry.getVideoSize(device.id) || resolutionById[device.id]}
                      onCreate={(zw) => {
                        zoomWindowManager.addWindow(zw);
                        zoomWindowManager.cancelDraw();
                      }}
                      onCancel={() => zoomWindowManager.cancelDraw()}
                    />
                  ) : null}
                </div>

                {overlayHeaders ? (
                  <div className="absolute inset-x-0 top-0">
                    <div
                      className="pointer-events-none absolute inset-x-0 top-0 h-8 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.6)_0%,rgba(0,0,0,0.38)_38%,rgba(0,0,0,0.14)_78%,rgba(0,0,0,0)_100%)] backdrop-blur-[2px] z-0"
                      aria-hidden="true"
                    />
                    <div className="relative z-20 px-2 py-1 flex items-center justify-between gap-2 text-white">
                      <div className="min-w-0 flex items-center gap-1.5 text-xs">
                        <Cctv className="h-3.5 w-3.5 text-white/80" />
                        <span className="truncate">{device.name}</span>
                        {resolvedSpaceName ? (
                          <>
                            <span className="text-white/60">•</span>
                            <span className="inline-flex items-center gap-1 truncate text-white/80">
                              <Box className="h-3.5 w-3.5" />
                              <span className="truncate">
                                {resolvedSpaceName}
                              </span>
                            </span>
                          </>
                        ) : null}
                        {resolvedLocationName ? (
                          <>
                            <span className="text-white/60">•</span>
                            <span className="inline-flex items-center gap-1 truncate text-white/80">
                              <Building className="h-3.5 w-3.5" />
                              <span className="truncate">
                                {resolvedLocationName}
                              </span>
                            </span>
                          </>
                        ) : null}
                      </div>
                      {onRemoveFromLayout ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 no-drag text-white/90 hover:text-white hover:bg-white/10"
                              aria-label="Tile options"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="no-drag">
                            <DewarpMenuSub
                              enabled={dewarpState.isEnabled(device.id)}
                              onToggleEnabled={() => dewarpState.toggleDewarp(device.id)}
                              onOpenSettings={() => setDewarpSettingsDialog({ open: true, deviceId: device.id })}
                            />
                            <ZoomMenuItem
                              disabled={locked}
                              onSelect={() => {
                                if (!locked) zoomWindowManager.beginDraw(device.id);
                              }}
                            />
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onRemoveFromLayout(device.id);
                              }}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Remove
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {showInfo ? (
                  <div className="absolute bottom-1 right-1 z-20">
                    <span className="block px-1.5 py-1 rounded text-[10px] leading-tight bg-black/55 text-white select-none font-mono text-right">
                      {(() => {
                        const res = resolutionById[device.id];
                        return res && res.w && res.h
                          ? `${res.w}×${res.h}`
                          : "—×—";
                      })()}
                      <br />
                      {typeof fpsById[device.id] === "number"
                        ? `${fpsById[device.id].toFixed(1)} fps`
                        : "— fps"}
                    </span>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        );
      })}

      {/* Render zoom windows as individual grid items */}
      {zoomWindowManager.windows.map((zw) => {
        // Find the source device to get its name and location info
        const sourceDevice = playableDevices.find((d) => d.id === zw.sourceDeviceId);
        const resolvedSpaceName = sourceDevice?.spaceName || 
          (sourceDevice?.spaceId ? spaceById.get(sourceDevice.spaceId)?.name : undefined);
        const resolvedLocationName = (() => {
          if (sourceDevice?.locationId)
            return locationById.get(sourceDevice.locationId)?.name;
          if (sourceDevice?.spaceId) {
            const s = spaceById.get(sourceDevice.spaceId);
            return s ? locationById.get(s.locationId)?.name : undefined;
          }
          return undefined;
        })();

        return (
          <div key={zw.id} className="overflow-hidden grid-item-container">
            <div className="h-full w-full flex flex-col overflow-hidden rounded-lg">
              <div className="p-0 grow relative overflow-hidden rounded-b-lg">
                <ZoomWindowTile
                  windowDef={zw}
                  getSharedVideoEl={getSharedVideoEl}
                  locked={locked}
                  overlayHeaders={overlayHeaders}
                  deviceName={sourceDevice?.name}
                  spaceName={resolvedSpaceName}
                  locationName={resolvedLocationName}
                  onEditRoi={(id, newRoi) => {
                    zoomWindowManager.updateWindow(id, { roi: newRoi });
                  }}
                  onRemove={(id) => {
                    zoomWindowManager.removeWindow(id);
                    setLayout((prev) => prev.filter((it) => it.i !== id));
                  }}
                />
              </div>
            </div>
          </div>
        );
      })}

      
    </GridLayout>

    {/* Dewarp Settings Dialog */}
    {dewarpSettingsDialog.deviceId && (
      <DewarpSettingsDialog
        open={dewarpSettingsDialog.open}
        onOpenChange={(open: boolean) => setDewarpSettingsDialog((prev) => ({ open, deviceId: prev.deviceId }))}
        settings={dewarpState.getSettings(dewarpSettingsDialog.deviceId)}
        onChange={(settings: DewarpSettings) => dewarpState.updateSettings(dewarpSettingsDialog.deviceId!, settings)}
      />
    )}
    </>
  );
};

export const PlayGrid: React.FC<PlayGridProps> = (props) => {
  return (
    <VideoRegistryProvider>
      <PlayGridInner {...props} />
    </VideoRegistryProvider>
  );
};
