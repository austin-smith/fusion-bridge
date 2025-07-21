export interface ExportOptions {
  format: 'csv' | 'xlsx' | 'json';
  columns: string[];
  includeMetadata?: boolean;
}

export interface ExportResult {
  data: Uint8Array;
  filename: string;
  contentType: string;
}

export interface ColumnDefinition {
  key: string;
  label: string;
  description: string;
  required?: boolean;
}

export interface DataTransformer<T> {
  transform(data: T[], columns: string[]): Record<string, any>[];
  getColumnDescription(column: string): string;
}

export interface MetadataGenerator<T> {
  generate(data: T[], columns: string[]): Array<[string, string | number]>;
}

export interface ExportConfig<T> {
  availableColumns: ColumnDefinition[];
  transformer: DataTransformer<T>;
  metadataGenerator?: MetadataGenerator<T>;
}

export interface ExportButtonProps<T> {
  currentData: T[];
  filterParams: URLSearchParams;
  dataTypeName: string;
  disabled?: boolean;
}



export interface ExportApiResponse {
  success: boolean;
  error?: string;
  // Response will be binary data for successful exports
}

export type ExportFormat = 'csv' | 'xlsx' | 'json';

export interface ExportState {
  isExporting: boolean;
  progress?: number;
  error?: string;
} 