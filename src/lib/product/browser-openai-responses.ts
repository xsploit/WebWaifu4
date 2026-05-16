type BrowserOpenAiMessage = {
  content: string;
  role: string;
};

type BrowserOpenAiResponseFormat =
  | {
      type: 'json_object';
    }
  | {
      name: string;
      schema: Record<string, unknown>;
      strict?: boolean;
      type: 'json_schema';
    };

export type BrowserOpenAiCompletionRequest = {
  apiBaseUrl?: string;
  apiKey: string;
  disableState?: boolean;
  fetchImpl?: typeof fetch;
  maxTokens: number;
  messages: BrowserOpenAiMessage[];
  model: string;
  onTextDelta?: (delta: string) => void;
  openAiStateMode?: 'conversation' | 'previous-response' | 'server-default' | 'stateless';
  providerLabel?: 'browser-openai-responses' | 'browser-openrouter-responses';
  responseFormat?: BrowserOpenAiResponseFormat;
  stateKey?: string;
  stateScope?: 'chat' | 'memory';
  store?: boolean;
};

export type BrowserOpenAiCompletionResponse = {
  meta: {
    previousResponseId: string | null;
    provider: 'browser-openai-responses' | 'browser-openrouter-responses';
    stateKey: string;
    stateMode: 'previous-response' | 'stateless';
  };
  text: string;
};

export type BrowserOpenAiEmbeddingRequest = {
  apiBaseUrl?: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
  input: string;
  model?: string;
  providerLabel?: string;
};

type OpenAiResponsePayload = {
  error?: {
    message?: string;
  };
  id?: string;
  output?: Array<{
    content?: Array<{
      text?: string;
      type?: string;
    }>;
    type?: string;
  }>;
  output_text?: string;
};

type OpenAiEmbeddingPayload = {
  data?: Array<{
    embedding?: number[];
  }>;
  error?: {
    message?: string;
  };
};

type OpenAiStreamEvent = {
  delta?: string;
  error?: {
    message?: string;
  };
  response?: OpenAiResponsePayload;
  type?: string;
};

type BrowserOpenAiState = {
  previousResponseId: string | null;
  signature: string | null;
};

const browserState = new Map<string, BrowserOpenAiState>();

export async function requestBrowserOpenRouterCompletion(
  request: Omit<BrowserOpenAiCompletionRequest, 'apiBaseUrl' | 'disableState' | 'openAiStateMode'>,
): Promise<BrowserOpenAiCompletionResponse> {
  return requestBrowserOpenAiCompletion({
    ...request,
    apiBaseUrl: 'https://openrouter.ai/api/v1',
    disableState: true,
    openAiStateMode: 'stateless',
    providerLabel: 'browser-openrouter-responses',
    store: false,
  });
}

export async function requestBrowserOpenRouterEmbedding(
  request: Omit<BrowserOpenAiEmbeddingRequest, 'apiBaseUrl' | 'model'> & { model?: string },
): Promise<number[]> {
  return requestBrowserOpenAiEmbedding({
    ...request,
    apiBaseUrl: 'https://openrouter.ai/api/v1',
    model: request.model ?? 'openai/text-embedding-3-small',
    providerLabel: 'OpenRouter',
  });
}

