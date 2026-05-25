import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import { MockChatProvider } from './ai/MockChatProvider.js';
import { OpenAiCompatibleProvider } from './ai/OpenAiCompatibleProvider.js';
import { OpenAiResponsesProvider } from './ai/OpenAiResponsesProvider.js';
import { TAVILY_OPENAI_TOOLS } from './ai/TavilyTools.js';
import { createAiVisibleDeltaFilter, getSafeFinalVisibleText } from './ai/VisibleDeltaFilter.js';
import type {
  ChatProvider,
  ChatProviderInputImage,
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
  createRemoteTtsVoice,
  listRemoteTtsVoices,
  streamFishSpeechTextStream,
  streamRemoteTts,
  type CreateRemoteTtsVoiceRequest,
  type RemoteTtsProvider,
  type RemoteTtsRequest,
} from './tts/RemoteTtsProvider.js';
import type { TwitchChatSource, TwitchChatSourceHandlers } from './twitch/TwitchChatSource.js';
import { TwitchIrcSource } from './twitch/TwitchIrcSource.js';
import {
  captureTwitchStreamFrame,
  transcribeTwitchStreamSample,
} from './twitch/TwitchStreamTranscriber.js';
import {
  isPremiumCostModelId,
  normalizeEmbeddingModel,
  normalizeOpenAiTranscriptionModel,
  resolveRuntimeHealthStateKey,
  resolveServerProviderProxyModel,
} from './runtimeSafety.js';
import {
  getProviderEmbeddingModel,
  getProviderEnvApiKey,
  getRuntimeProviderBaseUrl,
  normalizeRuntimeLlmProvider,
  providerModelsCanBeListedWithoutKey,
  providerUsesAppOwnedState,
  type RuntimeLlmProvider,
} from './runtimeProviderRouting.js';
import {
  closeLadybugMemoryService,
  getLadybugMemoryService,
} from './memory/LadybugMemoryService.js';

type OpenAiEmbeddingPayload = {
  data?: Array<{
    embedding?: number[];
  }>;
};

type ProviderModelsPayload = {
  data?: Array<{
    id?: string;
    [key: string]: unknown;
  }>;
  error?: {
    message?: string;
  };
};

type MemoryGrilloBody = {
  scopeKey?: unknown;
  state?: unknown;
};

type MemorySemanticBody = {
  records?: unknown;
  scopeKey?: unknown;
};

type AiChatRequestBody = {
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
};

type AiChatStreamEvent =
  | { type: 'delta'; delta: string }
  | { type: 'audio'; audio: string; mimeType: string; sampleRate?: number }
  | { type: 'tts-error'; ok: false; error: string };

type AiLiveClientMessage = {
  type?: string;
  requestId?: string;
  body?: AiChatRequestBody;
  headers?: Record<string, unknown>;
};

type AiLiveServerEvent =
  | (AiChatStreamEvent & { requestId: string })
  | {
      type: 'done';
      ok: true;
      requestId: string;
      text: string;
      meta: unknown;
    }
  | { type: 'error'; ok: false; requestId: string; error: string };

const CORS_REQUEST_HEADERS =
  'accept,authorization,content-type,x-requested-with,x-yourwifey-llm-provider,x-yourwifey-llm-provider-key,x-yourwifey-tts-provider-key,x-yourwifey-tavily-provider-key';
const AI_LIVE_SOCKET_PATH = '/ai/live';
const AI_LIVE_MAX_BUFFERED_BYTES = 2 * 1024 * 1024;
const AI_LIVE_ALLOWED_HEADERS = new Set([
  'x-yourwifey-llm-provider',
  'x-yourwifey-llm-provider-key',
  'x-yourwifey-tts-provider-key',
  'x-yourwifey-tavily-provider-key',
]);
const LIVE_TTS_BRIDGE_FINAL_WAIT_MS = 15000;
const RUNTIME_CHAT_PROVIDER_CACHE_TTL_MS = 10 * 60 * 1000;
const RUNTIME_CHAT_PROVIDER_CACHE_MAX = 8;
const AUTH_SCHEME_PATTERNS = {
  basic: /^basic\s+/i,
  bearer: /^bearer\s+/i,
} satisfies Record<'basic' | 'bearer', RegExp>;

type CachedRuntimeChatProvider = {
  key: string;
  lastUsedAt: number;
  provider: ChatProvider;
};

const runtimeChatProviderCache = new Map<string, CachedRuntimeChatProvider>();

function createCorsHeaders(request?: IncomingMessage) {
  const requestedHeaders = request?.headers['access-control-request-headers'];
  return {
    'Access-Control-Allow-Headers':
      typeof requestedHeaders === 'string' && requestedHeaders.trim()
        ? requestedHeaders
        : CORS_REQUEST_HEADERS,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Private-Network': 'true',
    Vary: 'Origin, Access-Control-Request-Headers',
  };
}

function writeCorsPreflight(request: IncomingMessage, response: ServerResponse) {
  response.writeHead(204, {
    ...createCorsHeaders(request),
    'Access-Control-Max-Age': '86400',
    'Content-Length': '0',
  });
  response.end();
}

function waitForLiveTtsBridge(done: Promise<void>, onTimeout: () => void) {
  return new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => {
      onTimeout();
      resolve(false);
    }, LIVE_TTS_BRIDGE_FINAL_WAIT_MS);
    done.then(
      () => {
        clearTimeout(timeout);
        resolve(true);
      },
      () => {
        clearTimeout(timeout);
        resolve(false);
      },
    );
  });
}

