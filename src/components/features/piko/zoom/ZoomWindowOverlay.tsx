'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { NormalizedRoi, ZoomWindow } from '@/types/zoom-window';
import { Button } from '@/components/ui/button';
import { Check, X } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

function computeViewportFor(
  container: DOMRect,
  videoSize?: { w: number; h: number }
): { x: number; y: number; w: number; h: number } {
  const cw = Math.max(1, Math.floor(container.width));
  const ch = Math.max(1, Math.floor(container.height));
  const vw = Math.max(1, Math.floor(videoSize?.w || 1280));
  const vh = Math.max(1, Math.floor(videoSize?.h || 720));
  const videoAspect = vw / vh;
  const containerAspect = cw / ch;
  if (videoAspect > containerAspect) {
    const viewportWidth = cw;
    const viewportHeight = Math.floor(cw / videoAspect);
    return { x: 0, y: Math.floor((ch - viewportHeight) / 2), w: viewportWidth, h: viewportHeight };
  } else {
    const viewportWidth = Math.floor(ch * videoAspect);
    const viewportHeight = ch;
    return { x: Math.floor((cw - viewportWidth) / 2), y: 0, w: viewportWidth, h: viewportHeight };
  }
}

export interface ZoomWindowOverlayProps {
  // Mode determines behavior
  mode: 'create' | 'edit';
  
  // Common props
  containerRef: React.RefObject<HTMLDivElement>;
  getVideoSize: () => { w: number; h: number } | undefined;
  onCancel: () => void;
  
  // Create mode props
  deviceId?: string;
  connectorId?: string; 
  cameraId?: string;
  onCreate?: (zw: ZoomWindow) => void;
  
  // Edit mode props
  roi?: NormalizedRoi;
  sourceVideoEl?: HTMLVideoElement | null;
  onSave?: (newRoi: NormalizedRoi) => void;
}