export async function requestBrowserOpenAiCompletion({
  apiBaseUrl = 'https://api.openai.com/v1',
  apiKey,
  disableState,
  fetchImpl = fetch,
  maxTokens,
  messages,
  model,
  onTextDelta,
  openAiStateMode,
  responseFormat,
  stateKey = 'default',
  stateScope = 'chat',
  providerLabel = 'browser-openai-responses',
  store,
}: BrowserOpenAiCompletionRequest): Promise<BrowserOpenAiCompletionResponse> {
  const trimmedApiKey = apiKey.trim();
  if (!trimmedApiKey) {
    throw new Error('OpenAI BYOK key is not saved in this browser.');
  }

  const normalizedStateKey = normalizeStateKey(stateKey);
  const stateMode = normalizeBrowserStateMode(openAiStateMode);
  const stateDisabled =
    disableState === true || stateScope === 'memory' || stateMode === 'stateless';
  const state = getBrowserState(normalizedStateKey);
  const signature = createStateSignature(model);
  if (state.signature && state.signature !== signature) {
    state.previousResponseId = null;
  }
  state.signature = signature;

  const { input, instructions } = splitMessages(messages);
  const canContinuePreviousResponse = !stateDisabled && Boolean(state.previousResponseId);
  const payload: Record<string, unknown> = {
    input: canContinuePreviousResponse && input.length > 0 ? input.slice(-1) : input,
    max_output_tokens: normalizeMaxOutputTokens(maxTokens),
    model: model.trim(),
    store: store ?? !stateDisabled,
  };

  if (instructions) {
    payload['instructions'] = instructions;
  }
  if (!stateDisabled && state.previousResponseId) {
    payload['previous_response_id'] = state.previousResponseId;
  }
  if (responseFormat?.type === 'json_object') {
    payload['text'] = {
      format: {
        type: 'json_object',
      },
    };
  } else if (responseFormat?.type === 'json_schema') {
    payload['text'] = {
      format: {
        name: responseFormat.name,
        schema: responseFormat.schema,
        strict: responseFormat.strict ?? false,
        type: 'json_schema',
      },
    };
  }

  const response = await fetchImpl(`${apiBaseUrl.replace(/\/+$/, '')}/responses`, {
    body: JSON.stringify(onTextDelta ? { ...payload, stream: true } : payload),
    headers: {
      Authorization: `Bearer ${trimmedApiKey}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });

  if (!response.ok) {
    const message = await response.text().catch(() => '');
    const apiLabel =
      providerLabel === 'browser-openrouter-responses'
        ? 'OpenRouter Responses API'
        : 'OpenAI Responses API';
    throw new Error(message || `${apiLabel} failed with HTTP ${response.status}.`);
  }

  const data = onTextDelta
    ? await readOpenAiStream(response, onTextDelta)
    : ((await response.json()) as OpenAiResponsePayload);
  const text = extractResponseText(data);
  if (!text.trim()) {
    const apiLabel =
      providerLabel === 'browser-openrouter-responses'
        ? 'OpenRouter Responses API'
        : 'OpenAI Responses API';
    throw new Error(`${apiLabel} returned an empty response.`);
  }

  if (!stateDisabled && data.id) {
    state.previousResponseId = data.id;
  }

  return {
    meta: {
      previousResponseId: stateDisabled ? null : state.previousResponseId,
      provider: providerLabel,
      stateKey: normalizedStateKey,
      stateMode,
    },
    text,
  };
}

export async function requestBrowserOpenAiEmbedding({
  apiBaseUrl = 'https://api.openai.com/v1',
  apiKey,
  fetchImpl = fetch,
  input,
  model = 'text-embedding-3-small',
  providerLabel = 'OpenAI',
}: BrowserOpenAiEmbeddingRequest): Promise<number[]> {
  const trimmedApiKey = apiKey.trim();
  if (!trimmedApiKey) {
    throw new Error(`${providerLabel} BYOK key is not saved in this browser.`);
  }

  const text = input.trim();
  if (!text) {
    throw new Error('Embedding input is empty.');
  }

  const response = await fetchImpl(`${apiBaseUrl.replace(/\/+$/, '')}/embeddings`, {
    body: JSON.stringify({
      input: text.slice(0, 4000),
      model,
    }),
    headers: {
      Authorization: `Bearer ${trimmedApiKey}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });

  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(
      message || `${providerLabel} Embeddings API failed with HTTP ${response.status}.`,
    );
  }

  const data = (await response.json()) as OpenAiEmbeddingPayload;
  const embedding = data.data?.[0]?.embedding;
  if (!Array.isArray(embedding)) {
    throw new Error(data.error?.message || `${providerLabel} returned no embedding.`);
  }
  return embedding;
}

function splitMessages(messages: BrowserOpenAiMessage[]) {
  const instructions = messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content.trim())
    .filter(Boolean)
    .join('\n\n');
  const input = messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => ({
      content: message.content,
      role: message.role,
    }));

  return { input, instructions };
}

function getBrowserState(stateKey: string) {
  const current = browserState.get(stateKey);
  if (current) {
    return current;
  }
  const next: BrowserOpenAiState = {
    previousResponseId: null,
    signature: null,
  };
  browserState.set(stateKey, next);
  return next;
}

function normalizeBrowserStateMode(
  stateMode: BrowserOpenAiCompletionRequest['openAiStateMode'],
): 'previous-response' | 'stateless' {
  if (stateMode === 'stateless') {
    return 'stateless';
  }

  return 'previous-response';
}

function normalizeStateKey(value: string | undefined) {
  return value?.trim().replace(/\s+/g, ':').slice(0, 180) || 'default';
}

function createStateSignature(model: string) {
  return model.trim() || 'default';
}

function normalizeMaxOutputTokens(value: number) {
  if (!Number.isFinite(value)) {
    return 220;
  }
  return Math.min(Math.max(Math.round(value), 1), 4096);
}

function extractResponseText(payload: OpenAiResponsePayload) {
  if (payload.output_text?.trim()) {
    return payload.output_text.trim();
  }

  return (
    payload.output
      ?.flatMap((item) => item.content ?? [])
      .map((content) => content.text ?? '')
      .join('')
      .trim() ?? ''
  );
}

async function readOpenAiStream(
  response: Response,
  onTextDelta: (delta: string) => void,
): Promise<OpenAiResponsePayload> {
  if (!response.body) {
    return (await response.json()) as OpenAiResponsePayload;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let streamedText = '';
  let completed: unknown = null;

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
    if (event.type === 'error' || event.type === 'response.error') {
      throw new Error(event.error?.message ?? 'OpenAI Responses stream failed.');
    }
    if (event.type === 'response.output_text.delta' && event.delta) {
      streamedText += event.delta;
      onTextDelta(event.delta);
      return;
    }
    if (event.type === 'response.completed' && event.response) {
      completed = event.response;
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() ?? '';
    blocks.forEach(handleBlock);
  }

  buffer += decoder.decode();
  if (buffer.trim()) {
    handleBlock(buffer);
  }

  const completedPayload = completed as OpenAiResponsePayload | null;
  if (!completedPayload) {
    return {
      output_text: streamedText,
    };
  }

  return extractResponseText(completedPayload)
    ? completedPayload
    : {
        ...completedPayload,
        output_text: streamedText,
      };
}
