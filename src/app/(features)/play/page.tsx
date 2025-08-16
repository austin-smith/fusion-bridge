'use client';

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useFusionStore } from "@/stores/store";
import { DeviceType } from "@/lib/mappings/definitions";
import type { DeviceWithConnector } from "@/types";
import { PageHeader } from "@/components/layout/page-header";
import { Maximize, Minimize, MonitorPlay, Settings } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LocationSpaceSelector } from "@/components/common/LocationSpaceSelector";
import { PlayGrid } from "@/components/features/play/play-grid";
import type { Layout } from "react-grid-layout";
import { PlayLayoutControls } from "@/components/features/play/PlayLayoutControls";
import type { PlayLayout, PlayGridLayoutItem, TileConfig, HeaderStyle } from "@/types/play";
import type { ZoomWindow } from "@/types/zoom-window";
import type { DewarpSettings } from "@/types/video-dewarp";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EditCamerasDialog } from "@/components/features/play/EditCamerasDialog";
import { toast } from "sonner";


export default function PlayPage() {
  const allDevices = useFusionStore((state) => state.allDevices);
  const isLoadingAllDevices = useFusionStore(
    (state) => state.isLoadingAllDevices
  );
  const allDevicesHasInitiallyLoaded = useFusionStore(
    (state) => state.allDevicesHasInitiallyLoaded
  );
  const fetchAllDevices = useFusionStore((state) => state.fetchAllDevices);
  const locations = useFusionStore((state) => state.locations);
  const spaces = useFusionStore((state) => state.spaces);
  const activeOrganizationId = useFusionStore((state) => state.activeOrganizationId);

  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [spaceFilter, setSpaceFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");

  const [layouts, setLayouts] = useState<PlayLayout[]>([]);
  const [activeLayoutId, setActiveLayoutId] = useState<string | "auto">("auto");
  const [latestGridLayout, setLatestGridLayout] = useState<Layout[] | null>(null);
  const [latestZoomWindows, setLatestZoomWindows] = useState<ZoomWindow[] | null>(null);
  const [latestDewarpByTileId, setLatestDewarpByTileId] = useState<Record<string, { enabled: boolean; settings: DewarpSettings }> | null>(null);
  const [isLoadingLayouts, setIsLoadingLayouts] = useState(false);

  // Determine active layout (top-level for memo derivations)
  const activeLayoutTop =
    activeLayoutId === "auto"
      ? null
      : layouts.find((l) => l.id === activeLayoutId) || null;

  // Memoize initial props derived from active layout tile configs to avoid ref churn
  const initialZoomWindowsMemo = useMemo(() => {
    const entries = Object.entries(activeLayoutTop?.tileConfigs ?? {})
      .filter(([_, v]) => (v as TileConfig).type === 'zoom')
      .map(([id, v]) => ({ id, ...(v as any) })) as unknown as ZoomWindow[];
    return entries;
  }, [activeLayoutTop?.tileConfigs]);
  const initialDewarpByTileIdMemo = useMemo(() => {
    const obj = Object.fromEntries(
      Object.entries(activeLayoutTop?.tileConfigs ?? {})
        .filter(([_, v]) => (v as TileConfig).type === 'camera' && (v as any).dewarp)
        .map(([id, v]) => [id, (v as any).dewarp])
    ) as Record<string, { enabled: boolean; settings: DewarpSettings }>;
    return obj;
  }, [activeLayoutTop?.tileConfigs]);

  // Guards to avoid setState loops from child change events
  const handleZoomWindowsChange = React.useCallback((next: ZoomWindow[]) => {
    const prev = latestZoomWindows;
    if (prev && prev.length === next.length) {
      let same = true;
      for (let i = 0; i < next.length; i++) {
        const a: any = prev[i];
        const b: any = next[i];
        if (
          a.id !== b.id ||
          a.sourceDeviceId !== b.sourceDeviceId ||
          a.connectorId !== b.connectorId ||
          a.cameraId !== b.cameraId ||
          a.roi?.x !== b.roi?.x ||
          a.roi?.y !== b.roi?.y ||
          a.roi?.w !== b.roi?.w ||
          a.roi?.h !== b.roi?.h
        ) {
          same = false;
          break;
        }
      }
      if (same) return;
    }
    setLatestZoomWindows(next);
  }, [latestZoomWindows]);

  const handleDewarpByTileIdChange = React.useCallback((next: Record<string, { enabled: boolean; settings: DewarpSettings }>) => {
    const prev = latestDewarpByTileId;
    if (prev) {
      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      if (prevKeys.length === nextKeys.length) {
        let same = true;
        for (const k of nextKeys) {
          const a = prev[k];
          const b = next[k];
          if (!a && b) { same = false; break; }
          if (!!a?.enabled !== !!b?.enabled) { same = false; break; }
          const as: any = a?.settings, bs: any = b?.settings;
          const fields = ['lensModel','cx','cy','focalPx','fovDeg','yawDeg','pitchDeg','rollDeg'];
          for (const f of fields) { if (as?.[f] !== bs?.[f]) { same = false; break; } }
          if (!same) break;
        }
        if (same) return;
      }
    }
    setLatestDewarpByTileId(next);
  }, [latestDewarpByTileId]);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editSelectedIds, setEditSelectedIds] = useState<Set<string>>(
    new Set()
  );
  const [editSearch, setEditSearch] = useState("");
  const [headerStyle, setHeaderStyle] = useState<HeaderStyle>(() => {
    if (typeof window === 'undefined') return 'overlay';
    const v = window.localStorage.getItem('fusion.play.headerStyle') as HeaderStyle | null;
    return v === 'standard' || v === 'overlay' || v === 'overlay-hover' ? v : 'overlay';
  });
  const [isViewSettingsOpen, setIsViewSettingsOpen] = useState(false);
  const [showInfo, setShowInfo] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const v = window.localStorage.getItem('fusion.play.showInfo');
    return v === '1';
  });
  const [targetStream, setTargetStream] = useState<'AUTO' | 'HIGH' | 'LOW'>(() => {
    if (typeof window === 'undefined') return 'AUTO';
    const v = window.localStorage.getItem('fusion.play.targetStream');
    return (v === 'HIGH' || v === 'LOW') ? v : 'AUTO';
  });
  const [prefs, setPrefs] = useState<{ defaultLayoutId: string | null }>({
    defaultLayoutId: null,
  });


  const [isPlayFullScreen, setIsPlayFullScreen] = useState(false);
  const playFullScreenContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = "Play // Fusion";
  }, []);
  useEffect(() => {
    if (!allDevicesHasInitiallyLoaded && !isLoadingAllDevices) {
      fetchAllDevices();
    }
  }, [allDevicesHasInitiallyLoaded, isLoadingAllDevices, fetchAllDevices]);

  // Load layouts and preferences on mount and when organization changes
  const loadLayoutsAndPreferences = React.useCallback(async () => {
    setIsLoadingLayouts(true);
    try {
      const [layoutsRes, prefsRes] = await Promise.all([
        fetch("/api/play/layouts"),
        fetch("/api/play/preferences"),
      ]);
      const [layoutsJson, prefsJson] = await Promise.all([
        layoutsRes.json(),
        prefsRes.json(),
      ]);
      if (!layoutsRes.ok || !layoutsJson.success) {
        toast.error("Failed to load layouts", {
          description: layoutsJson?.error || "Please try again.",
        });
        return;
      }
      setLayouts(layoutsJson.data);
      if (prefsRes.ok && prefsJson?.success) {
        setPrefs({ defaultLayoutId: prefsJson.data.defaultLayoutId ?? null });
        if (
          prefsJson.data.defaultLayoutId &&
          layoutsJson.data.some(
            (l: PlayLayout) => l.id === prefsJson.data.defaultLayoutId
          )
        ) {
          setActiveLayoutId(prefsJson.data.defaultLayoutId);
        } else {
          // Reset to auto if no valid default layout found
          setActiveLayoutId("auto");
        }
      } else {
        // Reset to auto if preferences couldn't be loaded
        setActiveLayoutId("auto");
      }
    } catch (e) {
      console.error("fetch layouts/prefs", e);
      toast.error("Failed to load layouts");
      // Reset to auto on error
      setActiveLayoutId("auto");
    } finally {
      setIsLoadingLayouts(false);
    }
  }, []);

  useEffect(() => {
    loadLayoutsAndPreferences();
  }, [loadLayoutsAndPreferences]);

  // Reset layout state when organization changes
  useEffect(() => {
    if (activeOrganizationId) {
      // Reset layout state to defaults
      setLayouts([]);
      setActiveLayoutId("auto");
      setLatestGridLayout(null);
      setLatestZoomWindows(null);
      setLatestDewarpByTileId(null);
      setPrefs({ defaultLayoutId: null });
      
      // Reload layouts and preferences for the new organization
      loadLayoutsAndPreferences();
    }
  }, [activeOrganizationId, loadLayoutsAndPreferences]);

  const cameraDevices = useMemo<DeviceWithConnector[]>(() => {
    let list = allDevices.filter(
      (d) =>
        d.connectorCategory === "piko" &&
        d.deviceTypeInfo?.type === DeviceType.Camera &&
        d.deviceId &&
        d.connectorId
    );

    if (spaceFilter !== "all") {
      list = list.filter((d) => d.spaceId === spaceFilter);
    } else if (locationFilter !== "all") {
      const ids = spaces
        .filter((s) => s.locationId === locationFilter)
        .map((s) => s.id);
      list = list.filter((d) => d.spaceId && ids.includes(d.spaceId));
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      list = list.filter((d) => d.name?.toLowerCase().includes(term));
    }

    return list;
  }, [allDevices, locationFilter, spaceFilter, spaces, searchTerm]);

  // Determine active layout
  const activeLayout =
    activeLayoutId === "auto"
      ? null
      : layouts.find((l) => l.id === activeLayoutId) || null;

  const viewDevices = useMemo<DeviceWithConnector[]>(() => {
    if (!activeLayout) return cameraDevices;
    const activeAllowed = new Set(activeLayout.deviceIds);
    const fromGrid = latestGridLayout
      ? new Set(latestGridLayout.map((it) => it.i))
      : null;
    const allowedIds = fromGrid
      ? new Set(Array.from(activeAllowed).filter((id) => fromGrid.has(id)))
      : activeAllowed;
    return cameraDevices.filter((d) => allowedIds.has(d.id));
  }, [cameraDevices, activeLayout, latestGridLayout]);

  // Dirty detection: compare latest grid (devices + zooms), zoom window definitions, and dewarp vs saved layout
  const isDirty = useMemo(() => {
    if (!activeLayout || !latestGridLayout) return false;
    const savedZoomIds = Object.entries(activeLayout.tileConfigs ?? {})
      .filter(([_, v]) => (v as TileConfig).type === 'zoom')
      .map(([id]) => id);
    const gridScope = new Set<string>([...activeLayout.deviceIds, ...savedZoomIds]);
    const filtered = latestGridLayout.filter((it) => gridScope.has(it.i));
    const savedScoped = activeLayout.items.filter((it) => gridScope.has(it.i));
    if (savedScoped.length !== filtered.length) return true;
    const byId = new Map(savedScoped.map((it) => [it.i, it]));
    for (const cur of filtered) {
      const prev = byId.get(cur.i);
      if (!prev) return true;
      if (prev.x !== cur.x || prev.y !== cur.y || prev.w !== cur.w || prev.h !== cur.h) return true;
    }

    // Compare zoom windows
    const savedZooms = Object.entries(activeLayout.tileConfigs ?? {})
      .filter(([_, v]) => (v as TileConfig).type === 'zoom')
      .map(([id, v]) => ({ id, ...(v as any) }));
    const currentZooms = (latestZoomWindows ?? savedZooms).map((z) => ({ id: (z as any).id, ...(z as any) }));
    if (savedZooms.length !== currentZooms.length) return true;
    const zoomMap = new Map(savedZooms.map((z) => [z.id, z]));
    for (const cz of currentZooms) {
      const sz = zoomMap.get(cz.id);
      if (!sz) return true;
      const a = sz as any, b = cz as any;
      if (a.sourceDeviceId !== b.sourceDeviceId || a.connectorId !== b.connectorId || a.cameraId !== b.cameraId) return true;
      const ar = a.roi || {}, br = b.roi || {};
      if (ar.x !== br.x || ar.y !== br.y || ar.w !== br.w || ar.h !== br.h) return true;
    }

    // Compare dewarp per camera tile
    const savedDewarp = Object.fromEntries(
      Object.entries(activeLayout.tileConfigs ?? {})
        .filter(([_, v]) => (v as TileConfig).type === 'camera' && (v as any).dewarp)
        .map(([id, v]) => {
          const dv = (v as any).dewarp;
          return [id, { enabled: !!dv.enabled, settings: dv.settings }];
        })
    );
    const currentDewarp = latestDewarpByTileId ?? savedDewarp;
    const savedKeys = Object.keys(savedDewarp);
    const currentKeys = Object.keys(currentDewarp);
    if (savedKeys.length !== currentKeys.length) return true;
    for (const k of currentKeys) {
      const a = savedDewarp[k];
      const b = currentDewarp[k];
      if (!a && b) return true;
      if (!!a?.enabled !== !!b?.enabled) return true;
      const as = a?.settings as any, bs = b?.settings as any;
      const fields = ['lensModel','cx','cy','focalPx','fovDeg','yawDeg','pitchDeg','rollDeg'];
      for (const f of fields) {
        if (as?.[f] !== bs?.[f]) return true;
      }
    }

    return false;
  }, [activeLayout, latestGridLayout, latestZoomWindows, latestDewarpByTileId]);

  const handleCreate = async (name: string) => {
    try {
      const res = await fetch("/api/play/layouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, deviceIds: [], items: [] }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed");
      setLayouts((prev) => [...prev, json.data]);
      setActiveLayoutId(json.data.id);
      toast.success("Layout created");
    } catch (e) {
      console.error("create layout", e);
    }
  };
  const handleRename = async (id: string, name: string) => {
    try {
      const res = await fetch(`/api/play/layouts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed");
      setLayouts((prev) => prev.map((l) => (l.id === id ? { ...l, name } : l)));
      toast.success("Layout renamed");
    } catch (e) {
      console.error("rename layout", e);
    }
  };
  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/play/layouts/${id}`, { method: "DELETE" });
      setLayouts((prev) => prev.filter((l) => l.id !== id));
      if (activeLayoutId === id) setActiveLayoutId("auto");
      setPrefs((prev) => ({
        defaultLayoutId:
          prev.defaultLayoutId === id ? null : prev.defaultLayoutId,
      }));
      toast.success("Layout deleted");
    } catch (e) {
      console.error("delete layout", e);
    }
  };
  const handleSave = async () => {
    if (
      !activeLayoutId ||
      activeLayoutId === "auto" ||
      !latestGridLayout ||
      !activeLayout
    )
      return;
    try {
      const savedZoomIds = Object.entries(activeLayout.tileConfigs ?? {})
        .filter(([_, v]) => (v as TileConfig).type === 'zoom')
        .map(([id]) => id);
      const zoomIds = new Set((latestZoomWindows ?? []).map((z) => (z as any).id as string));
      const deviceIds = latestGridLayout
        .filter((it) => activeLayout.deviceIds.includes(it.i))
        .map((it) => it.i);
      // Persist items for both devices and zoom windows (current set)
      const allowed = new Set<string>([...deviceIds, ...Array.from(zoomIds)]);
      const itemsToSave = latestGridLayout.filter((it) => allowed.has(it.i));
      const itemsToPersist: PlayGridLayoutItem[] = itemsToSave.map((it) => ({
        i: it.i,
        x: it.x,
        y: it.y,
        w: it.w,
        h: it.h,
        static: it.static,
      }));
      // Build tileConfigs from current zoom/dewarp state
      const zoomWindows = (latestZoomWindows ?? []).map((z) => z);
      const dewarp = latestDewarpByTileId ?? {};
      const tileConfigs: Record<string, TileConfig> = {};
      for (const id of deviceIds) {
        const d = dewarp[id];
        tileConfigs[id] = d && d.enabled ? { type: 'camera', deviceId: id, dewarp: { enabled: true, settings: d.settings } } as TileConfig : { type: 'camera', deviceId: id } as TileConfig;
      }
      for (const z of zoomWindows) {
        const zid = (z as any).id as string;
        tileConfigs[zid] = { type: 'zoom', sourceDeviceId: z.sourceDeviceId, connectorId: z.connectorId, cameraId: z.cameraId, roi: z.roi } as TileConfig;
      }

      const res = await fetch(`/api/play/layouts/${activeLayoutId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: itemsToPersist, deviceIds, tileConfigs }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "Failed to save layout");
      }
      setLayouts((prev) =>
        prev.map((l) =>
          l.id === activeLayoutId
            ? { ...l, items: itemsToPersist, deviceIds, tileConfigs }
            : l
        )
      );
      toast.success("Layout saved");
    } catch (e) {
      console.error("save layout items", e);
    }
  };

  const handleRemoveFromLayout = (deviceId: string) => {
    if (!activeLayoutId || activeLayoutId === "auto") return;
    const base: Layout[] =
      latestGridLayout ?? (activeLayout?.items as unknown as Layout[]) ?? [];
    setLatestGridLayout(base.filter((it) => it.i !== deviceId));
  };

  const togglePlayFullScreen = () => {
    if (!document.fullscreenElement) {
      setIsPlayFullScreen(true);
    } else if (document.exitFullscreen) {
      document.exitFullscreen().catch((err) => {
        console.error("Error exiting fullscreen:", err);
      });
    }
  };

  useEffect(() => {
    if (
      isPlayFullScreen &&
      playFullScreenContainerRef.current &&
      !document.fullscreenElement
    ) {
      playFullScreenContainerRef.current
        .requestFullscreen()
        .catch((err) => {
          console.error("Error attempting to enable full-screen mode:", err);
          toast.error(
            "Could not enter full-screen mode. Browser might have denied the request."
          );
          setIsPlayFullScreen(false);
        });
    }
  }, [isPlayFullScreen]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (isPlayFullScreen && !document.fullscreenElement) {
        setIsPlayFullScreen(false);
      }
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [isPlayFullScreen]);

  // Edit Cameras dialog data and handlers
  const availableCameras = useMemo(() => cameraDevices, [cameraDevices]);

  const applyEditCameras = async (selectedIdsParam: string[]) => {
    if (!activeLayoutId || activeLayoutId === "auto") return;
    const layout = layouts.find((l) => l.id === activeLayoutId);
    if (!layout) return;
    const nextIds = selectedIdsParam;
    const keptItems = layout.items.filter((it) => nextIds.includes(it.i));
    const existingIds = new Set(keptItems.map((it) => it.i));
    const newMembers = nextIds.filter((id) => !existingIds.has(id));
    const tileSpan = 4;
    const perRow = Math.max(1, Math.floor(12 / tileSpan));
    const startIndex = keptItems.length;
    const newItems: PlayGridLayoutItem[] = newMembers.map((id, idx) => {
      const row = Math.floor((startIndex + idx) / perRow);
      const col = ((startIndex + idx) % perRow) * tileSpan;
      return { i: id, x: col, y: row, w: tileSpan, h: 3, static: false };
    });
    const updated = { deviceIds: nextIds, items: [...keptItems, ...newItems] };
    setLayouts((prev) =>
      prev.map((l) => (l.id === activeLayoutId ? { ...l, ...updated } : l))
    );
    setIsEditDialogOpen(false);
    try {
      await fetch(`/api/play/layouts/${activeLayoutId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });
    } catch (e) {
      console.error("edit cameras apply", e);
    }
  };

  const actions = (
    <div className="flex items-center gap-2 w-full flex-wrap">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <LocationSpaceSelector
            locationFilter={locationFilter}
            spaceFilter={spaceFilter}
            searchTerm={searchTerm}
            locations={locations}
            spaces={spaces}
            onLocationChange={setLocationFilter}
            onSpaceChange={setSpaceFilter}
            onSearchChange={setSearchTerm}
          />
          <div className="w-[220px]">
            <Input
              placeholder="Search cameras..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-9"
            />
          </div>
        </div>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-3"
              onClick={() => setIsViewSettingsOpen(true)}
              aria-label="View settings"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>View settings</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-3"
              onClick={togglePlayFullScreen}
            >
              {isPlayFullScreen ? (
                <Minimize className="h-4 w-4" />
              ) : (
                <Maximize className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{isPlayFullScreen ? "Exit full screen" : "Full screen"}</p>
          </TooltipContent>
        </Tooltip>
        <div className="h-8 w-px bg-border" aria-hidden="true" />
        <PlayLayoutControls
          layouts={layouts.map((l) => ({ id: l.id, name: l.name }))}
          activeLayoutId={activeLayoutId}
          onSelect={setActiveLayoutId}
          onCreate={handleCreate}
          onRename={handleRename}
          onDelete={handleDelete}
          onSave={handleSave}
          isDirty={isDirty}
          isLoading={isLoadingLayouts}
          onEditCameras={() => {
            if (!activeLayout) return;
            setEditSelectedIds(new Set(activeLayout.deviceIds));
            setEditSearch("");
            setIsEditDialogOpen(true);
          }}
          defaultLayoutId={prefs.defaultLayoutId}
          
          onSetDefault={async (id) => {
            const defaultLayoutId = id === "auto" ? null : id;
            setPrefs((prev) => ({ ...prev, defaultLayoutId }));
            if (id === "auto") setActiveLayoutId("auto");
            else setActiveLayoutId(id);
            try {
              await fetch("/api/play/preferences", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ defaultLayoutId }),
              });
            } catch (e) {
              console.error("set default", e);
              toast.error("Failed to set default layout. Please try again.");
            }
          }}
        />
      </div>
      <EditCamerasDialog
        isOpen={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        cameras={availableCameras}
        initialSelectedIds={Array.from(editSelectedIds)}
        onApply={(ids) => {
          applyEditCameras(ids);
        }}
      />
      <Dialog open={isViewSettingsOpen} onOpenChange={setIsViewSettingsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-4 w-4 text-muted-foreground" />
              View Settings
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-between py-1">
            <div className="space-y-0.5">
              <Label htmlFor="header-style-select">Header style</Label>
            </div>
            <Select
              value={headerStyle}
              onValueChange={(value: 'standard' | 'overlay' | 'overlay-hover') => {
                setHeaderStyle(value as HeaderStyle);
                try { window.localStorage.setItem('fusion.play.headerStyle', value); } catch {}
              }}
            >
              <SelectTrigger id="header-style-select" className="w-45">
                <SelectValue placeholder="Header style">
                  {headerStyle === 'standard' && 'Standard'}
                  {headerStyle === 'overlay' && 'Overlay'}
                  {headerStyle === 'overlay-hover' && 'Overlay on hover'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">
                  <div>
                    <div>Standard</div>
                    <div className="text-xs text-muted-foreground">Dedicated header bar above video</div>
                  </div>
                </SelectItem>
                <SelectItem value="overlay">
                  <div>
                    <div>Overlay</div>
                    <div className="text-xs text-muted-foreground">Header overlaid on video, always visible</div>
                  </div>
                </SelectItem>
                <SelectItem value="overlay-hover">
                  <div>
                    <div>Overlay on hover</div>
                    <div className="text-xs text-muted-foreground">Header overlaid on video, shows on hover</div>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between py-1">
            <div className="space-y-0.5">
              <Label htmlFor="target-stream-select">Target stream</Label>
            </div>
            <Select
              value={targetStream}
              onValueChange={(value: 'AUTO' | 'HIGH' | 'LOW') => {
                setTargetStream(value);
                try { window.localStorage.setItem('fusion.play.targetStream', value); } catch {}
              }}
            >
              <SelectTrigger id="target-stream-select" className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AUTO">Auto</SelectItem>
                <SelectItem value="HIGH">Primary</SelectItem>
                <SelectItem value="LOW">Secondary</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between py-1">
            <div className="space-y-0.5">
              <Label htmlFor="info-toggle">Show info</Label>
            </div>
            <Switch
              id="info-toggle"
              checked={showInfo}
              onCheckedChange={(v) => {
                const nv = Boolean(v);
                setShowInfo(nv);
                try { window.localStorage.setItem('fusion.play.showInfo', nv ? '1' : '0'); } catch {}
              }}
            />
          </div>

        </DialogContent>
      </Dialog>
    </div>
  );

  if (isPlayFullScreen) {
    return (
      <div
        ref={playFullScreenContainerRef}
        className="fixed inset-0 bg-background z-50 h-screen w-screen overflow-hidden"
      >
        <div className="absolute inset-x-0 top-0 z-50 flex justify-end p-2 bg-background/80 backdrop-blur">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={togglePlayFullScreen}
              >
                <Minimize className="h-5 w-5" />
                <span className="sr-only">Exit Full Screen</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
            <p>Exit full screen (or press Esc)</p>
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="h-full w-full pt-12">
          {isLoadingAllDevices || !allDevicesHasInitiallyLoaded ? (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              Loading…
            </div>
          ) : (
            <PlayGrid
              devices={viewDevices}
              onLayoutChange={setLatestGridLayout}
              initialLayoutItems={activeLayout?.items}
              onRemoveFromLayout={
                activeLayoutId === "auto" ? undefined : handleRemoveFromLayout
              }
              onAddCameras={() => setIsEditDialogOpen(true)}
              spaces={spaces}
              locations={locations}
              headerStyle={headerStyle}
              showInfo={showInfo}
              targetStream={targetStream}
              initialZoomWindows={initialZoomWindowsMemo as any}
              onZoomWindowsChange={handleZoomWindowsChange as any}
              initialDewarpByTileId={initialDewarpByTileIdMemo as any}
              onDewarpByTileIdChange={handleDewarpByTileIdChange as any}
              key={`grid-fs-${activeLayout?.id || "auto"}`}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full p-4 md:p-6">
      <PageHeader
        title="Play"
        icon={<MonitorPlay className="h-6 w-6" />}
        actions={actions}
      />
      <div>
        {isLoadingAllDevices || !allDevicesHasInitiallyLoaded ? (
          <div className="h-64 flex items-center justify-center text-muted-foreground">
            Loading…
          </div>
        ) : (
          <PlayGrid
            devices={viewDevices}
            onLayoutChange={setLatestGridLayout}
            initialLayoutItems={activeLayout?.items}
            onRemoveFromLayout={
              activeLayoutId === "auto" ? undefined : handleRemoveFromLayout
            }
            onAddCameras={() => setIsEditDialogOpen(true)}
             spaces={spaces}
             locations={locations}
             headerStyle={headerStyle}
             showInfo={showInfo}
             targetStream={targetStream}
             initialZoomWindows={initialZoomWindowsMemo as any}
             onZoomWindowsChange={handleZoomWindowsChange as any}
             initialDewarpByTileId={initialDewarpByTileIdMemo as any}
             onDewarpByTileIdChange={handleDewarpByTileIdChange as any}
            key={`grid-${activeLayout?.id || "auto"}`}
          />
        )}
      </div>
    </div>
  );
}
