import { createHash } from 'node:crypto';
import {
  TAVILY_OPENAI_TOOLS,
  buildTavilyToolInstruction,
  runTavilyToolCall,
  type OpenAiFunctionCall,
  type TavilyToolOptions,
} from '../../server/src/ai/TavilyTools.js';
import { getServerProviderProxyAuthContext } from './provider-proxy-auth.js';

type ApiRequest = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
};

type ApiResponse = {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
  write?: (chunk: string) => void;
  end?: () => void;
};

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type ResponseFormat =
  | {
      type: 'json_object';
    }
  | {
      name: string;
      schema: Record<string, unknown>;
      strict?: boolean;
      type: 'json_schema';
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

type OpenAiStreamEvent = {
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
  };
};

type OpenAiConversationPayload = {
  id?: string;
};

type OpenAiReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
type UnsupportedOpenAiParam = 'reasoning' | 'temperature';

type ResponsesFunctionCallOutput = {
  type: 'function_call_output';
  call_id: string;
  output: string;
};

type RouteState = {
  conversationId: string | null;
  previousResponseId: string | null;
  stateSignature: string | null;
  cachedTokens: number;
};

type StreamingFunctionCallState = {
  callsById: Map<string, OpenAiFunctionCall>;
  callsByOutputIndex: Map<number, OpenAiFunctionCall>;
  outputIndexToCallId: Map<number, string>;
};

const MAX_TOOL_ROUNDS = 5;
const MAX_ROUTE_STATES = 200;

const routeStates = new Map<string, RouteState>();
const unsupportedParamsByModel = new Map<string, Set<UnsupportedOpenAiParam>>();

function normalizeMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item): ChatMessage | null => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const source = item as Partial<ChatMessage>;
      if (source.role !== 'system' && source.role !== 'user' && source.role !== 'assistant') {
        return null;
      }
      if (typeof source.content !== 'string' || !source.content.trim()) {
        return null;
      }

      return {
        role: source.role,
        content: source.content,
      };
    })
    .filter((item): item is ChatMessage => Boolean(item));
}

function splitMessages(messages: readonly ChatMessage[]) {
  const instructions = messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content.trim())
    .filter(Boolean)
    .join('\n\n');
  const input = messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => ({
      type: 'message',
      role: message.role,
      content: [
        {
          type: message.role === 'assistant' ? 'output_text' : 'input_text',
          text: message.content,
        },
      ],
    }));

  return { instructions, input };
}

