'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { FloorPlanData } from '@/lib/storage/file-storage';
import type { FloorPlan } from '@/types';

// PDF.js types
interface PDFDocumentProxy {
  numPages: number;
  getPage(pageNumber: number): Promise<PDFPageProxy>;
}

interface PDFPageProxy {
  getViewport(params: { scale: number; rotation?: number }): PDFPageViewport;
  render(params: { canvasContext: CanvasRenderingContext2D; viewport: PDFPageViewport }): PDFRenderTask;
}

interface PDFPageViewport {
  width: number;
  height: number;
  scale: number;
  rotation: number;
}

interface PDFRenderTask {
  promise: Promise<void>;
  cancel(): void;
}

export interface UsePdfRendererResult {
  canvas: HTMLCanvasElement | null;
  isLoading: boolean;
  error: string | null;
  numPages: number;
  currentPage: number;
  dimensions: {
    width: number;
    height: number;
  } | null;
  setCurrentPage: (page: number) => void;
  reload: () => void;
}

interface UsePdfRendererOptions {
  scale?: number;
  page?: number;
}

/**
 * Hook for rendering PDF pages to canvas for use with Konva
 * Handles PDF loading, page rendering, and canvas management
 */
export function usePdfRenderer(
  source: string | FloorPlan | FloorPlanData | null,
  locationId?: string,
  options: UsePdfRendererOptions = {}
): UsePdfRendererResult {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(options.page || 1);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const renderTaskRef = useRef<PDFRenderTask | null>(null);

  // Generate PDF URL
  const pdfUrl = generatePdfUrl(source, locationId);
  const scale = options.scale || 1.5; // Good balance between quality and performance

  // Load PDF document
  useEffect(() => {
    if (!pdfUrl || !isPdfSource(source)) {
      setCanvas(null);
      setNumPages(0);
      setDimensions(null);
      return;
    }

    let isCancelled = false;

    const loadPdf = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Dynamically import PDF.js to avoid SSR issues
        const pdfjsLib = await import('pdfjs-dist');
        
        // Set worker source with fallback for different bundling environments
        if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
          try {
            // Try using bundled worker first (modern bundlers)
            pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
              'pdfjs-dist/build/pdf.worker.min.mjs',
              import.meta.url
            ).toString();
          } catch (error) {
            // Fallback for older bundlers or environments that don't support import.meta.url
            console.warn('Using CDN fallback for PDF.js worker due to bundler compatibility:', error);
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@5.4.54/build/pdf.worker.min.mjs';
          }
        }

        // Load the PDF document
        const loadingTask = pdfjsLib.getDocument({
          url: pdfUrl,
          httpHeaders: {
            'Cache-Control': 'no-cache'
          }
        });

        const pdfDoc = await loadingTask.promise;
        
        if (isCancelled) return;

        pdfDocRef.current = pdfDoc;
        setNumPages(pdfDoc.numPages);
        
        // Ensure current page is valid
        const validPage = Math.max(1, Math.min(currentPage, pdfDoc.numPages));
        if (validPage !== currentPage) {
          setCurrentPage(validPage);
        }

      } catch (err) {
        if (!isCancelled) {
          console.error('Error loading PDF:', err);
          setError(err instanceof Error ? err.message : 'Failed to load PDF');
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    loadPdf();

    return () => {
      isCancelled = true;
      // Cancel any ongoing render task
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }
    };
  }, [pdfUrl, reloadKey, source, currentPage]); // Dependencies for PDF loading

  // Render current page
  useEffect(() => {
    if (!pdfDocRef.current || currentPage < 1 || currentPage > numPages) {
      return;
    }

    let isCancelled = false;

    const renderPage = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Cancel previous render task
        if (renderTaskRef.current) {
          renderTaskRef.current.cancel();
          renderTaskRef.current = null;
        }

        const page = await pdfDocRef.current!.getPage(currentPage);
        
        if (isCancelled) return;

        const viewport = page.getViewport({ scale });
        
        // Create canvas
        const newCanvas = document.createElement('canvas');
        newCanvas.width = viewport.width;
        newCanvas.height = viewport.height;
        
        const context = newCanvas.getContext('2d');
        if (!context) {
          throw new Error('Failed to get canvas context');
        }

        // Render the page
        const renderTask = page.render({
          canvasContext: context,
          viewport: viewport
        });

        renderTaskRef.current = renderTask;

        await renderTask.promise;
        
        if (isCancelled) return;

        setCanvas(newCanvas);
        setDimensions({
          width: viewport.width,
          height: viewport.height
        });

      } catch (err) {
        if (!isCancelled) {
          console.error('Error rendering PDF page:', err);
          setError(err instanceof Error ? err.message : 'Failed to render PDF page');
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
          renderTaskRef.current = null;
        }
      }
    };

    renderPage();

    return () => {
      isCancelled = true;
    };
  }, [currentPage, numPages, scale]); // Dependencies for page rendering

  // Reload function
  const reload = useCallback(() => {
    setReloadKey(prev => prev + 1);
  }, []);

  // Page setter with validation
  const setValidatedCurrentPage = useCallback((page: number) => {
    if (numPages > 0) {
      const validPage = Math.max(1, Math.min(page, numPages));
      setCurrentPage(validPage);
    } else {
      setCurrentPage(page);
    }
  }, [numPages]);

  return {
    canvas,
    isLoading,
    error,
    numPages,
    currentPage,
    dimensions,
    setCurrentPage: setValidatedCurrentPage,
    reload
  };
}

/**
 * Generate the appropriate PDF URL from various source types
 */
function generatePdfUrl(
  source: string | FloorPlan | FloorPlanData | null,
  locationId?: string
): string | null {
  if (!source) {
    return null;
  }

  // If source is already a string URL, use it directly
  if (typeof source === 'string') {
    return source;
  }

  // If source is a FloorPlan object (new format)
  if (typeof source === 'object' && 'id' in source && source.floorPlanData && locationId) {
    const internalFilename = source.floorPlanData.filePath?.split('/').pop();
    if (!internalFilename) {
      console.error('Invalid floor plan file path:', source.floorPlanData.filePath);
      return null;
    }
    return `/api/locations/${locationId}/floor-plans/${source.id}?file=${internalFilename}`;
  }

  // If source is FloorPlanData (legacy format), construct the old serving URL
  if (typeof source === 'object' && 'filePath' in source && source.filePath && locationId) {
    const internalFilename = source.filePath.split('/').pop();
    if (!internalFilename) {
      console.error('Invalid floor plan file path:', source.filePath);
      return null;
    }
    return `/api/locations/${locationId}/floor-plan?file=${internalFilename}`;
  }

  return null;
}

/**
 * Check if the source represents a PDF file
 */
export function isPdfSource(source: string | FloorPlan | FloorPlanData | null): boolean {
  if (!source) {
    return false;
  }

  if (typeof source === 'string') {
    return source.toLowerCase().includes('.pdf');
  }

  if (typeof source === 'object') {
    // Handle FloorPlan object (new format)
    if ('id' in source && source.floorPlanData) {
      return source.floorPlanData.contentType === 'application/pdf';
    }
    // Handle FloorPlanData object (legacy format)
    if ('contentType' in source && source.contentType) {
      return source.contentType === 'application/pdf';
    }
  }

  return false;
}