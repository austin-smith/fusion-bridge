'use client';

import React, { useCallback } from 'react';
import type { AlarmZone, DeviceWithConnector } from '@/types/index';
import { DeviceAssignmentDialog } from '@/components/features/common/device-assignment-dialog';

// --- Component Props --- 
interface AlarmZoneDeviceAssignmentDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  zone: AlarmZone | null; // The alarm zone to assign devices to
  allDevices: DeviceWithConnector[]; // List of all available devices
  allZones: AlarmZone[]; // List of all alarm zones for looking up zone names
  // Pass store actions directly for simplicity
  assignDeviceAction: (zoneId: string, deviceId: string) => Promise<boolean>;
  removeDeviceAction: (zoneId: string, deviceId: string) => Promise<boolean>;
  // Bulk assignment actions
  bulkAssignDevicesAction: (zoneId: string, deviceIds: string[]) => Promise<boolean>;
  bulkRemoveDevicesAction: (zoneId: string, deviceIds: string[]) => Promise<boolean>;
}

export const AlarmZoneDeviceAssignmentDialog: React.FC<AlarmZoneDeviceAssignmentDialogProps> = ({ 
  isOpen, 
  onOpenChange, 
  zone, 
  allDevices,
  allZones,
  assignDeviceAction,
  removeDeviceAction,
  bulkAssignDevicesAction,
  bulkRemoveDevicesAction,
}) => {
  // Create wrapper functions that bind the zone ID
  const fetchCurrentAssignments = useCallback(async (): Promise<string[]> => {
    if (!zone) return [];
    
    try {
      const response = await fetch(`/api/alarm-zones/${zone.id}/devices`);
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch current assignments');
      }
      // Extract device IDs from the response
      const devices = data.data || [];
      return devices.map((device: DeviceWithConnector) => device.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      throw new Error(message);
    }
  }, [zone]);

  const wrappedAssignDeviceAction = useCallback(async (deviceId: string): Promise<boolean> => {
    if (!zone) return false;
    return assignDeviceAction(zone.id, deviceId);
  }, [zone, assignDeviceAction]);

  const wrappedRemoveDeviceAction = useCallback(async (deviceId: string): Promise<boolean> => {
    if (!zone) return false;
    return removeDeviceAction(zone.id, deviceId);
  }, [zone, removeDeviceAction]);

  const wrappedBulkAssignDevicesAction = useCallback(async (deviceIds: string[]): Promise<boolean> => {
    if (!zone) return false;
    return bulkAssignDevicesAction(zone.id, deviceIds);
  }, [zone, bulkAssignDevicesAction]);

  const wrappedBulkRemoveDevicesAction = useCallback(async (deviceIds: string[]): Promise<boolean> => {
    if (!zone) return false;
    return bulkRemoveDevicesAction(zone.id, deviceIds);
  }, [zone, bulkRemoveDevicesAction]);

  if (!zone) {
    return null;
  }

  return (
    <DeviceAssignmentDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      containerName={zone.name}
      containerType="alarm-zone"
      allDevices={allDevices}
      fetchCurrentAssignments={fetchCurrentAssignments}
      assignDeviceAction={wrappedAssignDeviceAction}
      removeDeviceAction={wrappedRemoveDeviceAction}
      bulkAssignDevicesAction={wrappedBulkAssignDevicesAction}
      bulkRemoveDevicesAction={wrappedBulkRemoveDevicesAction}
    />
  );
}; 