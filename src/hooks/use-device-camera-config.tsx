import { useMemo, useState } from 'react';
import { useFusionStore } from '@/stores/store';
import type { PikoConfig } from '@/services/drivers/piko';
import type { DeviceWithConnector, ConnectorWithConfig } from '@/types';
import { Box } from 'lucide-react';
import { getDeviceTypeIcon } from '@/lib/mappings/presentation';
import { DeviceType } from '@/lib/mappings/definitions';

// Enhanced camera information type
export interface CameraInfo {
  id: string; // Device ID from database
  name: string;
  connectorId: string;
  cameraId: string; // Device identifier for API calls
  pikoSystemId?: string;
  spaceName?: string;
  spaceId?: string;
}

// Video configuration for a specific camera
export interface CameraVideoConfig {
  connectorId: string;
  cameraId: string;
  pikoSystemId?: string;
  positionMs?: number;
}

// Enhanced camera configuration result with multi-camera support
interface CameraConfigResult {
  shouldShowMedia: boolean;
  hasMultipleCameras: boolean;
  cameras: CameraInfo[];
  selectedCameraIndex: number;
  mediaConfig: {
    thumbnailMode: 'live-auto-refresh' | 'static-url';
    thumbnailUrl?: string;
    connectorId?: string;
    cameraId?: string;
    refreshInterval?: number;
    videoConfig: CameraVideoConfig;
    title?: string;
    titleElement?: React.ReactNode;
  } | null;
  // Camera selection controls
  selectCamera: (index: number) => void;
  selectNext: () => void;
  selectPrevious: () => void;
}

// Options for camera configuration
interface CameraConfigOptions {
  // For events with best shot
  bestShotUrlComponents?: {
    type: 'cloud' | 'local';
    pikoSystemId?: string;
    connectorId: string;
    objectTrackId: string;
    cameraId: string;
  };
  // For historical video at specific time
  timestamp?: number;
  // For static thumbnail URL
  staticThumbnailUrl?: string;
  // Space name (already looked up by parent component)
  spaceName?: string | null;
  // Initial camera selection
  initialCameraIndex?: number;
}

// Helper to get Piko system ID for a camera
const getPikoSystemId = (cameraConnectorId: string, connectors: ConnectorWithConfig[]): string | undefined => {
  const connector = connectors.find(c => c.id === cameraConnectorId);
  if (connector?.config) {
    try {
      const pikoConfig = connector.config as PikoConfig;
      if (pikoConfig.type === 'cloud') {
        return pikoConfig.selectedSystem;
      }
    } catch (e) {
      console.error("Error parsing connector config:", e);
    }
  }
  return undefined;
};

// Helper to create consistent title element
const createTitleElement = (cameraName: string, spaceName: string | null) => {
  const CameraIcon = getDeviceTypeIcon(DeviceType.Camera);
  
  return (
    <span className="flex items-center gap-1.5">
      <CameraIcon className="h-3 w-3" />
      {cameraName}
      {spaceName && (
        <>
          <span className="opacity-50">•</span>
          <Box className="h-3 w-3" />
          {spaceName}
        </>
      )}
    </span>
  );
};

// Helper to convert DeviceWithConnector to CameraInfo
const deviceToCameraInfo = (camera: DeviceWithConnector, spaceName?: string, spaceId?: string, connectors?: ConnectorWithConfig[]): CameraInfo => ({
  id: camera.id,
  name: camera.name,
  connectorId: camera.connectorId,
  cameraId: camera.deviceId,
  pikoSystemId: connectors ? getPikoSystemId(camera.connectorId, connectors) : undefined,
  spaceName,
  spaceId
});

/**
 * Enhanced hook for camera configuration with multi-camera support
 * Handles both direct camera devices and space camera associations
 * Provides camera carousel functionality and selection controls
 */
