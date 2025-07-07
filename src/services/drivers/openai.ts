import { z } from 'zod';
import { 
  OpenAIModel,
  type OpenAIGenerationRequest,
  type OpenAIGenerationResponse,
  type OpenAITestResponse,
} from '@/types/ai/openai-service-types';

// OpenAI API Base URL
const OPENAI_API_BASE_URL = 'https://api.openai.com/v1';

// OpenAI Chat Completion Request Schema
const OpenAICompletionRequestSchema = z.object({
  model: z.string(),
  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant', 'function']),
    content: z.string(),
    name: z.string().optional(), // For function responses
  })),
  max_tokens: z.number().optional(),
  temperature: z.number().optional(),
  top_p: z.number().optional(),
  functions: z.array(z.object({
    name: z.string(),
    description: z.string(),
    parameters: z.record(z.any()),
  })).optional(),
  function_call: z.union([
    z.literal('auto'),
    z.literal('none'),
    z.object({ name: z.string() })
  ]).optional(),
});

// OpenAI Function Call Schema
const OpenAIFunctionCallSchema = z.object({
  name: z.string(),
  arguments: z.string(),
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
      content: z.string().nullable(),
      function_call: OpenAIFunctionCallSchema.optional(),
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

// Function calling types
export interface OpenAIFunction {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'function';
  content: string;
  name?: string; // For function responses
}

export interface OpenAIChatSuccessResponse {
  success: true;
  content: string;
  functionResult?: any; // Function result data for UI use
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface OpenAIChatErrorResponse {
  success: false;
  errorMessage: string;
}

export type OpenAIChatResponse = OpenAIChatSuccessResponse | OpenAIChatErrorResponse;

/**
 * Makes a chat completion request to OpenAI with optional function calling support
 * 
 * @param apiKey OpenAI API key
 * @param model OpenAI model to use
 * @param messages Chat messages array
 * @param options Optional parameters including functions, maxTokens, temperature, etc.
 * @returns Promise resolving to completion response or null if failed
 */
export async function createChatCompletion(
  apiKey: string,
  model: OpenAIModel,
  messages: OpenAIMessage[],
  options?: {
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    functions?: OpenAIFunction[];
    functionCall?: 'auto' | 'none' | { name: string };
  }
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
    ...(options?.maxTokens && { max_tokens: options.maxTokens }),
    ...(options?.temperature !== undefined && { temperature: options.temperature }),
    ...(options?.topP !== undefined && { top_p: options.topP }),
    ...(options?.functions && { functions: options.functions }),
    ...(options?.functionCall && { function_call: options.functionCall }),
  };

  // Validate request structure
  const requestValidation = OpenAICompletionRequestSchema.safeParse(requestBody);
  if (!requestValidation.success) {
    console.error(`${logPrefix} Invalid request structure:`, requestValidation.error.flatten());
    return null;
  }

  console.log(`${logPrefix} Making chat completion request with model: ${model}`);
  console.log(`${logPrefix} Messages count: ${messages.length}`);
  if (options?.functions) {
    console.log(`${logPrefix} Functions available: ${options.functions.length}`);
  }

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
 * High-level chat completion with function calling support
 * Handles the complete flow: initial request -> function call -> function result -> final response
 * 
 * @param apiKey OpenAI API key
 * @param model OpenAI model to use
 * @param messages Chat messages array
 * @param functions Available functions for the AI to call
 * @param functionExecutor Function to execute when AI calls a function
 * @param options Optional parameters like maxTokens, temperature, etc.
 * @returns Promise resolving to chat response
 */
export async function chatWithFunctions(
  apiKey: string,
  model: OpenAIModel,
  messages: OpenAIMessage[],
  functions: OpenAIFunction[],
  functionExecutor: (name: string, args: Record<string, any>) => Promise<any>,
  options?: {
    maxTokens?: number;
    temperature?: number;
    topP?: number;
  }
): Promise<OpenAIChatResponse> {
  const logPrefix = '[OpenAI Chat with Functions]';

  // First, make the initial request with function calling enabled
  const initialResult = await createChatCompletion(apiKey, model, messages, {
    ...options,
    functions,
    functionCall: 'auto',
  });

  if (!initialResult) {
    return {
      success: false,
      errorMessage: 'Failed to get initial response from OpenAI'
    };
  }

  const message = initialResult.choices[0].message;

  // Check if AI wants to call a function
  if (message.function_call) {
    const functionName = message.function_call.name;
    const functionArgs = message.function_call.arguments;

    console.log(`${logPrefix} AI wants to call function: ${functionName}`);

    try {
      // Parse function arguments
      const parsedArgs = JSON.parse(functionArgs);
      
      // Execute the function
      const functionResult = await functionExecutor(functionName, parsedArgs);
      
      // Prepare messages for final completion
      const finalMessages: OpenAIMessage[] = [
        ...messages,
        {
          role: 'assistant',
          content: message.content ?? '',
          // Note: We don't include function_call in the message object here as it's not part of our schema
        },
        {
          role: 'function',
          name: functionName,
          content: JSON.stringify(functionResult),
        }
      ];

      // Get final response
      const finalResult = await createChatCompletion(apiKey, model, finalMessages, {
        maxTokens: options?.maxTokens || 500,
        temperature: options?.temperature || 0.7,
      });

      if (!finalResult) {
        return {
          success: false,
          errorMessage: 'Failed to get final response from OpenAI'
        };
      }

      return {
        success: true,
        content: finalResult.choices[0].message.content ?? '',
        functionResult: functionResult, // Include function result data for UI
        usage: {
          promptTokens: initialResult.usage.prompt_tokens + finalResult.usage.prompt_tokens,
          completionTokens: initialResult.usage.completion_tokens + finalResult.usage.completion_tokens,
          totalTokens: initialResult.usage.total_tokens + finalResult.usage.total_tokens,
        }
      };

    } catch (error) {
      console.error(`${logPrefix} Function execution error:`, error);
      return {
        success: false,
        errorMessage: `Function execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  // Direct response without function call
        return {
        success: true,
        content: message.content ?? '',
        usage: {
          promptTokens: initialResult.usage.prompt_tokens,
          completionTokens: initialResult.usage.completion_tokens,
          totalTokens: initialResult.usage.total_tokens,
        }
      };
}

/**
 * Simple chat completion without function calling (backward compatibility)
 * 
 * @param apiKey OpenAI API key
 * @param model OpenAI model to use
 * @param messages Chat messages array (simple format)
 * @param maxTokens Maximum tokens to generate (optional)
 * @param temperature Temperature parameter (optional)
 * @param topP Top-p parameter (optional)
 * @returns Promise resolving to completion response or null if failed
 */
export async function createSimpleChatCompletion(
  apiKey: string,
  model: OpenAIModel,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  maxTokens?: number,
  temperature?: number,
  topP?: number
): Promise<OpenAICompletionResponse | null> {
  return createChatCompletion(apiKey, model, messages, {
    maxTokens,
    temperature,
    topP,
  });
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
      {
        maxTokens,
        temperature,
        topP,
      }
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
      {
        maxTokens,
        temperature,
        topP,
      }
    );

    if (result && result.choices && result.choices.length > 0) {
      const content = result.choices[0].message.content ?? '';
      
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