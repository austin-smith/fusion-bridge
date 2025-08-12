import OpenAI from 'openai';
import { 
  OpenAIModel,
  type OpenAIGenerationRequest,
  type OpenAIGenerationResponse,
  type OpenAITestResponse,
} from '@/types/ai/openai-service-types';

// Helper utilities to avoid duplicating GPT-5 handling logic across calls
function isGpt5Model(model: OpenAIModel): boolean {
  return model === OpenAIModel.GPT_5 || model === OpenAIModel.GPT_5_MINI;
}

function applyTemperatureParam(params: Record<string, any>, model: OpenAIModel, temperature?: number): void {
  if (temperature === undefined) return;
  const isGpt5 = isGpt5Model(model);
  if (!isGpt5) {
    params.temperature = temperature;
  } else if (temperature === 1) {
    // GPT-5 only supports default temperature(1). Only include when explicitly 1.
    params.temperature = 1;
  }
}

function applyMaxTokensParam(params: Record<string, any>, model: OpenAIModel, maxTokens?: number): void {
  if (maxTokens === undefined) return;
  if (isGpt5Model(model)) {
    params.max_completion_tokens = maxTokens;
  } else {
    params.max_tokens = maxTokens;
  }
}

/**
 * Simple OpenAI service that uses the official library directly
 * No custom abstractions - just what we actually need
 */