function extractResponseText(payload: OpenAiResponsePayload) {
  const direct = payload.output_text?.trim();
  if (direct) {
    return direct;
  }

  return (
    payload.output
      ?.filter(isTextOutputItem)
      ?.flatMap((item) => item.content ?? [])
      .filter(isTextContentPart)
      .map((content) => readTextValue(content.text).trim())
      .filter(Boolean)
      .join(' ')
      .trim() ?? ''
  );
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

function isReasoningStreamEvent(event: OpenAiStreamEvent) {
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

function extractStreamEventText(event: OpenAiStreamEvent) {
  if (isReasoningStreamEvent(event)) {
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

function isStreamingFunctionCallItem(value: unknown): value is OpenAiFunctionCall {
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
    callsById: new Map<string, OpenAiFunctionCall>(),
    callsByOutputIndex: new Map<number, OpenAiFunctionCall>(),
    outputIndexToCallId: new Map<number, string>(),
  };
}

function rememberStreamingFunctionCall(
  state: StreamingFunctionCallState,
  event: OpenAiStreamEvent,
  item: OpenAiFunctionCall,
) {
  const callId = item.call_id;
  const outputIndex = event.output_index;
  const pendingByIndex =
    typeof outputIndex === 'number' ? state.callsByOutputIndex.get(outputIndex) : undefined;

  if (!callId) {
    if (typeof outputIndex === 'number') {
      state.callsByOutputIndex.set(outputIndex, { ...pendingByIndex, ...item });
    }
    return;
  }

  const current = state.callsById.get(callId) ?? {};
  state.callsById.set(callId, { ...pendingByIndex, ...current, ...item });
  if (typeof outputIndex === 'number') {
    state.outputIndexToCallId.set(outputIndex, callId);
    state.callsByOutputIndex.delete(outputIndex);
  }
}

function getStreamingFunctionCallForEvent(
  state: StreamingFunctionCallState,
  event: OpenAiStreamEvent,
) {
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
  const knownCallIds = new Set(output.map((item) => item.call_id).filter(Boolean));
  for (const call of state.callsById.values()) {
    if (!knownCallIds.has(call.call_id)) {
      output.push(call);
    }
  }
}

function writeSseEvent(response: ApiResponse, body: unknown) {
  response.write?.(`data: ${JSON.stringify(body)}\n\n`);
}

function createStateSignature(model: string, promptCacheKey: string) {
  return JSON.stringify({ model, promptCacheKey });
}

function normalizeStateScope(value: unknown): 'chat' | 'memory' {
  return value === 'memory' ? 'memory' : 'chat';
}

function normalizeResponseFormat(value: unknown): ResponseFormat | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const source = value as {
    name?: unknown;
    schema?: unknown;
    strict?: unknown;
    type?: unknown;
  };
  if (source.type === 'json_object') {
    return { type: 'json_object' };
  }
  if (
    source.type === 'json_schema' &&
    typeof source.name === 'string' &&
    source.name.trim() &&
    source.schema &&
    typeof source.schema === 'object' &&
    !Array.isArray(source.schema)
  ) {
    return {
      name: source.name.trim(),
      schema: source.schema as Record<string, unknown>,
      strict: typeof source.strict === 'boolean' ? source.strict : false,
      type: 'json_schema',
    };
  }
  return null;
}

function normalizeStateKey(value: unknown) {
  const key = (typeof value === 'string' && value.trim() ? value : 'default')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160);
  return key || 'default';
}

function getRouteState(stateKey: string) {
  let state = routeStates.get(stateKey);
  if (!state) {
    state = {
      cachedTokens: 0,
      conversationId:
        stateKey === 'default' ? process.env['OPENAI_CONVERSATION_ID']?.trim() || null : null,
      previousResponseId: null,
      stateSignature: null,
    };
    routeStates.set(stateKey, state);
    if (routeStates.size > MAX_ROUTE_STATES) {
      const oldestStateKey = routeStates.keys().next().value;
      if (oldestStateKey) {
        routeStates.delete(oldestStateKey);
      }
    }
  }
  return state;
}

function hashSecret(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function scopeRouteStateKey(input: {
  browserLlmApiKey: string;
  serverProxyPrincipal: string | null;
  stateKey: string;
}) {
  if (input.browserLlmApiKey) {
    return `byok:${hashSecret(input.browserLlmApiKey).slice(0, 32)}:${input.stateKey}`;
  }
  if (input.serverProxyPrincipal) {
    return `server-proxy:${input.serverProxyPrincipal}:${input.stateKey}`;
  }
  return `anonymous:${input.stateKey}`;
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

function supportsTemperature(model: string, reasoningEffort?: OpenAiReasoningEffort | null) {
  return !isReasoningStyleModel(model) || !reasoningEffort || reasoningEffort === 'none';
}

function isOpenRouterBaseUrl(value: string) {
  try {
    return new URL(value).hostname.toLowerCase().endsWith('openrouter.ai');
  } catch {
    return value.toLowerCase().includes('openrouter.ai');
  }
}

function normalizeMaxOutputTokens(requested: number | undefined, fallback: number) {
  const value = Number.isFinite(requested) ? requested! : fallback;
  return Math.max(16, Math.floor(value));
}

function normalizeTemperature(requested: number | undefined, fallback: number) {
  const value = Number.isFinite(requested) ? requested! : fallback;
  return Math.min(2, Math.max(0, value));
}

function normalizeReasoningEffortForModel(effort: OpenAiReasoningEffort | undefined) {
  if (!effort || effort === 'none') {
    return null;
  }
  return effort;
}

function getUnsupportedParamFromText(text: string): UnsupportedOpenAiParam | null {
  const normalized = text.toLowerCase();
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

function getCapabilityKey(apiBaseUrl: string, model: string) {
  return `${apiBaseUrl}|${model.trim().toLowerCase()}`;
}

function isUnsupportedParam(apiBaseUrl: string, model: string, param: UnsupportedOpenAiParam) {
  return unsupportedParamsByModel.get(getCapabilityKey(apiBaseUrl, model))?.has(param) ?? false;
}

function markUnsupportedParam(apiBaseUrl: string, model: string, param: UnsupportedOpenAiParam) {
  const key = getCapabilityKey(apiBaseUrl, model);
  const params = unsupportedParamsByModel.get(key) ?? new Set<UnsupportedOpenAiParam>();
  params.add(param);
  unsupportedParamsByModel.set(key, params);
}

function parseReasoningEffort(): OpenAiReasoningEffort {
  const raw = process.env['OPENAI_REASONING_EFFORT']?.trim().toLowerCase();
  if (
    raw === 'none' ||
    raw === 'minimal' ||
    raw === 'low' ||
    raw === 'medium' ||
    raw === 'high' ||
    raw === 'xhigh'
  ) {
    return raw;
  }
  return 'none';
}

function getOpenAiHeaders(apiKey: string) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
  const safetyIdentifier = process.env['OPENAI_SAFETY_IDENTIFIER']?.trim();
  if (safetyIdentifier) {
    headers['OpenAI-Safety-Identifier'] = safetyIdentifier;
  }
  return headers;
}

function getHeaderValue(request: ApiRequest, name: string) {
  const value = request.headers?.[name.toLowerCase()] ?? request.headers?.[name];
  return Array.isArray(value) ? value[0] : value;
}

function getHeaderSecret(request: ApiRequest, name: string) {
  return getHeaderValue(request, name)?.trim() ?? '';
}

function numberFromEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getTavilyTools(request: ApiRequest, allowServerProxy: boolean): TavilyToolOptions | null {
  const apiKey =
    getHeaderSecret(request, 'x-yourwifey-tavily-provider-key') ||
    (allowServerProxy ? process.env['TAVILY_API_KEY']?.trim() : '');
  if (!apiKey) {
    return null;
  }

  return {
    apiKey,
    searchDepth:
      process.env['TAVILY_SEARCH_DEPTH']?.trim().toLowerCase() === 'advanced'
        ? 'advanced'
        : 'basic',
    maxResults: numberFromEnv('TAVILY_MAX_RESULTS', 5),
    crawlLimit: numberFromEnv('TAVILY_CRAWL_LIMIT', 8),
    timeoutMs: numberFromEnv('TAVILY_TIMEOUT_MS', 10000),
  };
}

function createToolFollowupPayload(
  payload: Record<string, unknown>,
  data: OpenAiResponsePayload,
  canUsePreviousResponse: boolean,
  toolOutputs: ResponsesFunctionCallOutput[],
) {
  const nextPayload = { ...payload };
  const usesConversation = Boolean(nextPayload['conversation']);
  const canUsePreviousResponseState =
    canUsePreviousResponse && Boolean(data.id) && !usesConversation;
  if (canUsePreviousResponseState) {
    nextPayload.previous_response_id = data.id;
    nextPayload.input = toolOutputs;
    return nextPayload;
  }

  const responseOutput = Array.isArray(data.output) ? data.output : getFunctionCalls(data);
  nextPayload.input = [
    ...(usesConversation ? [] : Array.isArray(payload['input']) ? payload['input'] : []),
    ...responseOutput,
    ...toolOutputs,
  ];
  return nextPayload;
}

async function resolveResponseTools(
  payload: Record<string, unknown>,
  data: OpenAiResponsePayload,
  tools: TavilyToolOptions | null,
  canUsePreviousResponse: boolean,
  requestOpenAiResponse: (requestPayload: Record<string, unknown>) => Promise<Response>,
  stream: boolean,
  onTextDelta?: (delta: string) => void,
): Promise<{ data: OpenAiResponsePayload; toolsUsed: string[] }> {
  const toolsUsed: string[] = [];
  let currentPayload = payload;
  let currentData = data;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const calls = getFunctionCalls(currentData);
    if (!tools || calls.length === 0) {
      return { data: currentData, toolsUsed };
    }

    const toolOutputs: ResponsesFunctionCallOutput[] = [];
    for (const call of calls) {
      if (!call.call_id) {
        continue;
      }
      toolsUsed.push(call.name ?? 'unknown');
      toolOutputs.push({
        type: 'function_call_output',
        call_id: call.call_id,
        output: await runTavilyToolCall(tools, call),
      });
    }

    if (toolOutputs.length === 0) {
      return { data: currentData, toolsUsed };
    }

    currentPayload = createToolFollowupPayload(
      currentPayload,
      currentData,
      canUsePreviousResponse,
      toolOutputs,
    );
    const openAiResponse = await requestOpenAiResponse(
      stream ? { ...currentPayload, stream: true } : currentPayload,
    );
    if (!openAiResponse.ok) {
      const errorText = await openAiResponse.text().catch(() => '');
      throw new Error(
        errorText || `OpenAI Responses API failed with HTTP ${openAiResponse.status}.`,
      );
    }
    currentData = stream
      ? await readOpenAiStream(openAiResponse, onTextDelta)
      : ((await openAiResponse.json()) as OpenAiResponsePayload);
  }

  return { data: currentData, toolsUsed };
}

async function ensureConversationId(apiBaseUrl: string, apiKey: string, state: RouteState) {
  if (state.conversationId) {
    return state.conversationId;
  }

  const openAiResponse = await fetch(`${apiBaseUrl}/conversations`, {
    method: 'POST',
    headers: getOpenAiHeaders(apiKey),
    body: '{}',
  });

  if (!openAiResponse.ok) {
    const errorText = await openAiResponse.text().catch(() => '');
    throw new Error(
      errorText || `OpenAI Conversations API failed with HTTP ${openAiResponse.status}.`,
    );
  }

  const data = (await openAiResponse.json()) as OpenAiConversationPayload;
  if (!data.id) {
    throw new Error('OpenAI Conversations API did not return a conversation id.');
  }

  state.conversationId = data.id;
  return data.id;
}

async function readOpenAiStream(
  openAiResponse: Response,
  onTextDelta?: (delta: string) => void,
): Promise<OpenAiResponsePayload> {
  if (!openAiResponse.body) {
    return (await openAiResponse.json()) as OpenAiResponsePayload;
  }

  const reader = openAiResponse.body.getReader();
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

    const event = JSON.parse(data) as OpenAiStreamEvent;
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
  mergeStreamingFunctionCalls(output, functionCalls);

  const payload = text ? { ...completedPayload, output_text: text } : completedPayload;
  return output.length > 0 ? { ...payload, output } : payload;
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  response.setHeader(
    'Access-Control-Allow-Headers',
    'content-type,x-yourwifey-llm-provider,x-yourwifey-llm-provider-key,x-yourwifey-tavily-provider-key',
  );

  if (request.method === 'OPTIONS') {
    response.status(204).json({});
    return;
  }

  if (request.method !== 'POST') {
    response.status(200).json({ ok: false, error: 'POST required.' });
    return;
  }

  const browserLlmApiKey = getHeaderSecret(request, 'x-yourwifey-llm-provider-key');
  const proxyAuthContext = isServerAiProxyEnabled()
    ? await getServerProviderProxyAuthContext(request)
    : ({ ok: false, principal: null } as const);
  if (!browserLlmApiKey && !isServerAiProxyEnabled()) {
    response.status(200).json({ ok: false, error: 'Server AI proxy is disabled for BYOK mode.' });
    return;
  }
  if (!browserLlmApiKey && isServerAiProxyEnabled() && !proxyAuthContext.ok) {
    response.status(401).json({ ok: false, error: 'Authentication required for server AI proxy.' });
    return;
  }

  const apiKey =
    browserLlmApiKey ||
    (proxyAuthContext.ok ? process.env['OPENAI_API_KEY'] || process.env['AI_API_KEY'] : '');
  if (!apiKey) {
    response.status(200).json({ ok: false, error: 'OPENAI_API_KEY is not configured.' });
    return;
  }

  const body = (request.body ?? {}) as {
    disableState?: boolean;
    messages?: unknown;
    model?: string;
    maxTokens?: number;
    responseFormat?: unknown;
    stateKey?: string;
    stateScope?: 'chat' | 'memory';
    stream?: boolean;
    temperature?: number;
  };
  const messages = normalizeMessages(body.messages);
  if (messages.length === 0) {
    response.status(200).json({ ok: false, error: 'messages[] is required.' });
    return;
  }

  const { instructions, input } = splitMessages(messages);
  const model = body.model?.trim() || process.env['OPENAI_MODEL'] || 'gpt-5-nano';
  const configuredStateMode = process.env['OPENAI_STATE_MODE'] || 'conversation';
  const stateMode =
    configuredStateMode === 'conversation' ||
    configuredStateMode === 'previous-response' ||
    configuredStateMode === 'stateless'
      ? configuredStateMode
      : 'conversation';
  const store = process.env['OPENAI_STORE'] === 'true';
  const stateKey = normalizeStateKey(body.stateKey);
  const stateScope = normalizeStateScope(body.stateScope);
  const stateDisabled = body.disableState === true || stateScope === 'memory';
  const shouldStream = body.stream === true;
  const responseFormat = normalizeResponseFormat(body.responseFormat);
  const scopedStateKey = scopeRouteStateKey({
    browserLlmApiKey,
    serverProxyPrincipal: proxyAuthContext.ok ? proxyAuthContext.principal : null,
    stateKey,
  });
  const state = getRouteState(scopedStateKey);
  const promptCacheKey = process.env['OPENAI_PROMPT_CACHE_KEY']?.trim() || '';
  const tavilyTools = getTavilyTools(request, proxyAuthContext.ok);
  const canUsePreviousResponse = !stateDisabled && stateMode === 'previous-response' && store;
  const signature = createStateSignature(model, promptCacheKey);
  if (!stateDisabled) {
    if (
      stateMode !== 'conversation' &&
      state.stateSignature &&
      state.stateSignature !== signature
    ) {
      state.previousResponseId = null;
      state.conversationId =
        scopedStateKey === 'default' ? process.env['OPENAI_CONVERSATION_ID']?.trim() || null : null;
    }
    state.stateSignature = signature;
  }
  const apiBaseUrl = (process.env['OPENAI_API_BASE_URL'] || 'https://api.openai.com/v1').replace(
    /\/+$/,
    '',
  );
  const reasoningEffort =
    isReasoningStyleModel(model) && !isUnsupportedParam(apiBaseUrl, model, 'reasoning')
      ? normalizeReasoningEffortForModel(parseReasoningEffort())
      : null;
  const maxOutputTokens = normalizeMaxOutputTokens(body.maxTokens, 220);
  const conversationAlreadySeeded =
    !stateDisabled &&
    stateMode === 'conversation' &&
    Boolean(
      state.conversationId ||
      (scopedStateKey === 'default' && process.env['OPENAI_CONVERSATION_ID']?.trim()),
    );
  const payload: Record<string, unknown> = {
    input:
      conversationAlreadySeeded && input.length > 0
        ? input.slice(-1)
        : canUsePreviousResponse && state.previousResponseId && input.length > 0
          ? input.slice(-1)
          : input,
    max_output_tokens: maxOutputTokens,
    model,
    store,
  };

  if (responseFormat?.type === 'json_object') {
    payload.text = {
      format: {
        type: 'json_object',
      },
    };
  } else if (responseFormat?.type === 'json_schema') {
    payload.text = {
      format: {
        name: responseFormat.name,
        schema: responseFormat.schema,
        strict: responseFormat.strict ?? false,
        type: 'json_schema',
      },
    };
  }

  if (
    supportsTemperature(model, reasoningEffort) &&
    !isUnsupportedParam(apiBaseUrl, model, 'temperature')
  ) {
    payload.temperature = normalizeTemperature(body.temperature, 0.7);
  }

  const runtimeInstructions = tavilyTools ? buildTavilyToolInstruction() : '';
  const finalInstructions = [instructions, runtimeInstructions].filter(Boolean).join('\n\n');
  if (finalInstructions) {
    payload.instructions = finalInstructions;
  }
  if (promptCacheKey) {
    payload.prompt_cache_key = promptCacheKey;
  }
  if (process.env['OPENAI_PROMPT_CACHE_RETENTION']) {
    payload.prompt_cache_retention = process.env['OPENAI_PROMPT_CACHE_RETENTION'];
  }
  if (isOpenRouterBaseUrl(apiBaseUrl)) {
    payload.reasoning = {
      exclude: true,
    };
    payload.include_reasoning = false;
  } else if (reasoningEffort) {
    payload.reasoning = {
      effort: reasoningEffort,
    };
  }
  if (tavilyTools) {
    payload.tools = TAVILY_OPENAI_TOOLS;
    payload.tool_choice = 'auto';
  }

  try {
    if (!stateDisabled && stateMode === 'conversation') {
      payload.conversation = await ensureConversationId(apiBaseUrl, apiKey, state);
    } else if (canUsePreviousResponse && state.previousResponseId) {
      payload.previous_response_id = state.previousResponseId;
    }
  } catch (error) {
    response.status(200).json({
      ok: false,
      error: error instanceof Error ? error.message : 'OpenAI state setup failed.',
    });
    return;
  }

  const requestOpenAiResponse = async (requestPayload: Record<string, unknown>) => {
    let nextPayload = requestPayload;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const openAiResponse = await fetch(`${apiBaseUrl}/responses`, {
        method: 'POST',
        headers: getOpenAiHeaders(apiKey),
        body: JSON.stringify(nextPayload),
      });
      if (openAiResponse.ok) {
        return openAiResponse;
      }
      const errorText = await openAiResponse.text().catch(() => '');
      const unsupportedParam = getUnsupportedParamFromText(errorText);
      if (!unsupportedParam || !(unsupportedParam in nextPayload)) {
        return new Response(
          errorText || `OpenAI Responses API failed with HTTP ${openAiResponse.status}.`,
          { status: openAiResponse.status },
        );
      }
      markUnsupportedParam(apiBaseUrl, model, unsupportedParam);
      const { [unsupportedParam]: _unused, ...withoutUnsupportedParam } = nextPayload;
      nextPayload = withoutUnsupportedParam;
    }

    return new Response('OpenAI Responses API parameter compatibility retry failed.', {
      status: 400,
    });
  };

  let openAiResponse = await requestOpenAiResponse(
    shouldStream ? { ...payload, stream: true } : payload,
  );

  if (!openAiResponse.ok) {
    const errorText = await openAiResponse.text().catch(() => '');
    response.status(200).json({
      ok: false,
      error: errorText || `OpenAI Responses API failed with HTTP ${openAiResponse.status}.`,
    });
    return;
  }

  if (shouldStream) {
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');
    response.status(200);
    response.write?.(': stream-open\n\n');

    try {
      let data = await readOpenAiStream(openAiResponse, (delta) => {
        writeSseEvent(response, { type: 'delta', delta });
      });
      const toolResult = await resolveResponseTools(
        payload,
        data,
        tavilyTools,
        canUsePreviousResponse,
        requestOpenAiResponse,
        true,
        (delta) => {
          writeSseEvent(response, { type: 'delta', delta });
        },
      );
      data = toolResult.data;
      const text = extractResponseText(data);
      if (!text) {
        writeSseEvent(response, {
          ok: false,
          type: 'error',
          error: 'OpenAI returned an empty response.',
        });
        response.end?.();
        return;
      }

      if (!stateDisabled) {
        if (canUsePreviousResponse && data.id) {
          state.previousResponseId = data.id;
        }
        state.cachedTokens = getCachedTokenCount(data);
      }

      writeSseEvent(response, {
        ok: true,
        type: 'done',
        text,
        meta: {
          cachedTokens: stateDisabled ? 0 : state.cachedTokens,
          conversationId: stateDisabled ? null : state.conversationId,
          model,
          maxOutputTokens,
          previousResponseId: stateDisabled ? null : state.previousResponseId,
          provider: 'vercel-openai-responses',
          reasoningEffort,
          stateKey,
          stateMode: stateDisabled ? 'stateless' : stateMode,
          stateScope,
          temperature: typeof payload.temperature === 'number' ? payload.temperature : null,
          toolsAvailable: Boolean(tavilyTools),
          toolsUsed: toolResult.toolsUsed,
        },
      });
      response.end?.();
      return;
    } catch (error) {
      writeSseEvent(response, {
        ok: false,
        type: 'error',
        error: error instanceof Error ? error.message : 'OpenAI stream failed.',
      });
      response.end?.();
      return;
    }
  }

  let data = (await openAiResponse.json()) as OpenAiResponsePayload;
  const toolResult = await resolveResponseTools(
    payload,
    data,
    tavilyTools,
    canUsePreviousResponse,
    requestOpenAiResponse,
    false,
  );
  data = toolResult.data;
  let text = extractResponseText(data);
  if (!text) {
    response.status(200).json({ ok: false, error: 'OpenAI returned an empty response.' });
    return;
  }

  if (!stateDisabled) {
    if (canUsePreviousResponse && data.id) {
      state.previousResponseId = data.id;
    }
    state.cachedTokens = getCachedTokenCount(data);
  }

  response.status(200).json({
    ok: true,
    text,
    meta: {
      cachedTokens: stateDisabled ? 0 : state.cachedTokens,
      conversationId: stateDisabled ? null : state.conversationId,
      model,
      maxOutputTokens,
      previousResponseId: stateDisabled ? null : state.previousResponseId,
      provider: 'vercel-openai-responses',
      reasoningEffort,
      stateKey,
      stateMode: stateDisabled ? 'stateless' : stateMode,
      stateScope,
      temperature: typeof payload.temperature === 'number' ? payload.temperature : null,
      toolsAvailable: Boolean(tavilyTools),
      toolsUsed: toolResult.toolsUsed,
    },
  });
}

function isServerAiProxyEnabled() {
  return (
    process.env['BYOK_SERVER_PROVIDER_PROXY_ENABLED'] === 'true' ||
    process.env['SERVER_PROVIDER_PROXY_ENABLED'] === 'true'
  );
}
