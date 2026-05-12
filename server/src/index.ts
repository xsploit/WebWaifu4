import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { MockChatProvider } from './ai/MockChatProvider.js';
import { OpenAiCompatibleProvider } from './ai/OpenAiCompatibleProvider.js';
import { OpenAiResponsesProvider } from './ai/OpenAiResponsesProvider.js';
import type { ChatProvider, ChatProviderMessage, ChatProviderRequest } from './ai/ChatProvider.js';
import { normalizePomlRenderVariables, renderYourWifeyPomlMessages } from './ai/PomlRenderer.js';
import { loadConfig, type StreamBotConfig } from './config.js';
import { CommandRouter } from './commands/CommandRouter.js';
import { MockTwitchChatSource, type MockChatInjection } from './mock/MockTwitchChatSource.js';
import { OverlaySocket, type OverlayClientEvent } from './overlay/OverlaySocket.js';
import { ChatScheduler } from './scheduler/ChatScheduler.js';
import {
  listRemoteTtsVoices,
  streamRemoteTts,
  type RemoteTtsProvider,
} from './tts/RemoteTtsProvider.js';
import type { TwitchChatSource, TwitchChatSourceHandlers } from './twitch/TwitchChatSource.js';
import { TwitchIrcSource } from './twitch/TwitchIrcSource.js';

type OpenAiEmbeddingPayload = {
  data?: Array<{
    embedding?: number[];
  }>;
};

function createProvider(config: StreamBotConfig): ChatProvider {
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
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  });
  response.end(JSON.stringify(body));
}

function writeSseHead(response: ServerResponse) {
  response.socket?.setNoDelay(true);
  response.writeHead(200, {
    'Access-Control-Allow-Headers': 'content-type',
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
    'Access-Control-Allow-Headers': 'content-type',
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

  const source = value as { type?: unknown };
  return source.type === 'json_object' ? { type: 'json_object' } : undefined;
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

function normalizeTtsLatency(value: unknown) {
  return value === 'balanced' || value === 'normal' ? value : undefined;
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

const config = loadConfig();
const provider = createProvider(config);

let mockSource: MockTwitchChatSource | null = null;
let chatSource: TwitchChatSource;
let commandRouter: CommandRouter;

const httpServer = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);

  if (request.method === 'OPTIONS') {
    writeJson(response, 204, {});
    return;
  }

  if (request.method === 'GET' && url.pathname === '/health') {
    writeJson(response, 200, {
      ok: true,
      twitchMode: config.twitchMock ? 'mock' : 'irc',
      channel: chatSource.channel,
      overlayClients: overlaySocket.clientCount,
      aiProvider: config.aiProvider,
      model: provider.getModel?.() ?? config.aiModel,
      providerState: provider.getState?.() ?? null,
      ttsProviders: {
        fishSpeech: {
          configured: Boolean(config.fishSpeechApiKey),
          defaultVoice: Boolean(config.fishSpeechVoiceId),
          model: config.fishSpeechModel,
          latency: config.fishSpeechLatency,
          conditionOnPreviousChunks: config.fishSpeechConditionOnPreviousChunks,
        },
        inworld: {
          configured: Boolean(config.inworldApiKey),
          defaultVoice: Boolean(config.inworldVoiceId),
          model: config.inworldModelId,
          deliveryMode: config.inworldDeliveryMode,
        },
      },
    });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/tts/voices') {
    try {
      const providerName = normalizeRemoteTtsProvider(url.searchParams.get('provider'));
      const voices = await listRemoteTtsVoices(config, providerName);
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

  if (request.method === 'POST' && url.pathname === '/tts/stream') {
    try {
      const body = await readRequestJson<{
        provider?: unknown;
        text?: unknown;
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

      writeNdjsonHead(response);
      await streamRemoteTts(
        config,
        {
          provider: normalizeRemoteTtsProvider(body.provider),
          text,
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

  if (request.method === 'POST' && url.pathname === '/ai/embeddings') {
    try {
      if (!config.aiApiKey) {
        writeJson(response, 200, { ok: false, error: 'OPENAI_API_KEY is not configured.' });
        return;
      }

      const body = await readRequestJson<{ input?: unknown; model?: unknown }>(request);
      const input = normalizeEmbeddingInput(body.input);
      if (!input) {
        writeJson(response, 200, { ok: false, error: 'input is required.' });
        return;
      }

      const model =
        typeof body.model === 'string' && body.model.trim()
          ? body.model.trim()
          : process.env['OPENAI_EMBEDDING_MODEL'] || 'text-embedding-3-small';
      const embedding = await createOpenAiEmbedding(config, input, model);
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

  if (request.method === 'POST' && url.pathname === '/ai/poml/render') {
    try {
      const body = await readRequestJson<{ variables?: unknown }>(request);
      const messages = await renderYourWifeyPomlMessages(
        normalizePomlRenderVariables(body.variables),
      );
      writeJson(response, 200, {
        messages,
        ok: true,
      });
    } catch (error) {
      writeJson(response, 200, {
        ok: false,
        error: error instanceof Error ? error.message : 'POML render failed.',
      });
    }
    return;
  }

  if (request.method === 'POST' && url.pathname === '/ai/chat') {
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
      }>(request);
      const messages = normalizeProviderMessages(body.messages);
      if (messages.length === 0) {
        writeJson(response, 200, { ok: false, error: 'messages[] is required.' });
        return;
      }

      if (typeof body.model === 'string' && body.model.trim()) {
        provider.setModel?.(body.model);
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
      };

      if (body.stream === true) {
        writeSseHead(response);
        const providerResponse =
          (await provider.completeStream?.(providerRequest, {
            onTextDelta: (delta) => {
              writeSseEvent(response, { type: 'delta', delta });
            },
          })) ?? (await provider.complete(providerRequest));

        writeSseEvent(response, {
          type: 'done',
          ok: true,
          text: providerResponse.text,
          meta: providerResponse.meta ?? provider.getState?.() ?? null,
        });
        response.end();
        return;
      }

      const providerResponse = await provider.complete(providerRequest);

      writeJson(response, 200, {
        ok: true,
        text: providerResponse.text,
        meta: providerResponse.meta ?? provider.getState?.() ?? null,
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

  if (request.method === 'POST' && url.pathname === '/mock/chat') {
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

  if (request.method === 'GET' && url.pathname === '/overlay') {
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
    twitchMode: config.twitchMock ? 'mock' : 'irc',
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
  console.log(`Twitch chat mode: ${config.twitchMock ? 'mock' : 'irc'} (#${chatSource.channel})`);
  chatSource.start();
});
