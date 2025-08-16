export interface NormalizedRoi {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ZoomWindow {
  id: string;
  sourceDeviceId: string;
  connectorId: string;
  cameraId: string;
  roi: NormalizedRoi;
}
