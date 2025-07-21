import { utils, write } from "xlsx";
import type { 
  ExportOptions, 
  ExportResult, 
  ExportConfig, 
  DataTransformer, 
  MetadataGenerator,
  ColumnDefinition
} from './types';
import { 
  generateExportFilename,
  getContentType,
  createStandardMetadata
} from './utils';

export class DataExportService<T> {
  private config: ExportConfig<T>;

  constructor(config: ExportConfig<T>) {
    this.config = config;
  }

  /**
   * Export data for API routes (server-side)
   * Returns bytes that can be sent as Response
   */
  async exportForAPI(
    data: T[], 
    options: ExportOptions,
    dataTypeName: string
  ): Promise<ExportResult> {
    const { format, columns } = options;
    const transformedData = this.config.transformer.transform(data, columns);
    const filename = generateExportFilename(dataTypeName, format);
    
    switch (format) {
      case 'csv': {
        const ws = utils.json_to_sheet(transformedData);
        const csv = utils.sheet_to_csv(ws);
        return {
          data: new TextEncoder().encode(csv),
          filename,
          contentType: getContentType('csv')
        };
      }
      
      case 'xlsx': {
        const wb = utils.book_new();
        const ws = utils.json_to_sheet(transformedData);
        
        // Add metadata sheet if requested
        if (options.includeMetadata) {
          const metadataWs = this.createMetadataSheet(data, columns, dataTypeName);
          utils.book_append_sheet(wb, metadataWs, 'Export Info');
        }
        
        utils.book_append_sheet(wb, ws, this.capitalizeDataType(dataTypeName));
        
        const workbookData = write(wb, { 
          bookType: 'xlsx', 
          type: 'array',
          compression: true 
        });
        
        return {
          data: new Uint8Array(workbookData),
          filename,
          contentType: getContentType('xlsx')
        };
      }
      
      case 'json': {
        const exportData = {
          exportedAt: new Date().toISOString(),
          dataType: dataTypeName,
          totalRecords: data.length,
          columns: columns,
          data: transformedData
        };
        const json = JSON.stringify(exportData, null, 2);
        
        return {
          data: new TextEncoder().encode(json),
          filename,
          contentType: getContentType('json')
        };
      }
      
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  /**
   * Export data for client-side (browser download)
   * Triggers direct download using writeFile
   */
  exportForClient(
    data: T[], 
    options: ExportOptions,
    dataTypeName: string
  ): void {
    const { format, columns } = options;
    const transformedData = this.config.transformer.transform(data, columns);
    const filename = generateExportFilename(dataTypeName, format);

    switch (format) {
      case 'csv': {
        const ws = utils.json_to_sheet(transformedData);
        const wb = utils.book_new();
        utils.book_append_sheet(wb, ws, this.capitalizeDataType(dataTypeName));
        
        // Use dynamic import for client-side
        import('xlsx').then(XLSX => {
          XLSX.writeFile(wb, filename, { bookType: 'csv' });
        });
        break;
      }
      
      case 'xlsx': {
        const wb = utils.book_new();
        const ws = utils.json_to_sheet(transformedData);
        
        if (options.includeMetadata) {
          const metadataWs = this.createMetadataSheet(data, columns, dataTypeName);
          utils.book_append_sheet(wb, metadataWs, 'Export Info');
        }
        
        utils.book_append_sheet(wb, ws, this.capitalizeDataType(dataTypeName));
        
        // Use writeFileXLSX for tree-shaken XLSX-only helper
        import('xlsx').then(XLSX => {
          XLSX.writeFileXLSX(wb, filename);
        });
        break;
      }
      
      case 'json': {
        const exportData = {
          exportedAt: new Date().toISOString(),
          dataType: dataTypeName,
          totalRecords: data.length,
          columns: columns,
          data: transformedData
        };
        
        // Manual download for JSON
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { 
          type: 'application/json' 
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        break;
      }
    }
  }

  /**
   * Get available columns for export selection
   */
  getAvailableColumns(): ColumnDefinition[] {
    return this.config.availableColumns;
  }

  /**
   * Validate export parameters against this configuration
   */
  validateExportOptions(options: ExportOptions): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!['csv', 'xlsx', 'json'].includes(options.format)) {
      errors.push(`Invalid format: ${options.format}`);
    }
    
    if (!options.columns.length) {
      errors.push('No columns specified for export');
    }
    
    const availableColumnKeys = this.config.availableColumns.map(col => col.key);
    const invalidColumns = options.columns.filter(col => !availableColumnKeys.includes(col));
    if (invalidColumns.length > 0) {
      errors.push(`Invalid columns: ${invalidColumns.join(', ')}`);
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Create metadata sheet for Excel exports
   */
  private createMetadataSheet(data: T[], columns: string[], dataTypeName: string) {
    const baseMetadata = createStandardMetadata(dataTypeName, data.length, columns);
    
    // Add custom metadata if generator is available
    let customMetadata: Array<[string, string | number]> = [];
    if (this.config.metadataGenerator) {
      customMetadata = this.config.metadataGenerator.generate(data, columns);
    }
    
    // Add column descriptions
    const columnDescriptions = columns.map(col => [
      col, 
      this.config.transformer.getColumnDescription(col)
    ] as [string, string]);
    
    const finalMetadata = [
      ...baseMetadata,
      ...customMetadata,
      ['', ''],
      ['Column Mapping', ''],
      ...columnDescriptions
    ];
    
    return utils.aoa_to_sheet(finalMetadata);
  }

  /**
   * Capitalize data type name for sheet names
   */
  private capitalizeDataType(dataTypeName: string): string {
    return dataTypeName.charAt(0).toUpperCase() + dataTypeName.slice(1);
  }
}