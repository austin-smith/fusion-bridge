import { join } from 'path';
import { homedir } from 'os';

export interface StorageConfig {
  baseDir: string;
  maxFileSize: number;
  allowedTypes: string[];
  allowedExtensions: string[];
}

export function getStorageConfig(): StorageConfig {
  // Detect environment
  const isRailway = !!process.env.RAILWAY_ENVIRONMENT;
  
  let baseDir: string;
  
  if (isRailway) {
    // Railway production - use mounted volume
    baseDir = '/storage';
  } else {
    // Local development - use ~/.fusion-bridge/uploads
    baseDir = join(homedir(), '.fusion-bridge', 'storage');
  }
  
  return {
    baseDir,
    maxFileSize: 5 * 1024 * 1024, // 5MB
    allowedTypes: [
      'image/png',
      'image/jpeg', 
      'image/jpg',
      'application/pdf',
      'image/svg+xml'
    ],
    allowedExtensions: ['.png', '.jpg', '.jpeg', '.pdf', '.svg']
  };
}

export function getFloorPlanStoragePath(organizationId: string, locationId: string): string {
  const config = getStorageConfig();
  return join(config.baseDir, organizationId, 'floor-plans', locationId);
}