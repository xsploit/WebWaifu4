import { WebSocket } from 'ws';
import type { RawData } from 'ws';
import type {
  ChatProvider,
  ChatProviderMessage,
  ChatProviderRequest,
  ChatProviderResponse,
  ChatProviderStreamHandlers,
} from './ChatProvider.js';
import {
  TAVILY_OPENAI_TOOLS,
  buildTavilyToolInstruction,
  runTavilyToolCall,
  type OpenAiFunctionCall,
  type TavilyToolOptions,
} from './TavilyTools.js';

export type OpenAiResponsesStateMode = 'stateless' | 'previous-response' | 'conversation';
export type OpenAiReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

export type OpenAiResponsesProviderOptions = {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  maxOutputTokens: number;
  temperature: number;
  stateMode: OpenAiResponsesStateMode;
  conversationId?: string;
  promptCacheKey?: string;
  promptCacheRetention?: 'in_memory' | '24h';
  reasoningEffort?: OpenAiReasoningEffort;
  safetyIdentifier?: string;
  store: boolean;
  useWebSocket: boolean;
  webSocketUrl?: string;
  tavilyTools?: TavilyToolOptions;
  requestTimeoutMs?: number;
  fetcher?: typeof fetch;
};

type ResponsesInputMessage = {
  type: 'message';
  role: 'user' | 'assistant';
  content: Array<{ type: 'input_text' | 'output_text'; text: string }>;
};

type ResponsesFunctionCallOutput = {
  type: 'function_call_output';
  call_id: string;
  output: string;
};

type OpenAiResponsePayload = {
  id?: string;
  output_text?: string;
  output?: Array<{
    type?: string;
    id?: string;
    call_id?: string;
    name?: string;
    arguments?: string;
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  usage?: {
    input_tokens_details?: {
      cached_tokens?: number;
    };
    prompt_tokens_details?: {
      cached_tokens?: number;
    };
  };
};

type OpenAiWebSocketEvent = {
  type?: string;
  delta?: string;
  text?: string;
  response?: OpenAiResponsePayload;
  output_index?: number;
  arguments?: string;
  item?: unknown;
  part?: unknown;
  content_part?: unknown;
  output?: unknown;
  error?: {
    message?: string;
    code?: string;
  };
};

type OpenAiConversationPayload = {
  id?: string;
};

type OpenAiScopedState = {
  conversationId: string | null;
  previousResponseId: string | null;
  stateSignature: string | null;
  cachedTokens: number;
};

type OpenAiRequestRuntime = {
  stateMode: OpenAiResponsesStateMode;
  useWebSocket: boolean;
};

const MAX_TOOL_ROUNDS = 5;

function splitMessages(messages: readonly ChatProviderMessage[]) {
  const instructions = messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content.trim())
    .filter(Boolean)
    .join('\n\n');
  const input = messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map(
      (message): ResponsesInputMessage => ({
        type: 'message',
        role: message.role === 'assistant' ? 'assistant' : 'user',
        content: [
          {
            type: message.role === 'assistant' ? 'output_text' : 'input_text',
            text: message.content,
          },
        ],
      }),
    );

  return { instructions, input };
}

function extractResponseText(payload: OpenAiResponsePayload) {
  const direct = payload.output_text?.trim();
  if (direct) {
    return direct;
  }

  const text = payload.output
    ?.flatMap((item) => item.content ?? [])
    .map((content) => content.text?.trim() ?? '')
    .filter(Boolean)
    .join(' ')
    .trim();

  return text ?? '';
}

function readTextValue(value: unknown) {
  if (typeof value === 'string') {
    return value;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record['value'] === 'string') {
      return record['value'];
    }
  }
  return '';
}

function extractNestedText(value: unknown): string {
  if (!value) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => extractNestedText(item))
      .filter(Boolean)
      .join(' ')
      .trim();
  }
  if (typeof value !== 'object') {
    return '';
  }

  const record = value as Record<string, unknown>;
  const direct =
    readTextValue(record['text']) ||
    readTextValue(record['output_text']) ||
    readTextValue(record['delta']);
  if (direct) {
    return direct;
  }

  return (
    extractNestedText(record['content']) ||
    extractNestedText(record['output']) ||
    extractNestedText(record['item']) ||
    extractNestedText(record['part']) ||
    extractNestedText(record['content_part'])
  );
}

