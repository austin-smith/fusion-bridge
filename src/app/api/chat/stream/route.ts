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
          // First, get the assistant decision about tool calls without streaming
          const initialParams: any = {
            model: openaiConfig.model,
            messages,
            tools,
            tool_choice: 'auto',
            top_p: openaiConfig.topP,
          };
          if (!isGpt5 && typeof openaiConfig.temperature === 'number') {
            initialParams.temperature = openaiConfig.temperature;
          } else if (isGpt5 && openaiConfig.temperature === 1) {
            initialParams.temperature = 1;
          }
          if (typeof openaiConfig.maxTokens === 'number') {
            if (isGpt5) initialParams.max_completion_tokens = openaiConfig.maxTokens;
            else initialParams.max_tokens = openaiConfig.maxTokens;
          }

          const first = await client.chat.completions.create(initialParams);
          const firstMsg = first.choices[0]?.message;

          if (firstMsg?.tool_calls && firstMsg.tool_calls.length > 0) {
            const toolCall = firstMsg.tool_calls[0];
            if (toolCall.type !== 'function' || !('function' in toolCall)) {
              send('error', { message: 'Unsupported tool call type' });
              controller.close();
              return;
            }
            const fnName = toolCall.function.name;
            let fnArgs: Record<string, any> = {};
            try {
              fnArgs = JSON.parse(toolCall.function.arguments || '{}');
            } catch (_) {}

            send('status', { message: `Calling ${fnName}...` });
            const toolResult = await functionExecutor(fnName, fnArgs);
            send('status', { message: `Received results from ${fnName}. Generating answer...` });

            const followUpParams: any = {
              model: openaiConfig.model,
              messages: [
                ...messages,
                { role: 'assistant', content: firstMsg.content, tool_calls: firstMsg.tool_calls },
                { role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify(toolResult) },
              ],
              stream: true,
              top_p: openaiConfig.topP,
            };
            const followUpTemp = openaiConfig.temperature ?? 1;
            if (!isGpt5) followUpParams.temperature = followUpTemp;
            else if (isGpt5 && followUpTemp === 1) followUpParams.temperature = 1;
            const followUpMax = openaiConfig.maxTokens ?? 500;
            if (isGpt5) followUpParams.max_completion_tokens = followUpMax;
            else followUpParams.max_tokens = followUpMax;

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

          // No tool call → pseudo-stream the content
          const content = firstMsg?.content ?? '';
          for (const piece of splitTextToPseudoStream(content)) {
            send('token', { delta: piece });
            // Small pacing to feel like a stream without blocking too long
            // await new Promise((r) => setTimeout(r, 10));
          }
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



