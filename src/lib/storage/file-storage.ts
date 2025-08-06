import { mkdir, writeFile, unlink, access, stat } from 'fs/promises';
import { join, extname } from 'path';
import { createReadStream, type ReadStream } from 'fs';
import { randomUUID } from 'crypto';
import { getStorageConfig, getFloorPlanStoragePath } from './config';
import { validateFloorPlanFile } from './file-validation';

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
   * Validate ID parameter to prevent path traversal attacks
   */
  private validateId(id: string, paramName: string): void {
    if (!id || typeof id !== 'string') {
      throw new Error(`Invalid ${paramName}: must be a non-empty string`);
    }

    // Check for path traversal sequences
    if (id.includes('..') || id.includes('/') || id.includes('\\')) {
      throw new Error(`Invalid ${paramName}: contains illegal path characters`);
    }

    // Check for null bytes and other dangerous characters
    if (/[\x00-\x1f\x7f-\x9f]/.test(id)) {
      throw new Error(`Invalid ${paramName}: contains control characters`);
    }

    // Ensure ID contains only safe characters (alphanumeric, hyphens)
    const safeIdRegex = /^[a-zA-Z0-9-]+$/;
    if (!safeIdRegex.test(id)) {
      throw new Error(`Invalid ${paramName}: must contain only alphanumeric characters and hyphens`);
    }
  }

  /**
   * Validate filename parameter to prevent path traversal attacks
   */
  private validateFilename(filename: string): void {
    if (!filename || typeof filename !== 'string') {
      throw new Error('Invalid filename: must be a non-empty string');
    }

    // Check for path traversal sequences
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      throw new Error('Invalid filename: contains illegal path characters');
    }

    // Check for null bytes and other dangerous characters
    if (/[\x00-\x1f\x7f-\x9f]/.test(filename)) {
      throw new Error('Invalid filename: contains control characters');
    }

    // Ensure it looks like a UUID-based filename with safe extension
    const uuidFilenameRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|jpeg|pdf|svg)$/i;
    if (!uuidFilenameRegex.test(filename)) {
      throw new Error('Invalid filename: must be a UUID-based filename with a safe extension (png, jpg, jpeg, pdf, svg)');
    }
  }

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
    // filePath format: "orgId/floor-plans/locationId/floorPlanId/uuid.ext"
    const parts = filePath.split('/');
    if (parts.length !== 5 || parts[1] !== 'floor-plans') {
      throw new Error('Invalid floor plan file path format');
    }
    return parts[4]; // The filename part
  }

  /**
   * Validate file using shared validation logic
   */
  private validateFile(file: File): void {
    const validation = validateFloorPlanFile(file);
    if (!validation.isValid) {
      throw new Error(validation.errors.join(', '));
    }
  }

  /**
   * Save floor plan file
   */
  async saveFloorPlan(
    organizationId: string,
    locationId: string,
    floorPlanId: string,
    file: File,
    userId: string
  ): Promise<SaveFileResult> {
    // Validate input parameters for security
    this.validateId(organizationId, 'organizationId');
    this.validateId(locationId, 'locationId');
    this.validateId(floorPlanId, 'floorPlanId');
    this.validateId(userId, 'userId');

    // Validate file
    this.validateFile(file);

    // Get storage directory with floor plan ID
    const storageDir = getFloorPlanStoragePath(organizationId, locationId, floorPlanId);
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
    const relativeFilePath = join(organizationId, 'floor-plans', locationId, floorPlanId, internalFilename);

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
   * Delete floor plan file
   */
  async deleteFloorPlan(
    organizationId: string,
    locationId: string,
    floorPlanId: string,
    internalFilename: string
  ): Promise<void> {
    // Validate input parameters for security
    this.validateId(organizationId, 'organizationId');
    this.validateId(locationId, 'locationId');
    this.validateId(floorPlanId, 'floorPlanId');
    this.validateFilename(internalFilename);

    try {
      const storageDir = getFloorPlanStoragePath(organizationId, locationId, floorPlanId);
      const filePath = join(storageDir, internalFilename);
      
      await unlink(filePath);
    } catch (error) {
      console.error('Error deleting floor plan file:', error);
      throw new Error(`Failed to delete floor plan file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Delete floor plan using FloorPlanData object
   */
  async deleteFloorPlanFromData(
    organizationId: string,
    locationId: string,
    floorPlanId: string,
    floorPlanData: FloorPlanData
  ): Promise<void> {
    const internalFilename = this.getInternalFilenameFromPath(floorPlanData.filePath);
    await this.deleteFloorPlan(organizationId, locationId, floorPlanId, internalFilename);
  }

  /**
   * Get file stream for serving
   */
  async getFloorPlanStream(
    organizationId: string,
    locationId: string,
    floorPlanId: string,
    filename: string
  ): Promise<{ stream: ReadStream; metadata: FileMetadata }> {
    // Validate input parameters for security
    this.validateId(organizationId, 'organizationId');
    this.validateId(locationId, 'locationId');
    this.validateId(floorPlanId, 'floorPlanId');
    this.validateFilename(filename);

    const storageDir = getFloorPlanStoragePath(organizationId, locationId, floorPlanId);
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
    floorPlanId: string,
    filename: string
  ): Promise<boolean> {
    // Validate input parameters for security
    this.validateId(organizationId, 'organizationId');
    this.validateId(locationId, 'locationId');
    this.validateId(floorPlanId, 'floorPlanId');
    this.validateFilename(filename);

    try {
      const storageDir = getFloorPlanStoragePath(organizationId, locationId, floorPlanId);
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