export class OpenAIService {
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({
      apiKey,
      timeout: 30000,
      maxRetries: 3,
    });
  }

  /**
   * Chat with function calling - the only interface our app actually needs
   */
  async chatWithFunctions(
    model: OpenAIModel,
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    functions: Array<{
      name: string;
      description: string;
      parameters: Record<string, any>;
    }>,
    functionExecutor: (name: string, args: Record<string, any>) => Promise<any>,
    options?: {
      maxTokens?: number;
      temperature?: number;
      topP?: number;
    }
  ): Promise<{
    success: boolean;
    content?: string;
    functionResult?: any;
    errorMessage?: string;
      errorStatusCode?: number;
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  }> {
    try {
      // Convert functions to tools format
      const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = functions.map(fn => ({
        type: 'function',
        function: fn,
      }));

      const initialParams: any = {
        model,
        messages,
        tools,
        tool_choice: 'auto',
        top_p: options?.topP,
      };
      // Apply model-specific params
      applyTemperatureParam(initialParams, model, options?.temperature);
      applyMaxTokensParam(initialParams, model, options?.maxTokens);

      const completion = await this.client.chat.completions.create(initialParams);

      const message = completion.choices[0].message;

      // Handle function calling
      if (message.tool_calls && message.tool_calls.length > 0) {
        const toolCall = message.tool_calls[0];
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments);

        // Execute function
        const functionResult = await functionExecutor(functionName, functionArgs);

        const followUpParams: any = {
          model,
          messages: [
            ...messages,
            {
              role: 'assistant',
              content: message.content,
              tool_calls: message.tool_calls,
            },
            {
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify(functionResult),
            },
          ],
          top_p: options?.topP,
        };
        // Apply model-specific params for follow-up
        applyTemperatureParam(followUpParams, model, options?.temperature ?? 1);
        applyMaxTokensParam(followUpParams, model, options?.maxTokens ?? 500);

        const finalCompletion = await this.client.chat.completions.create(followUpParams);

        return {
          success: true,
          content: finalCompletion.choices[0].message.content ?? '',
          functionResult,
          usage: {
            promptTokens: (completion.usage?.prompt_tokens || 0) + (finalCompletion.usage?.prompt_tokens || 0),
            completionTokens: (completion.usage?.completion_tokens || 0) + (finalCompletion.usage?.completion_tokens || 0),
            totalTokens: (completion.usage?.total_tokens || 0) + (finalCompletion.usage?.total_tokens || 0),
          },
        };
      }

      // Direct response
      return {
        success: true,
        content: message.content ?? '',
        usage: {
          promptTokens: completion.usage?.prompt_tokens || 0,
          completionTokens: completion.usage?.completion_tokens || 0,
          totalTokens: completion.usage?.total_tokens || 0,
        },
      };

    } catch (error) {
      console.error('[OpenAI Service] Error:', error);
      
      let errorMessage = 'Unknown error occurred';
      let errorStatusCode: number | undefined = undefined;
      if (error instanceof OpenAI.APIError) {
        errorMessage = `OpenAI API Error: ${error.message}`;
        errorStatusCode = error.status;
        if (error.status === 401) errorMessage = 'Invalid API key';
        if (error.status === 429) errorMessage = 'Rate limit exceeded';
        if (error.status >= 500) errorMessage = 'OpenAI service unavailable';
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }

      return { success: false, errorMessage, errorStatusCode };
    }
  }

  /**
   * Simple completion for testing/automation analysis
   */
  async createCompletion(
    model: OpenAIModel,
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    options?: {
      maxTokens?: number;
      temperature?: number;
      topP?: number;
    }
  ): Promise<OpenAI.Chat.Completions.ChatCompletion | null> {
    try {
      const params: any = {
        model,
        messages,
        top_p: options?.topP,
      };
      // Apply model-specific params
      applyTemperatureParam(params, model, options?.temperature);
      applyMaxTokensParam(params, model, options?.maxTokens);
      return await this.client.chat.completions.create(params);
    } catch (error) {
      console.error('[OpenAI Service] Completion error:', error);
      return null;
    }
  }

  /**
   * Test API key
   */
  async testApiKey(model: OpenAIModel = OpenAIModel.GPT_4O_MINI): Promise<{
    success: boolean;
    errorMessage?: string;
    responseTime?: number;
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  }> {
    const startTime = Date.now();

    try {
      const params: any = {
        model,
        messages: [
          { role: 'system', content: 'You are a helpful assistant. Respond briefly.' },
          { role: 'user', content: 'Say "API test successful"' },
        ],
      };
      // Temperature not needed in test; GPT-5 defaults to 1. We omit it entirely.
      applyMaxTokensParam(params, model, 50);
      const completion = await this.client.chat.completions.create(params);

      return {
        success: true,
        responseTime: Date.now() - startTime,
        usage: {
          promptTokens: completion.usage?.prompt_tokens || 0,
          completionTokens: completion.usage?.completion_tokens || 0,
          totalTokens: completion.usage?.total_tokens || 0,
        },
      };
    } catch (error) {
      let errorMessage = 'Unknown error';
      if (error instanceof OpenAI.APIError) {
        if (error.status === 401) errorMessage = 'Invalid API key';
        else if (error.status === 429) errorMessage = 'Rate limit exceeded';
        else if (error.status >= 500) errorMessage = 'OpenAI service unavailable';
        else errorMessage = `OpenAI API Error: ${error.message}`;
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }

      return {
        success: false,
        errorMessage,
        responseTime: Date.now() - startTime,
      };
    }
  }
}

// Factory function
export function createOpenAIService(apiKey: string): OpenAIService {
  return new OpenAIService(apiKey);
}

// Legacy function for existing chat API
export async function chatWithFunctions(
  apiKey: string,
  model: OpenAIModel,
  messages: Array<{ role: 'system' | 'user' | 'assistant' | 'function'; content: string; name?: string }>,
  functions: Array<{ name: string; description: string; parameters: Record<string, any> }>,
  functionExecutor: (name: string, args: Record<string, any>) => Promise<any>,
  options?: { maxTokens?: number; temperature?: number; topP?: number }
): Promise<{
  success: boolean;
  content?: string;
  functionResult?: any;
  errorMessage?: string;
  errorStatusCode?: number;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}> {
  const service = new OpenAIService(apiKey);
  
  // Convert legacy message format to OpenAI format
  const openAIMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = messages.map(msg => {
    if (msg.role === 'function') {
      return { role: 'function', name: msg.name!, content: msg.content };
    }
    return { role: msg.role as 'system' | 'user' | 'assistant', content: msg.content };
  });
  
  const result = await service.chatWithFunctions(model, openAIMessages, functions, functionExecutor, options);
  
  // Return in legacy format
  return {
    success: result.success,
    content: result.content,
    functionResult: result.functionResult,
    errorMessage: result.errorMessage,
    errorStatusCode: result.errorStatusCode,
    usage: result.usage,
  };
}