export function useDeviceCameraConfig(
  device: DeviceWithConnector | null,
  options: CameraConfigOptions = {}
): CameraConfigResult {
  // Get store data
  const connectors = useFusionStore((state) => state.connectors);
  const spaces = useFusionStore((state) => state.spaces);
  const allDevices = useFusionStore((state) => state.allDevices);

  // Get all available cameras based on context
  const availableCameras = useMemo(() => {
    const cameras: CameraInfo[] = [];

    // Case 1: Device is a Piko camera itself
    if (device && device.connectorCategory === 'piko' && device.deviceTypeInfo?.type === 'Camera') {
      cameras.push(deviceToCameraInfo(device, options.spaceName || undefined, undefined, connectors));
      return cameras;
    }

    // Case 2: Event has best shot components (for events)
    if (options.bestShotUrlComponents) {
      const cameraDevice = allDevices.find(d => 
        d.connectorId === options.bestShotUrlComponents!.connectorId && 
        d.deviceId === options.bestShotUrlComponents!.cameraId
      );

      if (cameraDevice) {
        const cameraSpace = spaces.find(space => space.deviceIds?.includes(cameraDevice.id));
        cameras.push(deviceToCameraInfo(cameraDevice, cameraSpace?.name, cameraSpace?.id, connectors));
        
        // Also find other cameras in the same space
        if (cameraSpace) {
          const otherSpaceCameras = allDevices.filter(d => 
            cameraSpace.deviceIds?.includes(d.id) &&
            d.connectorCategory === 'piko' && 
            d.deviceTypeInfo?.type === 'Camera' &&
            d.id !== cameraDevice.id // Exclude the current camera
          );

          otherSpaceCameras.forEach(cam => {
            cameras.push(deviceToCameraInfo(cam, cameraSpace.name, cameraSpace.id, connectors));
          });
        }
      }
      return cameras;
    }

    // Case 3: Find space associations (only if we have a device)
    if (!device) {
      return cameras;
    }

    // Find space containing this device
    const deviceSpace = spaces.find(space => space.deviceIds?.includes(device.id));

    if (!deviceSpace) {
      return cameras;
    }

    // Find all Piko cameras in the same space
    const spaceCameras = allDevices.filter(d => 
      deviceSpace.deviceIds?.includes(d.id) &&
      d.connectorCategory === 'piko' && 
      d.deviceTypeInfo?.type === 'Camera'
    );

    spaceCameras.forEach(cam => {
      cameras.push(deviceToCameraInfo(cam, deviceSpace.name, deviceSpace.id, connectors));
    });

    return cameras;
  }, [device, options, allDevices, spaces, connectors]);

  // Camera selection state
  const [selectedCameraIndex, setSelectedCameraIndex] = useState(() => {
    return Math.max(0, Math.min(options.initialCameraIndex || 0, availableCameras.length - 1));
  });

  // Ensure selected index is valid when cameras change
  const validSelectedIndex = useMemo(() => {
    if (availableCameras.length === 0) return 0;
    return Math.max(0, Math.min(selectedCameraIndex, availableCameras.length - 1));
  }, [selectedCameraIndex, availableCameras.length]);

  // Update selected index if it becomes invalid
  if (validSelectedIndex !== selectedCameraIndex) {
    setSelectedCameraIndex(validSelectedIndex);
  }

  // Build media configuration for selected camera
  const mediaConfig = useMemo(() => {
    if (availableCameras.length === 0) {
      return null;
    }

    const selectedCamera = availableCameras[validSelectedIndex];
    
    // Use historical thumbnail if timestamp is provided
    const shouldUseHistoricalThumbnail = Boolean(options.timestamp && options.timestamp > 0);
    
    // For best shot events, use the provided static URL
    const staticThumbnailUrl = options.staticThumbnailUrl || 
      (shouldUseHistoricalThumbnail 
        ? `/api/piko/device-thumbnail?connectorId=${selectedCamera.connectorId}&cameraId=${selectedCamera.cameraId}&timestamp=${options.timestamp}`
        : undefined);

    return {
      thumbnailMode: (options.staticThumbnailUrl || shouldUseHistoricalThumbnail) ? 'static-url' as const : 'live-auto-refresh' as const,
      thumbnailUrl: staticThumbnailUrl,
      connectorId: selectedCamera.connectorId,
      cameraId: selectedCamera.cameraId,
      refreshInterval: (options.staticThumbnailUrl || shouldUseHistoricalThumbnail) ? undefined : 10000,
      videoConfig: {
        connectorId: selectedCamera.connectorId,
        cameraId: selectedCamera.cameraId,
        pikoSystemId: selectedCamera.pikoSystemId,
        positionMs: options.timestamp || undefined
      },
      title: undefined,
      titleElement: createTitleElement(selectedCamera.name, selectedCamera.spaceName || null)
    };
  }, [availableCameras, validSelectedIndex, options]);

  // Camera selection controls
  const selectCamera = (index: number) => {
    if (index >= 0 && index < availableCameras.length) {
      setSelectedCameraIndex(index);
    }
  };

  const selectNext = () => {
    setSelectedCameraIndex((prev) => (prev + 1) % availableCameras.length);
  };

  const selectPrevious = () => {
    setSelectedCameraIndex((prev) => 
      prev === 0 ? availableCameras.length - 1 : prev - 1);
  };

  return {
    shouldShowMedia: availableCameras.length > 0,
    hasMultipleCameras: availableCameras.length > 1,
    cameras: availableCameras,
    selectedCameraIndex: validSelectedIndex,
    mediaConfig,
    selectCamera,
    selectNext,
    selectPrevious
  };
} 