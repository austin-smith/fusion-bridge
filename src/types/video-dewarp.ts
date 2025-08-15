export type LensModel = 'equidistant' | 'equisolid' | 'orthographic' | 'stereographic';

export interface DewarpSettings {
  lensModel: LensModel;
  // Lens intrinsics in source pixel space
  cx?: number;
  cy?: number;
  focalPx?: number;
  // View parameters (degrees)
  fovDeg: number;
  yawDeg: number;
  pitchDeg: number;
  rollDeg: number;
}

export interface DewarpProps {
  enabled: boolean;
  settings: DewarpSettings;
}