export async function testApiKey(
  apiKey: string,
  model: OpenAIModel = OpenAIModel.GPT_4O_MINI,
  maxTokens: number = 50,
  temperature: number = 0.7,
  topP: number = 1.0
): Promise<OpenAITestResponse> {
  const service = new OpenAIService(apiKey);
  return service.testApiKey(model);
}

export async function analyzeAutomationRule(
  request: OpenAIGenerationRequest,
  apiKey: string,
  model: OpenAIModel = OpenAIModel.GPT_4O,
  maxTokens: number = 2000,
  temperature: number = 0.3,
  topP: number = 0.9
): Promise<OpenAIGenerationResponse> {
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

  try {
    const service = new OpenAIService(apiKey);

    // Build context for the AI
    const contextBuilder = [];
    
    if (request.context.availableDevices && request.context.availableDevices.length > 0) {
      contextBuilder.push(`Available devices: ${request.context.availableDevices.map(d => `${d.name} (${d.type})`).join(', ')}`);
    }
    
    if (request.context.availableSpaces && request.context.availableSpaces.length > 0) {
        contextBuilder.push(`Available spaces: ${request.context.availableSpaces.map(s => s.name).join(', ')}`);
    }
    
    if (request.context.availableAlarmZones && request.context.availableAlarmZones.length > 0) {
        contextBuilder.push(`Available alarm zones: ${request.context.availableAlarmZones.map(z => z.name).join(', ')}`);
    }
    
    if (request.context.availableConnectors && request.context.availableConnectors.length > 0) {
      contextBuilder.push(`Available connectors: ${request.context.availableConnectors.map(c => `${c.name} (${c.category})`).join(', ')}`);
    }

    const systemPrompt = `You are an expert automation assistant for a security and smart home platform called Fusion. 

Your task is to analyze natural language descriptions and suggest structured automation rules.

Context for this organization:
${contextBuilder.join('\n')}

When analyzing automation requests:
1. Break down the user's intent into triggers, conditions, and actions
2. Suggest specific devices, spaces, alarm zones, or connectors from the available options
3. Explain your reasoning clearly
4. Provide alternative suggestions if applicable
5. Be specific about event types, device states, and action parameters

Respond in a helpful, structured way that makes it easy for users to understand and implement their automation ideas.`;

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Please analyze this automation request and provide suggestions:\n\n"${request.prompt}"` }
    ];

    const result = await service.createCompletion(model, messages, {
      maxTokens,
      temperature,
      topP,
    });

    if (result && result.choices && result.choices.length > 0) {
      const content = result.choices[0].message.content ?? '';
      
      return {
        success: true,
        generatedContent: content,
        explanation: content,
        usage: {
          promptTokens: result.usage?.prompt_tokens || 0,
          completionTokens: result.usage?.completion_tokens || 0,
          totalTokens: result.usage?.total_tokens || 0,
        }
      };
    } else {
      return {
        success: false,
        errorMessage: 'No response generated from OpenAI'
      };
    }

  } catch (error) {
    console.error('[OpenAI Rule Analysis] Error:', error);
    
    let errorMessage = 'Unknown error occurred';
    
    if (error instanceof OpenAI.APIError) {
      errorMessage = `OpenAI API Error: ${error.message}`;
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }
    
    return {
      success: false,
      errorMessage: `Failed to analyze automation rule: ${errorMessage}`
    };
  }
} 