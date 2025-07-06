import { z } from 'zod';
import { 
  OpenAIModel,
  type OpenAIGenerationRequest,
  type OpenAIGenerationResponse,
  type OpenAITestResponse,
} from '@/types/ai/openai-service-types';
import type {
  QueryContext,
  InterpretedQuery,
  QueryInterpretationResponse,
  QueryFilters,
  TimeRange
} from '@/types/ai/natural-language-query-types';
import { QueryType } from '@/types/ai/natural-language-query-types';
import { EventCategory, EventType, EventSubtype } from '@/lib/mappings/definitions';

// OpenAI API Base URL
const OPENAI_API_BASE_URL = 'https://api.openai.com/v1';

// OpenAI Chat Completion Request Schema
const OpenAICompletionRequestSchema = z.object({
  model: z.string(),
  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant']),
    content: z.string(),
  })),
  max_tokens: z.number().optional(),
  temperature: z.number().optional(),
  top_p: z.number().optional(),
});

// OpenAI Chat Completion Response Schema
const OpenAICompletionResponseSchema = z.object({
  id: z.string(),
  object: z.literal('chat.completion'),
  created: z.number(),
  model: z.string(),
  choices: z.array(z.object({
    index: z.number(),
    message: z.object({
      role: z.enum(['assistant']),
      content: z.string(),
    }),
    finish_reason: z.string().nullable(),
  })),
  usage: z.object({
    prompt_tokens: z.number(),
    completion_tokens: z.number(),
    total_tokens: z.number(),
  }),
});

type OpenAICompletionResponse = z.infer<typeof OpenAICompletionResponseSchema>;

/**
 * Makes a chat completion request to OpenAI
 * 
 * @param apiKey OpenAI API key
 * @param model OpenAI model to use
 * @param messages Chat messages array
 * @param maxTokens Maximum tokens to generate (optional)
 * @param temperature Temperature parameter (optional)
 * @param topP Top-p parameter (optional)
 * @returns Promise resolving to completion response or null if failed
 */
