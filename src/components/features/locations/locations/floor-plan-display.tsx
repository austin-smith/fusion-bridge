'use client';

import React, { useState } from 'react';
import { Eye, Download, Trash2, Upload, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { FloorPlanData } from '@/lib/storage/file-storage';

interface FloorPlanDisplayProps {
  floorPlan: FloorPlanData;
  locationId: string;
  onDelete: () => void;
  onReplace: () => void;
  isDeleting?: boolean;
  className?: string;
}

export function FloorPlanDisplay({
  floorPlan,
  locationId,
  onDelete,
  onReplace,
  isDeleting = false,
  className
}: FloorPlanDisplayProps) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  // Generate serving URL for floor plan
  const getServingUrl = (floorPlanData: FloorPlanData) => {
    const internalFilename = floorPlanData.filePath?.split('/').pop();
    if (!internalFilename) {
      console.error('Invalid floor plan file path:', floorPlanData.filePath);
      return '#'; // Return placeholder URL to avoid crashes
    }
    return `/api/locations/${locationId}/floor-plan?file=${internalFilename}`;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getFileTypeDisplay = (contentType: string) => {
    if (contentType.startsWith('image/')) {
      return 'Image';
    } else if (contentType === 'application/pdf') {
      return 'PDF';
    }
    return 'File';
  };

  const handleDownload = () => {
    // Create a temporary link to download the file
    const servingUrl = getServingUrl(floorPlan);
    const link = document.createElement('a');
    link.href = servingUrl;
    link.download = floorPlan.filename;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleView = () => {
    // For PDFs, open in new tab. For images, show in modal
    const servingUrl = getServingUrl(floorPlan);
    if (floorPlan.contentType === 'application/pdf') {
      window.open(servingUrl, '_blank');
    } else {
      setIsPreviewOpen(true);
    }
  };

  const isImage = floorPlan.contentType.startsWith('image/');
  const isPdf = floorPlan.contentType === 'application/pdf';

  return (
    <Card className={cn("border", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            Floor Plan
            <Badge variant="secondary" className="text-xs">
              {getFileTypeDisplay(floorPlan.contentType)}
            </Badge>
          </CardTitle>
          
          <div className="flex items-center gap-1">
            {/* View/Preview Button */}
            <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleView}
                  className="h-8 w-8 p-0"
                >
                  {isPdf ? <ExternalLink className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  <span className="sr-only">
                    {isPdf ? 'Open PDF' : 'Preview'}
                  </span>
                </Button>
              </DialogTrigger>
              
              {isImage && (
                <DialogContent className="max-w-4xl">
                  <DialogHeader>
                    <DialogTitle>{floorPlan.filename}</DialogTitle>
                  </DialogHeader>
                  <div className="flex justify-center relative w-full h-[70vh]">
                    <Image
                      src={getServingUrl(floorPlan)}
                      alt="Floor plan"
                      fill
                      className="object-contain"
                    />
                  </div>
                </DialogContent>
              )}
            </Dialog>

            {/* Download Button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDownload}
              className="h-8 w-8 p-0"
            >
              <Download className="h-4 w-4" />
              <span className="sr-only">Download</span>
            </Button>

            {/* Replace Button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={onReplace}
              className="h-8 w-8 p-0"
            >
              <Upload className="h-4 w-4" />
              <span className="sr-only">Replace</span>
            </Button>

            {/* Delete Button */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isDeleting}
                  className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="sr-only">Delete</span>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Floor Plan</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete this floor plan? This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={onDelete}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Filename:</span>
            <span className="font-mono text-xs truncate max-w-xs" title={floorPlan.filename}>
              {floorPlan.filename}
            </span>
          </div>
          
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Size:</span>
            <span className="text-xs">
              {formatFileSize(floorPlan.size)}
            </span>
          </div>
          
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Uploaded:</span>
            <span className="text-xs">
              {format(new Date(floorPlan.uploadedAt), 'MMM d, yyyy h:mm a')}
            </span>
          </div>
        </div>

        {/* Thumbnail for images */}
        {isImage && (
          <div className="border rounded-lg overflow-hidden bg-muted/20 relative h-32 cursor-pointer" onClick={handleView}>
            <Image
              src={getServingUrl(floorPlan)}
              alt="Floor plan thumbnail"
              fill
              className="object-cover"
            />
          </div>
        )}

        {/* PDF indicator */}
        {isPdf && (
          <div 
            className="border-2 border-dashed border-muted rounded-lg p-4 text-center cursor-pointer hover:bg-muted/20 transition-colors"
            onClick={handleView}
          >
            <ExternalLink className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Click to open PDF</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}