import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import { withOrganizationAuth, type OrganizationAuthContext } from '@/lib/auth/withOrganizationAuth';
import { getOpenAIConfiguration } from '@/data/repositories/service-configurations';
import { openAIFunctions, executeFunction } from '@/lib/ai/functions';
import { OpenAIModel } from '@/types/ai/openai-service-types';

export const runtime = 'nodejs';

type ChatStreamBody = {
  query: string;
  userTimezone?: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
};

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\n` + `data: ${JSON.stringify(data)}\n\n`;
}

function splitTextToPseudoStream(text: string, chunkSize = 30): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return chunks.length ? chunks : [''];
}

export const POST = withOrganizationAuth(async (
  request: NextRequest,
  authContext: OrganizationAuthContext
) => {
  const { organizationId } = authContext;

  const encoder = new TextEncoder();

  try {
    const body: ChatStreamBody = await request.json();
    const { query, userTimezone, conversationHistory = [] } = body;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return new Response(sseEvent('error', { message: 'Query is required and must be a non-empty string' }), {
        status: 400,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        },
      });
    }

    const openaiConfig = await getOpenAIConfiguration();
    if (!openaiConfig || !openaiConfig.isEnabled || !openaiConfig.apiKey) {
      return new Response(
        sseEvent('error', { message: 'AI service is not configured. Please configure OpenAI in settings.' }),
        {
          status: 503,
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
          },
        }
      );
    }

    const client = new OpenAI({
      apiKey: openaiConfig.apiKey,
      timeout: 30000,
      maxRetries: 3,
    });

    const systemMessage: { role: 'system' | 'user' | 'assistant' | 'function'; content: string; name?: string } = {
      role: 'system',
      content: `You are an AI assistant for Fusion.

Context: Organization ${organizationId}, Server time: ${new Date().toISOString()}, User timezone: ${userTimezone || 'UTC'}

CORE ROLE: Provide information and analysis only. You do NOT execute actions - users must click buttons to perform actions.

SYSTEM ARCHITECTURE:
- SPACES: Physical locations where devices are co-located (one device per space)
- ALARM ZONES: Logical security groupings (devices can belong to multiple zones)
- DEVICES: Individual hardware components that can be controlled or monitored

TIME HANDLING:
- For relative times ("today", "yesterday"), calculate start/end in user timezone, convert to UTC ISO strings
- For follow-up queries, maintain temporal context from conversation history unless user specifies different time

LANGUAGE RULES:
- Never say "I will [action]" or "I am [action]ing"
- Check function results before mentioning buttons:
  * If actions are available → "You can [action] using the button below"
  * If no actions available → explain why (e.g., "The Front Door zone is already disarmed")
- Explain what you found based on actual data, don't assume buttons exist
- No hyperlinks, markdown links, or clickable elements in responses

FUNCTION USAGE:
- Device status questions → use list_devices, find_controllable_devices
- Space information → use list_spaces
- Alarm zone status → use list_alarm_zones
- Event queries → use count_events, query_events
- System overview → use get_system_overview
- Any request to control devices (individual or bulk) → use appropriate device functions
- Any request to arm/disarm alarm zones (individual or bulk) → use appropriate alarm zone functions
- Any request to lock/unlock devices (individual or bulk) → use lock_device, unlock_device, or find_controllable_devices with actionIntent 'lock'/'unlock'
- Always call functions to get current data before responding

