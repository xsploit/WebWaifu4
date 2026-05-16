import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { MockChatProvider } from './ai/MockChatProvider.js';
import { OpenAiCompatibleProvider } from './ai/OpenAiCompatibleProvider.js';
import { OpenAiResponsesProvider } from './ai/OpenAiResponsesProvider.js';
import type {
  ChatProvider,
  ChatProviderMessage,
  ChatProviderRequest,
  ChatProviderResponse,
} from './ai/ChatProvider.js';
import { renderYourWifeyPomlResponse } from './ai/PomlRenderer.js';
import { loadConfig, type StreamBotConfig } from './config.js';
import { CommandRouter } from './commands/CommandRouter.js';
import { MockTwitchChatSource, type MockChatInjection } from './mock/MockTwitchChatSource.js';
import { OverlaySocket, type OverlayClientEvent } from './overlay/OverlaySocket.js';
import { ChatScheduler } from './scheduler/ChatScheduler.js';
import {
  listRemoteTtsVoices,
  streamFishSpeechTextStream,
  streamRemoteTts,
  type RemoteTtsProvider,
  type RemoteTtsRequest,
} from './tts/RemoteTtsProvider.js';
import type { TwitchChatSource, TwitchChatSourceHandlers } from './twitch/TwitchChatSource.js';
import { TwitchIrcSource } from './twitch/TwitchIrcSource.js';
import { summarizeByokRuntimeHealth } from './byokHealth.js';

type OpenAiEmbeddingPayload = {
  data?: Array<{
    embedding?: number[];
  }>;
};

type ByokApiHandlerRequest = {
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
  method?: string;
  query?: Record<string, string | string[] | undefined>;
};

type ByokApiHandlerResponse = {
  json: (body: unknown) => void;
  setHeader: (name: string, value: string | number | readonly string[]) => void;
  status: (code: number) => ByokApiHandlerResponse;
};

type ByokApiHandler = (
  request: ByokApiHandlerRequest,
  response: ByokApiHandlerResponse,
) => Promise<void> | void;

type MatchedByokApiRoute = {
  modulePath: string;
  query: Record<string, string | string[] | undefined>;
};

const CORS_REQUEST_HEADERS =
  'content-type,x-yourwifey-llm-provider,x-yourwifey-llm-provider-key,x-yourwifey-tts-provider-key';

function createProvider(config: StreamBotConfig): ChatProvider {
  if (!config.providerProxyEnabled) {
    return new MockChatProvider();
  }
  if (config.aiProvider === 'openai-responses' || config.aiProvider === 'openai-responses-ws') {
    if (!config.aiApiKey) {
      throw new Error(`${config.aiProvider} requires OPENAI_API_KEY or AI_API_KEY.`);
    }
    return new OpenAiResponsesProvider({
      apiBaseUrl: config.aiApiBaseUrl,
      apiKey: config.aiApiKey,
      model: config.aiModel,
      maxOutputTokens: 180,
      temperature: 0.7,
      stateMode: config.openAiStateMode,
      conversationId: config.openAiConversationId || undefined,
      promptCacheKey: config.openAiPromptCacheKey || undefined,
      promptCacheRetention: config.openAiPromptCacheRetention || undefined,
      reasoningEffort: config.openAiReasoningEffort,
      safetyIdentifier: config.openAiSafetyIdentifier || undefined,
      store: config.openAiStore,
      tavilyTools: config.tavilyApiKey
        ? {
            apiKey: config.tavilyApiKey,
            searchDepth: config.tavilySearchDepth,
            maxResults: config.tavilyMaxResults,
            crawlLimit: config.tavilyCrawlLimit,
            timeoutMs: config.tavilyTimeoutMs,
          }
        : undefined,
      useWebSocket: config.aiProvider === 'openai-responses-ws',
      webSocketUrl: config.openAiWebSocketUrl || undefined,
    });
  }

  if (config.aiProvider === 'openai-compatible') {
    if (!config.aiApiKey) {
      throw new Error('AI_PROVIDER=openai-compatible requires AI_API_KEY.');
    }
    return new OpenAiCompatibleProvider({
      apiBaseUrl: config.aiApiBaseUrl,
      apiKey: config.aiApiKey,
      model: config.aiModel,
      maxTokens: 120,
      temperature: 0.7,
    });
  }

  return new MockChatProvider();
}

