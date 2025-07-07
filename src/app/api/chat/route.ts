import { NextRequest, NextResponse } from 'next/server';
import { withOrganizationAuth, type OrganizationAuthContext } from '@/lib/auth/withOrganizationAuth';
import { getOpenAIConfiguration } from '@/data/repositories/service-configurations';
import { openAIFunctions, executeFunction } from '@/lib/ai/functions';
import { chatWithFunctions, type OpenAIMessage, type OpenAIFunction } from '@/services/drivers/openai';
import { OpenAIModel } from '@/types/ai/openai-service-types';
import type { ChatRequest, ChatResponse } from '@/types/ai/chat-types';

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
      content: `You are a helpful security system assistant for Fusion. 

Current context:
- Organization: ${organizationId}
- Server time: ${new Date().toISOString()}
- User timezone: ${userTimezone || 'UTC'}

When users ask about time periods like "today", "yesterday", etc:
1. Calculate the start and end times in the user's timezone
2. Convert those times to UTC ISO strings
3. Pass the UTC times as timeStart and timeEnd parameters

IMPORTANT: When users ask follow-up questions that are refinements or filters of previous queries (e.g., "narrow it down to X", "what about Y events", "filter by Z"), maintain the same time context from the previous query unless they explicitly specify a different time period. Look at the conversation history to understand the temporal context.

For example, if user asks "events today" and user timezone is "America/New_York":
- Calculate today's start: beginning of today in America/New_York
- Calculate today's end: end of today in America/New_York  
- Convert both to UTC ISO strings for the API

When users ask questions about devices or areas:
1. Use the appropriate function to get current status (check_device_status, check_area_status, get_system_overview)
2. Explain what you found and provide action buttons for controllable items
3. Be specific about current states vs desired states

When users ask questions:
1. Use the available functions to get the data you need
2. Provide clear, concise, and helpful responses
3. If no data is found, explain clearly
4. Format counts and statistics in a friendly way
5. Use natural language, not technical jargon
6. For follow-up queries, consider the conversation context to maintain temporal consistency

Be helpful but brief. Don't over-explain unless asked.`
    };

    const messages: OpenAIMessage[] = [
      systemMessage,
      ...conversationHistory,
      {
        role: 'user',
        content: query
      }
    ];

    // Convert OpenAI functions to driver format
    const functions: OpenAIFunction[] = openAIFunctions.map(fn => ({
      name: fn.name,
      description: fn.description,
      parameters: fn.parameters
    }));

    // Function executor for the driver
    const functionExecutor = async (name: string, args: Record<string, any>) => {
      console.log(`[Chat API] Executing function: ${name}`);
      return await executeFunction(name, args, organizationId);
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
        temperature: 0.3,
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

    return NextResponse.json<ChatResponse>({
      success: true,
      response: result.content,
      data: result.functionResult, // Include function result data if UI wants to render it specially
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