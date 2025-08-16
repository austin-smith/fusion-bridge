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
import type { PlayLayout, PlayGridLayoutItem } from "@/types/play";
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

  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [spaceFilter, setSpaceFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");

  const [layouts, setLayouts] = useState<PlayLayout[]>([]);
  const [activeLayoutId, setActiveLayoutId] = useState<string | "auto">("auto");
  const [latestGridLayout, setLatestGridLayout] = useState<Layout[] | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editSelectedIds, setEditSelectedIds] = useState<Set<string>>(
    new Set()
  );
  const [editSearch, setEditSearch] = useState("");
  const [overlayHeaders, setOverlayHeaders] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const v = window.localStorage.getItem('fusion.play.overlayHeaders');
    return v === null ? true : v === '1';
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

  // Load layouts and preferences on mount
  useEffect(() => {
    (async () => {
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
          }
        }
      } catch (e) {
        console.error("fetch layouts/prefs", e);
        toast.error("Failed to load layouts");
      }
    })();
  }, []);

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

  // Dirty detection: compare latest grid to the active layout items
  const isDirty = useMemo(() => {
    if (!activeLayout || !latestGridLayout) return false;
    const activeAllowed = new Set(activeLayout.deviceIds);
    const filtered = latestGridLayout.filter((it) => activeAllowed.has(it.i));
    if (activeLayout.items.length !== filtered.length) return true;
    const byId = new Map(activeLayout.items.map((it) => [it.i, it]));
    for (const cur of filtered) {
      const prev = byId.get(cur.i);
      if (!prev) return true;
      if (
        prev.x !== cur.x ||
        prev.y !== cur.y ||
        prev.w !== cur.w ||
        prev.h !== cur.h
      )
        return true;
    }
    return false;
  }, [activeLayout, latestGridLayout]);

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
      const allowed = new Set(activeLayout.deviceIds);
      const itemsToSave = latestGridLayout.filter((it) => allowed.has(it.i));
      const deviceIds = itemsToSave.map((it) => it.i);
      const itemsToPersist: PlayGridLayoutItem[] = itemsToSave.map((it) => ({
        i: it.i,
        x: it.x,
        y: it.y,
        w: it.w,
        h: it.h,
        static: it.static,
      }));
      const res = await fetch(`/api/play/layouts/${activeLayoutId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: itemsToPersist, deviceIds }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "Failed to save layout");
      }
      setLayouts((prev) =>
        prev.map((l) =>
          l.id === activeLayoutId
            ? { ...l, items: itemsToPersist, deviceIds }
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
              <Label htmlFor="overlay-toggle">Overlay header over video</Label>
            </div>
            <Switch
              id="overlay-toggle"
              checked={overlayHeaders}
              onCheckedChange={(v) => {
                const nv = Boolean(v);
                setOverlayHeaders(nv);
                try { window.localStorage.setItem('fusion.play.overlayHeaders', nv ? '1' : '0'); } catch {}
              }}
            />
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
                <SelectItem value="HIGH">High</SelectItem>
                <SelectItem value="LOW">Low</SelectItem>
              </SelectContent>
            </Select>
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
              overlayHeaders={overlayHeaders}
              showInfo={showInfo}
              targetStream={targetStream}
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
             overlayHeaders={overlayHeaders}
             showInfo={showInfo}
             targetStream={targetStream}
            key={`grid-${activeLayout?.id || "auto"}`}
          />
        )}
      </div>
    </div>
  );
}