function extractStreamEventText(event: OpenAiWebSocketEvent) {
  return (
    readTextValue(event.text) ||
    extractNestedText(event.content_part) ||
    extractNestedText(event.part) ||
    extractNestedText(event.item) ||
    extractNestedText(event.output)
  );
}

function applyStreamText(
  currentText: string,
  nextText: string,
  onTextDelta?: (delta: string) => void,
) {
  if (!nextText) {
    return currentText;
  }

  let delta = nextText;
  let updatedText = currentText + nextText;
  if (!currentText) {
    updatedText = nextText;
  } else if (nextText.startsWith(currentText)) {
    delta = nextText.slice(currentText.length);
    updatedText = nextText;
  } else if (currentText.includes(nextText)) {
    delta = '';
    updatedText = currentText;
  }

  if (delta) {
    onTextDelta?.(delta);
  }
  return updatedText;
}

function isTerminalStreamEvent(type: string | undefined) {
  return (
    type === 'response.completed' ||
    type === 'response.incomplete' ||
    type === 'response.output_text.done' ||
    type === 'response.content_part.done' ||
    type === 'response.output_item.done'
  );
}

function getCachedTokenCount(payload: OpenAiResponsePayload) {
  return (
    payload.usage?.input_tokens_details?.cached_tokens ??
    payload.usage?.prompt_tokens_details?.cached_tokens ??
    0
  );
}

function isFunctionCallItem(value: unknown): value is OpenAiFunctionCall {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Record<string, unknown>;
  return record['type'] === 'function_call' && typeof record['call_id'] === 'string';
}

function getFunctionCalls(payload: OpenAiResponsePayload) {
  return (payload.output ?? []).filter(isFunctionCallItem);
}

function createStateSignature(model: string, promptCacheKey: string | undefined) {
  return JSON.stringify({ model, promptCacheKey });
}

function normalizeStateKey(value: string | undefined) {
  const key = (value ?? 'default')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160);
  return key || 'default';
}

function isReasoningStyleModel(model: string) {
  const normalized = model.trim().toLowerCase();
  return (
    normalized.startsWith('gpt-5') ||
    normalized.startsWith('o1') ||
    normalized.startsWith('o3') ||
    normalized.startsWith('o4')
  );
}

function supportsNoReasoningEffort(model: string) {
  const normalized = model.trim().toLowerCase();
  const gpt5Version = normalized.match(/^gpt-5\.(\d+)/);
  return gpt5Version ? Number(gpt5Version[1]) >= 1 : false;
}

function normalizeReasoningEffortForModel(model: string, effort: OpenAiReasoningEffort) {
  if (effort === 'none' && !supportsNoReasoningEffort(model)) {
    return 'minimal';
  }
  return effort;
}

function supportsTemperature(model: string, reasoningEffort?: OpenAiReasoningEffort | null) {
  return !isReasoningStyleModel(model) || reasoningEffort === 'none';
}

function normalizeMaxOutputTokens(requested: number | undefined, fallback: number) {
  const value = Number.isFinite(requested) ? requested! : fallback;
  return Math.max(16, Math.floor(value));
}

function normalizeTemperature(requested: number | undefined, fallback: number) {
  const value = Number.isFinite(requested) ? requested! : fallback;
  return Math.min(2, Math.max(0, value));
}

export class OpenAiResponsesProvider implements ChatProvider {
  private readonly states = new Map<string, OpenAiScopedState>();
  private ws: WebSocket | null = null;
  private wsReady: Promise<WebSocket> | null = null;
  private readonly fetcher: typeof fetch;

  constructor(private readonly options: OpenAiResponsesProviderOptions) {
    this.fetcher = options.fetcher ?? fetch;
    this.states.set('default', this.createInitialState());
  }

  getModel() {
    return this.options.model;
  }

  setModel(model: string) {
    const nextModel = model.trim();
    if (nextModel && nextModel !== this.options.model) {
      this.options.model = nextModel;
      this.resetState();
    }
  }

