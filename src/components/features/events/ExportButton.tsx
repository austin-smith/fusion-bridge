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
import { EventsExportService } from '@/services/events-export-service';
import type { EnrichedEvent } from '@/types/events';
import { toast } from 'sonner';

interface ExportButtonProps {
  currentEvents: EnrichedEvent[];
  filterParams: URLSearchParams;
}

export function ExportButton({ currentEvents, filterParams }: ExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async (format: 'csv' | 'xlsx' | 'json') => {
    if (isExporting) return;
    
    setIsExporting(true);
    
    try {
      // Always use server-side export to get ALL filtered events, not just current page
      console.log('[ExportButton] Exporting ALL filtered events as', format);
      const exportUrl = new URL('/api/events/export', window.location.origin);
      
      // Set export parameters
      exportUrl.searchParams.set('format', format);
      exportUrl.searchParams.set('scope', 'filtered');
      exportUrl.searchParams.set('columns', 'full'); // Use full preset
      exportUrl.searchParams.set('includeMetadata', 'true');
      
      // Append current filter parameters to get ALL matching events
      filterParams.forEach((value, key) => {
        exportUrl.searchParams.set(key, value);
      });

      // Download via API
      const response = await fetch(exportUrl.toString());
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Export failed' }));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const blob = await response.blob();
      
      // Get filename from headers or create default
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `events-${new Date().toISOString().split('T')[0]}.${format}`;
      
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }

      // Trigger download
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(`Events exported as ${format.toUpperCase()}`);
    } catch (error) {
      console.error('[ExportButton] Export failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Export failed';
      toast.error(errorMessage);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <DropdownMenu>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="outline" 
                size="icon" 
                disabled={isExporting || currentEvents.length === 0}
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