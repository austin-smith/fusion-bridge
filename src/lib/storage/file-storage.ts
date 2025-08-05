import { mkdir, writeFile, unlink, access, stat } from 'fs/promises';
import { join, extname } from 'path';
import { createReadStream } from 'fs';
import { randomUUID } from 'crypto';
import { getStorageConfig, getFloorPlanStoragePath } from './config';

export interface FloorPlanData {
  filename: string;           // Original filename (for display)
  uploadedAt: string;         // ISO timestamp  
  uploadedByUserId: string;   // User who uploaded the file
  size: number;              // File size in bytes
  contentType: string;       // MIME type
  filePath: string;          // Relative file path from storage root
}

export interface SaveFileResult {
  floorPlanData: FloorPlanData;
  internalFilename: string;   // Internal storage filename (UUID-based)
}

export interface FileMetadata {
  filename: string;
  size: number;
  uploadedAt: Date;
  contentType: string;
}

export class FileStorageService {
  private config = getStorageConfig();

  /**
   * Ensure directory exists, create if it doesn't
   */
  private async ensureDirectory(dirPath: string): Promise<void> {
    try {
      await access(dirPath);
    } catch {
      await mkdir(dirPath, { recursive: true });
    }
  }

  /**
   * Generate internal filename using UUID + extension
   */
  private generateInternalFilename(originalFilename: string): string {
    const ext = extname(originalFilename);
    return `${randomUUID()}${ext}`;
  }

  /**
   * Get content type from file extension
   */
  private getContentTypeFromExtension(filename: string): string {
    const ext = extname(filename).toLowerCase();
    
    switch (ext) {
      case '.png': return 'image/png';
      case '.jpg':
      case '.jpeg': return 'image/jpeg';
      case '.pdf': return 'application/pdf';
      case '.svg': return 'image/svg+xml';
      default: return 'application/octet-stream';
    }
  }

  /**
   * Extract internal filename from floor plan file path
   */
  private getInternalFilenameFromPath(filePath: string): string {
    // filePath format: "orgId/floor-plans/locationId/uuid.ext"
    const parts = filePath.split('/');
    if (parts.length !== 4 || parts[1] !== 'floor-plans') {
      throw new Error('Invalid floor plan file path format');
    }
    return parts[3]; // The filename part
  }

  /**
   * Validate file type and size
   */
  private validateFile(file: File): void {
    // Size validation
    if (file.size > this.config.maxFileSize) {
      throw new Error(`File size exceeds ${this.config.maxFileSize / (1024 * 1024)}MB limit`);
    }

    // Type validation
    if (!this.config.allowedTypes.includes(file.type)) {
      throw new Error(`File type ${file.type} is not allowed`);
    }

    // Extension validation (backup check)
    const ext = extname(file.name).toLowerCase();
    if (!this.config.allowedExtensions.includes(ext)) {
      throw new Error(`File extension ${ext} is not allowed`);
    }
  }

  /**
   * Save floor plan file for a location
   */
  async saveFloorPlan(
    organizationId: string,
    locationId: string,
    file: File,
    userId: string
  ): Promise<SaveFileResult> {
    // Validate file
    this.validateFile(file);

    // Get storage directory
    const storageDir = getFloorPlanStoragePath(organizationId, locationId);
    await this.ensureDirectory(storageDir);

    // Generate internal filename (UUID-based)
    const internalFilename = this.generateInternalFilename(file.name);
    const filePath = join(storageDir, internalFilename);

    // Convert File to Buffer and save
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);

    // Get file stats
    const stats = await stat(filePath);
    const uploadedAt = new Date();

    // Create relative file path from storage root
    const relativeFilePath = join(organizationId, 'floor-plans', locationId, internalFilename);

    // Create floor plan data object
    const floorPlanData: FloorPlanData = {
      filename: file.name, // Original filename for display
      uploadedAt: uploadedAt.toISOString(),
      uploadedByUserId: userId,
      size: stats.size,
      contentType: file.type || this.getContentTypeFromExtension(file.name),
      filePath: relativeFilePath
    };

    return {
      floorPlanData,
      internalFilename
    };
  }

  /**
   * Delete floor plan file using internal filename
   */
  async deleteFloorPlan(
    organizationId: string,
    locationId: string,
    internalFilename: string
  ): Promise<boolean> {
    try {
      const storageDir = getFloorPlanStoragePath(organizationId, locationId);
      const filePath = join(storageDir, internalFilename);
      
      await unlink(filePath);
      return true;
    } catch (error) {
      console.error('Error deleting floor plan file:', error);
      return false;
    }
  }

  /**
   * Delete floor plan using FloorPlanData object
   */
  async deleteFloorPlanFromData(
    organizationId: string,
    locationId: string,
    floorPlanData: FloorPlanData
  ): Promise<boolean> {
    const internalFilename = this.getInternalFilenameFromPath(floorPlanData.filePath);
    return this.deleteFloorPlan(organizationId, locationId, internalFilename);
  }

  /**
   * Get file stream for serving
   */
  async getFloorPlanStream(
    organizationId: string,
    locationId: string,
    filename: string
  ): Promise<{ stream: NodeJS.ReadableStream; metadata: FileMetadata }> {
    const storageDir = getFloorPlanStoragePath(organizationId, locationId);
    const filePath = join(storageDir, filename);

    // Check if file exists
    try {
      await access(filePath);
    } catch {
      throw new Error('Floor plan file not found');
    }

    // Get file stats
    const stats = await stat(filePath);
    
    // Determine content type from extension
    const contentType = this.getContentTypeFromExtension(filename);

    return {
      stream: createReadStream(filePath),
      metadata: {
        filename,
        size: stats.size,
        uploadedAt: stats.mtime,
        contentType
      }
    };
  }

  /**
   * Check if floor plan exists
   */
  async floorPlanExists(
    organizationId: string,
    locationId: string,
    filename: string
  ): Promise<boolean> {
    try {
      const storageDir = getFloorPlanStoragePath(organizationId, locationId);
      const filePath = join(storageDir, filename);
      await access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

// Export singleton instance
export const fileStorage = new FileStorageService();