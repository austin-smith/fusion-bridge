import { NextRequest, NextResponse } from 'next/server';
import { withOrganizationAuth, type OrganizationAuthContext } from '@/lib/auth/withOrganizationAuth';
import { getOpenAIConfiguration } from '@/data/repositories/service-configurations';
import { openAIFunctions, executeFunction } from '@/lib/ai/functions';
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
    const systemMessage = {
      role: 'system' as const,
      content: `You are a helpful security system assistant for Fusion Bridge. 
      
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

When users ask questions:
1. Use the available functions to get the data you need
2. Provide clear, concise, and helpful responses
3. If no data is found, explain clearly
4. Format counts and statistics in a friendly way
5. Use natural language, not technical jargon
6. For follow-up queries, consider the conversation context to maintain temporal consistency

Be helpful but brief. Don't over-explain unless asked.`
    };

    const messages = [
      systemMessage,
      ...conversationHistory,
      {
        role: 'user' as const,
        content: query
      }
    ];



    // Make OpenAI request with function calling
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: openaiConfig.model,
        messages,
        functions: openAIFunctions,
        function_call: 'auto',
        temperature: 0.3,
        max_tokens: openaiConfig.maxTokens || 1000
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[Chat API] OpenAI error:', error);
      return NextResponse.json<ChatResponse>(
        { 
          success: false, 
          error: 'Failed to process query with AI service'
        },
        { status: 500 }
      );
    }

    const completion = await response.json();
    const message = completion.choices[0].message;

    // Check if OpenAI wants to call a function
    if (message.function_call) {
      const functionName = message.function_call.name;
      const functionArgs = JSON.parse(message.function_call.arguments);
      
      console.log(`[Chat API] Calling function: ${functionName}`);
      
      // Execute the function
      let functionResult;
      try {
        functionResult = await executeFunction(
          functionName, 
          functionArgs, 
          organizationId
        );
      } catch (error) {
        console.error(`[Chat API] Function execution error:`, error);
        functionResult = {
          error: `Failed to ${functionName}: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
      }
      
      // Get final response from OpenAI with function result
      const finalResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiConfig.apiKey}`,
        },
        body: JSON.stringify({
          model: openaiConfig.model,
          messages: [
            systemMessage,
            ...conversationHistory,
            {
              role: 'user' as const,
              content: query
            },
            message,
            {
              role: 'function' as const,
              name: functionName,
              content: JSON.stringify(functionResult)
            }
          ],
          temperature: 0.7,
          max_tokens: 500
        })
      });

      if (!finalResponse.ok) {
        const error = await finalResponse.text();
        console.error('[Chat API] OpenAI final response error:', error);
        return NextResponse.json<ChatResponse>(
          { 
            success: false, 
            error: 'Failed to generate response'
          },
          { status: 500 }
        );
      }

      const finalCompletion = await finalResponse.json();
      
      return NextResponse.json<ChatResponse>({
        success: true,
        response: finalCompletion.choices[0].message.content,
        data: functionResult, // Include raw data if UI wants to render it specially
        usage: {
          promptTokens: (completion.usage?.prompt_tokens || 0) + (finalCompletion.usage?.prompt_tokens || 0),
          completionTokens: (completion.usage?.completion_tokens || 0) + (finalCompletion.usage?.completion_tokens || 0),
          totalTokens: (completion.usage?.total_tokens || 0) + (finalCompletion.usage?.total_tokens || 0)
        }
      });
    }
    
    // Direct response without function call
    return NextResponse.json<ChatResponse>({
      success: true,
      response: message.content,
      usage: {
        promptTokens: completion.usage?.prompt_tokens || 0,
        completionTokens: completion.usage?.completion_tokens || 0,
        totalTokens: completion.usage?.total_tokens || 0
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