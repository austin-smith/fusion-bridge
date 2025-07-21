import { NextRequest, NextResponse } from 'next/server';
import type { OrganizationAuthContext } from '@/lib/auth/withOrganizationAuth';
import type { ExportOptions, ExportConfig } from '@/lib/export/types';
import { DataExportService } from '@/lib/export/core-export-service';
import { getContentType } from '@/lib/export/utils';

// Generic data fetcher function type
export type DataFetcher<T> = (
  orgContext: OrganizationAuthContext,
  filters: Record<string, any>
) => Promise<T[]>;

// Export handler configuration
export interface ExportHandlerConfig<T> {
  dataFetcher: DataFetcher<T>;
  exportConfig: ExportConfig<T>;
  dataTypeName: string;
}

/**
 * Generic export handler for API routes
 * Handles parameter parsing, data fetching, and export generation
 */
export async function handleExportRequest<T>(
  request: NextRequest,
  authContext: OrganizationAuthContext,
  config: ExportHandlerConfig<T>
): Promise<NextResponse> {
  try {
    const searchParams = request.nextUrl.searchParams;
    
    // Parse export parameters
    const format = searchParams.get('format') as 'csv' | 'xlsx' | 'json';
    const includeMetadata = searchParams.get('includeMetadata') === 'true';
    
    if (!format || !['csv', 'xlsx', 'json'].includes(format)) {
      return NextResponse.json(
        { success: false, error: 'Invalid or missing format parameter' },
        { status: 400 }
      );
    }
    
    // Always export all available columns
    const exportService = new DataExportService(config.exportConfig);
    const columns = config.exportConfig.availableColumns.map(col => col.key);
    
    // Build filters from search parameters
    const filters: Record<string, any> = {};
    searchParams.forEach((value, key) => {
      // Skip export-specific parameters
      if (!['format', 'includeMetadata'].includes(key)) {
        filters[key] = value;
      }
    });
    
    // Fetch data using the provided data fetcher
    console.log(`[ExportHandler] Fetching ${config.dataTypeName} data with filters:`, filters);
    const data = await config.dataFetcher(authContext, filters);
    console.log(`[ExportHandler] Fetched ${data.length} ${config.dataTypeName} records`);
    
    // Generate export
    const exportOptions: ExportOptions = {
      format,
      columns,
      includeMetadata
    };
    
    const exportResult = await exportService.exportForAPI(data, exportOptions, config.dataTypeName);
    
    // Set appropriate headers
    const headers = new Headers();
    headers.set('Content-Type', exportResult.contentType);
    headers.set('Content-Disposition', `attachment; filename="${exportResult.filename}"`);
    headers.set('Content-Length', exportResult.data.length.toString());
    
    return new NextResponse(exportResult.data, {
      status: 200,
      headers
    });
    
  } catch (error) {
    console.error(`[ExportHandler] Error exporting ${config.dataTypeName}:`, error);
    
    // Return appropriate error response
    const errorMessage = error instanceof Error ? error.message : 'Export failed';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * Create a standardized export route handler
 * Returns a function that can be used as the GET handler in API routes
 */
export function createExportHandler<T>(config: ExportHandlerConfig<T>) {
  return async (request: NextRequest, authContext: OrganizationAuthContext) => {
    return handleExportRequest(request, authContext, config);
  };
}

 