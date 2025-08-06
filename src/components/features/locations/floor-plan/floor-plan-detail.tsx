'use client';

import React, { useState, useEffect } from 'react';
import { Upload, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FloorPlanUpload } from './floor-plan-upload';
import { FloorPlanCanvasDynamic, DevicePalette } from '.';
import { useDeviceOverlays } from '@/hooks/floor-plan/device-overlays';
import { useFusionStore } from '@/stores/store';
import { toast } from 'sonner';
import type { FloorPlan, DeviceWithConnector, Space } from '@/types';

interface FloorPlanDetailProps {
  floorPlan: FloorPlan | null;
  locationId: string;
  onFloorPlanUpdated?: () => void;
  onDelete?: () => void;
  showActions?: boolean;
  allDevices: DeviceWithConnector[];
  spaces: Space[];
}

export function FloorPlanDetail({
  floorPlan,
  locationId,
  onFloorPlanUpdated,
  onDelete,
  showActions = true,
  allDevices,
  spaces
}: FloorPlanDetailProps) {
  const [isReplacing, setIsReplacing] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [deviceSearchTerm, setDeviceSearchTerm] = useState('');

  // Get device overlays and management functions
  const {
    overlays,
    isLoading: overlaysLoading,
    error: overlaysError,
    selectedOverlayId,
    createOverlay,
    updateOverlay,
    deleteOverlay,
    selectOverlay
  } = useDeviceOverlays({ 
    locationId, 
    floorPlanId: floorPlan?.id || '',
    enabled: !!floorPlan?.id
  });

  // Create set of device IDs that are already placed on floor plan
  const placedDeviceIds = new Set(overlays.map(overlay => overlay.deviceId));

  // Handle overlay errors
  useEffect(() => {
    if (overlaysError) {
      toast.error(`Device overlay error: ${overlaysError}`);
    }
  }, [overlaysError]);

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
  };

  const handleFileRemove = () => {
    setSelectedFile(null);
  };

  const handleUpload = async () => {
    if (!selectedFile || !floorPlan) return;
    
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('floorPlan', selectedFile);
      
      const response = await fetch(`/api/locations/${locationId}/floor-plans/${floorPlan.id}`, {
        method: 'PUT',
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
  const getServingUrl = (floorPlan: FloorPlan) => {
    if (!floorPlan.floorPlanData) {
      console.log('🔍 No floor plan data found');
      return '#';
    }
    
    const internalFilename = floorPlan.floorPlanData.filePath?.split('/').pop();
    if (!internalFilename) {
      console.error('Invalid floor plan file path:', floorPlan.floorPlanData.filePath);
      return '#'; // Return placeholder URL to avoid crashes
    }
    const url = `/api/locations/${locationId}/floor-plans/${floorPlan.id}?file=${internalFilename}`;
    console.log('🔍 Generated floor plan URL:', url);
    console.log('🔍 Floor plan data:', floorPlan.floorPlanData);
    return url;
  };

  // Handle no floor plan case
  if (!floorPlan) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">No floor plan selected</p>
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

  // Handle viewing mode with interactive canvas
  const handleCanvasLoad = (dimensions: { width: number; height: number }) => {
    console.log('Floor plan loaded with dimensions:', dimensions);
  };

  const handleCanvasError = (error: string) => {
    console.error('Floor plan canvas error:', error);
    toast.error('Failed to load floor plan');
  };

  const handleAssignDevices = () => {
    // This would open the device assignment dialog
    // For now, just show a toast that this feature is coming
    toast.info('Device assignment dialog will be implemented in a future update');
  };

  return (
    <div className="space-y-4 max-w-full overflow-hidden">
      {/* Two-panel layout: Device Palette + Canvas */}
      <div className="flex gap-4 h-[600px] min-w-0">
        {/* Device Palette */}
        <div className="w-72 flex-shrink-0">
          <DevicePalette
            devices={allDevices}
            spaces={spaces}
            locationId={locationId}
            searchTerm={deviceSearchTerm}
            onSearchChange={setDeviceSearchTerm}
            onAssignDevices={handleAssignDevices}
            placedDeviceIds={placedDeviceIds}
            className="h-full"
          />
        </div>

        {/* Interactive Floor Plan Canvas */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <FloorPlanCanvasDynamic
            floorPlan={floorPlan}
            locationId={locationId}
            onLoad={handleCanvasLoad}
            onError={handleCanvasError}
            overlays={overlays}
            selectedOverlayId={selectedOverlayId}
            createOverlay={createOverlay}
            updateOverlay={updateOverlay}
            deleteOverlay={deleteOverlay}
            selectOverlay={selectOverlay}
            className="w-full h-full"
          />
        </div>
      </div>

      {/* Action Buttons */}
      {showActions && (
        <div className="flex justify-end gap-2 w-full max-w-full overflow-hidden">
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