  getState() {
    const defaultState = this.getScopedState('default');
    return {
      provider: this.options.useWebSocket ? 'openai-responses-ws' : 'openai-responses',
      stateMode: this.options.stateMode,
      conversationId: defaultState.conversationId,
      previousResponseId: defaultState.previousResponseId,
      promptCacheKey: this.options.promptCacheKey,
      promptCacheRetention: this.options.promptCacheRetention ?? 'in_memory',
      cachedTokens: defaultState.cachedTokens,
      stateKeys: Array.from(this.states.keys()).sort(),
      store: this.options.store,
      toolNames: this.options.tavilyTools ? TAVILY_OPENAI_TOOLS.map((tool) => tool.name) : [],
      toolsAvailable: Boolean(this.options.tavilyTools),
      websocketConnected: this.ws?.readyState === WebSocket.OPEN,
    };
  }

  private getRequestRuntime(request: ChatProviderRequest): OpenAiRequestRuntime {
    const stateMode = request.openAiStateMode ?? this.options.stateMode;
    const useWebSocket =
      request.transportMode === 'websocket'
        ? true
        : request.transportMode === 'http-stream'
          ? false
          : this.options.useWebSocket;
    return { stateMode, useWebSocket };
  }

  private canUsePreviousResponseFor(runtime: OpenAiRequestRuntime) {
    return (
      runtime.stateMode === 'previous-response' && (this.options.store || runtime.useWebSocket)
    );
  }

  resetState() {
    this.states.clear();
    this.states.set('default', this.createInitialState());
  }

  async complete(request: ChatProviderRequest): Promise<ChatProviderResponse> {
    const runtime = this.getRequestRuntime(request);
    const payload = await this.createResponsesPayload(request, runtime);
    const result = await this.completeResponsesWithTools(payload, false, undefined, runtime);
    const text = extractResponseText(result.response);

    if (!text) {
      throw new Error('OpenAI Responses API returned an empty response.');
    }

    this.recordResponseState(result.response, request, runtime);
    return {
      text,
      meta: {
        ...this.getRequestState(request, runtime),
        toolsUsed: result.toolsUsed,
      },
    };
  }

  async completeStream(
    request: ChatProviderRequest,
    handlers: ChatProviderStreamHandlers = {},
  ): Promise<ChatProviderResponse> {
    const runtime = this.getRequestRuntime(request);
    const payload = await this.createResponsesPayload(request, runtime);
    const result = await this.completeResponsesWithTools(
      payload,
      true,
      handlers.onTextDelta,
      runtime,
    );
    const text = extractResponseText(result.response);

    if (!text) {
      throw new Error('OpenAI Responses API returned an empty response.');
    }

    this.recordResponseState(result.response, request, runtime);
    return {
      text,
      meta: {
        ...this.getRequestState(request, runtime),
        toolsUsed: result.toolsUsed,
      },
    };
  }

  private get baseUrl() {
    return this.options.apiBaseUrl.replace(/\/+$/, '') || 'https://api.openai.com/v1';
  }

