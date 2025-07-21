"use client";

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { Download, FileX, FileText, FileJson } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from 'sonner';
import type { ExportButtonProps, ExportFormat } from '@/lib/export/types';
import { 
  buildExportUrl, 
  parseFilenameFromContentDisposition, 
  triggerBrowserDownload,
  generateExportFilename 
} from '@/lib/export/utils';

export function ExportButton<T>({ 
  currentData, 
  filterParams, 
  dataTypeName,
  disabled = false 
}: ExportButtonProps<T>) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async (format: ExportFormat) => {
    if (isExporting) return;
    
    setIsExporting(true);
    
    try {
      // Always use server-side export to get ALL filtered data, not just current page
      console.log(`[ExportButton] Exporting ALL filtered data as ${format}`);
      
      const exportUrl = buildExportUrl(
        `/api/${dataTypeName}/export`,
        format,
        true, // Include metadata
        filterParams
      );

      // Download via API
      const response = await fetch(exportUrl.toString());
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Export failed' }));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const blob = await response.blob();
      
      // Get filename from headers or create default
      const contentDisposition = response.headers.get('Content-Disposition');
      const fallbackFilename = generateExportFilename('data', format);
      const filename = parseFilenameFromContentDisposition(contentDisposition, fallbackFilename);

      // Trigger download
      triggerBrowserDownload(blob, filename);

      toast.success(`Data exported as ${format.toUpperCase()}`);
    } catch (error) {
      console.error('[ExportButton] Export failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Export failed';
      toast.error(errorMessage);
    } finally {
      setIsExporting(false);
    }
  };

  const isDisabled = isExporting || currentData.length === 0 || disabled;

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <DropdownMenu>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="outline" 
                size="icon" 
                disabled={isDisabled}
                className="h-8 w-8"
              >
                <Download className="h-4 w-4" />
                <span className="sr-only">Export</span>
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleExport('xlsx')} disabled={isExporting}>
              <FileX className="h-4 w-4 mr-2" />
              Excel
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport('csv')} disabled={isExporting}>
              <FileText className="h-4 w-4 mr-2" />
              CSV
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport('json')} disabled={isExporting}>
              <FileJson className="h-4 w-4 mr-2" />
              JSON
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <TooltipContent>
          <p>Export data</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
} 