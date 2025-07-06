import { NextRequest, NextResponse } from 'next/server';
import { withOrganizationAuth, type OrganizationAuthContext } from '@/lib/auth/withOrganizationAuth';
import { createOrgScopedDb } from '@/lib/db/org-scoped-db';
import { interpretEventQuery } from '@/services/drivers/openai';
import { NaturalLanguageQueryExecutor } from '@/services/natural-language-query-executor';
import type { 
  QueryContext, 
  QueryInterpretationRequest,
  QueryResults 
} from '@/types/ai/natural-language-query-types';
import { OpenAIConfigSchema } from '@/types/ai/openai-service-types';
import { getOpenAIConfiguration } from '@/data/repositories/service-configurations';
import { EVENT_TYPE_DISPLAY_MAP, EVENT_CATEGORY_DISPLAY_MAP } from '@/lib/mappings/definitions';

/**
 * POST /api/events/natural-query
 * 
 * Processes natural language queries about events, device status, and analytics
 */
export const POST = withOrganizationAuth(async (
  request: NextRequest,
  authContext: OrganizationAuthContext
) => {
  const { organizationId } = authContext;

  try {
    // Parse request body
    const body = await request.json();
    const { query: userQuery } = body;

    // Validate input
    if (!userQuery || typeof userQuery !== 'string' || userQuery.trim().length === 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: {
            type: 'invalid_input',
            message: 'Query text is required and must be a non-empty string'
          }
        },
        { status: 400 }
      );
    }

    if (userQuery.length > 1000) {
      return NextResponse.json(
        { 
          success: false, 
          error: {
            type: 'invalid_input',
            message: 'Query text must be less than 1000 characters'
          }
        },
        { status: 400 }
      );
    }

    console.log(`[Natural Query API] Processing query for org ${organizationId}: "${userQuery.substring(0, 100)}..."`);

    // Get OpenAI configuration
    const openaiConfig = await getOpenAIConfiguration();
    if (!openaiConfig || !openaiConfig.isEnabled || !openaiConfig.apiKey) {
      return NextResponse.json(
        { 
          success: false, 
          error: {
            type: 'service_unavailable',
            message: 'OpenAI service is not configured or disabled. Please configure OpenAI in settings.'
          }
        },
        { status: 503 }
      );
    }

    // Build context for OpenAI interpretation
    const context = await buildQueryContext(organizationId);
    
    // Interpret the query using OpenAI
    const interpretationResponse = await interpretEventQuery(
      openaiConfig.apiKey,
      userQuery,
      context,
      openaiConfig.model,
      openaiConfig.maxTokens,
      openaiConfig.temperature,
      openaiConfig.topP
    );

    if (!interpretationResponse.success || !interpretationResponse.interpretedQuery) {
      console.error('[Natural Query API] OpenAI interpretation failed:', interpretationResponse.error);
      return NextResponse.json(
        { 
          success: false, 
          error: {
            type: 'interpretation_failed',
            message: interpretationResponse.error?.message || 'Failed to understand your query. Please try rephrasing.',
            details: interpretationResponse.error
          }
        },
        { status: 400 }
      );
    }

    const interpretation = interpretationResponse.interpretedQuery;
    console.log(`[Natural Query API] OpenAI interpreted query as: "${interpretation.interpretation}" (confidence: ${interpretation.confidence})`);

    // Execute the interpreted query
    const executor = new NaturalLanguageQueryExecutor(organizationId);
    const results = await executor.executeQuery(interpretation);

    console.log(`[Natural Query API] Query executed successfully. Found ${results.totalResults} results in ${results.executionTime}ms`);

    // Return successful response
    return NextResponse.json({
      success: true,
      data: {
        interpretation: interpretation.interpretation,
        queryType: interpretation.queryType,
        confidence: interpretation.confidence,
        ambiguities: interpretation.ambiguities,
        suggestions: interpretation.suggestions,
        results: results,
        usage: interpretationResponse.usage
      }
    });

  } catch (error) {
    console.error('[Natural Query API] Unexpected error:', error);
    
    // Return generic error response
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    return NextResponse.json(
      { 
        success: false, 
        error: {
          type: 'execution_failed',
          message: `Failed to process query: ${errorMessage}`
        }
      },
      { status: 500 }
    );
  }
});

/**
 * Builds the context object needed for OpenAI query interpretation
 */
async function buildQueryContext(organizationId: string): Promise<QueryContext> {
  const orgDb = createOrgScopedDb(organizationId);
  
  try {
    // Fetch organization data in parallel
    const [devices, locations, areas] = await Promise.all([
      orgDb.devices.findAll(),
      orgDb.locations.findAll(),
      orgDb.areas.findAll()
    ]);

    // Transform devices for context
    const contextDevices = devices.map(device => ({
      id: device.id,
      name: device.name || 'Unknown Device',
      type: device.type,
      connectorCategory: device.connector.category
    }));

    // Transform locations for context (include hierarchical path)
    const contextLocations = locations.map(location => ({
      id: location.id,
      name: location.name,
      path: location.path
    }));

    // Transform areas for context (include location name if available)
    const contextAreas = areas.map(area => {
      const location = locations.find(loc => loc.id === area.locationId);
      return {
        id: area.id,
        name: area.name,
        locationName: location?.name
      };
    });

    // Get available event types and categories
    const eventTypes = Object.values(EVENT_TYPE_DISPLAY_MAP);
    const eventCategories = Object.values(EVENT_CATEGORY_DISPLAY_MAP);

    return {
      devices: contextDevices,
      locations: contextLocations,
      areas: contextAreas,
      eventTypes,
      eventCategories,
      currentTime: new Date(),
      organizationId
    };
  } catch (error) {
    console.error('[Natural Query API] Error building context:', error);
    
    // Return minimal context if there's an error
    return {
      devices: [],
      locations: [],
      areas: [],
      eventTypes: Object.values(EVENT_TYPE_DISPLAY_MAP),
      eventCategories: Object.values(EVENT_CATEGORY_DISPLAY_MAP),
      currentTime: new Date(),
      organizationId
    };
  }
} 