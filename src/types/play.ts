export interface PlayGridLayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  static?: boolean;
}

import type { DewarpSettings } from '@/types/video-dewarp';
import type { NormalizedRoi } from '@/types/zoom-window';

export type HeaderStyle = 'standard' | 'overlay' | 'overlay-hover';

export interface CameraTileConfig {
  type: 'camera';
  deviceId: string;
  dewarp?: {
    enabled: boolean;
    settings: DewarpSettings;
  };
}

export interface ZoomTileConfig {
  type: 'zoom';
  sourceDeviceId: string;
  connectorId: string;
  cameraId: string;
  roi: NormalizedRoi;
}

export type TileConfig = CameraTileConfig | ZoomTileConfig;

export interface PlayLayout {
  id: string;
  name: string;
  deviceIds: string[];
  items: PlayGridLayoutItem[];
  tileConfigs?: Record<string, TileConfig>;
  createdByUserId?: string;
  updatedByUserId?: string;
}