export const ZoomWindowOverlay: React.FC<ZoomWindowOverlayProps> = ({
  mode,
  containerRef,
  getVideoSize,
  onCancel,
  deviceId,
  connectorId,
  cameraId,
  onCreate,
  roi,
  sourceVideoEl,
  onSave,
}) => {
  // State for create mode (drawing new rectangle)
  const [drag, setDrag] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  
  // State for edit mode (editing existing ROI)
  const [editingRoi, setEditingRoi] = useState<NormalizedRoi>(roi || { x: 0, y: 0, w: 0, h: 0 });
  
  // Common refs
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const dragRectRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const dragModeRef = useRef<'move' | 'nw' | 'ne' | 'sw' | 'se' | 'draw' | null>(null);

  // Handle escape key to cancel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  // Update editing ROI when prop changes
  useEffect(() => {
    if (mode === 'edit' && roi) {
      setEditingRoi(roi);
    }
  }, [mode, roi]);

  const handlePointerDown = (e: React.PointerEvent, editMode?: 'move' | 'nw' | 'ne' | 'sw' | 'se') => {
    e.preventDefault();
    e.stopPropagation();
    const container = containerRef.current;
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    const videoSize = getVideoSize();
    const viewport = computeViewportFor(rect, videoSize);
    
    if (viewport.w <= 0 || viewport.h <= 0) return;

    const x0 = e.clientX - rect.left;
    const y0 = e.clientY - rect.top;
    startRef.current = { x: x0, y: y0 };

    if (mode === 'create') {
      // Create mode: drawing new rectangle
      dragModeRef.current = 'draw';
      const init = { x: x0, y: y0, w: 0, h: 0 };
      dragRectRef.current = init;
      setDrag(init);
    } else {
      // Edit mode: resizing/moving existing rectangle
      dragModeRef.current = editMode || null;
    }

    try { (e.currentTarget as any).setPointerCapture?.(e.pointerId); } catch {}

    const handleMove = (ev: PointerEvent) => {
      if (!startRef.current || !dragModeRef.current) return;
      const r = container.getBoundingClientRect();
      const curX = ev.clientX - r.left;
      const curY = ev.clientY - r.top;
      
      if (mode === 'create' && dragModeRef.current === 'draw') {
        // Create mode: update drag rectangle
        const x = Math.min(startRef.current.x, curX);
        const y = Math.min(startRef.current.y, curY);
        const w = Math.abs(curX - startRef.current.x);
        const h = Math.abs(curY - startRef.current.y);
        const next = { x, y, w, h };
        dragRectRef.current = next;
        setDrag(next);
      } else if (mode === 'edit') {
        // Edit mode: update ROI based on drag mode
        const normX = (curX - viewport.x) / viewport.w;
        const normY = (curY - viewport.y) / viewport.h;
        
        setEditingRoi((prev) => {
          const newRoi = { ...prev };
          
          switch (dragModeRef.current) {
            case 'move':
              const dx = normX - (startRef.current!.x - viewport.x) / viewport.w;
              const dy = normY - (startRef.current!.y - viewport.y) / viewport.h;
              newRoi.x = Math.max(0, Math.min(1 - prev.w, prev.x + dx));
              newRoi.y = Math.max(0, Math.min(1 - prev.h, prev.y + dy));
              break;
            case 'nw': // top-left
              newRoi.w = Math.max(0.05, prev.x + prev.w - normX);
              newRoi.h = Math.max(0.05, prev.y + prev.h - normY);
              newRoi.x = Math.min(prev.x + prev.w - 0.05, normX);
              newRoi.y = Math.min(prev.y + prev.h - 0.05, normY);
              break;
            case 'ne': // top-right
              newRoi.w = Math.max(0.05, normX - prev.x);
              newRoi.h = Math.max(0.05, prev.y + prev.h - normY);
              newRoi.y = Math.min(prev.y + prev.h - 0.05, normY);
              break;
            case 'sw': // bottom-left
              newRoi.w = Math.max(0.05, prev.x + prev.w - normX);
              newRoi.h = Math.max(0.05, normY - prev.y);
              newRoi.x = Math.min(prev.x + prev.w - 0.05, normX);
              break;
            case 'se': // bottom-right
              newRoi.w = Math.max(0.05, normX - prev.x);
              newRoi.h = Math.max(0.05, normY - prev.y);
              break;
          }
          
          // Clamp to bounds
          newRoi.x = Math.max(0, Math.min(1 - newRoi.w, newRoi.x));
          newRoi.y = Math.max(0, Math.min(1 - newRoi.h, newRoi.y));
          newRoi.w = Math.max(0.05, Math.min(1 - newRoi.x, newRoi.w));
          newRoi.h = Math.max(0.05, Math.min(1 - newRoi.y, newRoi.h));
          
          return newRoi;
        });
      }
    };

    const handleUp = (ev: PointerEvent) => {
      ev.preventDefault();
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);

      if (mode === 'create' && dragModeRef.current === 'draw') {
        // Create mode: finalize new zoom window
        const containerNow = containerRef.current;
        const finalDrag = dragRectRef.current;
        if (!containerNow || !finalDrag || !deviceId || !connectorId || !cameraId || !onCreate) {
          onCancel();
          startRef.current = null;
          setDrag(null);
          dragRectRef.current = null;
          return;
        }
        
        const rectNow = containerNow.getBoundingClientRect();
        const videoSize = getVideoSize();
        let viewport = computeViewportFor(rectNow, videoSize);
        if (viewport.w <= 0 || viewport.h <= 0) {
          viewport = { x: 0, y: 0, w: Math.max(1, Math.floor(rectNow.width)), h: Math.max(1, Math.floor(rectNow.height)) };
        }

        const dx1 = Math.max(finalDrag.x, viewport.x);
        const dy1 = Math.max(finalDrag.y, viewport.y);
        const dx2 = Math.min(finalDrag.x + finalDrag.w, viewport.x + viewport.w);
        const dy2 = Math.min(finalDrag.y + finalDrag.h, viewport.y + viewport.h);
        const iw = Math.max(0, dx2 - dx1);
        const ih = Math.max(0, dy2 - dy1);
        
        // Accept small selections; fallback to minimum size
        if (iw < 2 || ih < 2) {
          onCancel();
          startRef.current = null;
          setDrag(null);
          dragRectRef.current = null;
          return;
        }

        const newRoi: NormalizedRoi = {
          x: (dx1 - viewport.x) / viewport.w,
          y: (dy1 - viewport.y) / viewport.h,
          w: iw / viewport.w,
          h: ih / viewport.h,
        };
        
        // Clamp
        newRoi.x = Math.min(1, Math.max(0, newRoi.x));
        newRoi.y = Math.min(1, Math.max(0, newRoi.y));
        newRoi.w = Math.min(1, Math.max(0.01, newRoi.w));
        newRoi.h = Math.min(1, Math.max(0.01, newRoi.h));
        
        const id = uuidv4();
        const zw: ZoomWindow = { id, sourceDeviceId: deviceId, connectorId, cameraId, roi: newRoi };
        onCreate(zw);
        
        startRef.current = null;
        setDrag(null);
        dragRectRef.current = null;
      }
      
      // For edit mode, we don't auto-save on pointer up - user must click Save button
      startRef.current = null;
      dragModeRef.current = null;
    };

    window.addEventListener('pointermove', handleMove, { passive: true });
    window.addEventListener('pointerup', handleUp, { passive: false });
    window.addEventListener('pointercancel', handleUp, { passive: false });
  };

  const container = containerRef.current;
  if (!container) return null;

  const rect = container.getBoundingClientRect();
  const videoSize = getVideoSize();
  const viewport = computeViewportFor(rect, videoSize);
  
  if (viewport.w <= 0 || viewport.h <= 0) return null;

  // Calculate pixel coordinates for edit mode
  let pixelRoi: { x: number; y: number; w: number; h: number } | null = null;
  if (mode === 'edit') {
    pixelRoi = {
      x: viewport.x + editingRoi.x * viewport.w,
      y: viewport.y + editingRoi.y * viewport.h,
      w: editingRoi.w * viewport.w,
      h: editingRoi.h * viewport.h,
    };
  }

  return (
    <div className={`absolute inset-0 z-50 no-drag ${mode === 'create' ? 'cursor-crosshair' : ''}`}>
      {mode === 'edit' && sourceVideoEl && (
        /* Show full source video as background using canvas */
        <canvas
          ref={(canvas) => {
            if (!canvas || !sourceVideoEl) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            
            const draw = () => {
              if (sourceVideoEl.videoWidth && sourceVideoEl.videoHeight) {
                canvas.width = Math.max(1, Math.floor(rect.width));
                canvas.height = Math.max(1, Math.floor(rect.height));
                
                // Calculate aspect-correct rendering
                const videoAspect = sourceVideoEl.videoWidth / sourceVideoEl.videoHeight;
                const canvasAspect = canvas.width / canvas.height;
                
                let drawWidth, drawHeight, drawX, drawY;
                if (videoAspect > canvasAspect) {
                  drawWidth = canvas.width;
                  drawHeight = canvas.width / videoAspect;
                  drawX = 0;
                  drawY = (canvas.height - drawHeight) / 2;
                } else {
                  drawWidth = canvas.height * videoAspect;
                  drawHeight = canvas.height;
                  drawX = (canvas.width - drawWidth) / 2;
                  drawY = 0;
                }
                
                ctx.fillStyle = 'black';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(sourceVideoEl, drawX, drawY, drawWidth, drawHeight);
              }
              requestAnimationFrame(draw);
            };
            draw();
          }}
          className="absolute inset-0 w-full h-full"
        />
      )}
      
      {/* Dim background overlay */}
      <div className={`absolute inset-0 ${mode === 'edit' ? 'bg-black/60' : 'bg-black/30'}`} />
      
      {mode === 'edit' && pixelRoi && (
        /* Clear area for current ROI in edit mode */
        <div
          className="absolute bg-transparent"
          style={{
            left: pixelRoi.x,
            top: pixelRoi.y,
            width: pixelRoi.w,
            height: pixelRoi.h,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.6)',
          }}
        />
      )}
      
      {mode === 'create' && (
        /* Instructions overlay for create mode */
        <div className="absolute top-4 left-4 right-4 flex items-center justify-center pointer-events-none">
          <div className="bg-black/70 text-white px-4 py-2 rounded-lg text-sm font-medium backdrop-blur-sm">
            Drag to draw zoom window • Press Esc to cancel
          </div>
        </div>
      )}
      
      {mode === 'create' && !drag && (
        /* Crosshair indicator at center for create mode */
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          <div className="w-8 h-8 border-2 border-white/60 rounded-full flex items-center justify-center">
            <div className="w-1 h-1 bg-white/80 rounded-full"></div>
          </div>
          {/* Crosshair lines */}
          <div className="absolute top-1/2 left-1/2 w-16 h-0.5 bg-white/40 transform -translate-x-1/2 -translate-y-1/2"></div>
          <div className="absolute top-1/2 left-1/2 w-0.5 h-16 bg-white/40 transform -translate-x-1/2 -translate-y-1/2"></div>
        </div>
      )}
      
      {mode === 'create' && (
        /* Clickable area for create mode */
        <div className="absolute inset-0" onPointerDown={(e) => handlePointerDown(e)} />
      )}
      
      {mode === 'create' && drag && (
        /* Draw rectangle for create mode */
        <div
          className="absolute border-2 border-white/80 bg-white/10"
          style={{ left: drag.x, top: drag.y, width: drag.w, height: drag.h }}
        />
      )}
      
      {mode === 'edit' && pixelRoi && (
        /* Draggable ROI rectangle for edit mode */
        <div
          className="absolute border-2 border-white/80 bg-white/10"
          style={{
            left: pixelRoi.x,
            top: pixelRoi.y,
            width: pixelRoi.w,
            height: pixelRoi.h,
          }}
        >
          {/* Corner handles */}
          <div
            className="absolute w-3 h-3 bg-white border border-gray-400 cursor-nw-resize -top-1.5 -left-1.5"
            onPointerDown={(e) => handlePointerDown(e, 'nw')}
          />
          <div
            className="absolute w-3 h-3 bg-white border border-gray-400 cursor-ne-resize -top-1.5 -right-1.5"
            onPointerDown={(e) => handlePointerDown(e, 'ne')}
          />
          <div
            className="absolute w-3 h-3 bg-white border border-gray-400 cursor-sw-resize -bottom-1.5 -left-1.5"
            onPointerDown={(e) => handlePointerDown(e, 'sw')}
          />
          <div
            className="absolute w-3 h-3 bg-white border border-gray-400 cursor-se-resize -bottom-1.5 -right-1.5"
            onPointerDown={(e) => handlePointerDown(e, 'se')}
          />
          
          {/* Center area for moving */}
          <div
            className="absolute inset-2 cursor-move"
            onPointerDown={(e) => handlePointerDown(e, 'move')}
          />
        </div>
      )}

      {mode === 'edit' && (
        /* Action buttons for edit mode */
        <div className="absolute top-4 right-4 flex gap-2">
          <Button
            size="sm"
            onClick={() => onSave?.(editingRoi)}
          >
            <Check className="h-4 w-4" />
            Save
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={onCancel}
          >
            <X className="h-4 w-4" />
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
};
