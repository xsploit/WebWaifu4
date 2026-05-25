import type { ChatProvider, ChatProviderRequest, ChatProviderResponse } from './ChatProvider.js';
import {
  TAVILY_OPENAI_TOOLS,
  buildTavilyToolInstruction,
  runTavilyToolCall,
  type OpenAiFunctionCall,
  type TavilyToolOptions,
} from './TavilyTools.js';

export type OpenAiCompatibleProviderOptions = {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  maxTokens: number;
  tavilyTools?: TavilyToolOptions;
  temperature: number;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
      tool_calls?: ChatCompletionToolCall[];
    };
  }>;
};

type ChatCompletionToolCall = {
  id?: string;
  type?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
};

const MAX_TOOL_ROUNDS = 5;

function toChatCompletionResponseFormat(request: ChatProviderRequest) {
  if (request.responseFormat?.type === 'json_object') {
    return { type: 'json_object' };
  }
  if (request.responseFormat?.type === 'json_schema') {
    return {
      json_schema: {
        name: request.responseFormat.name,
        schema: request.responseFormat.schema,
        strict: request.responseFormat.strict ?? false,
      },
      type: 'json_schema',
    };
  }
  return null;
}

function toChatCompletionTools() {
  return TAVILY_OPENAI_TOOLS.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      ...(tool.strict === undefined ? {} : { strict: tool.strict }),
    },
  }));
}

function toTavilyToolCall(call: ChatCompletionToolCall): OpenAiFunctionCall {
  return {
    arguments: call.function?.arguments,
    call_id: call.id,
    id: call.id,
    name: call.function?.name,
    type: call.type,
  };
}

export class OpenAiCompatibleProvider implements ChatProvider {
  constructor(private readonly options: OpenAiCompatibleProviderOptions) {}

  getModel() {
    return this.options.model;
  }

  setModel(model: string) {
    const nextModel = model.trim();
    if (nextModel) {
      this.options.model = nextModel;
    }
  }

  async complete(request: ChatProviderRequest): Promise<ChatProviderResponse> {
    const baseUrl = this.options.apiBaseUrl.replace(/\/+$/, '');
    const responseFormat = toChatCompletionResponseFormat(request);
    const toolsAvailable = request.stateScope !== 'memory' && Boolean(this.options.tavilyTools);
    const systemToolMessage =
      toolsAvailable && !request.messages.some((message) => message.role === 'system')
        ? [{ role: 'system', content: buildTavilyToolInstruction() }]
        : [];
    const messages: Array<Record<string, unknown>> = [
      ...systemToolMessage,
      ...request.messages.map((message) =>
        message.role === 'system' && toolsAvailable
          ? { ...message, content: `${message.content}\n\n${buildTavilyToolInstruction()}` }
          : message,
      ),
    ];
    let payload: Record<string, unknown> = {
      model: this.options.model,
      messages,
      max_tokens: request.maxTokens ?? this.options.maxTokens,
      temperature: request.temperature ?? this.options.temperature,
      ...(responseFormat ? { response_format: responseFormat } : {}),
      ...(toolsAvailable ? { tool_choice: 'auto', tools: toChatCompletionTools() } : {}),
    };
    const toolsUsed: string[] = [];
    let data: ChatCompletionResponse | null = null;

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`AI provider failed with HTTP ${response.status}`);
      }

      data = (await response.json()) as ChatCompletionResponse;
      const message = data.choices?.[0]?.message;
      const toolCalls = toolsAvailable ? (message?.tool_calls ?? []) : [];
      if (toolCalls.length === 0) {
        break;
      }
      if (round === MAX_TOOL_ROUNDS) {
        throw new Error(`AI tool loop exceeded ${MAX_TOOL_ROUNDS} rounds.`);
      }

      const toolMessages = [];
      for (const call of toolCalls) {
        if (!call.id) {
          continue;
        }
        toolsUsed.push(call.function?.name ?? 'unknown');
        toolMessages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: await runTavilyToolCall(this.options.tavilyTools!, toTavilyToolCall(call)),
        });
      }
      payload = {
        ...payload,
        messages: [
          ...(payload.messages as Array<Record<string, unknown>>),
          {
            role: 'assistant',
            content: message?.content ?? '',
            tool_calls: toolCalls,
          },
          ...toolMessages,
        ],
      };
    }

    if (!data) {
      throw new Error('AI provider returned an empty response.');
    }
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) {
      throw new Error('AI provider returned an empty response.');
    }

    return {
      meta: {
        toolNames:
          request.stateScope === 'memory' || !this.options.tavilyTools
            ? []
            : TAVILY_OPENAI_TOOLS.map((tool) => tool.name),
        toolsAvailable,
        toolsUsed,
      },
      text,
    };
  }
}