Be concise and helpful. You provide information - users execute actions.`,
    };

    const messages: Array<{ role: 'system' | 'user' | 'assistant' | 'function'; content: string; name?: string }> = [
      systemMessage,
      ...conversationHistory,
      { role: 'user', content: query },
    ];

    const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = openAIFunctions.map((fn) => ({
      type: 'function',
      function: {
        name: fn.name,
        description: fn.description,
        parameters: fn.parameters as Record<string, unknown>,
      },
    }));

    let lastUiData: any = null;
    const functionExecutor = async (name: string, args: Record<string, any>) => {
      const result = await executeFunction(name, args, organizationId);
      lastUiData = result.uiData;
      return result.aiData;
    };

    const isGpt5 = openaiConfig.model === OpenAIModel.GPT_5 || openaiConfig.model === OpenAIModel.GPT_5_MINI;

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(sseEvent(event, data)));
        };

        try {
          // Build Responses API request (streamed)
          // Responses API: use 'instructions' for system; input parts types differ by role
          const instructions = systemMessage.content;
          const input: any[] = [];
          // Prior conversation
          for (const msg of conversationHistory) {
            const role = msg.role === 'user' ? 'user' : 'assistant';
            if (role === 'assistant') {
              input.push({ role: 'assistant', content: [{ type: 'output_text', text: msg.content }] });
            } else {
              input.push({ role: 'user', content: [{ type: 'input_text', text: msg.content }] });
            }
          }
          input.push({ role: 'user', content: [{ type: 'input_text', text: query }] });

          // Map tools to Responses API shape (flattened name/description/parameters)
          const responsesTools = openAIFunctions.map((fn) => ({
            type: 'function',
            name: fn.name,
            description: fn.description,
            parameters: fn.parameters as Record<string, unknown>,
          }));

          const responseParams: any = {
            model: openaiConfig.model,
            input,
            instructions,
            tools: responsesTools,
            tool_choice: 'auto',
            stream: true,
          };
          // Do not pass temperature per product decision
          if (typeof openaiConfig.topP === 'number') responseParams.top_p = openaiConfig.topP;
          if (typeof openaiConfig.maxTokens === 'number') responseParams.max_output_tokens = openaiConfig.maxTokens;

          const initialStream = await client.responses.create(responseParams as any);
          const asyncInitial = initialStream as unknown as AsyncIterable<any>;

          // Accumulate streamed tool calls if present
          const toolCalls: Array<{
            index: number;
            id?: string;
            name?: string;
            arguments: string;
          }> = [];
          let finishReason: string | null = null;
          let sawAnyToken = false;

          for await (const event of asyncInitial) {
            const e: any = event;
            const type: string | undefined = e.type;
            if (type === 'response.output_text.delta') {
              const deltaText: string | undefined = e.delta;
              if (deltaText && deltaText.length > 0) {
                sawAnyToken = true;
                send('token', { delta: deltaText });
              }
              continue;
            }
            if (type === 'response.output_item.added' && e.item?.type === 'function_call') {
              const idx = toolCalls.length;
              toolCalls[idx] = { index: idx, id: e.item?.id, name: e.item?.name, arguments: '' };
              continue;
            }
            if (type === 'response.function_call_arguments.delta') {
              const callId: string | undefined = e.id;
              const deltaArgs: string | undefined = e.delta;
              const call = toolCalls.find(tc => tc.id === callId);
              if (call && deltaArgs) call.arguments += deltaArgs;
              continue;
            }
            if (type === 'response.completed') {
              finishReason = 'completed';
              // break out after loop ends naturally
            }
          }

          // If the model asked to call a function
          if (toolCalls.length > 0) {
            const firstTool = toolCalls[0];
            const fnName = firstTool.name || 'unknown_tool';
            let fnArgs: Record<string, any> = {};
            try {
              fnArgs = JSON.parse(firstTool.arguments || '{}');
            } catch (_) {}

            const toolResult = await functionExecutor(fnName, fnArgs);
            // Fallback to Chat Completions for follow-up streaming with tool messages (stable and supported)
            const generatedToolCallId = 'call_1';
            const followUpMessages: any[] = [
              systemMessage,
              ...conversationHistory,
              { role: 'user', content: query },
              {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: generatedToolCallId,
                    type: 'function',
                    function: { name: fnName, arguments: JSON.stringify(fnArgs) },
                  },
                ],
              },
              { role: 'tool', tool_call_id: generatedToolCallId, content: JSON.stringify(toolResult) },
            ];

            const followUpParams: any = {
              model: openaiConfig.model,
              messages: followUpMessages,
              stream: true,
              top_p: openaiConfig.topP,
            };
            // no temperature
            if (typeof openaiConfig.maxTokens === 'number') {
              if (isGpt5) followUpParams.max_completion_tokens = openaiConfig.maxTokens;
              else followUpParams.max_tokens = openaiConfig.maxTokens;
            }

            const followUp = await client.chat.completions.create(followUpParams as any);
            const followUpStream = followUp as unknown as AsyncIterable<any>;
            for await (const chunk of followUpStream) {
              const delta = (chunk as any)?.choices?.[0]?.delta?.content as string | undefined;
              if (delta) send('token', { delta });
            }
            send('done', { data: lastUiData || undefined });
            controller.close();
            return;
          }

          // No tool call: if we streamed tokens already, we're done; otherwise just send done.
          send('done', {});
          controller.close();
        } catch (err) {
          console.error('[Chat Stream] Error:', err);
          try {
            send('error', { message: err instanceof Error ? err.message : 'Unexpected error' });
          } finally {
            controller.close();
          }
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (outerErr) {
    console.error('[Chat Stream] Outer error:', outerErr);
    return new Response(sseEvent('error', { message: 'Failed to initialize stream' }), {
      status: 500,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  }
});