function readRequestJson<T>(request: IncomingMessage) {
  return new Promise<T>((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => {
      body += chunk;
      if (body.length > 100000) {
        reject(new Error('Request body too large.'));
      }
    });
    request.on('end', () => {
      try {
        resolve((body ? JSON.parse(body) : {}) as T);
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

function writeJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    'Access-Control-Allow-Headers': CORS_REQUEST_HEADERS,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  });
  response.end(JSON.stringify(body));
}

function writeSseHead(response: ServerResponse) {
  response.socket?.setNoDelay(true);
  response.writeHead(200, {
    'Access-Control-Allow-Headers': CORS_REQUEST_HEADERS,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'Content-Type': 'text/event-stream; charset=utf-8',
    'X-Accel-Buffering': 'no',
  });
  response.flushHeaders();
  response.write(': stream-open\n\n');
}

function writeSseEvent(response: ServerResponse, body: unknown) {
  response.write(`data: ${JSON.stringify(body)}\n\n`);
  (response as ServerResponse & { flush?: () => void }).flush?.();
}

function writeNdjsonHead(response: ServerResponse) {
  response.socket?.setNoDelay(true);
  response.writeHead(200, {
    'Access-Control-Allow-Headers': CORS_REQUEST_HEADERS,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'X-Accel-Buffering': 'no',
  });
  response.flushHeaders();
}

function writeNdjsonEvent(response: ServerResponse, body: unknown) {
  response.write(`${JSON.stringify(body)}\n`);
  (response as ServerResponse & { flush?: () => void }).flush?.();
}

function normalizeProviderMessages(value: unknown): ChatProviderMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item): ChatProviderMessage | null => {
      if (!item || typeof item !== 'object') {
        return null;
      }
      const source = item as Partial<ChatProviderMessage>;
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
    .filter((item): item is ChatProviderMessage => Boolean(item));
}

function normalizeStateScope(value: unknown): 'chat' | 'memory' {
  return value === 'memory' ? 'memory' : 'chat';
}

function normalizeResponseFormat(value: unknown): ChatProviderRequest['responseFormat'] {
  if (!value || typeof value !== 'object') {
    return undefined;
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
  return undefined;
}

function normalizeStateKey(value: unknown, fallback: string) {
  const raw = typeof value === 'string' && value.trim() ? value : fallback;
  const key = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160);
  return key || 'default';
}

function normalizeRemoteTtsProvider(value: unknown): RemoteTtsProvider {
  return value === 'inworld' ? 'inworld' : 'fish-speech';
}

function getHeaderValue(request: IncomingMessage, name: string) {
  const value = request.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function getHeaderSecret(request: IncomingMessage, name: string) {
  return getHeaderValue(request, name)?.trim() ?? '';
}

function normalizeRuntimeLlmProvider(value: unknown) {
  return value === 'openrouter-responses' ? 'openrouter-responses' : 'openai-responses';
}

function hashSecret(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function getRuntimeChatProvider(
  baseConfig: StreamBotConfig,
  request: IncomingMessage,
  llmProvider: unknown,
  model?: string,
) {
  const apiKey = getHeaderSecret(request, 'x-yourwifey-llm-provider-key');
  if (!apiKey) {
    return baseConfig.providerProxyEnabled ? provider : null;
  }

  const providerName = normalizeRuntimeLlmProvider(
    getHeaderValue(request, 'x-yourwifey-llm-provider') || llmProvider,
  );
  const runtimeConfig: StreamBotConfig = {
    ...baseConfig,
    aiApiBaseUrl:
      providerName === 'openrouter-responses'
        ? 'https://openrouter.ai/api/v1'
        : baseConfig.aiApiBaseUrl,
    aiApiKey: apiKey,
    aiModel: model?.trim() || baseConfig.aiModel,
    aiProvider: 'openai-responses',
    openAiStateMode:
      providerName === 'openrouter-responses' ? 'stateless' : baseConfig.openAiStateMode,
    openAiStore: providerName === 'openrouter-responses' ? false : baseConfig.openAiStore,
    openAiWebSocketUrl:
      providerName === 'openrouter-responses' ? '' : baseConfig.openAiWebSocketUrl,
    providerProxyEnabled: true,
  };
  const cacheKey = [
    providerName,
    runtimeConfig.aiApiBaseUrl,
    runtimeConfig.aiModel,
    runtimeConfig.openAiStateMode,
    runtimeConfig.openAiStore ? 'store' : 'no-store',
    hashSecret(apiKey),
  ].join('|');
  let runtimeProvider = runtimeProviderCache.get(cacheKey);
  if (!runtimeProvider) {
    runtimeProvider = createProvider(runtimeConfig);
    runtimeProviderCache.set(cacheKey, runtimeProvider);
  }
  return runtimeProvider;
}

function getRuntimeEmbeddingConfig(
  baseConfig: StreamBotConfig,
  request: IncomingMessage,
  llmProvider: unknown,
) {
  const apiKey = getHeaderSecret(request, 'x-yourwifey-llm-provider-key');
  if (!apiKey) {
    return baseConfig.providerProxyEnabled ? baseConfig : null;
  }

  const providerName = normalizeRuntimeLlmProvider(
    getHeaderValue(request, 'x-yourwifey-llm-provider') || llmProvider,
  );
  return {
    ...baseConfig,
    aiApiBaseUrl:
      providerName === 'openrouter-responses'
        ? 'https://openrouter.ai/api/v1'
        : baseConfig.aiApiBaseUrl,
    aiApiKey: apiKey,
    providerProxyEnabled: true,
  };
}

function getRuntimeTtsConfig(
  baseConfig: StreamBotConfig,
  providerName: RemoteTtsProvider,
  request: IncomingMessage,
) {
  const apiKey = getHeaderSecret(request, 'x-yourwifey-tts-provider-key');
  if (!apiKey) {
    return baseConfig.providerProxyEnabled ? baseConfig : null;
  }

  return providerName === 'inworld'
    ? {
        ...baseConfig,
        inworldApiKey: apiKey,
        providerProxyEnabled: true,
      }
    : {
        ...baseConfig,
        fishSpeechApiKey: apiKey,
        providerProxyEnabled: true,
      };
}

function normalizeTtsLatency(value: unknown) {
  return value === 'balanced' || value === 'normal' ? value : undefined;
}

function normalizeLiveTtsBridge(
  value: unknown,
): Omit<RemoteTtsRequest, 'provider' | 'text'> | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const source = value as Partial<RemoteTtsRequest>;
  if (source.provider !== 'fish-speech' || source.streamingMode !== 'live-bridge') {
    return null;
  }
  return {
    streamingMode: 'live-bridge',
    voiceId: typeof source.voiceId === 'string' ? source.voiceId : undefined,
    modelId: typeof source.modelId === 'string' ? source.modelId : undefined,
    latency: normalizeTtsLatency(source.latency),
    conditionOnPreviousChunks:
      typeof source.conditionOnPreviousChunks === 'boolean'
        ? source.conditionOnPreviousChunks
        : undefined,
    chunkLength: typeof source.chunkLength === 'number' ? source.chunkLength : undefined,
  };
}

function createAsyncTextQueue() {
  const chunks: string[] = [];
  const waiters: Array<() => void> = [];
  let closed = false;
  let failure: Error | null = null;

  const wake = () => {
    while (waiters.length > 0) {
      waiters.shift()?.();
    }
  };

  return {
    push(chunk: string) {
      if (closed || failure) {
        return;
      }
      const text = chunk.trim();
      if (!text) {
        return;
      }
      chunks.push(text.endsWith(' ') ? text : `${text} `);
      wake();
    },
    close() {
      closed = true;
      wake();
    },
    fail(error: Error) {
      failure = error;
      closed = true;
      wake();
    },
    async *stream() {
      while (true) {
        if (failure) {
          throw failure;
        }
        const next = chunks.shift();
        if (next) {
          yield next;
          continue;
        }
        if (closed) {
          return;
        }
        await new Promise<void>((resolve) => waiters.push(resolve));
      }
    },
  };
}

function createMetadataSpeechFilter() {
  const open = '<yw-meta>';
  const close = '</yw-meta>';
  let buffer = '';
  let suppressing = false;

  const safeLength = (value: string) => {
    for (let tail = Math.min(open.length - 1, value.length); tail > 0; tail -= 1) {
      if (open.startsWith(value.slice(value.length - tail))) {
        return value.length - tail;
      }
    }
    return value.length;
  };

  return {
    push(delta: string) {
      buffer += delta;
      let visible = '';
      while (buffer) {
        if (suppressing) {
          const closeIndex = buffer.indexOf(close);
          if (closeIndex === -1) {
            buffer = '';
            break;
          }
          buffer = buffer.slice(closeIndex + close.length);
          suppressing = false;
          continue;
        }
        const openIndex = buffer.indexOf(open);
        if (openIndex !== -1) {
          visible += buffer.slice(0, openIndex);
          buffer = buffer.slice(openIndex + open.length);
          suppressing = true;
          continue;
        }
        const length = safeLength(buffer);
        if (length <= 0) {
          break;
        }
        visible += buffer.slice(0, length);
        buffer = buffer.slice(length);
      }
      return visible;
    },
    finish() {
      if (suppressing) {
        buffer = '';
        return '';
      }
      const visible = buffer;
      buffer = '';
      return visible;
    },
  };
}

function createLiveSpeechTextBridge() {
  const queue = createAsyncTextQueue();
  const filter = createMetadataSpeechFilter();
  let pending = '';

  const flush = (force = false) => {
    while (pending.trim()) {
      const maxLength = 180;
      const minLength = 28;
      if (!force && pending.length < minLength) {
        return;
      }
      const windowText = pending.slice(0, maxLength);
      const matches = Array.from(windowText.matchAll(/[.!?]["')\]]?\s+|[,;:]\s+|\n+/g));
      const boundary = [...matches].reverse().find((match) => (match.index ?? 0) >= minLength);
      let splitAt = boundary ? (boundary.index ?? 0) + boundary[0].length : -1;
      if (splitAt === -1 && pending.length >= maxLength) {
        splitAt = Math.max(windowText.lastIndexOf(' '), minLength);
      }
      if (splitAt === -1) {
        if (!force) {
          return;
        }
        splitAt = pending.length;
      }
      const chunk = pending.slice(0, splitAt).trim();
      pending = pending.slice(splitAt).trimStart();
      queue.push(chunk);
    }
  };

  return {
    push(delta: string) {
      const visible = filter.push(delta);
      if (!visible) {
        return;
      }
      pending += visible;
      flush(false);
    },
    close() {
      pending += filter.finish();
      flush(true);
      queue.close();
    },
    fail(error: Error) {
      queue.fail(error);
    },
    stream: queue.stream(),
  };
}

function normalizeFishVoiceScope(value: unknown) {
  return value === 'mine' || value === 'public' ? value : 'all';
}

function normalizeAiTransportMode(value: unknown): ChatProviderRequest['transportMode'] {
  return value === 'websocket' || value === 'http-stream' ? value : undefined;
}

function normalizeOpenAiStateMode(value: unknown): ChatProviderRequest['openAiStateMode'] {
  return value === 'conversation' || value === 'previous-response' || value === 'stateless'
    ? value
    : undefined;
}

function normalizeEmbeddingInput(value: unknown) {
  return typeof value === 'string' ? value.trim().slice(0, 4000) : '';
}

function getOpenAiEmbeddingHeaders(config: StreamBotConfig) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.aiApiKey}`,
    'Content-Type': 'application/json',
  };
  if (config.openAiSafetyIdentifier) {
    headers['OpenAI-Safety-Identifier'] = config.openAiSafetyIdentifier;
  }
  return headers;
}

async function createOpenAiEmbedding(config: StreamBotConfig, input: string, model: string) {
  const openAiResponse = await fetch(`${config.aiApiBaseUrl.replace(/\/+$/, '')}/embeddings`, {
    method: 'POST',
    headers: getOpenAiEmbeddingHeaders(config),
    body: JSON.stringify({
      input,
      model,
    }),
  });

  if (!openAiResponse.ok) {
    const errorText = await openAiResponse.text().catch(() => '');
    throw new Error(
      errorText || `OpenAI Embeddings API failed with HTTP ${openAiResponse.status}.`,
    );
  }

  const data = (await openAiResponse.json()) as OpenAiEmbeddingPayload;
  const embedding = data.data?.[0]?.embedding;
  if (!Array.isArray(embedding)) {
    throw new Error('OpenAI returned no embedding.');
  }

  return embedding;
}

function matchByokApiRoute(url: URL): MatchedByokApiRoute | null {
  const parts = url.pathname
    .split('/')
    .filter(Boolean)
    .map((part) => decodeURIComponent(part));
  if (parts[0] !== 'api' || parts[1] !== 'byok') {
    return null;
  }

  const query = Object.fromEntries(url.searchParams.entries()) as Record<
    string,
    string | string[] | undefined
  >;
  const route = (...path: string[]) =>
    new URL(`../../api-dist/api/byok/${path.join('/')}`, import.meta.url).href;

  if (parts.length === 3 && parts[2] === 'profile') {
    return { modulePath: route('profile.js'), query };
  }

  if (parts.length === 5 && parts[2] === 'overlay' && parts[4] === 'config') {
    return {
      modulePath: route('overlay/[sceneId]/config.js'),
      query: { ...query, sceneId: parts[3] },
    };
  }

  if (parts[2] !== 'workspaces' || !parts[3]) {
    return null;
  }

  const workspaceId = parts[3];
  if (parts.length === 4) {
    return {
      modulePath: route('workspaces/[workspaceId].js'),
      query: { ...query, workspaceId },
    };
  }

  if (parts.length === 5 && parts[4] === 'settings') {
    return {
      modulePath: route('workspaces/[workspaceId]/settings/index.js'),
      query: { ...query, workspaceId },
    };
  }

  if (parts.length === 6 && parts[4] === 'settings') {
    return {
      modulePath: route('workspaces/[workspaceId]/settings/[settingId].js'),
      query: { ...query, settingId: parts[5], workspaceId },
    };
  }

  if (parts.length === 7 && parts[4] === 'scenes' && parts[6] === 'overlay-tokens' && parts[5]) {
    return {
      modulePath: route('workspaces/[workspaceId]/scenes/[sceneId]/overlay-tokens.js'),
      query: { ...query, sceneId: parts[5], workspaceId },
    };
  }

  return null;
}

function getRuntimeApiPath(pathname: string) {
  return pathname.startsWith('/api/ai/') ||
    pathname.startsWith('/api/tts/') ||
    pathname.startsWith('/api/mock/') ||
    pathname === '/api/health'
    ? pathname.slice('/api'.length)
    : pathname;
}

async function handleByokApiRoute(
  request: IncomingMessage,
  response: ServerResponse,
  route: MatchedByokApiRoute,
) {
  try {
    const method = request.method ?? 'GET';
    const body =
      method === 'GET' || method === 'HEAD' ? undefined : await readRequestJson<unknown>(request);
    const module = (await import(route.modulePath)) as { default?: ByokApiHandler };
    if (!module.default) {
      writeJson(response, 404, {
        ok: false,
        reason: 'byok-route-not-found',
        message: 'BYOK API route is not available in this runtime.',
        status: 404,
      });
      return;
    }

    let ended = false;
    const apiResponse: ByokApiHandlerResponse = {
      json(bodyValue: unknown) {
        if (ended) {
          return;
        }
        ended = true;
        if (!response.headersSent) {
          response.setHeader('Content-Type', 'application/json');
        }
        response.end(JSON.stringify(bodyValue));
      },
      setHeader(name: string, value: string | number | readonly string[]) {
        response.setHeader(name, value);
      },
      status(code: number) {
        response.statusCode = code;
        return apiResponse;
      },
    };

    await module.default(
      {
        body,
        headers: request.headers,
        method,
        query: route.query,
      },
      apiResponse,
    );

    if (!ended) {
      response.end();
    }
  } catch (error) {
    writeJson(response, 500, {
      ok: false,
      reason: 'byok-runtime-route-failed',
      message: error instanceof Error ? error.message : 'BYOK API route failed.',
      status: 500,
    });
  }
}

const config = loadConfig();
const provider = createProvider(config);
const runtimeProviderCache = new Map<string, ChatProvider>();
const serverTwitchMode = config.twitchMock ? 'client-direct' : 'server-irc';

let mockSource: MockTwitchChatSource | null = null;
let chatSource: TwitchChatSource;
let commandRouter: CommandRouter;

const httpServer = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);

  if (request.method === 'OPTIONS') {
    writeJson(response, 204, {});
    return;
  }

  const byokApiRoute = matchByokApiRoute(url);
  if (byokApiRoute) {
    await handleByokApiRoute(request, response, byokApiRoute);
    return;
  }

  const runtimePath = getRuntimeApiPath(url.pathname);

  if (request.method === 'GET' && runtimePath === '/health') {
    writeJson(response, 200, {
      ok: true,
      twitchMode: serverTwitchMode,
      serverTwitchSource: config.twitchMock ? 'local-control' : 'irc',
      channel: chatSource.channel,
      overlayClients: overlaySocket.clientCount,
      aiProvider: config.providerProxyEnabled ? config.aiProvider : 'disabled',
      serverProviderProxyEnabled: config.providerProxyEnabled,
      model: config.providerProxyEnabled ? (provider.getModel?.() ?? config.aiModel) : null,
      providerState: config.providerProxyEnabled ? (provider.getState?.() ?? null) : null,
      ttsProviders: {
        fishSpeech: {
          configured: config.providerProxyEnabled && Boolean(config.fishSpeechApiKey),
          defaultVoice: Boolean(config.fishSpeechVoiceId),
          model: config.fishSpeechModel,
          latency: config.fishSpeechLatency,
          conditionOnPreviousChunks: config.fishSpeechConditionOnPreviousChunks,
        },
        inworld: {
          configured: config.providerProxyEnabled && Boolean(config.inworldApiKey),
          defaultVoice: Boolean(config.inworldVoiceId),
          model: config.inworldModelId,
          deliveryMode: config.inworldDeliveryMode,
        },
      },
      byok: summarizeByokRuntimeHealth(),
    });
    return;
  }

  if (request.method === 'GET' && runtimePath === '/tts/voices') {
    const providerName = normalizeRemoteTtsProvider(url.searchParams.get('provider'));
    const ttsConfig = getRuntimeTtsConfig(config, providerName, request);
    if (!ttsConfig) {
      writeJson(response, 200, {
        ok: false,
        error: 'Remote TTS provider key is not configured.',
        voices: [],
      });
      return;
    }
    try {
      const voices = await listRemoteTtsVoices(ttsConfig, providerName, {
        fishScope: normalizeFishVoiceScope(url.searchParams.get('scope')),
      });
      writeJson(response, 200, {
        ok: true,
        provider: providerName,
        voices,
      });
    } catch (error) {
      writeJson(response, 200, {
        ok: false,
        error: error instanceof Error ? error.message : 'Remote TTS voice fetch failed.',
        voices: [],
      });
    }
    return;
  }

  if (request.method === 'POST' && runtimePath === '/tts/stream') {
    try {
      const body = await readRequestJson<{
        provider?: unknown;
        text?: unknown;
        streamingMode?: unknown;
        voiceId?: unknown;
        modelId?: unknown;
        latency?: unknown;
        conditionOnPreviousChunks?: unknown;
        chunkLength?: unknown;
        deliveryMode?: unknown;
        bufferCharThreshold?: unknown;
      }>(request);
      const text = typeof body.text === 'string' ? body.text.trim() : '';
      if (!text) {
        writeJson(response, 200, { ok: false, error: 'text is required.' });
        return;
      }
      const providerName = normalizeRemoteTtsProvider(body.provider);
      const ttsConfig = getRuntimeTtsConfig(config, providerName, request);
      if (!ttsConfig) {
        writeJson(response, 200, {
          ok: false,
          error: 'Remote TTS provider key is not configured.',
        });
        return;
      }

      writeNdjsonHead(response);
      await streamRemoteTts(
        ttsConfig,
        {
          provider: providerName,
          text,
          streamingMode: typeof body.streamingMode === 'string' ? body.streamingMode : undefined,
          voiceId: typeof body.voiceId === 'string' ? body.voiceId : undefined,
          modelId: typeof body.modelId === 'string' ? body.modelId : undefined,
          latency: normalizeTtsLatency(body.latency),
          conditionOnPreviousChunks:
            typeof body.conditionOnPreviousChunks === 'boolean'
              ? body.conditionOnPreviousChunks
              : undefined,
          chunkLength: typeof body.chunkLength === 'number' ? body.chunkLength : undefined,
          deliveryMode: typeof body.deliveryMode === 'string' ? body.deliveryMode : undefined,
          bufferCharThreshold:
            typeof body.bufferCharThreshold === 'number' ? body.bufferCharThreshold : undefined,
        },
        {
          onAudioChunk: (chunk) => {
            writeNdjsonEvent(response, {
              type: 'audio',
              audio: chunk.audio.toString('base64'),
              mimeType: chunk.mimeType,
              sampleRate: chunk.sampleRate,
            });
          },
        },
      );
      writeNdjsonEvent(response, { type: 'done', ok: true });
      response.end();
    } catch (error) {
      if (response.headersSent) {
        writeNdjsonEvent(response, {
          type: 'error',
          ok: false,
          error: error instanceof Error ? error.message : 'Remote TTS failed.',
        });
        response.end();
        return;
      }
      writeJson(response, 200, {
        ok: false,
        error: error instanceof Error ? error.message : 'Remote TTS failed.',
      });
    }
    return;
  }

  if (request.method === 'POST' && runtimePath === '/ai/embeddings') {
    try {
      const body = await readRequestJson<{
        input?: unknown;
        llmProvider?: unknown;
        model?: unknown;
      }>(request);
      const embeddingConfig = getRuntimeEmbeddingConfig(config, request, body.llmProvider);
      if (!embeddingConfig?.aiApiKey) {
        writeJson(response, 200, { ok: false, error: 'AI provider key is not configured.' });
        return;
      }

      const input = normalizeEmbeddingInput(body.input);
      if (!input) {
        writeJson(response, 200, { ok: false, error: 'input is required.' });
        return;
      }

      const model =
        typeof body.model === 'string' && body.model.trim()
          ? body.model.trim()
          : process.env['OPENAI_EMBEDDING_MODEL'] || 'text-embedding-3-small';
      const embedding = await createOpenAiEmbedding(embeddingConfig, input, model);
      writeJson(response, 200, {
        embedding,
        model,
        ok: true,
      });
    } catch (error) {
      writeJson(response, 200, {
        ok: false,
        error: error instanceof Error ? error.message : 'Embedding request failed.',
      });
    }
    return;
  }

  if (request.method === 'POST' && runtimePath === '/ai/poml/render') {
    try {
      const body = await readRequestJson<{ variables?: unknown }>(request);
      writeJson(response, 200, await renderYourWifeyPomlResponse(body.variables));
    } catch (error) {
      writeJson(response, 200, {
        ok: false,
        error: error instanceof Error ? error.message : 'POML render failed.',
      });
    }
    return;
  }

  if (request.method === 'POST' && runtimePath === '/ai/chat') {
    try {
      const body = await readRequestJson<{
        mode?: 'direct' | 'batch';
        activeChatters?: number;
        disableState?: boolean;
        model?: string;
        messages?: unknown;
        maxTokens?: number;
        responseFormat?: unknown;
        stateKey?: string;
        stateScope?: 'chat' | 'memory';
        stream?: boolean;
        temperature?: number;
        transportMode?: unknown;
        openAiStateMode?: unknown;
        ttsBridge?: unknown;
        llmProvider?: unknown;
      }>(request);
      const messages = normalizeProviderMessages(body.messages);
      if (messages.length === 0) {
        writeJson(response, 200, { ok: false, error: 'messages[] is required.' });
        return;
      }

      const runtimeProvider = getRuntimeChatProvider(config, request, body.llmProvider, body.model);
      if (!runtimeProvider) {
        writeJson(response, 200, {
          ok: false,
          error: 'AI provider key is not configured.',
        });
        return;
      }
      if (typeof body.model === 'string' && body.model.trim()) {
        runtimeProvider.setModel?.(body.model);
      }

      const providerRequest: ChatProviderRequest = {
        mode: body.mode === 'batch' ? 'batch' : 'direct',
        activeChatters: Number.isFinite(body.activeChatters) ? Number(body.activeChatters) : 1,
        disableState: body.disableState === true,
        messages,
        sourceMessages: [],
        maxTokens: body.maxTokens,
        responseFormat: normalizeResponseFormat(body.responseFormat),
        stateKey: normalizeStateKey(body.stateKey, `twitch:${config.twitchChannel}:persona:riko`),
        stateScope: normalizeStateScope(body.stateScope),
        temperature: body.temperature,
        transportMode: normalizeAiTransportMode(body.transportMode),
        openAiStateMode: normalizeOpenAiStateMode(body.openAiStateMode),
      };

      if (body.stream === true) {
        writeSseHead(response);
        const bridgeRequest = normalizeLiveTtsBridge(body.ttsBridge);
        const bridgeConfig = bridgeRequest
          ? getRuntimeTtsConfig(config, 'fish-speech', request)
          : null;
        if (bridgeRequest && !bridgeConfig) {
          writeSseEvent(response, {
            type: 'tts-error',
            ok: false,
            error: 'Fish Speech live bridge provider key is not configured.',
          });
        }
        const bridge = bridgeRequest && bridgeConfig ? createLiveSpeechTextBridge() : null;
        const bridgeDone = bridge
          ? streamFishSpeechTextStream(bridgeConfig!, bridgeRequest!, bridge.stream, {
              onAudioChunk: (chunk) => {
                writeSseEvent(response, {
                  type: 'audio',
                  audio: chunk.audio.toString('base64'),
                  mimeType: chunk.mimeType,
                  sampleRate: chunk.sampleRate,
                });
              },
            }).catch((error) => {
              writeSseEvent(response, {
                type: 'tts-error',
                ok: false,
                error: error instanceof Error ? error.message : 'Live TTS bridge failed.',
              });
            })
          : null;
        let providerResponse: ChatProviderResponse;
        try {
          providerResponse =
            (await runtimeProvider.completeStream?.(providerRequest, {
              onTextDelta: (delta) => {
                writeSseEvent(response, { type: 'delta', delta });
                bridge?.push(delta);
              },
            })) ?? (await runtimeProvider.complete(providerRequest));
          bridge?.close();
          if (bridgeDone) {
            await bridgeDone;
          }
        } catch (error) {
          bridge?.fail(error instanceof Error ? error : new Error(String(error)));
          if (bridgeDone) {
            await bridgeDone.catch(() => {});
          }
          throw error;
        }

        writeSseEvent(response, {
          type: 'done',
          ok: true,
          text: providerResponse.text,
          meta: providerResponse.meta ?? runtimeProvider.getState?.() ?? null,
        });
        response.end();
        return;
      }

      const providerResponse = await runtimeProvider.complete(providerRequest);

      writeJson(response, 200, {
        ok: true,
        text: providerResponse.text,
        meta: providerResponse.meta ?? runtimeProvider.getState?.() ?? null,
      });
    } catch (error) {
      if (response.headersSent) {
        writeSseEvent(response, {
          type: 'error',
          ok: false,
          error: error instanceof Error ? error.message : 'AI chat request failed.',
        });
        response.end();
        return;
      }
      writeJson(response, 200, {
        ok: false,
        error: error instanceof Error ? error.message : 'AI chat request failed.',
      });
    }
    return;
  }

  if (request.method === 'POST' && runtimePath === '/mock/chat') {
    if (!mockSource) {
      writeJson(response, 409, {
        ok: false,
        error: 'TWITCH_MOCK=true is required for /mock/chat.',
      });
      return;
    }

    try {
      const body = await readRequestJson<MockChatInjection>(request);
      mockSource.inject(body);
      writeJson(response, 202, { ok: true });
    } catch (error) {
      writeJson(response, 400, {
        ok: false,
        error: error instanceof Error ? error.message : 'Invalid request.',
      });
    }
    return;
  }

  if (request.method === 'GET' && runtimePath === '/overlay') {
    response.writeHead(302, { Location: `http://127.0.0.1:${config.overlayPort}/overlay` });
    response.end();
    return;
  }

  writeJson(response, 404, { ok: false, error: 'Not found.' });
});

const overlaySocket = new OverlaySocket(httpServer, (event: OverlayClientEvent) => {
  if (event.type === 'manual:prompt') {
    const text = event.payload?.text?.trim();
    if (text && mockSource) {
      mockSource.inject({ user: 'operator', displayName: 'Operator', text, isBroadcaster: true });
    }
  }
});

const scheduler = new ChatScheduler({
  provider,
  botAliases: config.botAliases,
  onEvent: emitBotEvent,
  onReply: (text) => {
    if (commandRouter.getSendChatReplies()) {
      chatSource.sendMessage(text);
    }
  },
});

const sourceHandlers: TwitchChatSourceHandlers = {
  onMessage: (message) => {
    if (commandRouter.handleMessage(message)) {
      return;
    }
    void scheduler.handleMessage(message);
  },
  onStatus: (status) => {
    emitBotEvent({ type: 'system:status', payload: status });
  },
};

if (config.twitchMock) {
  mockSource = new MockTwitchChatSource(config.twitchChannel || 'mock-channel', sourceHandlers);
  chatSource = mockSource;
} else {
  chatSource = new TwitchIrcSource(
    {
      channel: config.twitchChannel,
      botUsername: config.twitchBotUsername,
      oauthToken: config.twitchOauthToken,
    },
    sourceHandlers,
  );
}

function emitBotEvent(event: Parameters<OverlaySocket['broadcast']>[0]) {
  overlaySocket.broadcast(event);
  if (event.type === 'system:status') {
    const writer = event.payload.level === 'error' ? console.error : console.log;
    writer(`[${event.payload.level}] ${event.payload.message}`);
  }
  if (event.type === 'command:response') {
    console.log(`[command] ${event.payload.text}`);
  }
}

commandRouter = new CommandRouter({
  prefixes: config.commandPrefixes,
  admins: config.commandAdmins,
  allowMods: config.commandAllowMods,
  sendChatReplies: config.sendTwitchReplies,
  provider,
  getChatSource: () => chatSource,
  getStatus: () => ({
    activeChatters: scheduler.getActiveChatterCount(),
    overlayClients: overlaySocket.clientCount,
    twitchMode: serverTwitchMode,
  }),
  emit: emitBotEvent,
});

const batchTimer = setInterval(() => {
  void scheduler.flushTimedBatch();
}, 1000);

function shutdown() {
  clearInterval(batchTimer);
  chatSource.stop();
  overlaySocket.close();
  httpServer.close();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

httpServer.listen(config.botPort, () => {
  console.log(`YourWifey stream bot listening on http://127.0.0.1:${config.botPort}`);
  console.log(`Overlay WebSocket path: ws://127.0.0.1:${config.botPort}/ws`);
  console.log(`Twitch chat mode: ${serverTwitchMode} (#${chatSource.channel})`);
  chatSource.start();
});
