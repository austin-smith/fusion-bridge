/**
 * Generate a standardized filename for exports
 */
export function generateExportFilename(
  dataType: string, 
  format: string, 
  timestamp?: Date
): string {
  const date = timestamp || new Date();
  const dateString = date.toISOString().split('T')[0];
  return `${dataType}-${dateString}.${format}`;
}

/**
 * Parse content disposition header to extract filename
 */
export function parseFilenameFromContentDisposition(
  contentDisposition: string | null,
  fallbackFilename: string
): string {
  if (!contentDisposition) {
    return fallbackFilename;
  }
  
  const filenameMatch = contentDisposition.match(/filename="(.+)"/);
  return filenameMatch ? filenameMatch[1] : fallbackFilename;
}

/**
 * Trigger browser download for blob data
 */
export function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Build export URL with parameters
 */
export function buildExportUrl(
  baseEndpoint: string,
  format: string,
  includeMetadata: boolean,
  filterParams: URLSearchParams
): URL {
  const exportUrl = new URL(baseEndpoint, window.location.origin);
  
  // Set export-specific parameters
  exportUrl.searchParams.set('format', format);
  exportUrl.searchParams.set('includeMetadata', includeMetadata.toString());
  
  // Append filter parameters
  filterParams.forEach((value, key) => {
    exportUrl.searchParams.set(key, value);
  });
  
  return exportUrl;
}

/**
 * Get appropriate MIME type for export format
 */
export function getContentType(format: string): string {
  switch (format) {
    case 'csv':
      return 'text/csv';
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'json':
      return 'application/json';
    default:
      return 'application/octet-stream';
  }
}



/**
 * Create standardized export metadata
 */
export function createStandardMetadata(
  dataType: string,
  dataCount: number,
  columns: string[],
  customMetadata?: Array<[string, string | number]>
): Array<[string, string | number]> {
  const metadata: Array<[string, string | number]> = [
    ['Export Information', ''],
    ['Data Type', dataType],
    ['Generated At', new Date().toISOString()],
    ['Total Records', dataCount],
    ['Exported Columns', columns.join(', ')],
  ];
  
  if (customMetadata) {
    metadata.push(['', '']);
    metadata.push(['Additional Information', '']);
    metadata.push(...customMetadata);
  }
  
  metadata.push(['', '']);
  metadata.push(['Column Descriptions', '']);
  
  return metadata;
} 