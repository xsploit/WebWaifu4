import OpenAI from 'openai';
import { WebSocket } from 'ws';
import type { RawData } from 'ws';
import type {
  ChatProvider,
  ChatProviderMessage,
  ChatProviderRequest,
  ChatProviderResponse,
  ChatProviderStreamHandlers,
  ChatProviderStateOptions,
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
  closeWebSocketAfterRequest?: boolean;
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
  providerName?: 'openai-responses' | 'openrouter-responses';
};

type ResponsesInputMessage = {
  type: 'message';
  role: 'user' | 'assistant';
  content: Array<
    | { type: 'input_text' | 'output_text'; text: string }
    | { type: 'input_image'; image_url: string; detail?: 'auto' | 'high' | 'low' }
  >;
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
      text?: unknown;
      output_text?: unknown;
      refusal?: unknown;
    }>;
  }>;
  status?: string;
  error?: {
    message?: string;
    code?: string;
  };
  incomplete_details?: {
    reason?: string;
  };
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

type UnsupportedOpenAiParam = 'reasoning' | 'temperature';
type StreamReadResult<T> = { done: false; value: T } | { done: true; value?: T };

const DEFAULT_REQUEST_TIMEOUT_MS = 120000;
const MAX_WEBSOCKET_QUEUE_DEPTH = 10;
const OPENROUTER_ANTHROPIC_MODEL_PATTERN = /(?:^|\/)(?:anthropic\/)?claude-|^anthropic\//i;

function getWebSocketStatus(ws: WebSocket | null) {
  if (!ws) {
    return 'idle';
  }
  switch (ws.readyState) {
    case WebSocket.CONNECTING:
      return 'connecting';
    case WebSocket.OPEN:
      return 'connected';
    case WebSocket.CLOSING:
      return 'closing';
    case WebSocket.CLOSED:
      return 'closed';
    default:
      return 'unknown';
  }
}

type StreamingFunctionCallState = {
  callSeenAtById: Map<string, number>;
  callsById: Map<string, OpenAiFunctionCall>;
  callsByOutputIndex: Map<number, OpenAiFunctionCall>;
  outputIndexSeenAt: Map<number, number>;
  outputIndexToCallId: Map<number, string>;
};

const MAX_TOOL_ROUNDS = 5;
const STREAMING_FUNCTION_CALL_TTL_MS = 60_000;

function splitMessages(messages: readonly ChatProviderMessage[]) {
  const instructions = messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content.trim())
    .filter(Boolean)
    .join('\n\n');
  const input = messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message): ResponsesInputMessage => {
      const content: ResponsesInputMessage['content'] = [
        {
          type: message.role === 'assistant' ? 'output_text' : 'input_text',
          text: message.content,
        },
      ];
      if (message.role === 'user') {
        message.images
          ?.filter((image) => image.imageUrl.trim())
          .slice(0, 2)
          .forEach((image) => {
            content.push({
              type: 'input_image',
              detail: image.detail ?? 'low',
              image_url: image.imageUrl,
            });
          });
      }
      return {
        type: 'message',
        role: message.role === 'assistant' ? 'assistant' : 'user',
        content,
      };
    });

  return { instructions, input };
}

