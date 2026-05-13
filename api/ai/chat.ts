import {
  TAVILY_OPENAI_TOOLS,
  buildTavilyToolInstruction,
  runTavilyToolCall,
  type OpenAiFunctionCall,
  type TavilyToolOptions,
} from '../../server/src/ai/TavilyTools.js';

type ApiRequest = {
  method?: string;
  body?: unknown;
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

const MAX_TOOL_ROUNDS = 5;

const routeStates = new Map<string, RouteState>();

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
      ?.flatMap((item) => item.content ?? [])
      .map((content) => content.text?.trim() ?? '')
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

function extractStreamEventText(event: OpenAiStreamEvent) {
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

function writeSseEvent(response: ApiResponse, body: unknown) {
  response.write?.(`data: ${JSON.stringify(body)}\n\n`);
}

function createStateSignature(model: string, promptCacheKey: string) {
  return JSON.stringify({ model, promptCacheKey });
}

function normalizeStateScope(value: unknown): 'chat' | 'memory' {
  return value === 'memory' ? 'memory' : 'chat';
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
  }
  return state;
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

function numberFromEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getTavilyTools(): TavilyToolOptions | null {
  const apiKey = process.env['TAVILY_API_KEY']?.trim();
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

    const event = JSON.parse(data) as OpenAiStreamEvent;
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

export default async function handler(request: ApiRequest, response: ApiResponse) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'content-type');

  if (request.method === 'OPTIONS') {
    response.status(204).json({});
    return;
  }

  if (request.method !== 'POST') {
    response.status(200).json({ ok: false, error: 'POST required.' });
    return;
  }

  const apiKey = process.env['OPENAI_API_KEY'] || process.env['AI_API_KEY'];
  if (!apiKey) {
    response.status(200).json({ ok: false, error: 'OPENAI_API_KEY is not configured.' });
    return;
  }

  const body = (request.body ?? {}) as {
    disableState?: boolean;
    messages?: unknown;
    model?: string;
    maxTokens?: number;
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
  const state = getRouteState(stateKey);
  const promptCacheKey = process.env['OPENAI_PROMPT_CACHE_KEY']?.trim() || '';
  const tavilyTools = getTavilyTools();
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
        stateKey === 'default' ? process.env['OPENAI_CONVERSATION_ID']?.trim() || null : null;
    }
    state.stateSignature = signature;
  }
  const reasoningEffort = isReasoningStyleModel(model)
    ? normalizeReasoningEffortForModel(model, parseReasoningEffort())
    : null;
  const maxOutputTokens = normalizeMaxOutputTokens(body.maxTokens, 220);
  const payload: Record<string, unknown> = {
    input,
    max_output_tokens: maxOutputTokens,
    model,
    store,
  };

  if (supportsTemperature(model, reasoningEffort)) {
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
  if (reasoningEffort) {
    payload.reasoning = {
      effort: reasoningEffort,
    };
  }
  if (tavilyTools) {
    payload.tools = TAVILY_OPENAI_TOOLS;
    payload.tool_choice = 'auto';
  }

  const apiBaseUrl = (process.env['OPENAI_API_BASE_URL'] || 'https://api.openai.com/v1').replace(
    /\/+$/,
    '',
  );
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

  const requestOpenAiResponse = (requestPayload: Record<string, unknown>) =>
    fetch(`${apiBaseUrl}/responses`, {
      method: 'POST',
      headers: getOpenAiHeaders(apiKey),
      body: JSON.stringify(requestPayload),
    });

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
