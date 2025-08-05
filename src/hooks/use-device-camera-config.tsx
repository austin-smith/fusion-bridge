import { useMemo } from 'react';
import { useFusionStore } from '@/stores/store';
import type { PikoConfig } from '@/services/drivers/piko';
import type { DeviceWithConnector } from '@/types';
import { Box } from 'lucide-react';
import { getDeviceTypeIcon } from '@/lib/mappings/presentation';
import { DeviceType } from '@/lib/mappings/definitions';

interface CameraConfigResult {
  shouldShowMedia: boolean;
  mediaConfig: {
    thumbnailMode: 'live-auto-refresh' | 'static-url';
    thumbnailUrl?: string;
    connectorId?: string;
    cameraId?: string;
    refreshInterval?: number;
    videoConfig: {
      connectorId: string;
      cameraId: string;
      pikoSystemId?: string;
      positionMs?: number;
    };
    title?: string;
    titleElement?: React.ReactNode;
  } | null;
}

/**
 * Custom hook to find camera configuration for a device
 * Handles both direct camera devices and space camera associations
 */
export function useDeviceCameraConfig(
  device: DeviceWithConnector | null,
  options: {
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
  } = {}
): CameraConfigResult {
  // Get store data
  const connectors = useFusionStore((state) => state.connectors);
  const spaces = useFusionStore((state) => state.spaces);
  const allDevices = useFusionStore((state) => state.allDevices);

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

  return useMemo(() => {
    // Case 1: Device is a Piko camera itself
    if (device && device.connectorCategory === 'piko' && device.deviceTypeInfo?.type === 'Camera') {
      // Get the device's system ID
      let pikoSystemIdForVideo: string | undefined = undefined;
      const connector = connectors.find(c => c.id === device.connectorId);
      if (connector?.config) {
        try {
          const pikoConfig = connector.config as PikoConfig;
          if (pikoConfig.type === 'cloud') {
            pikoSystemIdForVideo = pikoConfig.selectedSystem;
          }
        } catch (e) {
          console.error("Error parsing connector config:", e);
        }
      }

      return {
        shouldShowMedia: true,
        mediaConfig: {
          thumbnailMode: options.staticThumbnailUrl ? 'static-url' : 'live-auto-refresh',
          thumbnailUrl: options.staticThumbnailUrl,
          connectorId: device.connectorId,
          cameraId: device.deviceId,
          refreshInterval: 10000,
          videoConfig: {
            connectorId: device.connectorId,
            cameraId: device.deviceId,
            pikoSystemId: pikoSystemIdForVideo,
            positionMs: options.timestamp || undefined
          },
          title: undefined,
          titleElement: createTitleElement(device.name, options.spaceName || null)
        }
      };
    }

    // Case 2: Event has best shot components (for events)
    if (options.bestShotUrlComponents) {
      // Find the camera device object
      const cameraDevice = allDevices.find(d => 
        d.connectorId === options.bestShotUrlComponents!.connectorId && 
        d.deviceId === options.bestShotUrlComponents!.cameraId
      );

      if (!cameraDevice) {
        return { shouldShowMedia: false, mediaConfig: null };
      }

      // For best shot events, find the camera's space since it might be different from the event device's space
      const cameraSpace = spaces.find(space => space.deviceIds?.includes(cameraDevice.id));

      return {
        shouldShowMedia: true,
        mediaConfig: {
          thumbnailMode: 'static-url',
          thumbnailUrl: options.staticThumbnailUrl,
          videoConfig: {
            connectorId: cameraDevice.connectorId,
            cameraId: cameraDevice.deviceId,
            pikoSystemId: options.bestShotUrlComponents.type === 'cloud' ? options.bestShotUrlComponents.pikoSystemId : undefined,
            positionMs: options.timestamp || undefined
          },
          title: undefined,
          titleElement: createTitleElement(cameraDevice.name, cameraSpace?.name || null)
        }
      };
    }

    // Case 3: Find space associations (only if we have a device)
    if (!device) {
      return { shouldShowMedia: false, mediaConfig: null };
    }

    // Find space containing this device
    const deviceSpace = spaces.find(space => space.deviceIds?.includes(device.id));

    // Find Piko cameras in the same space ONLY
    if (!deviceSpace) {
      return { shouldShowMedia: false, mediaConfig: null };
    }

    const spaceCameras = allDevices.filter(d => 
      deviceSpace.deviceIds?.includes(d.id) &&
      d.connectorCategory === 'piko' && 
      d.deviceTypeInfo?.type === 'Camera'
    );

    if (spaceCameras.length === 0) {
      return { shouldShowMedia: false, mediaConfig: null };
    }

    // Use first available space camera
    const associatedCamera = spaceCameras[0];
    
    // Get the associated camera's system ID
    let associatedCameraPikoSystemId: string | undefined = undefined;
    const associatedCameraConnector = connectors.find(c => c.id === associatedCamera.connectorId);
    if (associatedCameraConnector?.config) {
      try {
        const associatedCameraPikoConfig = associatedCameraConnector.config as PikoConfig;
        if (associatedCameraPikoConfig.type === 'cloud') {
          associatedCameraPikoSystemId = associatedCameraPikoConfig.selectedSystem;
        }
      } catch (e) {
        console.error("Error parsing associated camera connector config:", e);
      }
    }
    
    // Use historical thumbnail if timestamp is provided
    const shouldUseHistoricalThumbnail = Boolean(options.timestamp && options.timestamp > 0);
    
    // Generate static thumbnail URL for historical events
    const staticThumbnailUrl = shouldUseHistoricalThumbnail 
      ? `/api/piko/device-thumbnail?connectorId=${associatedCamera.connectorId}&cameraId=${associatedCamera.deviceId}&timestamp=${options.timestamp}`
      : undefined;

    return {
      shouldShowMedia: true,
      mediaConfig: {
        thumbnailMode: shouldUseHistoricalThumbnail ? 'static-url' : 'live-auto-refresh',
        thumbnailUrl: staticThumbnailUrl,
        connectorId: associatedCamera.connectorId,
        cameraId: associatedCamera.deviceId,
        refreshInterval: shouldUseHistoricalThumbnail ? undefined : 10000,
        videoConfig: {
          connectorId: associatedCamera.connectorId,
          cameraId: associatedCamera.deviceId,
          pikoSystemId: associatedCameraPikoSystemId,
          positionMs: options.timestamp || undefined
        },
        title: undefined,
        titleElement: createTitleElement(associatedCamera.name, deviceSpace.name)
      }
    };
  }, [device, options, connectors, spaces, allDevices]);
} 