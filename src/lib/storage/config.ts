import { join } from 'path';
import { homedir } from 'os';

const LOCAL_APP_DIR = '.fusion-bridge';

export interface StorageConfig {
  baseDir: string;
  maxFileSize: number;
  allowedTypes: string[];
  allowedExtensions: string[];
}

export function getStorageConfig(): StorageConfig {
  const storageDir = process.env.STORAGE_DIR;
  
  if (!storageDir) {
    throw new Error('STORAGE_DIR environment variable is not set');
  }
  
  // If it's an absolute path, use as-is, otherwise resolve based on environment
  let baseDir: string;
  if (storageDir.startsWith('/')) {
    // Absolute path - use as-is (Railway with mounted volume)
    baseDir = storageDir;
  } else {
    // Directory name - resolve based on environment
    if (process.env.RAILWAY_ENVIRONMENT) {
      baseDir = `//${storageDir}`;  // Railway: //storage
    } else {
      baseDir = join(homedir(), LOCAL_APP_DIR, storageDir);  // Local: ~/.fusion-bridge/storage
    }
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