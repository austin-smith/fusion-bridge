export interface FileValidationResult {
  isValid: boolean;
  errors: string[];
}

export function validateFloorPlanFile(file: File): FileValidationResult {
  const errors: string[] = [];
  
  // Size validation (5MB)
  const maxSize = 5 * 1024 * 1024;
  if (file.size > maxSize) {
    errors.push(`File size must be less than ${maxSize / (1024 * 1024)}MB`);
  }
  
  // Type validation
  const allowedTypes = [
    'image/png',
    'image/jpeg',
    'application/pdf',
    'image/svg+xml'
  ];
  
  if (!allowedTypes.includes(file.type)) {
    errors.push('File must be PNG, JPG, PDF, or SVG format');
  }
  
  // Extension validation (backup check)
  const allowedExtensions = ['.png', '.jpg', '.jpeg', '.pdf', '.svg'];
  const fileExtension = file.name.split('.').pop()?.toLowerCase();
  
  if (!fileExtension || !allowedExtensions.includes(`.${fileExtension}`)) {
    errors.push('File must have a valid extension (.png, .jpg, .jpeg, .pdf, .svg)');
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
  const dangerousChars = /[<>:"/\\|?*\x00-\x1f]/;
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
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, '_')
    .substring(0, 100);
}