function extractResponseText(payload: OpenAiResponsePayload) {
  const direct = payload.output_text?.trim();
  if (direct) {
    return direct;
  }

  const text = payload.output
    ?.filter(isTextOutputItem)
    ?.flatMap((item) => item.content ?? [])
    .filter(isTextContentPart)
    .map(
      (content) =>
        readTextValue(content.text) ||
        readTextValue(content.output_text) ||
        readTextValue(content.refusal),
    )
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

function readType(value: unknown) {
  if (!value || typeof value !== 'object') {
    return '';
  }
  const type = (value as Record<string, unknown>)['type'];
  return typeof type === 'string' ? type.toLowerCase() : '';
}

function isReasoningType(type: string | undefined) {
  const normalized = type?.toLowerCase() ?? '';
  return normalized.includes('reasoning') || normalized.includes('thinking');
}

function isTextContentPart(value: unknown) {
  const type = readType(value);
  return !type || type === 'output_text' || type === 'refusal' || type === 'text';
}

function isTextOutputItem(value: unknown) {
  const type = readType(value);
  return !type || type === 'message' || type === 'output_text';
}

function isReasoningStreamEvent(event: OpenAiWebSocketEvent) {
  return (
    isReasoningType(event.type) ||
    isReasoningType(readType(event.item)) ||
    isReasoningType(readType(event.part)) ||
    isReasoningType(readType(event.content_part))
  );
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
  if (isReasoningType(readType(record))) {
    return '';
  }
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

function extractStreamDeltaText(event: OpenAiWebSocketEvent) {
  if (isReasoningStreamEvent(event)) {
    return '';
  }
  const delta = readTextValue(event.delta);
  if (delta) {
    return delta;
  }

  const type = event.type?.toLowerCase() ?? '';
  if (type && !type.endsWith('.delta') && type !== 'delta') {
    return '';
  }

  return (
    readTextValue(event.text) ||
    extractNestedText(event.content_part) ||
    extractNestedText(event.part) ||
    extractNestedText(event.item) ||
    extractNestedText(event.output)
  );
}

function isTerminalStreamEvent(type: string | undefined) {
  return type === 'response.completed' || type === 'response.incomplete';
}

function getEmptyResponseErrorMessage(payload: OpenAiResponsePayload) {
  if (payload.error?.message) {
    return `OpenAI Responses API failed: ${payload.error.message}`;
  }

  if (payload.status && payload.status !== 'completed') {
    const reason = payload.incomplete_details?.reason;
    return `OpenAI Responses API finished with status ${payload.status}${
      reason ? ` (${reason})` : ''
    } before producing text.`;
  }

  if (payload.incomplete_details?.reason) {
    return `OpenAI Responses API returned an incomplete response (${payload.incomplete_details.reason}) before producing text.`;
  }

  return 'OpenAI Responses API returned an empty response.';
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

function isStreamingFunctionCallItem(value: unknown): value is OpenAiFunctionCall {
  // Stream deltas can arrive before the final item supplies call_id.
  return Boolean(
    value &&
    typeof value === 'object' &&
    (value as Record<string, unknown>)['type'] === 'function_call',
  );
}

function getFunctionCalls(payload: OpenAiResponsePayload) {
  return (payload.output ?? []).filter(isFunctionCallItem);
}

function createStreamingFunctionCallState(): StreamingFunctionCallState {
  return {
    callSeenAtById: new Map<string, number>(),
    callsById: new Map<string, OpenAiFunctionCall>(),
    callsByOutputIndex: new Map<number, OpenAiFunctionCall>(),
    outputIndexSeenAt: new Map<number, number>(),
    outputIndexToCallId: new Map<number, string>(),
  };
}

function pruneStreamingFunctionCallState(state: StreamingFunctionCallState, now = Date.now()) {
  const cutoff = now - STREAMING_FUNCTION_CALL_TTL_MS;
  for (const [callId, seenAt] of state.callSeenAtById.entries()) {
    if (seenAt < cutoff) {
      state.callSeenAtById.delete(callId);
      state.callsById.delete(callId);
    }
  }
  for (const [outputIndex, seenAt] of state.outputIndexSeenAt.entries()) {
    if (seenAt < cutoff) {
      state.outputIndexSeenAt.delete(outputIndex);
      state.callsByOutputIndex.delete(outputIndex);
      state.outputIndexToCallId.delete(outputIndex);
    }
  }
}

function rememberStreamingFunctionCall(
  state: StreamingFunctionCallState,
  event: OpenAiWebSocketEvent,
  item: OpenAiFunctionCall,
) {
  pruneStreamingFunctionCallState(state);
  const callId = item.call_id;
  const outputIndex = event.output_index;
  const pendingByIndex =
    typeof outputIndex === 'number' ? state.callsByOutputIndex.get(outputIndex) : undefined;

  if (!callId) {
    if (typeof outputIndex === 'number') {
      state.callsByOutputIndex.set(outputIndex, { ...pendingByIndex, ...item });
      state.outputIndexSeenAt.set(outputIndex, Date.now());
    }
    return;
  }

  const current = state.callsById.get(callId) ?? {};
  state.callsById.set(callId, { ...pendingByIndex, ...current, ...item });
  state.callSeenAtById.set(callId, Date.now());
  if (typeof outputIndex === 'number') {
    state.outputIndexToCallId.set(outputIndex, callId);
    state.callsByOutputIndex.delete(outputIndex);
    state.outputIndexSeenAt.delete(outputIndex);
  }
}

function getStreamingFunctionCallForEvent(
  state: StreamingFunctionCallState,
  event: OpenAiWebSocketEvent,
) {
  pruneStreamingFunctionCallState(state);
  if (typeof event.output_index !== 'number') {
    return null;
  }
  const callId = state.outputIndexToCallId.get(event.output_index);
  return callId
    ? (state.callsById.get(callId) ?? null)
    : (state.callsByOutputIndex.get(event.output_index) ?? null);
}

function mergeStreamingFunctionCalls(
  output: NonNullable<OpenAiResponsePayload['output']>,
  state: StreamingFunctionCallState,
) {
  pruneStreamingFunctionCallState(state);
  const knownCallIds = new Set(output.map((item) => item.call_id).filter(Boolean));
  for (const call of state.callsById.values()) {
    if (!knownCallIds.has(call.call_id)) {
      output.push(call);
    }
  }
  if (state.callsByOutputIndex.size > 0) {
    console.warn(
      `[OpenAiResponsesProvider] Dropped ${state.callsByOutputIndex.size} streamed function call item(s) without call_id.`,
    );
    state.callsByOutputIndex.clear();
  }
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

function normalizeReasoningEffortForModel(effort: OpenAiReasoningEffort | undefined) {
  if (!effort || effort === 'none') {
    return null;
  }
  return effort;
}

function supportsTemperature(model: string, _reasoningEffort?: OpenAiReasoningEffort | null) {
  return !isReasoningStyleModel(model);
}

function isOpenRouterBaseUrl(value: string) {
  try {
    return new URL(value).hostname.toLowerCase().endsWith('openrouter.ai');
  } catch {
    return value.toLowerCase().includes('openrouter.ai');
  }
}

function getOpenRouterCacheControl(
  model: string,
  retention: OpenAiResponsesProviderOptions['promptCacheRetention'] | undefined,
) {
  if (!OPENROUTER_ANTHROPIC_MODEL_PATTERN.test(model.trim())) {
    return null;
  }
  return retention === '24h' ? { type: 'ephemeral', ttl: '1h' } : { type: 'ephemeral' };
}

function normalizeMaxOutputTokens(requested: number | undefined, fallback: number) {
  const value = Number.isFinite(requested) ? requested! : fallback;
  return Math.max(16, Math.floor(value));
}

function normalizeTemperature(requested: number | undefined, fallback: number) {
  const value = Number.isFinite(requested) ? requested! : fallback;
  return Math.min(2, Math.max(0, value));
}

function getUnsupportedParamFromError(error: unknown): UnsupportedOpenAiParam | null {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  if (!normalized.includes('unsupported parameter')) {
    return null;
  }
  if (normalized.includes('reasoning.effort') || normalized.includes("'reasoning'")) {
    return 'reasoning';
  }
  if (normalized.includes('temperature')) {
    return 'temperature';
  }
  return null;
}

export class OpenAiResponsesProvider implements ChatProvider {
  private readonly states = new Map<string, OpenAiScopedState>();
  private readonly unsupportedParamsByModel = new Map<string, Set<UnsupportedOpenAiParam>>();
  private ws: WebSocket | null = null;
  private wsReady: Promise<WebSocket> | null = null;
  private wsQueue: Promise<void> = Promise.resolve();
  private wsQueueDepth = 0;
  private sdkClient: OpenAI | null = null;
  private readonly fetcher: typeof fetch;
  private readonly useSdkHttp: boolean;

  constructor(private readonly options: OpenAiResponsesProviderOptions) {
    this.useSdkHttp = !options.fetcher;
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
    }
  }

  getState(stateKey?: string, options: ChatProviderStateOptions = {}) {
    const defaultState = this.getScopedState('default');
    const runtime = {
      stateMode: options.openAiStateMode ?? this.options.stateMode,
      useWebSocket:
        options.transportMode === 'websocket'
          ? true
          : options.transportMode === 'http-stream'
            ? false
            : this.options.useWebSocket,
    };
    const snapshots = Array.from(this.states.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, state]) => this.getStateSnapshot(key, state));
    const activeStateKey = stateKey ? normalizeStateKey(stateKey) : 'default';
    const activeState =
      snapshots.find((snapshot) => snapshot.stateKey === activeStateKey) ??
      this.getStateSnapshot(activeStateKey, null);
    return {
      provider: this.getRuntimeProviderName(runtime),
      stateMode: runtime.stateMode,
      activeState,
      activeStateKey,
      conversationId: activeState.conversationId ?? defaultState.conversationId,
      previousResponseId: activeState.previousResponseId ?? defaultState.previousResponseId,
      promptCacheKey: this.options.promptCacheKey,
      promptCacheRetention: this.options.promptCacheRetention ?? 'in_memory',
      cachedTokens: activeState.cachedTokens ?? defaultState.cachedTokens,
      scopedStates: snapshots,
      stateKeys: snapshots.map((snapshot) => snapshot.stateKey),
      store: this.options.store,
      toolNames: this.options.tavilyTools ? TAVILY_OPENAI_TOOLS.map((tool) => tool.name) : [],
      toolsAvailable: Boolean(this.options.tavilyTools),
      requestedTransport: 'server-default',
      transport: runtime.useWebSocket ? 'websocket' : 'http-stream',
      websocketConfigured: runtime.useWebSocket,
      websocketConnected: this.ws?.readyState === WebSocket.OPEN,
      websocketStatus: runtime.useWebSocket ? getWebSocketStatus(this.ws) : 'disabled',
      websocketLifecycle: runtime.useWebSocket
        ? this.options.closeWebSocketAfterRequest
          ? 'per-reply'
          : 'persistent'
        : 'disabled',
    };
  }

  private getStateSnapshot(stateKey: string, state: OpenAiScopedState | null) {
    return {
      stateKey,
      conversationId: state?.conversationId ?? null,
      previousResponseId: state?.previousResponseId ?? null,
      cachedTokens: state?.cachedTokens ?? 0,
    };
  }

  private getRequestRuntime(request: ChatProviderRequest): OpenAiRequestRuntime {
    if (this.isOpenRouterRuntime()) {
      return { stateMode: 'stateless', useWebSocket: false };
    }
    const stateMode = request.openAiStateMode ?? this.options.stateMode;
    const useWebSocket =
      request.transportMode === 'websocket'
        ? true
        : request.transportMode === 'http-stream'
          ? false
          : this.options.useWebSocket;
    return { stateMode, useWebSocket };
  }

  private isOpenRouterRuntime() {
    return (
      this.options.providerName === 'openrouter-responses' || isOpenRouterBaseUrl(this.baseUrl)
    );
  }

  private getRuntimeProviderName(runtime: OpenAiRequestRuntime) {
    if (this.isOpenRouterRuntime()) {
      return 'openrouter-responses';
    }
    return runtime.useWebSocket ? 'openai-responses-ws' : 'openai-responses';
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

  dispose() {
    const socket = this.ws;
    this.ws = null;
    this.wsReady = null;
    if (
      socket &&
      (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)
    ) {
      socket.close();
    }
  }

  async complete(request: ChatProviderRequest): Promise<ChatProviderResponse> {
    const runtime = this.getRequestRuntime(request);
    const payload = await this.createResponsesPayload(request, runtime);
    const result = await this.completeResponsesWithTools(payload, false, undefined, runtime);
    const text = extractResponseText(result.response);

    if (!text) {
      throw new Error(getEmptyResponseErrorMessage(result.response));
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
      throw new Error(getEmptyResponseErrorMessage(result.response));
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

  private get capabilityKey() {
    return `${this.baseUrl}|${this.options.model.trim().toLowerCase()}`;
  }

  private getOpenAiClient() {
    if (!this.sdkClient) {
      this.sdkClient = new OpenAI({
        apiKey: this.options.apiKey,
        baseURL: this.baseUrl,
        timeout: this.options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
      });
    }
    return this.sdkClient;
  }

  private async createSdkResponse(payload: Record<string, unknown>) {
    return (await this.getOpenAiClient().responses.create(
      payload as never,
    )) as unknown as OpenAiResponsePayload;
  }

  private async createSdkResponseStream(payload: Record<string, unknown>) {
    return (await this.getOpenAiClient().responses.create({
      ...payload,
      stream: true,
    } as never)) as unknown as AsyncIterable<OpenAiWebSocketEvent>;
  }

  private async createSdkConversation() {
    return (await this.getOpenAiClient().conversations.create()) as unknown as OpenAiConversationPayload;
  }

  private isUnsupportedParam(param: UnsupportedOpenAiParam) {
    return this.unsupportedParamsByModel.get(this.capabilityKey)?.has(param) ?? false;
  }

  private markUnsupportedParam(param: UnsupportedOpenAiParam) {
    const key = this.capabilityKey;
    const params = this.unsupportedParamsByModel.get(key) ?? new Set<UnsupportedOpenAiParam>();
    params.add(param);
    this.unsupportedParamsByModel.set(key, params);
  }

  private getReasoningEffort() {
    if (!isReasoningStyleModel(this.options.model) || this.isUnsupportedParam('reasoning')) {
      return null;
    }
    return normalizeReasoningEffortForModel(this.options.reasoningEffort);
  }

  private supportsTemperature(reasoningEffort?: OpenAiReasoningEffort | null) {
    return (
      supportsTemperature(this.options.model, reasoningEffort) &&
      !this.isUnsupportedParam('temperature')
    );
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
    const reasoningEffort = this.getReasoningEffort();
    return {
      provider: this.getRuntimeProviderName(runtime),
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
      store: request.stateScope === 'memory' ? false : this.options.store,
      temperature: this.supportsTemperature(reasoningEffort)
        ? normalizeTemperature(request.temperature, this.options.temperature)
        : null,
      toolNames:
        request.stateScope === 'memory' || !this.options.tavilyTools
          ? []
          : TAVILY_OPENAI_TOOLS.map((tool) => tool.name),
      toolsAvailable: request.stateScope !== 'memory' && Boolean(this.options.tavilyTools),
      websocketConfigured: runtime.useWebSocket,
      websocketConnected: this.ws?.readyState === WebSocket.OPEN,
      websocketStatus: runtime.useWebSocket ? getWebSocketStatus(this.ws) : 'disabled',
      websocketLifecycle: runtime.useWebSocket
        ? this.options.closeWebSocketAfterRequest
          ? 'per-reply'
          : 'persistent'
        : 'disabled',
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

    const reasoningEffort = this.getReasoningEffort();
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
      store: request.stateScope === 'memory' ? false : this.options.store,
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

    if (this.supportsTemperature(reasoningEffort)) {
      payload.temperature = normalizeTemperature(request.temperature, this.options.temperature);
    }

    const runtimeToolsAvailable =
      request.stateScope !== 'memory' && Boolean(this.options.tavilyTools);
    const runtimeInstructions = runtimeToolsAvailable ? buildTavilyToolInstruction() : '';
    const finalInstructions = [instructions, runtimeInstructions].filter(Boolean).join('\n\n');
    if (finalInstructions) {
      payload.instructions = finalInstructions;
    }

    if (this.options.promptCacheKey) {
      payload.prompt_cache_key = this.options.promptCacheKey;
    }

    const isOpenRouter = this.isOpenRouterRuntime();
    if (!isOpenRouter && this.options.promptCacheRetention) {
      payload.prompt_cache_retention = this.options.promptCacheRetention;
    }

    if (isOpenRouter) {
      payload.reasoning = {
        exclude: true,
      };
      payload.include_reasoning = false;
      const cacheControl = getOpenRouterCacheControl(
        this.options.model,
        this.options.promptCacheRetention,
      );
      if (cacheControl) {
        payload.cache_control = cacheControl;
      }
    } else if (reasoningEffort) {
      payload.reasoning = {
        effort: reasoningEffort,
      };
    }

    if (runtimeToolsAvailable) {
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
    let nextPayload = { ...payload };
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        if (runtime.useWebSocket) {
          return await this.completeWithWebSocket(nextPayload, stream ? onTextDelta : undefined);
        }

        return stream
          ? await this.completeWithHttpStream(nextPayload, onTextDelta)
          : await this.completeWithHttp(nextPayload);
      } catch (error) {
        const unsupportedParam = getUnsupportedParamFromError(error);
        if (!unsupportedParam || !(unsupportedParam in nextPayload)) {
          throw error;
        }
        this.markUnsupportedParam(unsupportedParam);
        const { [unsupportedParam]: _unused, ...withoutUnsupportedParam } = nextPayload;
        nextPayload = withoutUnsupportedParam;
      }
    }

    throw new Error('OpenAI Responses API parameter compatibility retry failed.');
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

    const data = this.useSdkHttp
      ? await this.createSdkConversation()
      : await this.createConversationWithFetch();
    if (!data.id) {
      throw new Error('OpenAI Conversations API did not return a conversation id.');
    }

    state.conversationId = data.id;
    return data.id;
  }

  private async createConversationWithFetch() {
    const response = await this.fetcher(`${this.baseUrl}/conversations`, {
      method: 'POST',
      headers: this.headers,
      body: '{}',
    });

    if (!response.ok) {
      throw new Error(`OpenAI Conversations API failed with HTTP ${response.status}.`);
    }

    return (await response.json()) as OpenAiConversationPayload;
  }

  private async completeWithHttp(payload: Record<string, unknown>) {
    if (this.useSdkHttp) {
      return this.createSdkResponse(payload);
    }

    const { controller, timeout } = this.createRequestAbortController();
    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl}/responses`, {
        method: 'POST',
        headers: this.headers,
        signal: controller.signal,
        body: JSON.stringify(payload),
      });
    } finally {
      clearTimeout(timeout);
    }

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
    if (this.useSdkHttp) {
      return this.completeWithSdkStream(payload, onTextDelta);
    }

    const { controller, timeout } = this.createRequestAbortController();
    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl}/responses`, {
        method: 'POST',
        headers: this.headers,
        signal: controller.signal,
        body: JSON.stringify({ ...payload, stream: true }),
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const message = await response.text().catch(() => '');
      throw new Error(
        `OpenAI Responses API failed with HTTP ${response.status}${message ? `: ${message}` : ''}`,
      );
    }

    return this.parseHttpStreamResponse(response, onTextDelta);
  }

  private async completeWithSdkStream(
    payload: Record<string, unknown>,
    onTextDelta?: (delta: string) => void,
  ): Promise<OpenAiResponsePayload> {
    const stream = await this.createSdkResponseStream(payload);
    let text = '';
    let completed: OpenAiResponsePayload | null = null;
    const functionCalls = createStreamingFunctionCallState();

    for await (const event of stream) {
      if (event.type === 'response.output_item.added' && isStreamingFunctionCallItem(event.item)) {
        rememberStreamingFunctionCall(functionCalls, event, { ...event.item });
        continue;
      }
      if (event.type === 'response.function_call_arguments.delta') {
        const current = getStreamingFunctionCallForEvent(functionCalls, event);
        if (current) {
          current.arguments = `${current.arguments ?? ''}${event.delta ?? ''}`;
        }
        continue;
      }
      if (event.type === 'response.function_call_arguments.done') {
        const current = getStreamingFunctionCallForEvent(functionCalls, event);
        if (current && typeof event.arguments === 'string') {
          current.arguments = event.arguments;
        }
        continue;
      }
      if (event.type === 'response.output_item.done' && isStreamingFunctionCallItem(event.item)) {
        rememberStreamingFunctionCall(functionCalls, event, { ...event.item });
        continue;
      }
      if (isReasoningStreamEvent(event)) {
        continue;
      }

      const delta = extractStreamDeltaText(event);
      if (delta) {
        text += delta;
        onTextDelta?.(delta);
      }
      if (event.type === 'response.completed' && event.response) {
        completed = event.response;
        continue;
      }
      if (event.type === 'response.incomplete') {
        completed = event.response ?? completed;
        continue;
      }
      if (isTerminalStreamEvent(event.type)) {
        completed = event.response ?? completed;
        continue;
      }
      if (event.type === 'response.failed' || event.type === 'error') {
        throw new Error(event.error?.message ?? `OpenAI Responses stream event ${event.type}.`);
      }
    }

    const completedPayload = (completed ?? {}) as OpenAiResponsePayload;
    const output = [...(completedPayload.output ?? [])];
    mergeStreamingFunctionCalls(output, functionCalls);

    const response = text ? { ...completedPayload, output_text: text } : completedPayload;
    return output.length > 0 ? { ...response, output } : response;
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
    const functionCalls = createStreamingFunctionCallState();

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
      if (event.type === 'response.output_item.added' && isStreamingFunctionCallItem(event.item)) {
        rememberStreamingFunctionCall(functionCalls, event, { ...event.item });
        return;
      }
      if (event.type === 'response.function_call_arguments.delta') {
        const current = getStreamingFunctionCallForEvent(functionCalls, event);
        if (current) {
          current.arguments = `${current.arguments ?? ''}${event.delta ?? ''}`;
        }
        return;
      }
      if (event.type === 'response.function_call_arguments.done') {
        const current = getStreamingFunctionCallForEvent(functionCalls, event);
        if (current && typeof event.arguments === 'string') {
          current.arguments = event.arguments;
        }
        return;
      }
      if (event.type === 'response.output_item.done' && isStreamingFunctionCallItem(event.item)) {
        rememberStreamingFunctionCall(functionCalls, event, { ...event.item });
        return;
      }
      if (isReasoningStreamEvent(event)) {
        return;
      }

      const delta = extractStreamDeltaText(event);
      if (delta) {
        text += delta;
        onTextDelta?.(delta);
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
      const { value, done } = await this.readStreamChunkWithIdleTimeout(reader);
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
    mergeStreamingFunctionCalls(output, functionCalls);

    const payload = text ? { ...completedPayload, output_text: text } : completedPayload;
    return output.length > 0 ? { ...payload, output } : payload;
  }

  private async completeWithWebSocket(
    payload: Record<string, unknown>,
    onTextDelta?: (delta: string) => void,
  ): Promise<OpenAiResponsePayload> {
    return this.enqueueWebSocketRequest(async () => {
      const socket = await this.createRequestWebSocket();

      return new Promise<OpenAiResponsePayload>((resolve, reject) => {
        let text = '';
        let settled = false;
        const functionCalls = createStreamingFunctionCallState();
        const timeout = setTimeout(() => {
          fail(new Error('OpenAI Responses WebSocket request timed out.'), true);
        }, this.options.requestTimeoutMs ?? 120000);

        const cleanup = (closeSocket = false) => {
          settled = true;
          clearTimeout(timeout);
          socket.off('message', onMessage);
          socket.off('close', onClose);
          socket.off('error', onError);
          if (
            closeSocket &&
            (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)
          ) {
            socket.close();
          }
        };

        const finish = (response: OpenAiResponsePayload) => {
          const output = [...(response.output ?? [])];
          mergeStreamingFunctionCalls(output, functionCalls);
          cleanup(this.options.closeWebSocketAfterRequest === true);
          const payload = text ? { ...response, output_text: text } : response;
          resolve(output.length > 0 ? { ...payload, output } : payload);
        };

        const fail = (error: Error, closeSocket = false) => {
          cleanup(closeSocket || this.options.closeWebSocketAfterRequest === true);
          reject(error);
        };

        const onMessage = (raw: RawData) => {
          if (settled) {
            return;
          }

          const event = JSON.parse(raw.toString()) as OpenAiWebSocketEvent;
          if (
            event.type === 'response.output_item.added' &&
            isStreamingFunctionCallItem(event.item)
          ) {
            rememberStreamingFunctionCall(functionCalls, event, { ...event.item });
            return;
          }
          if (event.type === 'response.function_call_arguments.delta') {
            const current = getStreamingFunctionCallForEvent(functionCalls, event);
            if (current) {
              current.arguments = `${current.arguments ?? ''}${event.delta ?? ''}`;
            }
            return;
          }
          if (event.type === 'response.function_call_arguments.done') {
            const current = getStreamingFunctionCallForEvent(functionCalls, event);
            if (current && typeof event.arguments === 'string') {
              current.arguments = event.arguments;
            }
            return;
          }
          if (
            event.type === 'response.output_item.done' &&
            isStreamingFunctionCallItem(event.item)
          ) {
            rememberStreamingFunctionCall(functionCalls, event, { ...event.item });
            return;
          }

          const delta = extractStreamDeltaText(event);
          if (delta) {
            text += delta;
            onTextDelta?.(delta);
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
            const isConnectionLimit = event.error?.code === 'websocket_connection_limit_reached';
            fail(
              new Error(event.error?.message ?? `OpenAI Responses WebSocket event ${event.type}.`),
              isConnectionLimit,
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
            fail(error, true);
          }
        };

        socket.on('message', onMessage);
        socket.on('close', onClose);
        socket.on('error', onError);
        socket.send(JSON.stringify({ type: 'response.create', ...payload }));
      });
    });
  }

  private enqueueWebSocketRequest<T>(task: () => Promise<T>) {
    if (this.wsQueueDepth >= MAX_WEBSOCKET_QUEUE_DEPTH) {
      return Promise.reject(new Error('OpenAI Responses WebSocket queue is full.'));
    }

    this.wsQueueDepth += 1;
    const run = this.wsQueue.then(task, task);
    this.wsQueue = run.then(
      () => {
        this.wsQueueDepth = Math.max(0, this.wsQueueDepth - 1);
      },
      () => {
        this.wsQueueDepth = Math.max(0, this.wsQueueDepth - 1);
      },
    );
    return run;
  }

  private createRequestAbortController() {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
    );
    return { controller, timeout };
  }

  private readStreamChunkWithIdleTimeout(reader: ReadableStreamDefaultReader<Uint8Array>) {
    const idleTimeoutMs = this.options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    return new Promise<StreamReadResult<Uint8Array>>((resolve, reject) => {
      const timeout = setTimeout(() => {
        void reader.cancel().catch(() => {});
        reject(
          new Error(`OpenAI Responses stream was idle for ${Math.round(idleTimeoutMs / 1000)}s.`),
        );
      }, idleTimeoutMs);

      reader.read().then(
        (result) => {
          clearTimeout(timeout);
          resolve(result);
        },
        (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      );
    });
  }

  private async createRequestWebSocket() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return this.ws;
    }
    if (this.wsReady) {
      return this.wsReady;
    }

    this.wsReady = new Promise<WebSocket>((resolve, reject) => {
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
        if (this.ws === socket || this.wsReady) {
          this.ws = null;
          this.wsReady = null;
        }
        reject(error);
      });
      socket.once('close', () => {
        if (this.ws === socket) {
          this.ws = null;
          this.wsReady = null;
        }
      });
    });
    return this.wsReady;
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