export async function createChatCompletion(
  apiKey: string,
  model: OpenAIModel,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  maxTokens?: number,
  temperature?: number,
  topP?: number
): Promise<OpenAICompletionResponse | null> {
  const logPrefix = '[OpenAI Chat Completion]';
  
  if (!apiKey) {
    console.error(`${logPrefix} API key is required`);
    return null;
  }

  if (!messages || messages.length === 0) {
    console.error(`${logPrefix} Messages array is required and cannot be empty`);
    return null;
  }

  const requestBody = {
    model,
    messages,
    ...(maxTokens && { max_tokens: maxTokens }),
    ...(temperature !== undefined && { temperature }),
    ...(topP !== undefined && { top_p: topP }),
  };

  // Validate request structure
  const requestValidation = OpenAICompletionRequestSchema.safeParse(requestBody);
  if (!requestValidation.success) {
    console.error(`${logPrefix} Invalid request structure:`, requestValidation.error.flatten());
    return null;
  }

  console.log(`${logPrefix} Making chat completion request with model: ${model}`);
  console.log(`${logPrefix} Messages count: ${messages.length}`);

  try {
    const response = await fetch(`${OPENAI_API_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'User-Agent': 'Fusion-Bridge/1.0',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`${logPrefix} HTTP error: ${response.status} - ${response.statusText}`);
      console.error(`${logPrefix} Error response:`, errorText);
      return null;
    }

    const data = await response.json();
    console.log(`${logPrefix} Raw OpenAI API response:`, JSON.stringify(data, null, 2));

    // Validate response structure
    const parseResult = OpenAICompletionResponseSchema.safeParse(data);
    if (!parseResult.success) {
      console.error(`${logPrefix} Invalid response format:`, parseResult.error.flatten());
      console.error(`${logPrefix} Raw data that failed validation:`, data);
      return null;
    }

    const completionData = parseResult.data;
    console.log(`${logPrefix} Successfully processed completion:`);
    console.log(`${logPrefix} Completion tokens: ${completionData.usage.completion_tokens}`);
    console.log(`${logPrefix} Total tokens: ${completionData.usage.total_tokens}`);

    return completionData;

  } catch (error) {
    console.error(`${logPrefix} Network or parsing error:`, error);
    return null;
  }
}

/**
 * Tests the OpenAI API key by making a simple completion request
 * 
 * @param apiKey OpenAI API key to test
 * @param model OpenAI model to test with
 * @param maxTokens Max tokens for the test request
 * @param temperature Temperature for the test request
 * @param topP Top-p for the test request
 * @returns Promise resolving to test result
 */
export async function testApiKey(
  apiKey: string,
  model: OpenAIModel = OpenAIModel.GPT_4O_MINI,
  maxTokens: number = 50,
  temperature: number = 0.7,
  topP: number = 1.0
): Promise<OpenAITestResponse> {
  const logPrefix = '[OpenAI API Test]';
  
  if (!apiKey) {
    return {
      success: false,
      errorMessage: 'API key is required for testing'
    };
  }

  console.log(`${logPrefix} Testing API key with model: ${model}`);

  const startTime = Date.now();

  try {
    // Simple test message
    const testMessages = [
      {
        role: 'system' as const,
        content: 'You are a helpful AI assistant. Respond briefly.'
      },
      {
        role: 'user' as const,
        content: 'Say "API test successful" if you can read this message.'
      }
    ];

    const result = await createChatCompletion(
      apiKey,
      model,
      testMessages,
      maxTokens,
      temperature,
      topP
    );

    const responseTime = Date.now() - startTime;

    if (result && result.choices && result.choices.length > 0) {
      const content = result.choices[0].message.content;
      
      return {
        success: true,
        responseTime,
        usage: {
          promptTokens: result.usage.prompt_tokens,
          completionTokens: result.usage.completion_tokens,
          totalTokens: result.usage.total_tokens,
        }
      };
    } else {
      return {
        success: false,
        errorMessage: 'API key may be invalid or the OpenAI service is temporarily unavailable. Check your API key and try again.',
        responseTime
      };
    }

  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error(`${logPrefix} Error during API key test:`, error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    return {
      success: false,
      errorMessage: `Failed to test API key: ${errorMessage}`,
      responseTime
    };
  }
}

/**
 * Analyzes natural language input and generates automation rule suggestions
 * 
 * @param request Rule generation request with context
 * @param apiKey OpenAI API key
 * @param model OpenAI model to use
 * @param maxTokens Maximum tokens to generate
 * @param temperature Temperature parameter
 * @param topP Top-p parameter
 * @returns Promise resolving to rule analysis response
 */
export async function analyzeAutomationRule(
  request: OpenAIGenerationRequest,
  apiKey: string,
  model: OpenAIModel = OpenAIModel.GPT_4O,
  maxTokens: number = 2000,
  temperature: number = 0.3,
  topP: number = 0.9
): Promise<OpenAIGenerationResponse> {
  const logPrefix = '[OpenAI Rule Analysis]';

  if (!apiKey) {
    return {
      success: false,
      errorMessage: 'OpenAI API key is required'
    };
  }

  if (!request.prompt || request.prompt.trim().length === 0) {
    return {
      success: false,
      errorMessage: 'Rule description is required'
    };
  }

  console.log(`${logPrefix} Analyzing automation rule: "${request.prompt.substring(0, 100)}..."`);

  try {
    // Build context for the AI
    const contextBuilder = [];
    
    if (request.context.availableDevices && request.context.availableDevices.length > 0) {
      contextBuilder.push(`Available devices: ${request.context.availableDevices.map(d => `${d.name} (${d.type})`).join(', ')}`);
    }
    
    if (request.context.availableAreas && request.context.availableAreas.length > 0) {
      contextBuilder.push(`Available areas: ${request.context.availableAreas.map(a => a.name).join(', ')}`);
    }
    
    if (request.context.availableConnectors && request.context.availableConnectors.length > 0) {
      contextBuilder.push(`Available connectors: ${request.context.availableConnectors.map(c => `${c.name} (${c.category})`).join(', ')}`);
    }

    const systemPrompt = `You are an expert automation assistant for a security and smart home platform called Fusion Bridge. 

Your task is to analyze natural language descriptions and suggest structured automation rules.

Context for this organization:
${contextBuilder.join('\n')}

When analyzing automation requests:
1. Break down the user's intent into triggers, conditions, and actions
2. Suggest specific devices, areas, or connectors from the available options
3. Explain your reasoning clearly
4. Provide alternative suggestions if applicable
5. Be specific about event types, device states, and action parameters

Respond in a helpful, structured way that makes it easy for users to understand and implement their automation ideas.`;

    const messages = [
      {
        role: 'system' as const,
        content: systemPrompt
      },
      {
        role: 'user' as const,
        content: `Please analyze this automation request and provide suggestions:\n\n"${request.prompt}"`
      }
    ];

    const result = await createChatCompletion(
      apiKey,
      model,
      messages,
      maxTokens,
      temperature,
      topP
    );

    if (result && result.choices && result.choices.length > 0) {
      const content = result.choices[0].message.content;
      
      return {
        success: true,
        generatedContent: content,
        explanation: content, // For now, the full response is the explanation
        usage: {
          promptTokens: result.usage.prompt_tokens,
          completionTokens: result.usage.completion_tokens,
          totalTokens: result.usage.total_tokens,
        }
      };
    } else {
      return {
        success: false,
        errorMessage: 'No response generated from OpenAI'
      };
    }

  } catch (error) {
    console.error(`${logPrefix} Error during rule analysis:`, error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    return {
      success: false,
      errorMessage: `Failed to analyze automation rule: ${errorMessage}`
    };
  }
}

/**
 * Interprets natural language queries about security events using OpenAI
 * 
 * @param apiKey OpenAI API key
 * @param userQuery Natural language query from user
 * @param context Organization context (devices, locations, etc.)
 * @param model OpenAI model to use
 * @param maxTokens Maximum tokens to generate
 * @param temperature Temperature parameter
 * @param topP Top-p parameter
 * @returns Promise resolving to query interpretation response
 */
export async function interpretEventQuery(
  apiKey: string,
  userQuery: string,
  context: QueryContext,
  model: OpenAIModel = OpenAIModel.GPT_4O,
  maxTokens: number = 1500,
  temperature: number = 0.2,
  topP: number = 0.9
): Promise<QueryInterpretationResponse> {
  const logPrefix = '[OpenAI Query Interpretation]';

  if (!apiKey) {
    return {
      success: false,
      error: {
        type: 'interpretation_failed',
        message: 'OpenAI API key is required'
      }
    };
  }

  if (!userQuery || userQuery.trim().length === 0) {
    return {
      success: false,
      error: {
        type: 'interpretation_failed',
        message: 'Query text is required'
      }
    };
  }

  console.log(`${logPrefix} Interpreting query: "${userQuery.substring(0, 100)}..."`);

  try {
    // Build comprehensive system prompt with context
    const systemPrompt = buildQueryInterpretationPrompt(context);
    
    const messages = [
      {
        role: 'system' as const,
        content: systemPrompt
      },
      {
        role: 'user' as const,
        content: `Please interpret this security system query: "${userQuery}"`
      }
    ];

    const result = await createChatCompletion(
      apiKey,
      model,
      messages,
      maxTokens,
      temperature,
      topP
    );

    if (result && result.choices && result.choices.length > 0) {
      const responseContent = result.choices[0].message.content;
      
      try {
        console.log(`${logPrefix} Raw OpenAI response content:`, responseContent);
        
        // Try to extract JSON from the response - OpenAI sometimes adds extra text
        let jsonContent = responseContent.trim();
        
        // Look for JSON object boundaries
        const jsonStart = jsonContent.indexOf('{');
        const jsonEnd = jsonContent.lastIndexOf('}');
        
        if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
          jsonContent = jsonContent.substring(jsonStart, jsonEnd + 1);
        }
        
        console.log(`${logPrefix} Extracted JSON content:`, jsonContent);
        
        // Parse the JSON response from OpenAI
        const parsedResponse = JSON.parse(jsonContent);
        
        // Validate and transform the response
        const interpretedQuery = validateAndTransformInterpretation(parsedResponse, context);
        
        return {
          success: true,
          interpretedQuery,
          usage: {
            promptTokens: result.usage.prompt_tokens,
            completionTokens: result.usage.completion_tokens,
            totalTokens: result.usage.total_tokens,
          }
        };
      } catch (parseError) {
        console.error(`${logPrefix} Failed to parse OpenAI response:`, parseError);
        console.error(`${logPrefix} Raw response:`, responseContent);
        console.error(`${logPrefix} Parse error details:`, parseError);
        
        // If JSON parsing fails, try to provide a helpful fallback response
        const fallbackInterpretation: InterpretedQuery = {
          interpretation: `I understood your query: "${userQuery}", but had trouble formatting the response. Let me try to help anyway.`,
          queryType: QueryType.EVENTS, // Default to events for most queries
          confidence: 0.3,
          ambiguities: ['AI response parsing failed'],
          suggestions: ['Try rephrasing your query with more specific terms'],
          filters: {}
        };
        
        return {
          success: true,
          interpretedQuery: fallbackInterpretation,
          usage: {
            promptTokens: result.usage.prompt_tokens,
            completionTokens: result.usage.completion_tokens,
            totalTokens: result.usage.total_tokens,
          }
        };
      }
    } else {
      return {
        success: false,
        error: {
          type: 'interpretation_failed',
          message: 'No response generated from OpenAI'
        }
      };
    }

  } catch (error) {
    console.error(`${logPrefix} Error during query interpretation:`, error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    return {
      success: false,
      error: {
        type: 'interpretation_failed',
        message: `Failed to interpret query: ${errorMessage}`,
        details: error
      }
    };
  }
}

/**
 * Builds the system prompt for query interpretation with organization context
 */
function buildQueryInterpretationPrompt(context: QueryContext): string {
  const devicesList = context.devices.map(d => `${d.name} (${d.type}, ${d.connectorCategory})`).join(', ');
  const locationsList = context.locations.map(l => `${l.name} (${l.path})`).join(', ');
  const areasList = context.areas.map(a => `${a.name}${a.locationName ? ` in ${a.locationName}` : ''}`).join(', ');
  
  return `You are an expert AI assistant for a security monitoring system. Your job is to interpret natural language queries about security events, device status, and system analytics.

ORGANIZATION CONTEXT:
Current time: ${context.currentTime.toISOString()}
Organization ID: ${context.organizationId}

Available devices: ${devicesList}
Available locations: ${locationsList}
Available areas: ${areasList}
Available event types: ${context.eventTypes.join(', ')}
Available event categories: ${context.eventCategories.join(', ')}

QUERY TYPES:
1. "events" - User wants to see specific events (e.g., "show door events", "what happened last night")
2. "status" - User wants current device/system status (e.g., "are sensors working", "what's offline")  
3. "analytics" - User wants aggregated data (e.g., "how many events", "busiest time of day")

RESPONSE FORMAT:
You MUST respond with ONLY a valid JSON object (no additional text, explanations, or markdown). Use this exact structure:
{
  "interpretation": "Human-readable summary of what you understood",
  "queryType": "events|status|analytics",
  "filters": {
    "deviceTypes": ["array of device types if mentioned"],
    "deviceNames": ["array of specific device names if mentioned"],
    "deviceIds": ["array of device IDs if you can match names to IDs"],
    "locationNames": ["array of location names if mentioned"], 
    "locationIds": ["array of location IDs if you can match names to IDs"],
    "areaNames": ["array of area names if mentioned"],
    "areaIds": ["array of area IDs if you can match names to IDs"],
    "eventTypes": ["array of event types if mentioned"],
    "eventCategories": ["array of event categories if mentioned"]
  },
  "timeRange": {
    "start": "ISO date string",
    "end": "ISO date string", 
    "description": "human readable time description"
  },
  "aggregation": {
    "type": "count|timeline|groupBy",
    "field": "what to group by or count"
  },
  "confidence": 0.95,
  "ambiguities": ["any unclear parts"],
  "suggestions": ["alternative interpretations"]
}

IMPORTANT RULES:
- Only include fields that are relevant to the query
- Match device/location names to IDs when possible using the provided context
- Use reasonable time ranges - if user says "today" use current date, "last week" use 7 days ago to now
- Be conservative with confidence scores - only use >0.9 when very certain
- Include timeRange for event queries, omit for status queries unless specifically time-based
- For ambiguous queries, include alternatives in suggestions array

Examples:
- "show door events from building A yesterday" -> events query with device type filter and time range
- "what sensors are offline" -> status query with device type filter  
- "how many alerts last month" -> analytics query with time range and count aggregation`;
}

/**
 * Validates and transforms the OpenAI response into a proper InterpretedQuery
 */
function validateAndTransformInterpretation(
  response: any, 
  context: QueryContext
): InterpretedQuery {
  // Basic validation
  if (!response || typeof response !== 'object') {
    throw new Error('Invalid response format');
  }

  // Validate required fields
  if (!response.interpretation || !response.queryType) {
    throw new Error('Missing required fields: interpretation or queryType');
  }

  // Validate queryType
  if (!['events', 'status', 'analytics'].includes(response.queryType)) {
    throw new Error(`Invalid queryType: ${response.queryType}`);
  }

  // Transform time range strings to Date objects
  let timeRange: TimeRange | undefined;
  if (response.timeRange) {
    timeRange = {
      start: new Date(response.timeRange.start),
      end: new Date(response.timeRange.end),
      description: response.timeRange.description || 'Custom range'
    };
  }

  // Ensure filters object exists
  const filters: QueryFilters = response.filters || {};

  // Transform the response into our InterpretedQuery format
  const interpretedQuery: InterpretedQuery = {
    interpretation: response.interpretation,
    queryType: response.queryType,
    filters,
    timeRange,
    confidence: Math.min(Math.max(response.confidence || 0.5, 0), 1), // Clamp between 0-1
    ambiguities: Array.isArray(response.ambiguities) ? response.ambiguities : [],
    suggestions: Array.isArray(response.suggestions) ? response.suggestions : []
  };

  // Add aggregation if present
  if (response.aggregation) {
    interpretedQuery.aggregation = {
      type: response.aggregation.type || 'count',
      field: response.aggregation.field
    };
  }

  return interpretedQuery;
} 