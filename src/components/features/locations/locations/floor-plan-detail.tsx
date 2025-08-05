'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { ExternalLink, Upload, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FloorPlanUpload } from './floor-plan-upload';
import { toast } from 'sonner';
import type { FloorPlanData } from '@/lib/storage/file-storage';

interface FloorPlanDetailProps {
  floorPlan: FloorPlanData | null;
  locationId: string;
  onFloorPlanUpdated?: () => void;
  onDelete?: () => void;
  showActions?: boolean;
}

export function FloorPlanDetail({
  floorPlan,
  locationId,
  onFloorPlanUpdated,
  onDelete,
  showActions = true
}: FloorPlanDetailProps) {
  const [isReplacing, setIsReplacing] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
  };

  const handleFileRemove = () => {
    setSelectedFile(null);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('floorPlan', selectedFile);
      
      const response = await fetch(`/api/locations/${locationId}/floor-plan`, {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error('Failed to upload floor plan');
      }
      
      toast.success('Floor plan uploaded successfully');
      setIsReplacing(false);
      setSelectedFile(null);
      onFloorPlanUpdated?.();
    } catch (error) {
      console.error('Error uploading floor plan:', error);
      toast.error('Failed to upload floor plan');
    } finally {
      setIsUploading(false);
    }
  };

  const handleStartReplace = () => {
    setIsReplacing(true);
    setSelectedFile(null);
  };

  const handleCancelReplace = () => {
    setIsReplacing(false);
    setSelectedFile(null);
  };

  // Generate serving URL for floor plan
  const getServingUrl = (floorPlanData: FloorPlanData) => {
    const internalFilename = floorPlanData.filePath?.split('/').pop();
    if (!internalFilename) {
      console.error('Invalid floor plan file path:', floorPlanData.filePath);
      return '#'; // Return placeholder URL to avoid crashes
    }
    return `/api/locations/${locationId}/floor-plan?file=${internalFilename}`;
  };

  // Handle initial upload state (no floor plan)
  if (!floorPlan) {
    return (
      <div className="space-y-4">
        <FloorPlanUpload
          onFileSelect={handleFileSelect}
          onFileRemove={handleFileRemove}
          selectedFile={selectedFile}
          isUploading={isUploading}
        />
        {selectedFile && (
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleFileRemove}>
              Cancel
            </Button>
            <Button onClick={handleUpload} disabled={isUploading}>
              {isUploading ? 'Uploading...' : 'Upload Floor Plan'}
            </Button>
          </div>
        )}
      </div>
    );
  }

  // Handle replace mode
  if (isReplacing) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium">Replace Floor Plan</h3>
          <Button variant="ghost" size="icon" onClick={handleCancelReplace}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <FloorPlanUpload
          onFileSelect={handleFileSelect}
          onFileRemove={handleFileRemove}
          selectedFile={selectedFile}
          isUploading={isUploading}
        />
        {selectedFile && (
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleCancelReplace}>
              Cancel
            </Button>
            <Button onClick={handleUpload} disabled={isUploading}>
              {isUploading ? 'Uploading...' : 'Replace Floor Plan'}
            </Button>
          </div>
        )}
      </div>
    );
  }

  // Handle viewing mode
  const isImage = floorPlan.contentType.startsWith('image/');
  const isPdf = floorPlan.contentType === 'application/pdf';

  return (
    <div className="space-y-4">
      {/* Floor Plan Content */}
      {isPdf ? (
        <div className="flex flex-col items-center justify-center p-8 text-center bg-muted/20 rounded-lg">
          <ExternalLink className="h-12 w-12 mb-4 text-muted-foreground" />
          <p className="text-lg font-medium mb-2">{floorPlan.filename}</p>
          <p className="text-sm text-muted-foreground mb-4">PDF files open in a new tab</p>
          <a
            href={getServingUrl(floorPlan)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Open PDF
          </a>
        </div>
      ) : isImage ? (
        <div className="relative w-full h-[70vh] bg-muted/20 rounded-lg overflow-hidden">
          <Image
            src={getServingUrl(floorPlan)}
            alt="Floor plan"
            fill
            className="object-contain"
            priority
          />
        </div>
      ) : (
        <div className="flex items-center justify-center p-8 bg-muted/20 rounded-lg">
          <p className="text-muted-foreground">Unsupported file type</p>
        </div>
      )}

      {/* Action Buttons */}
      {showActions && (
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleStartReplace}>
            <Upload className="h-4 w-4 mr-2" />
            Replace
          </Button>
          <Button variant="outline" onClick={onDelete} className="text-destructive hover:text-destructive">
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
        </div>
      )}
    </div>
  );
}