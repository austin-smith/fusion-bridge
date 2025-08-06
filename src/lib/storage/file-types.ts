/**
 * Centralized file type mappings for floor plan uploads
 * This ensures consistency between validation and storage services
 */

export const FILE_TYPE_MAPPINGS = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.pdf': 'application/pdf',
  '.svg': 'image/svg+xml'
} as const;

// Derived arrays for type checking and validation
export const ALLOWED_EXTENSIONS = Object.keys(FILE_TYPE_MAPPINGS);
export const ALLOWED_FILE_TYPES = [...new Set(Object.values(FILE_TYPE_MAPPINGS))];

/**
 * Get content type from file extension
 */
export function getContentTypeFromExtension(filename: string): string {
  const ext = filename.toLowerCase().match(/\.[^.]*$/)?.[0];
  if (!ext) return 'application/octet-stream';
  
  return FILE_TYPE_MAPPINGS[ext as keyof typeof FILE_TYPE_MAPPINGS] || 'application/octet-stream';
}