import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Layout } from 'react-grid-layout';
import type { ZoomWindow } from '@/types/zoom-window';

export interface UseZoomWindowsOptions {
  initialWindows?: ZoomWindow[];
  onChange?: (windows: ZoomWindow[]) => void;
}

export interface UseZoomWindowsReturn {
  windows: ZoomWindow[];
  beginDraw: (deviceId: string) => void;
  drawingFor?: string;
  cancelDraw: () => void;
  addWindow: (zw: ZoomWindow) => void;
  updateWindow: (id: string, updates: Partial<ZoomWindow>) => void;
  removeWindow: (id: string) => void;
  augmentLayout: (layout: Layout[], cols: number) => Layout[];
}

export function useZoomWindows(opts: UseZoomWindowsOptions = {}): UseZoomWindowsReturn {
  const [windows, setWindows] = useState<ZoomWindow[]>(opts.initialWindows ?? []);
  const [drawingFor, setDrawingFor] = useState<string | undefined>(undefined);

  const setAndEmit = useCallback((next: ZoomWindow[]) => {
    setWindows(next);
    opts.onChange?.(next);
  }, [opts]);

  const beginDraw = useCallback((deviceId: string) => setDrawingFor(deviceId), []);
  const cancelDraw = useCallback(() => setDrawingFor(undefined), []);
  const addWindow = useCallback((zw: ZoomWindow) => setAndEmit([...windows, zw]), [windows, setAndEmit]);
  const updateWindow = useCallback((id: string, updates: Partial<ZoomWindow>) => {
    setAndEmit(windows.map(w => w.id === id ? { ...w, ...updates } : w));
  }, [windows, setAndEmit]);
  const removeWindow = useCallback((id: string) => setAndEmit(windows.filter(w => w.id !== id)), [windows, setAndEmit]);

  const augmentLayout = useCallback((layout: Layout[], cols: number): Layout[] => {
    const tileSpan = 4;
    const perRow = Math.max(1, Math.floor(cols / tileSpan));
    const presentIds = new Set(layout.map((it) => it.i));
    const missing = windows.filter((w) => !presentIds.has(w.id));
    if (missing.length === 0) return layout;
    const baseIndex = layout.length;
    const additions: Layout[] = missing.map((zw, idx) => ({
      i: zw.id,
      x: ((baseIndex + idx) % perRow) * tileSpan,
      y: Math.floor((baseIndex + idx) / perRow),
      w: tileSpan,
      h: 3,
      static: false,
    }));
    return [...layout, ...additions];
  }, [windows]);

  return {
    windows,
    beginDraw,
    drawingFor,
    cancelDraw,
    addWindow,
    updateWindow,
    removeWindow,
    augmentLayout,
  };
}


