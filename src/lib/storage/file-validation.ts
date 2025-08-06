import { ALLOWED_FILE_TYPES, ALLOWED_EXTENSIONS } from './file-types';

export interface FileValidationResult {
  isValid: boolean;
  errors: string[];
}

export function validateFloorPlanFile(file: File): FileValidationResult {
  const errors: string[] = [];
  
  // Size validation (5MB)
  const maxSize = 5 * 1024 * 1024;
  if (file.size > maxSize) {
    errors.push(`File size must be less than ${(maxSize / (1024 * 1024)).toFixed(0)}MB`);
  }
  
  // Type validation
  if (!ALLOWED_FILE_TYPES.includes(file.type as any)) {
    errors.push('File must be PNG, JPG, PDF, or SVG format');
  }
  
  // Extension validation (backup check)
  const fileExtension = file.name.split('.').pop()?.toLowerCase();
  
  if (!fileExtension || !ALLOWED_EXTENSIONS.includes(`.${fileExtension}` as any)) {
    errors.push(`File must have a valid extension (${ALLOWED_EXTENSIONS.join(', ')})`);
  }
  
  // Filename validation
  if (file.name.length > 255) {
    errors.push('Filename is too long (max 255 characters)');
  }
  
  // Empty file check
  if (file.size === 0) {
    errors.push('File cannot be empty');
  }
  
  // Filename safety check
  const dangerousChars = /[<>:"/\\|?*%&\x00-\x1f]|%[0-9A-Fa-f]{2}/;
  if (dangerousChars.test(file.name)) {
    errors.push('Filename contains invalid characters');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

export function sanitizeFilename(filename: string): string {
  // Remove dangerous characters and limit length
  return filename
    .replace(/[<>:"/\\|?*%&\x00-\x1f]/g, '_')
    .replace(/%[0-9A-Fa-f]{2}/g, '_')
    .replace(/\s+/g, '_')
    .substring(0, 100);
}