  private get headers() {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.options.apiKey}`,
      'Content-Type': 'application/json',
    };

    if (this.options.safetyIdentifier) {
      headers['OpenAI-Safety-Identifier'] = this.options.safetyIdentifier;
    }

    return headers;
  }

  private createInitialState(): OpenAiScopedState {
    return {
      cachedTokens: 0,
      conversationId: this.options.conversationId?.trim() || null,
      previousResponseId: null,
      stateSignature: null,
    };
  }

  private getScopedState(stateKey: string) {
    const key = normalizeStateKey(stateKey);
    let state = this.states.get(key);
    if (!state) {
      state = this.createInitialState();
      if (key !== 'default') {
        state.conversationId = null;
      }
      this.states.set(key, state);
    }
    return state;
  }

  private getRequestState(
    request: ChatProviderRequest,
    runtime: OpenAiRequestRuntime = this.getRequestRuntime(request),
  ) {
    const key = normalizeStateKey(request.stateKey);
    const state = this.getScopedState(key);
    const stateDisabled =
      request.disableState === true ||
      request.stateScope === 'memory' ||
      runtime.stateMode === 'stateless';
    const reasoningEffort =
      isReasoningStyleModel(this.options.model) && this.options.reasoningEffort
        ? normalizeReasoningEffortForModel(this.options.model, this.options.reasoningEffort)
        : null;
    return {
      provider: runtime.useWebSocket ? 'openai-responses-ws' : 'openai-responses',
      stateKey: key,
      stateMode: stateDisabled ? 'stateless' : runtime.stateMode,
      stateScope: request.stateScope ?? 'chat',
      conversationId: stateDisabled ? null : state.conversationId,
      previousResponseId: stateDisabled ? null : state.previousResponseId,
      requestedTransport: request.transportMode ?? 'server-default',
      transport: runtime.useWebSocket ? 'websocket' : 'http-stream',
      promptCacheKey: this.options.promptCacheKey,
      promptCacheRetention: this.options.promptCacheRetention ?? 'in_memory',
      cachedTokens: stateDisabled ? 0 : state.cachedTokens,
      maxOutputTokens: normalizeMaxOutputTokens(request.maxTokens, this.options.maxOutputTokens),
      reasoningEffort,
      store: this.options.store,
      temperature: supportsTemperature(this.options.model, reasoningEffort)
        ? normalizeTemperature(request.temperature, this.options.temperature)
        : null,
      toolNames: this.options.tavilyTools ? TAVILY_OPENAI_TOOLS.map((tool) => tool.name) : [],
      toolsAvailable: Boolean(this.options.tavilyTools),
      websocketConnected: this.ws?.readyState === WebSocket.OPEN,
    };
  }

  private async createResponsesPayload(
    request: ChatProviderRequest,
    runtime: OpenAiRequestRuntime,
  ) {
    const { instructions, input } = splitMessages(request.messages);
    const key = normalizeStateKey(request.stateKey);
    const state = this.getScopedState(key);
    const stateDisabled =
      request.disableState === true ||
      request.stateScope === 'memory' ||
      runtime.stateMode === 'stateless';
    const usesConversation = !stateDisabled && runtime.stateMode === 'conversation';
    const canContinuePreviousResponse =
      !stateDisabled &&
      this.canUsePreviousResponseFor(runtime) &&
      Boolean(state.previousResponseId);
    const signature = createStateSignature(this.options.model, this.options.promptCacheKey);
    if (!stateDisabled) {
      if (!usesConversation && state.stateSignature && state.stateSignature !== signature) {
        state.previousResponseId = null;
        state.conversationId =
          key === 'default' ? this.options.conversationId?.trim() || null : null;
      }
      state.stateSignature = signature;
    }

    const reasoningEffort =
      isReasoningStyleModel(this.options.model) && this.options.reasoningEffort
        ? normalizeReasoningEffortForModel(this.options.model, this.options.reasoningEffort)
        : null;
    const conversationAlreadySeeded =
      usesConversation &&
      Boolean(state.conversationId || (key === 'default' && this.options.conversationId?.trim()));
    const requestInput =
      canContinuePreviousResponse && input.length > 0
        ? input.slice(-1)
        : usesConversation && conversationAlreadySeeded && input.length > 0
          ? input.slice(-1)
          : input;

    const payload: Record<string, unknown> = {
      model: this.options.model,
      input: requestInput,
      max_output_tokens: normalizeMaxOutputTokens(request.maxTokens, this.options.maxOutputTokens),
      store: this.options.store,
    };

    if (request.responseFormat?.type === 'json_object') {
      payload.text = {
        format: {
          type: 'json_object',
        },
      };
    } else if (request.responseFormat?.type === 'json_schema') {
      payload.text = {
        format: {
          name: request.responseFormat.name,
          schema: request.responseFormat.schema,
          strict: request.responseFormat.strict ?? false,
          type: 'json_schema',
        },
      };
    }

    if (supportsTemperature(this.options.model, reasoningEffort)) {
      payload.temperature = normalizeTemperature(request.temperature, this.options.temperature);
    }

    const runtimeInstructions = this.options.tavilyTools ? buildTavilyToolInstruction() : '';
    const finalInstructions = [instructions, runtimeInstructions].filter(Boolean).join('\n\n');
    if (finalInstructions) {
      payload.instructions = finalInstructions;
    }

    if (this.options.promptCacheKey) {
      payload.prompt_cache_key = this.options.promptCacheKey;
    }

    if (this.options.promptCacheRetention) {
      payload.prompt_cache_retention = this.options.promptCacheRetention;
    }

    if (reasoningEffort) {
      payload.reasoning = {
        effort: reasoningEffort,
      };
    }

    if (this.options.tavilyTools) {
      payload.tools = TAVILY_OPENAI_TOOLS;
      payload.tool_choice = 'auto';
    }

    if (usesConversation) {
      payload.conversation = await this.ensureConversationId(state);
      return payload;
    }

    if (!stateDisabled && this.canUsePreviousResponseFor(runtime) && state.previousResponseId) {
      payload.previous_response_id = state.previousResponseId;
    }

    return payload;
  }

  private async completeResponsesWithTools(
    initialPayload: Record<string, unknown>,
    stream: boolean,
    onTextDelta?: (delta: string) => void,
    runtime: OpenAiRequestRuntime = {
      stateMode: this.options.stateMode,
      useWebSocket: this.options.useWebSocket,
    },
  ) {
    let payload = initialPayload;
    let response = await this.sendResponsesPayload(payload, stream, onTextDelta, runtime);
    const toolsUsed: string[] = [];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const functionCalls = getFunctionCalls(response);
      if (!this.options.tavilyTools || functionCalls.length === 0) {
        return { response, toolsUsed };
      }

      const toolOutputs: ResponsesFunctionCallOutput[] = [];
      for (const call of functionCalls) {
        if (!call.call_id) {
          continue;
        }
        toolsUsed.push(call.name ?? 'unknown');
        toolOutputs.push({
          type: 'function_call_output',
          call_id: call.call_id,
          output: await runTavilyToolCall(this.options.tavilyTools, call),
        });
      }

      if (toolOutputs.length === 0) {
        return { response, toolsUsed };
      }

      payload = this.createToolFollowupPayload(
        payload,
        response,
        functionCalls,
        toolOutputs,
        runtime,
      );
      response = await this.sendResponsesPayload(payload, stream, onTextDelta, runtime);
    }

    return { response, toolsUsed };
  }

  private async sendResponsesPayload(
    payload: Record<string, unknown>,
    stream: boolean,
    onTextDelta?: (delta: string) => void,
    runtime: OpenAiRequestRuntime = {
      stateMode: this.options.stateMode,
      useWebSocket: this.options.useWebSocket,
    },
  ) {
    if (runtime.useWebSocket) {
      return this.completeWithWebSocket(payload, stream ? onTextDelta : undefined);
    }

    return stream
      ? this.completeWithHttpStream(payload, onTextDelta)
      : this.completeWithHttp(payload);
  }

  private createToolFollowupPayload(
    payload: Record<string, unknown>,
    response: OpenAiResponsePayload,
    functionCalls: OpenAiFunctionCall[],
    toolOutputs: ResponsesFunctionCallOutput[],
    runtime: OpenAiRequestRuntime,
  ) {
    const nextPayload = { ...payload };
    const usesConversation = Boolean(nextPayload['conversation']);
    const canUsePreviousResponseState =
      this.canUsePreviousResponseFor(runtime) && Boolean(response.id) && !usesConversation;
    if (canUsePreviousResponseState) {
      nextPayload.previous_response_id = response.id;
      nextPayload.input = toolOutputs;
      return nextPayload;
    }

    const responseOutput = Array.isArray(response.output) ? response.output : functionCalls;
    nextPayload.input = [
      ...(usesConversation ? [] : Array.isArray(payload['input']) ? payload['input'] : []),
      ...responseOutput,
      ...toolOutputs,
    ];
    return nextPayload;
  }

  private async ensureConversationId(state: OpenAiScopedState) {
    if (state.conversationId) {
      return state.conversationId;
    }

    const response = await this.fetcher(`${this.baseUrl}/conversations`, {
      method: 'POST',
      headers: this.headers,
      body: '{}',
    });

    if (!response.ok) {
      throw new Error(`OpenAI Conversations API failed with HTTP ${response.status}.`);
    }

    const data = (await response.json()) as OpenAiConversationPayload;
    if (!data.id) {
      throw new Error('OpenAI Conversations API did not return a conversation id.');
    }

    state.conversationId = data.id;
    return data.id;
  }

  private async completeWithHttp(payload: Record<string, unknown>) {
    const response = await this.fetcher(`${this.baseUrl}/responses`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const message = await response.text().catch(() => '');
      throw new Error(
        `OpenAI Responses API failed with HTTP ${response.status}${message ? `: ${message}` : ''}`,
      );
    }

    return (await response.json()) as OpenAiResponsePayload;
  }

  private async completeWithHttpStream(
    payload: Record<string, unknown>,
    onTextDelta?: (delta: string) => void,
  ) {
    const response = await this.fetcher(`${this.baseUrl}/responses`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ ...payload, stream: true }),
    });

    if (!response.ok) {
      const message = await response.text().catch(() => '');
      throw new Error(
        `OpenAI Responses API failed with HTTP ${response.status}${message ? `: ${message}` : ''}`,
      );
    }

    return this.parseHttpStreamResponse(response, onTextDelta);
  }

  private async parseHttpStreamResponse(
    response: Response,
    onTextDelta?: (delta: string) => void,
  ): Promise<OpenAiResponsePayload> {
    if (!response.body) {
      return (await response.json()) as OpenAiResponsePayload;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let text = '';
    let completed: OpenAiResponsePayload | null = null;
    const functionCalls = new Map<number, OpenAiFunctionCall>();

    const handleBlock = (block: string) => {
      const data = block
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n')
        .trim();

      if (!data || data === '[DONE]') {
        return;
      }

      const event = JSON.parse(data) as OpenAiWebSocketEvent;
      if (event.type === 'response.output_item.added' && isFunctionCallItem(event.item)) {
        functionCalls.set(event.output_index ?? functionCalls.size, { ...event.item });
        return;
      }
      if (event.type === 'response.function_call_arguments.delta') {
        const index = event.output_index ?? 0;
        const current = functionCalls.get(index);
        if (current) {
          current.arguments = `${current.arguments ?? ''}${event.delta ?? ''}`;
        }
        return;
      }
      if (event.type === 'response.function_call_arguments.done') {
        const index = event.output_index ?? 0;
        const current = functionCalls.get(index);
        if (current && typeof event.arguments === 'string') {
          current.arguments = event.arguments;
        }
        return;
      }
      if (event.type === 'response.output_item.done' && isFunctionCallItem(event.item)) {
        functionCalls.set(event.output_index ?? functionCalls.size, { ...event.item });
        return;
      }

      const delta = readTextValue(event.delta);
      if (delta) {
        text += delta;
        onTextDelta?.(delta);
      } else {
        const eventText = extractStreamEventText(event);
        if (eventText) {
          text = applyStreamText(text, eventText, onTextDelta);
        }
      }
      if (event.type === 'response.completed' && event.response) {
        completed = event.response;
        return;
      }
      if (event.type === 'response.incomplete') {
        completed = event.response ?? completed;
        return;
      }
      if (isTerminalStreamEvent(event.type)) {
        completed = event.response ?? completed;
        return;
      }
      if (event.type === 'response.failed' || event.type === 'error') {
        throw new Error(event.error?.message ?? `OpenAI Responses stream event ${event.type}.`);
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() ?? '';
      for (const block of blocks) {
        handleBlock(block);
      }
    }

    buffer += decoder.decode();
    if (buffer.trim()) {
      handleBlock(buffer);
    }

    const completedPayload = (completed ?? {}) as OpenAiResponsePayload;
    const output = [...(completedPayload.output ?? [])];
    const knownCallIds = new Set(output.map((item) => item.call_id).filter(Boolean));
    for (const call of functionCalls.values()) {
      if (!knownCallIds.has(call.call_id)) {
        output.push(call);
      }
    }

    const payload = text ? { ...completedPayload, output_text: text } : completedPayload;
    return output.length > 0 ? { ...payload, output } : payload;
  }

  private async completeWithWebSocket(
    payload: Record<string, unknown>,
    onTextDelta?: (delta: string) => void,
  ): Promise<OpenAiResponsePayload> {
    const socket = await this.createRequestWebSocket();

    return new Promise<OpenAiResponsePayload>((resolve, reject) => {
      let text = '';
      let settled = false;
      const functionCalls = new Map<number, OpenAiFunctionCall>();
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('OpenAI Responses WebSocket request timed out.'));
      }, this.options.requestTimeoutMs ?? 120000);

      const cleanup = () => {
        settled = true;
        clearTimeout(timeout);
        socket.off('message', onMessage);
        socket.off('close', onClose);
        socket.off('error', onError);
        if (this.ws === socket) {
          this.ws = null;
          this.wsReady = null;
        }
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
          socket.close();
        }
      };

      const finish = (response: OpenAiResponsePayload) => {
        const output = [...(response.output ?? [])];
        const knownCallIds = new Set(output.map((item) => item.call_id).filter(Boolean));
        for (const call of functionCalls.values()) {
          if (!knownCallIds.has(call.call_id)) {
            output.push(call);
          }
        }
        cleanup();
        const payload = text ? { ...response, output_text: text } : response;
        resolve(output.length > 0 ? { ...payload, output } : payload);
      };

      const fail = (error: Error) => {
        cleanup();
        reject(error);
      };

      const onMessage = (raw: RawData) => {
        if (settled) {
          return;
        }

        const event = JSON.parse(raw.toString()) as OpenAiWebSocketEvent;
        if (event.type === 'response.output_item.added' && isFunctionCallItem(event.item)) {
          functionCalls.set(event.output_index ?? functionCalls.size, { ...event.item });
          return;
        }
        if (event.type === 'response.function_call_arguments.delta') {
          const index = event.output_index ?? 0;
          const current = functionCalls.get(index);
          if (current) {
            current.arguments = `${current.arguments ?? ''}${event.delta ?? ''}`;
          }
          return;
        }
        if (event.type === 'response.function_call_arguments.done') {
          const index = event.output_index ?? 0;
          const current = functionCalls.get(index);
          if (current && typeof event.arguments === 'string') {
            current.arguments = event.arguments;
          }
          return;
        }
        if (event.type === 'response.output_item.done' && isFunctionCallItem(event.item)) {
          functionCalls.set(event.output_index ?? functionCalls.size, { ...event.item });
          return;
        }

        const delta = readTextValue(event.delta);
        if (delta) {
          text += delta;
          onTextDelta?.(delta);
        } else {
          const eventText = extractStreamEventText(event);
          if (eventText) {
            text = applyStreamText(text, eventText, onTextDelta);
          }
        }
        if (event.type === 'response.completed' && event.response) {
          finish(event.response);
          return;
        }
        if (event.type === 'response.incomplete') {
          finish(event.response ?? {});
          return;
        }
        if (isTerminalStreamEvent(event.type)) {
          finish(event.response ?? {});
          return;
        }
        if (event.type === 'response.failed' || event.type === 'error') {
          fail(
            new Error(event.error?.message ?? `OpenAI Responses WebSocket event ${event.type}.`),
          );
        }
      };

      const onClose = () => {
        if (!settled) {
          this.ws = null;
          this.wsReady = null;
          fail(new Error('OpenAI Responses WebSocket closed before completion.'));
        }
      };

      const onError = (error: Error) => {
        if (!settled) {
          this.ws = null;
          this.wsReady = null;
          fail(error);
        }
      };

      socket.on('message', onMessage);
      socket.on('close', onClose);
      socket.on('error', onError);
      socket.send(JSON.stringify({ type: 'response.create', ...payload }));
    });
  }

  private async createRequestWebSocket() {
    return new Promise<WebSocket>((resolve, reject) => {
      const url =
        this.options.webSocketUrl?.trim() || this.baseUrl.replace(/^http/, 'ws') + '/responses';
      const socket = new WebSocket(url, {
        headers: this.headers,
      });

      socket.once('open', () => {
        this.ws = socket;
        resolve(socket);
      });
      socket.once('error', (error) => {
        reject(error);
      });
      socket.once('close', () => {
        if (this.ws === socket) {
          this.ws = null;
          this.wsReady = null;
        }
      });
    });
  }

  private recordResponseState(
    response: OpenAiResponsePayload,
    request: ChatProviderRequest,
    runtime: OpenAiRequestRuntime,
  ) {
    const state = this.getScopedState(normalizeStateKey(request.stateKey));
    const stateDisabled =
      request.disableState === true ||
      request.stateScope === 'memory' ||
      runtime.stateMode === 'stateless';
    if (stateDisabled) {
      return;
    }
    if (!stateDisabled && this.canUsePreviousResponseFor(runtime) && response.id) {
      state.previousResponseId = response.id;
    }
    state.cachedTokens = getCachedTokenCount(response);
  }
}
