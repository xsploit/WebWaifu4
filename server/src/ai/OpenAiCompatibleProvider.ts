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

type ChatCompletionStreamEvent = {
  choices?: Array<{
    delta?: {
      content?: string;
      tool_calls?: ChatCompletionToolCallDelta[];
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

type ChatCompletionToolCallDelta = {
  index?: number;
  id?: string;
  type?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
};

const DEFAULT_MAX_TOOL_ROUNDS = 15;

function normalizeMaxToolRounds(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_MAX_TOOL_ROUNDS;
  }
  return Math.max(1, Math.min(30, Math.round(parsed)));
}

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

function appendToolCallDelta(
  toolCalls: ChatCompletionToolCall[],
  delta: ChatCompletionToolCallDelta,
) {
  const index = delta.index ?? toolCalls.length;
  const current =
    toolCalls[index] ??
    ({
      function: {
        arguments: '',
        name: '',
      },
    } satisfies ChatCompletionToolCall);
  current.id = delta.id ?? current.id;
  current.type = delta.type ?? current.type ?? 'function';
  current.function = {
    arguments: `${current.function?.arguments ?? ''}${delta.function?.arguments ?? ''}`,
    name: delta.function?.name ?? current.function?.name,
  };
  toolCalls[index] = current;
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
      ...(toolsAvailable
        ? {
            tool_choice: request.toolChoiceMode === 'required' ? 'required' : 'auto',
            tools: toChatCompletionTools(),
          }
        : {}),
    };
    const toolsUsed: string[] = [];
    let data: ChatCompletionResponse | null = null;
    const maxToolRounds = normalizeMaxToolRounds(request.maxToolRounds);

    for (let round = 0; round <= maxToolRounds; round += 1) {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: request.signal,
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
      if (round === maxToolRounds) {
        throw new Error(`AI tool loop exceeded ${maxToolRounds} rounds.`);
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

  async completeStream(
    request: ChatProviderRequest,
    handlers: { onTextDelta?: (delta: string) => void } = {},
  ): Promise<ChatProviderResponse> {
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
      stream: true,
      ...(responseFormat ? { response_format: responseFormat } : {}),
      ...(toolsAvailable
        ? {
            tool_choice: request.toolChoiceMode === 'required' ? 'required' : 'auto',
            tools: toChatCompletionTools(),
          }
        : {}),
    };
    const toolsUsed: string[] = [];
    let finalText = '';
    const maxToolRounds = normalizeMaxToolRounds(request.maxToolRounds);

    for (let round = 0; round <= maxToolRounds; round += 1) {
      const { text, toolCalls } = await this.streamChatCompletionRound(
        baseUrl,
        payload,
        handlers.onTextDelta,
        request.signal,
      );
      if (!toolsAvailable || toolCalls.length === 0) {
        finalText = text.trim();
        break;
      }
      if (round === maxToolRounds) {
        throw new Error(`AI tool loop exceeded ${maxToolRounds} rounds.`);
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
            content: text,
            tool_calls: toolCalls,
          },
          ...toolMessages,
        ],
      };
    }

    if (!finalText) {
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
      text: finalText,
    };
  }

  private async streamChatCompletionRound(
    baseUrl: string,
    payload: Record<string, unknown>,
    onTextDelta: ((delta: string) => void) | undefined,
    signal: AbortSignal | undefined,
  ) {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal,
    });

    if (!response.ok) {
      throw new Error(`AI provider failed with HTTP ${response.status}`);
    }
    if (!response.body) {
      throw new Error('AI provider returned an empty streaming response.');
    }

    const decoder = new TextDecoder();
    const reader = response.body.getReader();
    let buffer = '';
    let text = '';
    const toolCalls: ChatCompletionToolCall[] = [];

    const consumeLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data:')) {
        return;
      }
      const payloadText = trimmed.slice('data:'.length).trim();
      if (!payloadText || payloadText === '[DONE]') {
        return;
      }
      const event = JSON.parse(payloadText) as ChatCompletionStreamEvent;
      const delta = event.choices?.[0]?.delta;
      const content = delta?.content;
      if (content) {
        text += content;
        onTextDelta?.(content);
      }
      for (const callDelta of delta?.tool_calls ?? []) {
        appendToolCallDelta(toolCalls, callDelta);
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        consumeLine(line);
      }
    }
    buffer += decoder.decode();
    if (buffer) {
      for (const line of buffer.split(/\r?\n/)) {
        consumeLine(line);
      }
    }

    return { text, toolCalls: toolCalls.filter((call) => call.id || call.function?.name) };
  }
}
