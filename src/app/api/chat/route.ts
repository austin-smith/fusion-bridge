import { NextRequest, NextResponse } from 'next/server';
import { withOrganizationAuth, type OrganizationAuthContext } from '@/lib/auth/withOrganizationAuth';
import { getOpenAIConfiguration } from '@/data/repositories/service-configurations';
import { openAIFunctions, executeFunction } from '@/lib/ai/functions';
import { chatWithFunctions, type OpenAIMessage, type OpenAIFunction } from '@/services/drivers/openai';
import { OpenAIModel } from '@/types/ai/openai-service-types';
import type { ChatRequest, ChatResponse, FunctionExecutionResult } from '@/types/ai/chat-types';

/**
 * POST /api/chat
 * 
 * Simple AI chat endpoint using OpenAI function calling
 * No complex pipelines, just let AI understand and respond naturally
 */
export const POST = withOrganizationAuth(async (
  request: NextRequest,
  authContext: OrganizationAuthContext
) => {
  const { organizationId } = authContext;

  try {
    // Parse request
    const body: ChatRequest = await request.json();
    const { query, userTimezone, conversationHistory = [] } = body;

    // Simple validation
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return NextResponse.json<ChatResponse>(
        { 
          success: false, 
          error: 'Query is required and must be a non-empty string'
        },
        { status: 400 }
      );
    }

    console.log(`[Chat API] Processing query for org ${organizationId}: "${query.substring(0, 100)}..."`);
    console.log(`[Chat API] Conversation history length: ${conversationHistory.length}`);

    // Get OpenAI configuration
    const openaiConfig = await getOpenAIConfiguration();
    if (!openaiConfig || !openaiConfig.isEnabled || !openaiConfig.apiKey) {
      return NextResponse.json<ChatResponse>(
        { 
          success: false, 
          error: 'AI service is not configured. Please configure OpenAI in settings.'
        },
        { status: 503 }
      );
    }

    // Build messages array with conversation history
    const systemMessage: OpenAIMessage = {
      role: 'system',
      content: `You are a security system assistant for Fusion Bridge.

Context: Organization ${organizationId}, Server time: ${new Date().toISOString()}, User timezone: ${userTimezone || 'UTC'}

CORE ROLE: Provide information and analysis only. You do NOT execute actions - users must click buttons to perform actions.

TIME HANDLING:
- For relative times ("today", "yesterday"), calculate start/end in user timezone, convert to UTC ISO strings
- For follow-up queries, maintain temporal context from conversation history unless user specifies different time

LANGUAGE RULES:
- Never say "I will [action]" or "I am [action]ing"
- Check function results before mentioning buttons:
  * If actions are available → "You can [action] using the button below"
  * If no actions available → explain why (e.g., "The Front Door is already disarmed")
- Explain what you found based on actual data, don't assume buttons exist
- No hyperlinks, markdown links, or clickable elements in responses

FUNCTION USAGE:
- Device/area status questions → use check_device_status, check_area_status, get_system_overview
- Event queries → use count_events, query_events
- Controllable device questions → use find_controllable_devices
- Any request to control devices/areas (individual or bulk) → use appropriate functions
- Always call functions to get current data before responding

Be concise and helpful. You provide information - users execute actions.`
    };

    const messages: OpenAIMessage[] = [
      systemMessage,
      ...conversationHistory,
      {
        role: 'user',
        content: query
      }
    ];

    console.log(`[Chat API] Full conversation being sent to OpenAI:`);
    console.log(`[Chat API] System message: ${systemMessage.content.substring(0, 100)}...`);
    console.log(`[Chat API] History messages: ${conversationHistory.length}`);
    conversationHistory.forEach((msg, i) => {
      console.log(`[Chat API] History[${i}] ${msg.role}: ${msg.content?.substring(0, 100)}...`);
    });
    console.log(`[Chat API] Current query: ${query}`);

    // Convert OpenAI functions to driver format
    const functions: OpenAIFunction[] = openAIFunctions.map(fn => ({
      name: fn.name,
      description: fn.description,
      parameters: fn.parameters
    }));

    // Variable to store UI data from function execution
    let lastUiData: any = null;

    // Function executor that handles data separation
    const functionExecutor = async (name: string, args: Record<string, any>) => {
      console.log(`[Chat API] Executing function: ${name}`);
      const result: FunctionExecutionResult = await executeFunction(name, args, organizationId);
      
      // Store UI data for final response
      lastUiData = result.uiData;
      
      // Return ONLY AI data to OpenAI (clean data without UI metadata)
      return result.aiData;
    };

    // Use the OpenAI driver for chat with functions
    const result = await chatWithFunctions(
      openaiConfig.apiKey,
      openaiConfig.model as OpenAIModel,
      messages,
      functions,
      functionExecutor,
      {
        maxTokens: openaiConfig.maxTokens || 1000,
        temperature: openaiConfig.temperature || 0.3,
        topP: openaiConfig.topP || 1.0,
      }
    );

    if (!result.success) {
      console.error('[Chat API] OpenAI driver error:', result.errorMessage);
      return NextResponse.json<ChatResponse>(
        { 
          success: false, 
          error: result.errorMessage
        },
        { status: 500 }
      );
    }

    // Combine AI response with UI data
    const responseData = {
      ...(lastUiData || {}),
      // Add any AI-specific response data if needed
    };

    return NextResponse.json<ChatResponse>({
      success: true,
      response: result.content,
      data: Object.keys(responseData).length > 0 ? responseData : undefined,
      usage: {
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        totalTokens: result.usage.totalTokens
      }
    });

  } catch (error) {
    console.error('[Chat API] Unexpected error:', error);
    
    return NextResponse.json<ChatResponse>(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'An unexpected error occurred'
      },
      { status: 500 }
    );
  }
}); 