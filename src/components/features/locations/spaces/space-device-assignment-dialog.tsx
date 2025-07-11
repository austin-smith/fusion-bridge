'use client';

import React, { useCallback } from 'react';
import type { Space, DeviceWithConnector } from '@/types/index';
import { DeviceAssignmentDialog } from '@/components/features/common/device-assignment-dialog';

// --- Component Props --- 
interface SpaceDeviceAssignmentDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  space: Space | null; // The space to assign a device to
  allDevices: DeviceWithConnector[]; // List of all available devices
  allSpaces: Space[]; // List of all spaces for looking up space names
  // Pass store actions directly for simplicity
  assignDeviceAction: (spaceId: string, deviceId: string) => Promise<boolean>;
  removeDeviceAction: (spaceId: string, deviceId: string) => Promise<boolean>;
}

export const SpaceDeviceAssignmentDialog: React.FC<SpaceDeviceAssignmentDialogProps> = ({ 
  isOpen, 
  onOpenChange, 
  space, 
  allDevices,
  allSpaces,
  assignDeviceAction,
  removeDeviceAction,
}) => {
  // Create wrapper functions that bind the space ID
  const fetchCurrentAssignments = useCallback(async (): Promise<string[]> => {
    if (!space) return [];
    
    try {
      const response = await fetch(`/api/spaces/${space.id}/devices`);
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch current assignments');
      }
      // Extract device IDs from the response (should be 0 or 1 device for spaces)
      const devices = data.data || [];
      return devices.map((device: DeviceWithConnector) => device.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      throw new Error(message);
    }
  }, [space]);

  const wrappedAssignDeviceAction = useCallback(async (deviceId: string): Promise<boolean> => {
    if (!space) return false;
    return assignDeviceAction(space.id, deviceId);
  }, [space, assignDeviceAction]);

  const wrappedRemoveDeviceAction = useCallback(async (deviceId: string): Promise<boolean> => {
    if (!space) return false;
    return removeDeviceAction(space.id, deviceId);
  }, [space, removeDeviceAction]);

  // Bulk operations for spaces - assign multiple devices
  const wrappedBulkAssignDevicesAction = useCallback(async (deviceIds: string[]): Promise<boolean> => {
    if (!space || deviceIds.length === 0) return false;
    // Assign all devices to this space
    for (const deviceId of deviceIds) {
      const success = await assignDeviceAction(space.id, deviceId);
      if (!success) return false;
    }
    return true;
  }, [space, assignDeviceAction]);

  const wrappedBulkRemoveDevicesAction = useCallback(async (deviceIds: string[]): Promise<boolean> => {
    if (!space || deviceIds.length === 0) return false;
    // Remove all specified devices
    for (const deviceId of deviceIds) {
      const success = await removeDeviceAction(space.id, deviceId);
      if (!success) return false;
    }
    return true;
  }, [space, removeDeviceAction]);

  if (!space) {
    return null;
  }

  return (
    <DeviceAssignmentDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      containerName={space.name}
      containerType="space"
      allDevices={allDevices}
      fetchCurrentAssignments={fetchCurrentAssignments}
      assignDeviceAction={wrappedAssignDeviceAction}
      removeDeviceAction={wrappedRemoveDeviceAction}
      bulkAssignDevicesAction={wrappedBulkAssignDevicesAction}
      bulkRemoveDevicesAction={wrappedBulkRemoveDevicesAction}
    />
  );
}; 