function createProvider(
  config: StreamBotConfig,
  options: {
    closeWebSocketAfterRequest?: boolean;
    providerName?: RuntimeLlmProvider;
  } = {},
): ChatProvider {
  if (!config.providerProxyEnabled) {
    return new MockChatProvider();
  }
  if (
    config.aiProvider === 'openai-responses' ||
    config.aiProvider === 'openai-responses-ws' ||
    config.aiProvider === 'openrouter-responses'
  ) {
    if (!config.aiApiKey) {
      throw new Error(
        `${config.aiProvider} requires ${
          config.aiProvider === 'openrouter-responses'
            ? 'OPENROUTER_API_KEY'
            : 'OPENAI_API_KEY or AI_API_KEY'
        }.`,
      );
    }
    const isOpenRouter = config.aiProvider === 'openrouter-responses';
    return new OpenAiResponsesProvider({
      apiBaseUrl: config.aiApiBaseUrl,
      apiKey: config.aiApiKey,
      closeWebSocketAfterRequest: options.closeWebSocketAfterRequest,
      model: config.aiModel,
      maxOutputTokens: 180,
      temperature: 0.7,
      stateMode: isOpenRouter ? 'stateless' : config.openAiStateMode,
      conversationId: isOpenRouter ? undefined : config.openAiConversationId || undefined,
      promptCacheKey: config.openAiPromptCacheKey || undefined,
      promptCacheRetention: config.openAiPromptCacheRetention || undefined,
      providerName: options.providerName ?? (isOpenRouter ? 'openrouter-responses' : undefined),
      reasoningEffort: config.openAiReasoningEffort,
      safetyIdentifier: config.openAiSafetyIdentifier || undefined,
      store: isOpenRouter ? false : config.openAiStore,
      tavilyTools: config.tavilyApiKey
        ? {
            apiKey: config.tavilyApiKey,
            searchDepth: config.tavilySearchDepth,
            maxResults: config.tavilyMaxResults,
            crawlLimit: config.tavilyCrawlLimit,
            timeoutMs: config.tavilyTimeoutMs,
          }
        : undefined,
      useWebSocket: isOpenRouter ? false : config.aiProvider === 'openai-responses-ws',
      webSocketUrl: isOpenRouter ? undefined : config.openAiWebSocketUrl || undefined,
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

function disposeChatProvider(provider: ChatProvider) {
  (provider as { dispose?: () => void }).dispose?.();
}

function hashCacheSecret(value: string) {
  return createHash('sha256').update(value).digest('base64url').slice(0, 18);
}

function buildRuntimeChatProviderCacheKey(
  runtimeConfig: StreamBotConfig,
  providerName: RuntimeLlmProvider,
) {
  return [
    providerName,
    runtimeConfig.aiApiBaseUrl,
    runtimeConfig.aiModel,
    hashCacheSecret(runtimeConfig.aiApiKey),
    hashCacheSecret(runtimeConfig.tavilyApiKey || ''),
    runtimeConfig.openAiStateMode,
    runtimeConfig.openAiStore ? 'store' : 'nostore',
    runtimeConfig.openAiPromptCacheKey,
    runtimeConfig.openAiPromptCacheRetention,
    runtimeConfig.openAiWebSocketUrl,
    runtimeConfig.openAiReasoningEffort,
    runtimeConfig.openAiSafetyIdentifier,
  ].join('|');
}

function pruneRuntimeChatProviderCache(now = Date.now()) {
  for (const [cacheKey, cached] of runtimeChatProviderCache) {
    if (now - cached.lastUsedAt > RUNTIME_CHAT_PROVIDER_CACHE_TTL_MS) {
      disposeChatProvider(cached.provider);
      runtimeChatProviderCache.delete(cacheKey);
    }
  }

  while (runtimeChatProviderCache.size > RUNTIME_CHAT_PROVIDER_CACHE_MAX) {
    let oldest: CachedRuntimeChatProvider | null = null;
    for (const cached of runtimeChatProviderCache.values()) {
      if (!oldest || cached.lastUsedAt < oldest.lastUsedAt) {
        oldest = cached;
      }
    }
    if (!oldest) {
      return;
    }
    disposeChatProvider(oldest.provider);
    runtimeChatProviderCache.delete(oldest.key);
  }
}

function disposeRuntimeChatProviderCache() {
  for (const cached of runtimeChatProviderCache.values()) {
    disposeChatProvider(cached.provider);
  }
  runtimeChatProviderCache.clear();
}

function readRequestJson<T>(request: IncomingMessage, maxBodyLength = 100000) {
  return new Promise<T>((resolve, reject) => {
    let body = '';
    let rejected = false;
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => {
      body += chunk;
      if (!rejected && body.length > maxBodyLength) {
        rejected = true;
        reject(new Error('Request body too large.'));
      }
    });
    request.on('end', () => {
      if (rejected) {
        return;
      }
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
    ...createCorsHeaders(),
    'Content-Type': 'application/json',
  });
  response.end(JSON.stringify(body));
}

function writeSseHead(response: ServerResponse) {
  response.socket?.setNoDelay(true);
  response.writeHead(200, {
    ...createCorsHeaders(),
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'Content-Type': 'text/event-stream; charset=utf-8',
    'X-Accel-Buffering': 'no',
  });
  response.flushHeaders();
  response.write(': stream-open\n\n');
}

function writeWithBackpressure(response: ServerResponse, chunk: string) {
  if (response.writableEnded || response.destroyed) {
    return Promise.resolve();
  }
  const canContinue = response.write(chunk);
  (response as ServerResponse & { flush?: () => void }).flush?.();
  if (canContinue) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      response.off('drain', onDrain);
      response.off('close', onClose);
      response.off('error', onError);
    };
    const onDrain = () => {
      cleanup();
      resolve();
    };
    const onClose = () => {
      cleanup();
      resolve();
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    response.once('drain', onDrain);
    response.once('close', onClose);
    response.once('error', onError);
  });
}

function createQueuedResponseWriter(response: ServerResponse, format: (body: unknown) => string) {
  let queue = Promise.resolve();
  const write = (body: unknown) => {
    queue = queue.then(() => writeWithBackpressure(response, format(body)));
    queue = queue.catch((error) => {
      if (!response.writableEnded && !response.destroyed) {
        response.destroy(error instanceof Error ? error : new Error(String(error)));
      }
    });
    return queue;
  };
  return {
    flush: () => queue,
    write,
  };
}

function createSseWriter(response: ServerResponse) {
  return createQueuedResponseWriter(response, (body) => `data: ${JSON.stringify(body)}\n\n`);
}

function writeNdjsonHead(response: ServerResponse) {
  response.socket?.setNoDelay(true);
  response.writeHead(200, {
    ...createCorsHeaders(),
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'X-Accel-Buffering': 'no',
  });
  response.flushHeaders();
}

function createNdjsonWriter(response: ServerResponse) {
  return createQueuedResponseWriter(response, (body) => `${JSON.stringify(body)}\n`);
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
      const images = Array.isArray(source.images)
        ? source.images
            .map((image): ChatProviderInputImage | null => {
              if (!image || typeof image !== 'object') {
                return null;
              }
              const input = image as { detail?: unknown; imageUrl?: unknown };
              if (typeof input.imageUrl !== 'string' || !input.imageUrl.trim()) {
                return null;
              }
              const detail =
                input.detail === 'high' || input.detail === 'auto' || input.detail === 'low'
                  ? input.detail
                  : 'low';
              return {
                detail,
                imageUrl: input.imageUrl.trim().slice(0, 8 * 1024 * 1024),
              };
            })
            .filter((image): image is ChatProviderInputImage => Boolean(image))
            .slice(0, 2)
        : undefined;
      return {
        role: source.role,
        content: source.content,
        ...(images?.length ? { images } : {}),
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

function createAiLiveRuntimeRequest(
  request: IncomingMessage,
  headers: AiLiveClientMessage['headers'],
) {
  const mergedHeaders: IncomingMessage['headers'] = { ...request.headers };
  for (const [rawName, rawValue] of Object.entries(headers ?? {})) {
    const name = rawName.toLowerCase();
    if (!AI_LIVE_ALLOWED_HEADERS.has(name) || typeof rawValue !== 'string') {
      continue;
    }
    const value = rawValue.trim();
    if (value) {
      mergedHeaders[name] = value;
    }
  }

  return {
    ...request,
    headers: mergedHeaders,
  } as IncomingMessage;
}

function stripAuthScheme(value: string, scheme: 'bearer' | 'basic') {
  return value.replace(AUTH_SCHEME_PATTERNS[scheme], '').trim();
}

function normalizeRuntimeTtsApiKey(providerName: RemoteTtsProvider, value: string) {
  return providerName === 'inworld'
    ? stripAuthScheme(value, 'basic')
    : stripAuthScheme(value, 'bearer');
}

function getConfiguredModelForProvider(providerName: RuntimeLlmProvider, config: StreamBotConfig) {
  if (providerName === 'openrouter-responses') {
    return process.env.OPENROUTER_MODEL?.trim() || 'openai/gpt-4o-mini';
  }
  return config.aiModel;
}

function getDefaultModelForProvider(providerName: RuntimeLlmProvider) {
  return providerName === 'openrouter-responses' ? 'openai/gpt-4o-mini' : 'gpt-5-nano';
}

function getAllowlistEnvNamesForProvider(providerName: RuntimeLlmProvider) {
  return providerName === 'openrouter-responses'
    ? ['OPENROUTER_MODEL_ALLOWLIST', 'OPENROUTER_SERVER_PROVIDER_PROXY_MODEL_ALLOWLIST']
    : ['OPENAI_MODEL_ALLOWLIST', 'OPENAI_SERVER_PROVIDER_PROXY_MODEL_ALLOWLIST'];
}

function getRuntimeTavilyApiKeyWithAuth(
  baseConfig: StreamBotConfig,
  request: IncomingMessage,
  allowServerProxy: boolean,
) {
  return (
    getHeaderSecret(request, 'x-yourwifey-tavily-provider-key') ||
    (allowServerProxy ? baseConfig.tavilyApiKey : '')
  );
}

function getRuntimeChatProvider(
  baseConfig: StreamBotConfig,
  request: IncomingMessage,
  llmProvider: unknown,
  model?: string,
  allowServerProxy = false,
) {
  const allowServerKeys = baseConfig.providerProxyEnabled && allowServerProxy;
  const providerName = normalizeRuntimeLlmProvider(
    getHeaderValue(request, 'x-yourwifey-llm-provider') || llmProvider,
  );
  const apiKey = getHeaderSecret(request, 'x-yourwifey-llm-provider-key');
  const tavilyApiKey = getRuntimeTavilyApiKeyWithAuth(baseConfig, request, allowServerKeys);
  const serverApiKey =
    providerName === 'openai-responses' ? baseConfig.aiApiKey : getProviderEnvApiKey(providerName);
  const effectiveApiKey = apiKey || (allowServerKeys ? serverApiKey : '');
  if (
    !effectiveApiKey ||
    (!apiKey && providerUsesAppOwnedState(providerName) && !allowServerKeys)
  ) {
    return null;
  }
  const appOwnedState = providerUsesAppOwnedState(providerName);
  const runtimeConfig: StreamBotConfig = {
    ...baseConfig,
    aiApiBaseUrl: getRuntimeProviderBaseUrl(providerName, baseConfig.aiApiBaseUrl),
    aiApiKey: effectiveApiKey,
    aiModel: isPremiumCostModelId(model)
      ? getDefaultModelForProvider(providerName)
      : model?.trim() || baseConfig.aiModel,
    aiProvider: providerName,
    tavilyApiKey,
    openAiStateMode: appOwnedState ? 'stateless' : baseConfig.openAiStateMode,
    openAiStore: appOwnedState ? false : baseConfig.openAiStore,
    openAiPromptCacheKey: baseConfig.openAiPromptCacheKey,
    openAiPromptCacheRetention: baseConfig.openAiPromptCacheRetention,
    openAiWebSocketUrl: appOwnedState ? '' : baseConfig.openAiWebSocketUrl,
    providerProxyEnabled: true,
  };
  if (providerName === 'openai-responses') {
    const now = Date.now();
    pruneRuntimeChatProviderCache(now);
    const cacheKey = buildRuntimeChatProviderCacheKey(runtimeConfig, providerName);
    const cached = runtimeChatProviderCache.get(cacheKey);
    if (cached) {
      cached.lastUsedAt = now;
      return cached.provider;
    }
    const runtimeProvider = createProvider(runtimeConfig, {
      closeWebSocketAfterRequest: false,
      providerName,
    });
    runtimeChatProviderCache.set(cacheKey, {
      key: cacheKey,
      lastUsedAt: now,
      provider: runtimeProvider,
    });
    pruneRuntimeChatProviderCache(now);
    return runtimeProvider;
  }

  const runtimeProvider = createProvider(runtimeConfig, {
    closeWebSocketAfterRequest: true,
    providerName,
  });
  runtimeProvider.setModel?.(runtimeConfig.aiModel);
  return runtimeProvider;
}

function getRuntimeEmbeddingConfig(
  baseConfig: StreamBotConfig,
  request: IncomingMessage,
  llmProvider: unknown,
  allowServerProxy = false,
) {
  const apiKey = getHeaderSecret(request, 'x-yourwifey-llm-provider-key');
  const providerName = normalizeRuntimeLlmProvider(
    getHeaderValue(request, 'x-yourwifey-llm-provider') || llmProvider,
  );
  const serverApiKey =
    providerName === 'openai-responses' ? baseConfig.aiApiKey : getProviderEnvApiKey(providerName);
  if (!apiKey && (!allowServerProxy || !baseConfig.providerProxyEnabled || !serverApiKey)) {
    return null;
  }
  return {
    ...baseConfig,
    aiApiBaseUrl: getRuntimeProviderBaseUrl(providerName, baseConfig.aiApiBaseUrl),
    aiApiKey: apiKey || (allowServerProxy && baseConfig.providerProxyEnabled ? serverApiKey : ''),
    providerProxyEnabled: true,
  };
}

function getRuntimeProviderConfig(
  baseConfig: StreamBotConfig,
  request: IncomingMessage,
  llmProvider: unknown,
  allowServerProxy = false,
) {
  const apiKey = getHeaderSecret(request, 'x-yourwifey-llm-provider-key');
  const providerName = normalizeRuntimeLlmProvider(
    getHeaderValue(request, 'x-yourwifey-llm-provider') || llmProvider,
  );
  if (!apiKey && providerModelsCanBeListedWithoutKey(providerName)) {
    return {
      ...baseConfig,
      aiApiBaseUrl: getRuntimeProviderBaseUrl(providerName, baseConfig.aiApiBaseUrl),
      aiApiKey: '',
      providerProxyEnabled: true,
    };
  }
  if (!apiKey && (!allowServerProxy || !baseConfig.providerProxyEnabled)) {
    return null;
  }

  return {
    ...baseConfig,
    aiApiBaseUrl: getRuntimeProviderBaseUrl(providerName, baseConfig.aiApiBaseUrl),
    aiApiKey:
      apiKey ||
      (allowServerProxy && baseConfig.providerProxyEnabled
        ? providerName === 'openai-responses'
          ? baseConfig.aiApiKey
          : getProviderEnvApiKey(providerName)
        : ''),
    providerProxyEnabled: true,
  };
}

async function listProviderModels(config: StreamBotConfig) {
  const url = `${config.aiApiBaseUrl.replace(/\/+$/, '')}/models`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (config.aiApiKey) {
    headers.Authorization = `Bearer ${config.aiApiKey}`;
  }
  const response = await fetch(url, {
    headers,
    method: 'GET',
  });
  const data = (await response.json().catch(() => ({}))) as ProviderModelsPayload;
  if (!response.ok) {
    throw new Error(
      data.error?.message || `Provider model list failed with HTTP ${response.status}.`,
    );
  }

  return (data.data ?? [])
    .map((model) => (typeof model.id === 'string' ? model.id.trim() : ''))
    .filter((model) => model && !isPremiumCostModelId(model));
}

function getRuntimeTtsConfig(
  baseConfig: StreamBotConfig,
  providerName: RemoteTtsProvider,
  request: IncomingMessage,
  allowServerProxy = false,
) {
  const apiKey = normalizeRuntimeTtsApiKey(
    providerName,
    getHeaderSecret(request, 'x-yourwifey-tts-provider-key'),
  );
  if (!apiKey) {
    return allowServerProxy && baseConfig.providerProxyEnabled ? baseConfig : null;
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

function normalizeBridgeNumber(value: unknown, min: number, max: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.max(min, Math.min(max, Math.round(value)));
}

function normalizeBridgeChunkingStrategy(value: unknown) {
  return value === 'python-safe' || value === 'eager' || value === 'app' ? value : undefined;
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
    minBufferChars: normalizeBridgeNumber(source.minBufferChars, 1, 500),
    maxBufferChars: normalizeBridgeNumber(source.maxBufferChars, 16, 1000),
    softBufferChars: normalizeBridgeNumber(source.softBufferChars, 8, 1000),
    chunkingStrategy: normalizeBridgeChunkingStrategy(source.chunkingStrategy),
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

const LIVE_BRIDGE_ABBREVIATIONS = new Set([
  'dr.',
  'mr.',
  'mrs.',
  'ms.',
  'prof.',
  'sr.',
  'jr.',
  'vs.',
  'etc.',
]);

function getLastWordFragment(text: string) {
  return (text.match(/[A-Za-z]+\\.$/)?.[0] ?? '').toLowerCase();
}

function isDecimalPoint(text: string, index: number) {
  return /\\d/.test(text[index - 1] ?? '') && /\\d/.test(text[index + 1] ?? '');
}

function findSentenceBoundary(text: string) {
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (!char || !'.?!'.includes(char)) {
      continue;
    }
    if (
      char === '.' &&
      (isDecimalPoint(text, index) ||
        LIVE_BRIDGE_ABBREVIATIONS.has(getLastWordFragment(text.slice(0, index + 1))))
    ) {
      continue;
    }
    const next = text[index + 1] ?? '';
    if (!next || (!/\\s/.test(next) && !`"')]} `.includes(next))) {
      continue;
    }
    return index + 1;
  }
  return -1;
}

function findSoftBoundary(text: string, softLength: number, maxLength: number) {
  if (text.length < maxLength) {
    return -1;
  }
  const region = text.slice(0, maxLength);
  for (const delimiter of [', ', '; ', ': ', ' - ', ' ']) {
    const index = region.lastIndexOf(delimiter);
    if (index >= softLength) {
      return index + delimiter.length;
    }
  }
  return maxLength;
}

function createLiveSpeechTextBridge(
  options: Omit<RemoteTtsRequest, 'provider' | 'text'> | null = null,
) {
  const queue = createAsyncTextQueue();
  const filter = createMetadataSpeechFilter();
  let pending = '';
  const strategy = options?.chunkingStrategy ?? 'app';
  const minLength = options?.minBufferChars ?? (strategy === 'python-safe' ? 160 : 28);
  const maxLength = options?.maxBufferChars ?? (strategy === 'python-safe' ? 240 : 180);
  const softLength = options?.softBufferChars ?? (strategy === 'python-safe' ? 160 : minLength);

  const flush = (force = false) => {
    while (pending.trim()) {
      if (!force && pending.length < minLength) {
        return;
      }
      let splitAt = -1;
      if (strategy === 'python-safe') {
        splitAt = findSentenceBoundary(pending);
        if (splitAt < minLength) {
          splitAt = findSoftBoundary(pending, softLength, maxLength);
        }
      } else {
        const windowText = pending.slice(0, maxLength);
        const matches = Array.from(windowText.matchAll(/[.!?]["')\]]?\s+|[,;:]\s+|\n+/g));
        const boundary = [...matches].reverse().find((match) => (match.index ?? 0) >= minLength);
        splitAt = boundary ? (boundary.index ?? 0) + boundary[0].length : -1;
        if (splitAt === -1 && pending.length >= maxLength) {
          splitAt = Math.max(windowText.lastIndexOf(' '), minLength);
        }
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

async function runAiChatRequest({
  allowServerProviderProxy,
  body,
  request,
  streamEvent,
}: {
  allowServerProviderProxy: boolean;
  body: AiChatRequestBody;
  request: IncomingMessage;
  streamEvent?: (event: AiChatStreamEvent) => void | Promise<void>;
}) {
  const messages = normalizeProviderMessages(body.messages);
  if (messages.length === 0) {
    throw new Error('messages[] is required.');
  }

  const targetStateKey = normalizeStateKey(
    body.stateKey,
    `twitch:${config.twitchChannel}:persona:riko`,
  );
  const providerName = normalizeRuntimeLlmProvider(body.llmProvider);
  const appOwnedState = providerUsesAppOwnedState(providerName);
  const requestedModel = typeof body.model === 'string' ? body.model : '';
  const modelDecision = resolveServerProviderProxyModel({
    allowlistEnvNames: getAllowlistEnvNamesForProvider(providerName),
    browserProviderKeyPresent: Boolean(getHeaderSecret(request, 'x-yourwifey-llm-provider-key')),
    configuredModel: getConfiguredModelForProvider(providerName, config),
    defaultModel: getDefaultModelForProvider(providerName),
    requestedModel,
  });
  if (!modelDecision.allowed) {
    throw new Error(modelDecision.error);
  }

  const runtimeProvider = getRuntimeChatProvider(
    config,
    request,
    body.llmProvider,
    modelDecision.model,
    allowServerProviderProxy,
  );
  if (!runtimeProvider) {
    throw new Error('AI provider key is not configured.');
  }
  runtimeProvider.setModel?.(modelDecision.model);

  const providerRequest: ChatProviderRequest = {
    mode: body.mode === 'batch' ? 'batch' : 'direct',
    activeChatters: Number.isFinite(body.activeChatters) ? Number(body.activeChatters) : 1,
    disableState: body.disableState === true,
    messages,
    sourceMessages: [],
    maxTokens: body.maxTokens,
    responseFormat: normalizeResponseFormat(body.responseFormat),
    stateKey: targetStateKey,
    stateScope: normalizeStateScope(body.stateScope),
    temperature: body.temperature,
    transportMode: appOwnedState ? 'http-stream' : normalizeAiTransportMode(body.transportMode),
    openAiStateMode: appOwnedState ? 'stateless' : normalizeOpenAiStateMode(body.openAiStateMode),
  };

  if (body.stream === true && streamEvent) {
    const visibleDeltaFilter = createAiVisibleDeltaFilter(providerRequest.responseFormat);
    let visibleTextLength = 0;
    const bridgeRequest = normalizeLiveTtsBridge(body.ttsBridge);
    const bridgeConfig = bridgeRequest
      ? getRuntimeTtsConfig(config, 'fish-speech', request, allowServerProviderProxy)
      : null;
    if (bridgeRequest && !bridgeConfig) {
      await streamEvent({
        type: 'tts-error',
        ok: false,
        error: 'Fish Speech live bridge provider key is not configured.',
      });
    }
    const bridge = bridgeRequest && bridgeConfig ? createLiveSpeechTextBridge(bridgeRequest) : null;
    const bridgeDone = bridge
      ? streamFishSpeechTextStream(bridgeConfig!, bridgeRequest!, bridge.stream, {
          onAudioChunk: (chunk) => {
            void streamEvent({
              type: 'audio',
              audio: chunk.audio.toString('base64'),
              mimeType: chunk.mimeType,
              sampleRate: chunk.sampleRate,
            });
          },
        }).catch((error) => {
          void streamEvent({
            type: 'tts-error',
            ok: false,
            error: error instanceof Error ? error.message : 'Live TTS bridge failed.',
          });
        })
      : null;

    try {
      const providerResponse =
        (await runtimeProvider.completeStream?.(providerRequest, {
          onTextDelta: (delta) => {
            const visibleDelta = visibleDeltaFilter.push(delta);
            if (!visibleDelta) {
              return;
            }
            visibleTextLength += visibleDelta.length;
            void streamEvent({ type: 'delta', delta: visibleDelta });
            bridge?.push(visibleDelta);
          },
        })) ?? (await runtimeProvider.complete(providerRequest));
      const finalVisibleDelta = visibleDeltaFilter.flush();
      if (finalVisibleDelta) {
        visibleTextLength += finalVisibleDelta.length;
        void streamEvent({ type: 'delta', delta: finalVisibleDelta });
        bridge?.push(finalVisibleDelta);
      }
      const finalProviderText = getSafeFinalVisibleText(
        providerResponse.text,
        providerRequest.responseFormat,
      );
      if (bridge && visibleTextLength === 0 && finalProviderText) {
        visibleTextLength += finalProviderText.length;
        await streamEvent({ type: 'delta', delta: finalProviderText });
        bridge.push(finalProviderText);
      }
      bridge?.close();
      if (bridgeDone) {
        const bridgeFinished = await waitForLiveTtsBridge(bridgeDone, () => {
          bridge?.fail(new Error('Live TTS bridge finalization timed out.'));
        });
        if (!bridgeFinished) {
          await streamEvent({
            type: 'tts-error',
            ok: false,
            error: 'Live TTS bridge finalization timed out.',
          });
        }
      }
      return {
        meta: providerResponse.meta ?? runtimeProvider.getState?.() ?? null,
        text: providerResponse.text,
      };
    } catch (error) {
      bridge?.fail(error instanceof Error ? error : new Error(String(error)));
      if (bridgeDone) {
        await waitForLiveTtsBridge(bridgeDone, () => {});
      }
      throw error;
    }
  }

  const providerResponse = await runtimeProvider.complete(providerRequest);
  return {
    meta: providerResponse.meta ?? runtimeProvider.getState?.() ?? null,
    text: providerResponse.text,
  };
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

function getRuntimeApiPath(pathname: string) {
  return pathname.startsWith('/api/ai/') ||
    pathname.startsWith('/api/tts/') ||
    pathname.startsWith('/api/twitch/') ||
    pathname.startsWith('/api/memory/') ||
    pathname.startsWith('/api/mock/') ||
    pathname === '/api/health'
    ? pathname.slice('/api'.length)
    : pathname;
}

function normalizeMemoryScopeKey(value: unknown) {
  return typeof value === 'string' && value.trim()
    ? value.trim().replace(/[^a-z0-9:_-]+/gi, '-').slice(0, 180) || 'default'
    : 'default';
}

const config = loadConfig();
const provider = createProvider(config);
const serverTwitchMode = config.twitchMock ? 'client-direct' : 'server-irc';

let mockSource: MockTwitchChatSource | null = null;
let chatSource: TwitchChatSource;
let commandRouter: CommandRouter;

const httpServer = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);

  if (request.method === 'OPTIONS') {
    writeCorsPreflight(request, response);
    return;
  }

  const runtimePath = getRuntimeApiPath(url.pathname);
  const allowServerProviderProxy = config.providerProxyEnabled;

  if (request.method === 'GET' && runtimePath === '/health') {
    const requestedStateKey = url.searchParams.get('stateKey') ?? undefined;
    const requestedModel = url.searchParams.get('model') ?? undefined;
    const providerName = normalizeRuntimeLlmProvider(
      getHeaderValue(request, 'x-yourwifey-llm-provider') || config.aiProvider,
    );
    const appOwnedState = providerUsesAppOwnedState(providerName);
    const requestedTransportMode = appOwnedState
      ? 'http-stream'
      : normalizeAiTransportMode(url.searchParams.get('transportMode'));
    const requestedOpenAiStateMode = appOwnedState
      ? 'stateless'
      : normalizeOpenAiStateMode(url.searchParams.get('openAiStateMode'));

    const healthStateKey = resolveRuntimeHealthStateKey({
      browserProviderKeyPresent: Boolean(getHeaderSecret(request, 'x-yourwifey-llm-provider-key')),
      requestedStateKey,
    });

    const runtimeHealthProvider = getRuntimeChatProvider(
      config,
      request,
      providerName,
      requestedModel ?? undefined,
      allowServerProviderProxy,
    );
    const providerState =
      runtimeHealthProvider?.getState?.(healthStateKey, {
        openAiStateMode: requestedOpenAiStateMode,
        transportMode: requestedTransportMode,
      }) ?? null;
    const runtimeTavilyApiKey = getRuntimeTavilyApiKeyWithAuth(
      config,
      request,
      allowServerProviderProxy,
    );
    const healthProviderState =
      providerState && runtimeTavilyApiKey
        ? {
            ...providerState,
            toolNames: TAVILY_OPENAI_TOOLS.map((tool) => tool.name),
            toolsAvailable: true,
            toolsSource: getHeaderSecret(request, 'x-yourwifey-tavily-provider-key')
              ? 'browser-vault'
              : 'server-env',
          }
        : providerState;
    writeJson(response, 200, {
      ok: true,
      twitchMode: serverTwitchMode,
      serverTwitchSource: config.twitchMock ? 'local-control' : 'irc',
      channel: chatSource.channel,
      overlayClients: overlaySocket.clientCount,
      aiProvider: runtimeHealthProvider
        ? (getHeaderValue(request, 'x-yourwifey-llm-provider') ?? config.aiProvider)
        : 'disabled',
      serverProviderProxyEnabled: config.providerProxyEnabled,
      model: runtimeHealthProvider ? (runtimeHealthProvider.getModel?.() ?? config.aiModel) : null,
      providerState: healthProviderState,
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
    });
    return;
  }

  if (request.method === 'GET' && runtimePath === '/memory/status') {
    try {
      writeJson(response, 200, {
        ok: true,
        ...(await getLadybugMemoryService().getStatus()),
      });
    } catch (error) {
      writeJson(response, 200, {
        ok: false,
        backend: 'ladybug',
        error: error instanceof Error ? error.message : 'Ladybug memory status failed.',
      });
    }
    return;
  }

  if (request.method === 'GET' && runtimePath === '/memory/graph') {
    try {
      writeJson(response, 200, {
        ok: true,
        backend: 'ladybug',
        graph: await getLadybugMemoryService().getGraphSummary(),
      });
    } catch (error) {
      writeJson(response, 200, {
        ok: false,
        backend: 'ladybug',
        error: error instanceof Error ? error.message : 'Ladybug memory graph load failed.',
      });
    }
    return;
  }

  if (request.method === 'GET' && runtimePath === '/memory/grillo') {
    try {
      const scopeKey = normalizeMemoryScopeKey(url.searchParams.get('scopeKey'));
      writeJson(response, 200, {
        ok: true,
        backend: 'ladybug',
        scopeKey,
        state: await getLadybugMemoryService().loadGrilloState(scopeKey),
      });
    } catch (error) {
      writeJson(response, 200, {
        ok: false,
        backend: 'ladybug',
        error: error instanceof Error ? error.message : 'Ladybug Grillo memory load failed.',
      });
    }
    return;
  }

  if (request.method === 'PUT' && runtimePath === '/memory/grillo') {
    try {
      const body = await readRequestJson<MemoryGrilloBody>(request, 8 * 1024 * 1024);
      const scopeKey = normalizeMemoryScopeKey(body.scopeKey);
      await getLadybugMemoryService().saveGrilloState(scopeKey, body.state);
      writeJson(response, 200, {
        ok: true,
        backend: 'ladybug',
        scopeKey,
      });
    } catch (error) {
      writeJson(response, 200, {
        ok: false,
        backend: 'ladybug',
        error: error instanceof Error ? error.message : 'Ladybug Grillo memory save failed.',
      });
    }
    return;
  }

  if (request.method === 'DELETE' && runtimePath === '/memory/grillo') {
    try {
      const scopeKey = normalizeMemoryScopeKey(url.searchParams.get('scopeKey'));
      await getLadybugMemoryService().deleteGrilloState(scopeKey);
      writeJson(response, 200, {
        ok: true,
        backend: 'ladybug',
        scopeKey,
      });
    } catch (error) {
      writeJson(response, 200, {
        ok: false,
        backend: 'ladybug',
        error: error instanceof Error ? error.message : 'Ladybug Grillo memory delete failed.',
      });
    }
    return;
  }

  if (request.method === 'GET' && runtimePath === '/memory/semantic') {
    try {
      const scopeKey = normalizeMemoryScopeKey(url.searchParams.get('scopeKey'));
      writeJson(response, 200, {
        ok: true,
        backend: 'ladybug',
        records: await getLadybugMemoryService().loadSemanticRecords(scopeKey),
        scopeKey,
      });
    } catch (error) {
      writeJson(response, 200, {
        ok: false,
        backend: 'ladybug',
        error: error instanceof Error ? error.message : 'Ladybug semantic memory load failed.',
      });
    }
    return;
  }

  if (request.method === 'PUT' && runtimePath === '/memory/semantic') {
    try {
      const body = await readRequestJson<MemorySemanticBody>(request, 8 * 1024 * 1024);
      const scopeKey = normalizeMemoryScopeKey(body.scopeKey);
      const records = Array.isArray(body.records) ? body.records : [];
      await getLadybugMemoryService().saveSemanticRecords(scopeKey, records);
      writeJson(response, 200, {
        ok: true,
        backend: 'ladybug',
        scopeKey,
      });
    } catch (error) {
      writeJson(response, 200, {
        ok: false,
        backend: 'ladybug',
        error: error instanceof Error ? error.message : 'Ladybug semantic memory save failed.',
      });
    }
    return;
  }

  if (request.method === 'GET' && runtimePath === '/tts/voices') {
    const providerName = normalizeRemoteTtsProvider(url.searchParams.get('provider'));
    const ttsConfig = getRuntimeTtsConfig(config, providerName, request, allowServerProviderProxy);
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

  if (request.method === 'POST' && runtimePath === '/tts/voices/create') {
    try {
      const body = await readRequestJson<CreateRemoteTtsVoiceRequest>(request, 28 * 1024 * 1024);
      const providerName = normalizeRemoteTtsProvider(body.provider);
      const ttsConfig = getRuntimeTtsConfig(config, providerName, request, allowServerProviderProxy);
      if (!ttsConfig) {
        writeJson(response, 200, {
          ok: false,
          error: 'Remote TTS provider key is not configured.',
        });
        return;
      }
      const voice = await createRemoteTtsVoice(ttsConfig, { ...body, provider: providerName });
      writeJson(response, 200, {
        ok: true,
        provider: providerName,
        voice,
      });
    } catch (error) {
      writeJson(response, 200, {
        ok: false,
        error: error instanceof Error ? error.message : 'Remote TTS voice creation failed.',
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
      const ttsConfig = getRuntimeTtsConfig(
        config,
        providerName,
        request,
        allowServerProviderProxy,
      );
      if (!ttsConfig) {
        writeJson(response, 200, {
          ok: false,
          error: 'Remote TTS provider key is not configured.',
        });
        return;
      }

      writeNdjsonHead(response);
      const ndjson = createNdjsonWriter(response);
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
            void ndjson.write({
              type: 'audio',
              audio: chunk.audio.toString('base64'),
              mimeType: chunk.mimeType,
              sampleRate: chunk.sampleRate,
            });
          },
        },
      );
      await ndjson.flush();
      await ndjson.write({ type: 'done', ok: true });
      response.end();
    } catch (error) {
      if (response.headersSent) {
        const ndjson = createNdjsonWriter(response);
        await ndjson.write({
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
      const embeddingConfig = getRuntimeEmbeddingConfig(
        config,
        request,
        body.llmProvider,
        allowServerProviderProxy,
      );
      if (!embeddingConfig?.aiApiKey) {
        writeJson(response, 200, { ok: false, error: 'AI provider key is not configured.' });
        return;
      }

      const input = normalizeEmbeddingInput(body.input);
      if (!input) {
        writeJson(response, 200, { ok: false, error: 'input is required.' });
        return;
      }

      const model = normalizeEmbeddingModel(
        body.model,
        getProviderEmbeddingModel(
          normalizeRuntimeLlmProvider(body.llmProvider),
          process.env['OPENAI_EMBEDDING_MODEL'] || 'text-embedding-3-small',
        ),
      );
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

  if (request.method === 'POST' && runtimePath === '/twitch/transcribe-sample') {
    try {
      const body = await readRequestJson<{
        channel?: unknown;
        model?: unknown;
        sampleSeconds?: unknown;
      }>(request);
      const model = normalizeOpenAiTranscriptionModel(body.model);
      const sampleSeconds =
        typeof body.sampleSeconds === 'number' && Number.isFinite(body.sampleSeconds)
          ? body.sampleSeconds
          : 15;
      const providerConfig = getRuntimeProviderConfig(
        config,
        request,
        'openai-responses',
        allowServerProviderProxy,
      );
      if (!providerConfig?.aiApiKey) {
        writeJson(response, 200, {
          ok: false,
          error: 'OpenAI provider key is not configured.',
        });
        return;
      }
      const transcript = await transcribeTwitchStreamSample({
        apiBaseUrl: providerConfig.aiApiBaseUrl,
        apiKey: providerConfig.aiApiKey,
        channel: typeof body.channel === 'string' ? body.channel : chatSource.channel,
        model,
        sampleSeconds,
      });
      writeJson(response, 200, {
        ok: true,
        transcript,
      });
    } catch (error) {
      writeJson(response, 200, {
        ok: false,
        error: error instanceof Error ? error.message : 'Twitch stream transcription failed.',
      });
    }
    return;
  }

  if (request.method === 'POST' && runtimePath === '/twitch/capture-frame') {
    try {
      const body = await readRequestJson<{
        channel?: unknown;
      }>(request);
      const frame = await captureTwitchStreamFrame(
        typeof body.channel === 'string' ? body.channel : chatSource.channel,
      );
      writeJson(response, 200, {
        frame,
        ok: true,
      });
    } catch (error) {
      writeJson(response, 200, {
        ok: false,
        error: error instanceof Error ? error.message : 'Twitch stream frame capture failed.',
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

  if (request.method === 'GET' && runtimePath === '/ai/models') {
    try {
      const providerName = normalizeRuntimeLlmProvider(url.searchParams.get('provider'));
      const modelConfig = getRuntimeProviderConfig(
        config,
        request,
        providerName,
        allowServerProviderProxy,
      );
      const canUsePublicModels = providerModelsCanBeListedWithoutKey(providerName);
      if (!modelConfig?.aiApiKey && !canUsePublicModels) {
        writeJson(response, 200, { ok: false, error: 'AI provider key is not configured.' });
        return;
      }

      const models = await listProviderModels(
        modelConfig ??
          ({
            ...config,
            aiApiBaseUrl: getRuntimeProviderBaseUrl(providerName, config.aiApiBaseUrl),
            aiApiKey: '',
            providerProxyEnabled: true,
          } as StreamBotConfig),
      );
      writeJson(response, 200, {
        ok: true,
        models,
        provider: providerName,
      });
    } catch (error) {
      writeJson(response, 200, {
        ok: false,
        error: error instanceof Error ? error.message : 'Provider model list failed.',
        models: [],
      });
    }
    return;
  }

  if (request.method === 'POST' && runtimePath === '/ai/chat') {
    try {
      const body = await readRequestJson<AiChatRequestBody>(request);

      if (body.stream === true) {
        writeSseHead(response);
        const sse = createSseWriter(response);
        let sseOpen = true;
        const providerResponse = await runAiChatRequest({
          allowServerProviderProxy,
          body,
          request,
          streamEvent: (event) => {
            if (!sseOpen || response.writableEnded) {
              return;
            }
            void sse.write(event);
          },
        });

        sseOpen = false;
        await sse.flush();
        await sse.write({
          type: 'done',
          ok: true,
          text: providerResponse.text,
          meta: providerResponse.meta ?? null,
        });
        response.end();
        return;
      }

      const providerResponse = await runAiChatRequest({
        allowServerProviderProxy,
        body,
        request,
      });

      writeJson(response, 200, {
        ok: true,
        text: providerResponse.text,
        meta: providerResponse.meta ?? null,
      });
    } catch (error) {
      if (response.headersSent) {
        const sse = createSseWriter(response);
        await sse.write({
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

function rawDataToUtf8(raw: RawData) {
  if (Array.isArray(raw)) {
    return Buffer.concat(raw).toString('utf8');
  }
  if (raw instanceof ArrayBuffer) {
    return Buffer.from(raw).toString('utf8');
  }
  return raw.toString('utf8');
}

function sendAiLiveEvent(socket: WebSocket, event: AiLiveServerEvent) {
  if (socket.readyState !== WebSocket.OPEN) {
    return false;
  }
  if (socket.bufferedAmount > AI_LIVE_MAX_BUFFERED_BYTES) {
    socket.close(1013, 'AI live socket backpressure limit exceeded.');
    return false;
  }
  socket.send(JSON.stringify(event), (error) => {
    if (error && socket.readyState === WebSocket.OPEN) {
      socket.close(1011, 'AI live socket send failed.');
    }
  });
  return true;
}

async function handleAiLiveMessage(socket: WebSocket, request: IncomingMessage, raw: RawData) {
  let message: AiLiveClientMessage;
  try {
    message = JSON.parse(rawDataToUtf8(raw)) as AiLiveClientMessage;
  } catch {
    sendAiLiveEvent(socket, {
      type: 'error',
      ok: false,
      requestId: 'unknown',
      error: 'Invalid AI live websocket JSON.',
    });
    return;
  }

  const requestId =
    typeof message.requestId === 'string' && message.requestId.trim()
      ? message.requestId.trim().slice(0, 120)
      : `live-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  if (message.type === 'ping') {
    sendAiLiveEvent(socket, { type: 'done', ok: true, requestId, text: '', meta: null });
    return;
  }

  if (message.type !== 'chat.create' || !message.body || typeof message.body !== 'object') {
    sendAiLiveEvent(socket, {
      type: 'error',
      ok: false,
      requestId,
      error: 'Expected chat.create with a body.',
    });
    return;
  }

  try {
    const runtimeRequest = createAiLiveRuntimeRequest(request, message.headers);
    const providerResponse = await runAiChatRequest({
      allowServerProviderProxy: config.providerProxyEnabled,
      body: { ...message.body, stream: true },
      request: runtimeRequest,
      streamEvent: async (event) => {
        sendAiLiveEvent(socket, { ...event, requestId });
      },
    });
    sendAiLiveEvent(socket, {
      type: 'done',
      ok: true,
      requestId,
      text: providerResponse.text,
      meta: providerResponse.meta ?? null,
    });
  } catch (error) {
    sendAiLiveEvent(socket, {
      type: 'error',
      ok: false,
      requestId,
      error: error instanceof Error ? error.message : 'AI live websocket request failed.',
    });
  }
}

const aiLiveSocket = new WebSocketServer({
  noServer: true,
  perMessageDeflate: false,
});

httpServer.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);
  if (getRuntimeApiPath(url.pathname) !== AI_LIVE_SOCKET_PATH) {
    return;
  }
  aiLiveSocket.handleUpgrade(request, socket, head, (webSocket) => {
    aiLiveSocket.emit('connection', webSocket, request);
  });
});

aiLiveSocket.on('connection', (socket, request) => {
  let queue = Promise.resolve();
  const onMessage = (raw: RawData) => {
    queue = queue.then(
      () => handleAiLiveMessage(socket, request, raw),
      () => handleAiLiveMessage(socket, request, raw),
    );
    void queue.catch(() => {});
  };
  const cleanup = () => {
    socket.off('message', onMessage);
    socket.off('close', cleanup);
    socket.off('error', cleanup);
  };

  socket.on('message', onMessage);
  socket.once('close', cleanup);
  socket.once('error', cleanup);
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
let shuttingDown = false;

export async function shutdownStreamBot() {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  clearInterval(batchTimer);
  disposeRuntimeChatProviderCache();
  disposeChatProvider(provider);
  await closeLadybugMemoryService();
  chatSource.stop();
  aiLiveSocket.close();
  overlaySocket.close();
  await new Promise<void>((resolve) => {
    if (!httpServer.listening) {
      resolve();
      return;
    }
    httpServer.close(() => resolve());
  });
}

function shutdownAndExit() {
  void shutdownStreamBot().finally(() => process.exit(0));
}

process.once('SIGINT', shutdownAndExit);
process.once('SIGTERM', shutdownAndExit);

httpServer.listen(config.botPort, () => {
  console.log(`Web Waifu 4 stream bot listening on http://127.0.0.1:${config.botPort}`);
  console.log(`AI Live WebSocket path: ws://127.0.0.1:${config.botPort}${AI_LIVE_SOCKET_PATH}`);
  console.log(`Overlay WebSocket path: ws://127.0.0.1:${config.botPort}/ws`);
  console.log(`Twitch chat mode: ${serverTwitchMode} (#${chatSource.channel})`);
  chatSource.start();
});
