import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { WebSocket, type RawData } from 'ws';
import { loadConfig, type StreamBotConfig } from '../server/src/config.js';
import {
  OpenAiResponsesProvider,
  type OpenAiReasoningEffort,
} from '../server/src/ai/OpenAiResponsesProvider.js';
import {
  streamFishSpeechTextStream,
  type FishSpeechLatency,
  type RemoteTextStream,
  type RemoteTtsRequest,
} from '../server/src/tts/RemoteTtsProvider.js';

type Mode =
  | 'fish'
  | 'llm-http'
  | 'llm-ws'
  | 'pipeline-http'
  | 'pipeline-ws'
  | 'direct-http'
  | 'direct-ws'
  | 'route-http'
  | 'route-ws'
  | 'all';

type BenchOptions = {
  backupPath: string;
  conditionOnPreviousChunks: boolean;
  fishChunkLength: number;
  fishLatency: FishSpeechLatency;
  fishModel: string;
  fishVoiceId: string;
  format: StreamBotConfig['fishSpeechFormat'];
  hardTimeoutMs: number;
  json: boolean;
  llmMaxOutputTokens: number;
  llmModel: string;
  mode: Mode;
  openAiReasoningEffort: OpenAiReasoningEffort;
  openAiWarmup: boolean;
  fishWarmup: boolean;
  progress: boolean;
  prompt: string;
  repeat: number;
  routeBridgeChunkingStrategy: 'app' | 'python-safe' | 'eager';
  routeBridgeMaxChars: number;
  routeBridgeMinChars: number;
  routeBridgeSoftChars: number;
  routeServerUrl: string;
  routeStateKey: string;
  routeStateMode: 'conversation' | 'previous-response' | 'stateless';
  textChunkChars: number;
  textChunkDelayMs: number;
};

type ResultRow = {
  audioBytes?: number;
  audioChunks?: number;
  deltaChars?: number;
  deltaCount?: number;
  error?: string;
  firstAudioMs?: number | null;
  firstDeltaMs?: number | null;
  firstTextToAudioMs?: number | null;
  lastAudioMs?: number | null;
  mode: Exclude<Mode, 'all'>;
  run: number;
  textChunks?: number;
  totalMs: number;
};

const DEFAULT_PROMPT =
  'Reply in one energetic sentence for a VTuber stream. Say that this is a latency benchmark and keep it natural.';

function readArg(name: string) {
  const prefix = `${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) {
    return inline.slice(prefix.length);
  }
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? '') : '';
}

function parseBoolean(value: string, fallback: boolean) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }
  throw new Error(`Invalid boolean value: ${value}`);
}

function parseNumber(value: string, fallback: number, min: number, max: number) {
  if (!value.trim()) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid number value: ${value}`);
  }
  return Math.min(max, Math.max(min, parsed));
}

function parseMode(value: string): Mode {
  if (
    value === 'fish' ||
    value === 'llm-http' ||
    value === 'llm-ws' ||
    value === 'pipeline-http' ||
    value === 'pipeline-ws' ||
    value === 'direct-http' ||
    value === 'direct-ws' ||
    value === 'route-http' ||
    value === 'route-ws' ||
    value === 'all'
  ) {
    return value;
  }
  return 'all';
}

function parseLatency(value: string, fallback: FishSpeechLatency): FishSpeechLatency {
  if (!value.trim()) {
    return fallback;
  }
  if (value === 'balanced' || value === 'normal') {
    return value;
  }
  throw new Error(`Invalid Fish latency: ${value}`);
}

function parseFormat(value: string, fallback: StreamBotConfig['fishSpeechFormat']) {
  if (!value.trim()) {
    return fallback;
  }
  if (value === 'pcm' || value === 'mp3' || value === 'wav' || value === 'opus') {
    return value;
  }
  throw new Error(`Invalid Fish format: ${value}`);
}

function parseStateMode(value: string): BenchOptions['routeStateMode'] {
  if (value === 'conversation' || value === 'previous-response' || value === 'stateless') {
    return value;
  }
  return 'stateless';
}

function parseBridgeChunkingStrategy(value: string): BenchOptions['routeBridgeChunkingStrategy'] {
  if (value === 'python-safe' || value === 'eager' || value === 'app') {
    return value;
  }
  return 'app';
}

function parseReasoningEffort(
  value: string,
  fallback: OpenAiReasoningEffort,
): OpenAiReasoningEffort {
  if (!value.trim()) {
    return fallback;
  }
  if (
    value === 'none' ||
    value === 'minimal' ||
    value === 'low' ||
    value === 'medium' ||
    value === 'high' ||
    value === 'xhigh'
  ) {
    return value;
  }
  return fallback;
}

function printHelp() {
  console.log(`OpenAI Responses + Fish Speech latency benchmark

Usage:
  npm run bench:pipeline -- --backup C:\\path\\yourwifey-local-backup.json --mode all

Modes:
  fish           Fish Speech websocket only
  llm-http       OpenAI Responses HTTP stream only
  llm-ws         OpenAI Responses WebSocket only
  pipeline-http  OpenAI HTTP deltas into Fish live bridge
  pipeline-ws    OpenAI WebSocket deltas into Fish live bridge
  direct-http    Raw OpenAI HTTP stream into one Fish realtime stream, no app backend route
  direct-ws      Raw persistent OpenAI WS into one Fish realtime stream, no app backend route
  route-http     Exact /ai/chat SSE route with HTTP-stream transport + Fish bridge
  route-ws       Exact /ai/chat SSE route with WebSocket transport + Fish bridge
  all            Run every mode above

Options:
  --backup <path>              Optional backup JSON to read provider keys + Hikari voice
  --prompt "..."               LLM prompt / Fish-only text
  --repeat 3                   Repeats per mode, default 1
  --llm-model gpt-5-nano       OpenAI model, default gpt-5-nano
  --max-output-tokens 120      LLM output cap, default 120
  --reasoning minimal          Reasoning effort for reasoning models, default minimal
  --openai-warmup true         Warm direct-ws with one tiny generated turn before timing
  --fish-warmup true           Warm Fish with one tiny realtime request before timing
  --fish-model s2              Fish backend/model, default env/backup/config
  --voice <reference-id>       Fish reference id, default backup/config
  --chunk-length 160           Fish chunk_length
  --condition true|false       Fish condition_on_previous_chunks
  --text-chunk-chars 999       Fish-only streamed text chunk size
  --chunk-delay-ms 0           Fish-only delay between text chunks
  --hard-timeout-ms 45000      Exit with partial logs if a provider stalls
  --server-url http://127.0.0.1:8797  Runtime server for route-* modes
  --state-mode stateless       route-* OpenAI state mode
  --state-key bench:local      route-* state key
  --bridge-chunking app        route-* live bridge chunking: app, eager, python-safe
  --bridge-min-chars 28        route-* min text before Fish gets a chunk
  --bridge-max-chars 180       route-* hard text chunk cap
  --bridge-soft-chars 160      route-* soft boundary target for python-safe
  --progress                   Print live delta/audio events
  --json                       Print JSON results
`);
}

function parseOptions(config: StreamBotConfig): BenchOptions {
  const modelArg = readArg('--model');
  const fishModelArg = readArg('--fish-model');
  const llmModelArg = readArg('--llm-model');
  const fishModel =
    fishModelArg ||
    (modelArg && !modelArg.startsWith('gpt-') ? modelArg : '') ||
    config.fishSpeechModel ||
    's2';
  const llmModel =
    llmModelArg || (modelArg && modelArg.startsWith('gpt-') ? modelArg : '') || 'gpt-5-nano';
  return {
    backupPath: readArg('--backup'),
    conditionOnPreviousChunks: parseBoolean(
      readArg('--condition'),
      config.fishSpeechConditionOnPreviousChunks,
    ),
    fishChunkLength: parseNumber(readArg('--chunk-length'), config.fishSpeechChunkLength, 100, 300),
    fishLatency: parseLatency(readArg('--latency'), config.fishSpeechLatency),
    fishModel,
    fishVoiceId: readArg('--voice') || config.fishSpeechVoiceId,
    format: parseFormat(readArg('--format'), config.fishSpeechFormat || 'pcm'),
    hardTimeoutMs: parseNumber(readArg('--hard-timeout-ms'), 45000, 0, 300000),
    json: process.argv.includes('--json'),
    llmMaxOutputTokens: parseNumber(readArg('--max-output-tokens'), 200, 16, 4096),
    llmModel,
    mode: parseMode(readArg('--mode')),
    openAiReasoningEffort: parseReasoningEffort(readArg('--reasoning'), 'minimal'),
    openAiWarmup: parseBoolean(readArg('--openai-warmup'), false),
    fishWarmup: parseBoolean(readArg('--fish-warmup'), false),
    progress: process.argv.includes('--progress'),
    prompt: readArg('--prompt') || DEFAULT_PROMPT,
    repeat: parseNumber(readArg('--repeat'), 1, 1, 20),
    routeBridgeChunkingStrategy: parseBridgeChunkingStrategy(readArg('--bridge-chunking')),
    routeBridgeMaxChars: parseNumber(readArg('--bridge-max-chars'), 180, 16, 1000),
    routeBridgeMinChars: parseNumber(readArg('--bridge-min-chars'), 28, 1, 500),
    routeBridgeSoftChars: parseNumber(readArg('--bridge-soft-chars'), 160, 8, 1000),
    routeServerUrl:
      readArg('--server-url') ||
      `http://127.0.0.1:${config.botPort || Number(process.env.BOT_PORT) || 8797}`,
    routeStateKey: readArg('--state-key') || 'bench:local',
    routeStateMode: parseStateMode(readArg('--state-mode')),
    textChunkChars: parseNumber(readArg('--text-chunk-chars'), 999, 1, 2000),
    textChunkDelayMs: parseNumber(readArg('--chunk-delay-ms'), 0, 0, 10000),
  };
}

function hydrateFromBackup(config: StreamBotConfig, options: BenchOptions) {
  if (!options.backupPath) {
    return;
  }
  const backup = JSON.parse(readFileSync(options.backupPath, 'utf8')) as {
    providerSecrets?: Array<{ provider?: string; secret?: string }>;
    state?: {
      personaVoiceBindings?: Record<
        string,
        { modelId?: string; provider?: string; voiceId?: string }
      >;
    };
  };
  const fishSecret = backup.providerSecrets?.find(
    (entry) => entry.provider === 'fish_speech',
  )?.secret;
  const openAiSecret = backup.providerSecrets?.find((entry) => entry.provider === 'openai')?.secret;
  const hikariFish = backup.state?.personaVoiceBindings?.['hikari-chan'];
  if (fishSecret && !config.fishSpeechApiKey) {
    config.fishSpeechApiKey = fishSecret;
  }
  if (openAiSecret && !config.aiApiKey) {
    config.aiApiKey = openAiSecret;
  }
  if (!options.fishVoiceId && hikariFish?.provider === 'fish-speech' && hikariFish.voiceId) {
    options.fishVoiceId = hikariFish.voiceId;
  }
  if (!readArg('--fish-model') && hikariFish?.provider === 'fish-speech' && hikariFish.modelId) {
    options.fishModel = hikariFish.modelId;
  }
}

function splitText(text: string, chunkChars: number) {
  const chunks: string[] = [];
  for (let cursor = 0; cursor < text.length; cursor += chunkChars) {
    const chunk = text.slice(cursor, cursor + chunkChars);
    chunks.push(chunk.endsWith(' ') ? chunk : `${chunk} `);
  }
  return chunks;
}

function sleep(ms: number) {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function* createMeasuredTextStream(
  text: string,
  chunkChars: number,
  chunkDelayMs: number,
  onChunk: (chunk: string) => void,
): RemoteTextStream {
  for (const chunk of splitText(text, chunkChars)) {
    onChunk(chunk);
    yield chunk;
    await sleep(chunkDelayMs);
  }
}

function createAsyncTextQueue() {
  const queue: string[] = [];
  let closed = false;
  let failure: Error | null = null;
  let notify: (() => void) | null = null;

  const wake = () => {
    notify?.();
    notify = null;
  };

  return {
    close() {
      closed = true;
      wake();
    },
    fail(error: Error) {
      failure = error;
      closed = true;
      wake();
    },
    push(value: string) {
      if (!closed && value.trim()) {
        queue.push(value.endsWith(' ') ? value : `${value} `);
        wake();
      }
    },
    async *stream(): RemoteTextStream {
      while (!closed || queue.length > 0) {
        if (failure) {
          throw failure;
        }
        const next = queue.shift();
        if (next) {
          yield next;
          continue;
        }
        await new Promise<void>((resolve) => {
          notify = resolve;
        });
      }
      if (failure) {
        throw failure;
      }
    },
  };
}

function createLiveSpeechTextBridge(onTextChunk?: (chunk: string) => void) {
  const queue = createAsyncTextQueue();
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
      onTextChunk?.(chunk);
      queue.push(chunk);
    }
  };

  return {
    close() {
      flush(true);
      queue.close();
    },
    fail(error: Error) {
      queue.fail(error);
    },
    push(delta: string) {
      pending += delta;
      flush(false);
    },
    stream: queue.stream(),
  };
}

function createFishConfig(baseConfig: StreamBotConfig, options: BenchOptions): StreamBotConfig {
  return {
    ...baseConfig,
    fishSpeechChunkLength: options.fishChunkLength,
    fishSpeechConditionOnPreviousChunks: options.conditionOnPreviousChunks,
    fishSpeechFormat: options.format,
    fishSpeechLatency: options.fishLatency,
    fishSpeechModel: options.fishModel,
    fishSpeechVoiceId: options.fishVoiceId,
  };
}

function createOpenAiProvider(
  config: StreamBotConfig,
  options: BenchOptions,
  useWebSocket: boolean,
) {
  return new OpenAiResponsesProvider({
    apiBaseUrl: 'https://api.openai.com/v1',
    apiKey: config.aiApiKey,
    closeWebSocketAfterRequest: true,
    maxOutputTokens: options.llmMaxOutputTokens,
    model: options.llmModel,
    reasoningEffort: options.openAiReasoningEffort,
    requestTimeoutMs: Math.max(options.hardTimeoutMs || 45000, 15000),
    safetyIdentifier: '',
    stateMode: 'stateless',
    store: false,
    temperature: 0.4,
    useWebSocket,
  });
}

function createOpenAiRequest(options: BenchOptions, useWebSocket: boolean) {
  return {
    activeChatters: 1,
    disableState: true,
    maxTokens: options.llmMaxOutputTokens,
    messages: [
      {
        content:
          'You are a live VTuber assistant. Reply briefly and naturally. Do not include hidden reasoning.',
        role: 'system' as const,
      },
      { content: options.prompt, role: 'user' as const },
    ],
    mode: 'direct' as const,
    openAiStateMode: 'stateless' as const,
    sourceMessages: [],
    transportMode: useWebSocket ? ('websocket' as const) : ('http-stream' as const),
  };
}

type DirectOpenAiEvent = {
  type?: string;
  delta?: string;
  response?: {
    id?: string;
    incomplete_details?: {
      reason?: string;
    };
  };
  error?: {
    message?: string;
  };
};

function isReasoningStyleModelName(model: string) {
  const normalized = model.trim().toLowerCase();
  return (
    normalized.startsWith('gpt-5') ||
    normalized.startsWith('o1') ||
    normalized.startsWith('o3') ||
    normalized.startsWith('o4')
  );
}

function createDirectOpenAiPayload(options: BenchOptions, prompt = options.prompt) {
  const payload: Record<string, unknown> = {
    model: options.llmModel,
    instructions:
      'You are a live VTuber assistant. Reply briefly and naturally. Do not include hidden reasoning.',
    input: [
      {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: prompt }],
      },
    ],
    max_output_tokens: options.llmMaxOutputTokens,
    store: false,
  };
  if (isReasoningStyleModelName(options.llmModel)) {
    if (options.openAiReasoningEffort !== 'none') {
      payload.reasoning = { effort: options.openAiReasoningEffort };
    }
  } else {
    payload.temperature = 0.4;
  }
  return payload;
}

function handleDirectOpenAiEvent(event: DirectOpenAiEvent, onTextDelta: (delta: string) => void) {
  if (event.type === 'error' || event.type === 'response.failed') {
    throw new Error(event.error?.message ?? `OpenAI Responses WS event ${event.type}.`);
  }
  if (typeof event.delta === 'string' && event.delta) {
    onTextDelta(event.delta);
  }
  if (event.type === 'response.completed') {
    return 'completed' as const;
  }
  if (event.type === 'response.incomplete') {
    const reason = event.response?.incomplete_details?.reason ?? 'unknown';
    throw new Error(`OpenAI Responses API returned an incomplete response: ${reason}.`);
  }
  return 'continue' as const;
}

class DirectOpenAiWsSession {
  private queue = Promise.resolve();
  private socket: WebSocket | null = null;
  private socketReady: Promise<WebSocket> | null = null;

  constructor(
    private readonly config: StreamBotConfig,
    private readonly options: BenchOptions,
  ) {}

  dispose() {
    if (
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)
    ) {
      this.socket.close();
    }
    this.socket = null;
    this.socketReady = null;
  }

  warmup() {
    return this.complete('Say ready.', () => undefined);
  }

  complete(prompt: string, onTextDelta: (delta: string) => void) {
    const run = () => this.completeNow(prompt, onTextDelta);
    const result = this.queue.then(run, run);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async completeNow(prompt: string, onTextDelta: (delta: string) => void) {
    const socket = await this.getSocket();
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        fail(new Error(`Direct OpenAI WS timed out after ${this.options.hardTimeoutMs}ms.`), true);
      }, this.options.hardTimeoutMs);

      const cleanup = () => {
        settled = true;
        clearTimeout(timeout);
        socket.off('message', onMessage);
        socket.off('close', onClose);
        socket.off('error', onError);
      };

      const finish = () => {
        cleanup();
        resolve();
      };

      const fail = (error: Error, closeSocket = false) => {
        cleanup();
        if (closeSocket) {
          this.dispose();
        }
        reject(error);
      };

      const onMessage = (raw: RawData) => {
        if (settled) {
          return;
        }
        try {
          const event = JSON.parse(raw.toString()) as DirectOpenAiEvent;
          if (handleDirectOpenAiEvent(event, onTextDelta) === 'completed') {
            finish();
          }
        } catch (error) {
          fail(error instanceof Error ? error : new Error(String(error)), true);
        }
      };

      const onClose = (code: number, reason: Buffer) => {
        if (!settled) {
          fail(
            new Error(
              `Direct OpenAI WS closed before completion: ${code}${reason.length ? ` ${reason.toString()}` : ''}.`,
            ),
          );
        }
      };

      const onError = (error: Error) => {
        if (!settled) {
          fail(error, true);
        }
      };

      socket.on('message', onMessage);
      socket.on('close', onClose);
      socket.on('error', onError);
      socket.send(
        JSON.stringify({
          type: 'response.create',
          ...createDirectOpenAiPayload(this.options, prompt),
        }),
      );
    });
  }

  private async getSocket() {
    if (this.socket?.readyState === WebSocket.OPEN) {
      return this.socket;
    }
    if (this.socketReady) {
      return this.socketReady;
    }
    this.socketReady = new Promise<WebSocket>((resolve, reject) => {
      const socket = new WebSocket('wss://api.openai.com/v1/responses', {
        headers: {
          Authorization: `Bearer ${this.config.aiApiKey}`,
          'Content-Type': 'application/json',
        },
      });
      socket.once('open', () => {
        this.socket = socket;
        resolve(socket);
      });
      socket.once('error', (error) => {
        this.socket = null;
        this.socketReady = null;
        reject(error);
      });
      socket.once('close', () => {
        if (this.socket === socket) {
          this.socket = null;
          this.socketReady = null;
        }
      });
    });
    return this.socketReady;
  }
}

async function streamDirectOpenAiHttp(
  config: StreamBotConfig,
  options: BenchOptions,
  onTextDelta: (delta: string) => void,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.hardTimeoutMs);
  let response: Response;
  try {
    response = await fetch('https://api.openai.com/v1/responses', {
      body: JSON.stringify({ ...createDirectOpenAiPayload(options), stream: true }),
      headers: {
        Authorization: `Bearer ${config.aiApiKey}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    throw new Error(
      `Direct OpenAI HTTP failed with HTTP ${response.status}: ${await response.text()}`,
    );
  }
  if (!response.body) {
    throw new Error('Direct OpenAI HTTP did not return a readable stream.');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const handleBlock = (block: string) => {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .join('\n')
      .trim();
    if (!data || data === '[DONE]') {
      return;
    }
    const event = JSON.parse(data) as DirectOpenAiEvent;
    handleDirectOpenAiEvent(event, onTextDelta);
  };
  try {
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
  } finally {
    reader.releaseLock();
  }
}

async function warmFish(config: StreamBotConfig, options: BenchOptions) {
  await streamFishSpeechTextStream(
    createFishConfig(config, options),
    {
      chunkLength: options.fishChunkLength,
      conditionOnPreviousChunks: options.conditionOnPreviousChunks,
      latency: options.fishLatency,
      modelId: options.fishModel,
      voiceId: options.fishVoiceId,
    },
    createMeasuredTextStream('warmup.', 999, 0, () => undefined),
    {
      onAudioChunk() {
        // Warmup only.
      },
    },
  );
}

async function withHardTimeout<T>(
  options: BenchOptions,
  label: string,
  work: () => Promise<T>,
  onTimeout?: () => void,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      work(),
      new Promise<T>((_, reject) => {
        if (options.hardTimeoutMs <= 0) {
          return;
        }
        timeout = setTimeout(() => {
          onTimeout?.();
          reject(new Error(`${label} hard timeout after ${options.hardTimeoutMs}ms`));
        }, options.hardTimeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

async function runFishOnly(
  config: StreamBotConfig,
  options: BenchOptions,
  run: number,
): Promise<ResultRow> {
  const startedAt = performance.now();
  let firstTextAt: number | null = null;
  let firstAudioAt: number | null = null;
  let lastAudioAt: number | null = null;
  let textChunks = 0;
  let audioChunks = 0;
  let audioBytes = 0;
  const textStream = createMeasuredTextStream(
    options.prompt,
    options.textChunkChars,
    options.textChunkDelayMs,
    () => {
      firstTextAt ??= performance.now();
      textChunks += 1;
    },
  );

  await withHardTimeout(options, 'fish', () =>
    streamFishSpeechTextStream(
      createFishConfig(config, options),
      {
        chunkLength: options.fishChunkLength,
        conditionOnPreviousChunks: options.conditionOnPreviousChunks,
        latency: options.fishLatency,
        modelId: options.fishModel,
        voiceId: options.fishVoiceId,
      },
      textStream,
      {
        onAudioChunk(chunk) {
          const now = performance.now();
          firstAudioAt ??= now;
          lastAudioAt = now;
          audioChunks += 1;
          audioBytes += chunk.audio.length;
          if (options.progress) {
            console.log(`[fish run ${run}] audio ${audioChunks} ${Math.round(now - startedAt)}ms`);
          }
        },
      },
    ),
  );

  return {
    audioBytes,
    audioChunks,
    firstAudioMs: firstAudioAt === null ? null : firstAudioAt - startedAt,
    firstTextToAudioMs:
      firstAudioAt === null || firstTextAt === null ? null : firstAudioAt - firstTextAt,
    lastAudioMs: lastAudioAt === null ? null : lastAudioAt - startedAt,
    mode: 'fish',
    run,
    textChunks,
    totalMs: performance.now() - startedAt,
  };
}

async function runLlmOnly(
  config: StreamBotConfig,
  options: BenchOptions,
  run: number,
  useWebSocket: boolean,
): Promise<ResultRow> {
  const startedAt = performance.now();
  const provider = createOpenAiProvider(config, options, useWebSocket);
  let firstDeltaAt: number | null = null;
  let deltaCount = 0;
  let deltaChars = 0;
  try {
    await withHardTimeout(options, useWebSocket ? 'llm-ws' : 'llm-http', async () => {
      await provider.completeStream(createOpenAiRequest(options, useWebSocket), {
        onTextDelta(delta) {
          const now = performance.now();
          firstDeltaAt ??= now;
          deltaCount += 1;
          deltaChars += delta.length;
          if (options.progress) {
            console.log(
              `[${useWebSocket ? 'llm-ws' : 'llm-http'} run ${run}] delta ${deltaCount} ${Math.round(now - startedAt)}ms chars=${delta.length}`,
            );
          }
        },
      });
    });
  } finally {
    provider.dispose();
  }

  return {
    deltaChars,
    deltaCount,
    firstDeltaMs: firstDeltaAt === null ? null : firstDeltaAt - startedAt,
    mode: useWebSocket ? 'llm-ws' : 'llm-http',
    run,
    totalMs: performance.now() - startedAt,
  };
}

async function runPipeline(
  config: StreamBotConfig,
  options: BenchOptions,
  run: number,
  useWebSocket: boolean,
): Promise<ResultRow> {
  const startedAt = performance.now();
  const provider = createOpenAiProvider(config, options, useWebSocket);
  let firstDeltaAt: number | null = null;
  let firstTextAt: number | null = null;
  let firstAudioAt: number | null = null;
  let lastAudioAt: number | null = null;
  let deltaCount = 0;
  let deltaChars = 0;
  let textChunks = 0;
  let audioChunks = 0;
  let audioBytes = 0;
  const mode: ResultRow['mode'] = useWebSocket ? 'pipeline-ws' : 'pipeline-http';
  const bridge = createLiveSpeechTextBridge((chunk) => {
    firstTextAt ??= performance.now();
    textChunks += 1;
    if (options.progress) {
      console.log(`[${mode} run ${run}] fish text ${textChunks} chars=${chunk.length}`);
    }
  });

  let fishDone: Promise<void> | null = null;
  await withHardTimeout(
    options,
    mode,
    async () => {
      fishDone = streamFishSpeechTextStream(
        createFishConfig(config, options),
        {
          chunkLength: options.fishChunkLength,
          conditionOnPreviousChunks: options.conditionOnPreviousChunks,
          latency: options.fishLatency,
          modelId: options.fishModel,
          voiceId: options.fishVoiceId,
        },
        bridge.stream,
        {
          onAudioChunk(chunk) {
            const now = performance.now();
            firstAudioAt ??= now;
            lastAudioAt = now;
            audioChunks += 1;
            audioBytes += chunk.audio.length;
            if (options.progress) {
              console.log(
                `[${mode} run ${run}] audio ${audioChunks} ${Math.round(now - startedAt)}ms`,
              );
            }
          },
        },
      );
      try {
        await provider.completeStream(createOpenAiRequest(options, useWebSocket), {
          onTextDelta(delta) {
            const now = performance.now();
            firstDeltaAt ??= now;
            deltaCount += 1;
            deltaChars += delta.length;
            bridge.push(delta);
            if (options.progress) {
              console.log(
                `[${mode} run ${run}] delta ${deltaCount} ${Math.round(now - startedAt)}ms chars=${delta.length}`,
              );
            }
          },
        });
        bridge.close();
        await fishDone;
      } catch (error) {
        bridge.fail(error instanceof Error ? error : new Error(String(error)));
        await fishDone.catch(() => undefined);
        throw error;
      } finally {
        provider.dispose();
      }
    },
    () => {
      bridge.fail(new Error(`${mode} timed out`));
      provider.dispose();
    },
  );

  return {
    audioBytes,
    audioChunks,
    deltaChars,
    deltaCount,
    firstAudioMs: firstAudioAt === null ? null : firstAudioAt - startedAt,
    firstDeltaMs: firstDeltaAt === null ? null : firstDeltaAt - startedAt,
    firstTextToAudioMs:
      firstAudioAt === null || firstTextAt === null ? null : firstAudioAt - firstTextAt,
    lastAudioMs: lastAudioAt === null ? null : lastAudioAt - startedAt,
    mode,
    run,
    textChunks,
    totalMs: performance.now() - startedAt,
  };
}

async function runDirectPipeline(
  config: StreamBotConfig,
  options: BenchOptions,
  run: number,
  transport: 'http' | 'ws',
  wsSession?: DirectOpenAiWsSession,
): Promise<ResultRow> {
  const startedAt = performance.now();
  let firstDeltaAt: number | null = null;
  let firstTextAt: number | null = null;
  let firstAudioAt: number | null = null;
  let lastAudioAt: number | null = null;
  let deltaCount = 0;
  let deltaChars = 0;
  let textChunks = 0;
  let audioChunks = 0;
  let audioBytes = 0;
  const mode: ResultRow['mode'] = transport === 'ws' ? 'direct-ws' : 'direct-http';
  const bridge = createLiveSpeechTextBridge((chunk) => {
    firstTextAt ??= performance.now();
    textChunks += 1;
    if (options.progress) {
      console.log(`[${mode} run ${run}] fish text ${textChunks} chars=${chunk.length}`);
    }
  });

  let fishDone: Promise<void> | null = null;
  await withHardTimeout(
    options,
    mode,
    async () => {
      fishDone = streamFishSpeechTextStream(
        createFishConfig(config, options),
        {
          chunkLength: options.fishChunkLength,
          conditionOnPreviousChunks: options.conditionOnPreviousChunks,
          latency: options.fishLatency,
          modelId: options.fishModel,
          voiceId: options.fishVoiceId,
        },
        bridge.stream,
        {
          onAudioChunk(chunk) {
            const now = performance.now();
            firstAudioAt ??= now;
            lastAudioAt = now;
            audioChunks += 1;
            audioBytes += chunk.audio.length;
            if (options.progress) {
              console.log(
                `[${mode} run ${run}] audio ${audioChunks} ${Math.round(now - startedAt)}ms`,
              );
            }
          },
        },
      );

      const onDelta = (delta: string) => {
        const now = performance.now();
        firstDeltaAt ??= now;
        deltaCount += 1;
        deltaChars += delta.length;
        bridge.push(delta);
        if (options.progress) {
          console.log(
            `[${mode} run ${run}] delta ${deltaCount} ${Math.round(now - startedAt)}ms chars=${delta.length}`,
          );
        }
      };

      try {
        if (transport === 'ws') {
          if (!wsSession) {
            throw new Error('Missing direct OpenAI WS session.');
          }
          await wsSession.complete(options.prompt, onDelta);
        } else {
          await streamDirectOpenAiHttp(config, options, onDelta);
        }
        bridge.close();
        await fishDone;
      } catch (error) {
        bridge.fail(error instanceof Error ? error : new Error(String(error)));
        await fishDone.catch(() => undefined);
        throw error;
      }
    },
    () => {
      bridge.fail(new Error(`${mode} timed out`));
    },
  );

  return {
    audioBytes,
    audioChunks,
    deltaChars,
    deltaCount,
    firstAudioMs: firstAudioAt === null ? null : firstAudioAt - startedAt,
    firstDeltaMs: firstDeltaAt === null ? null : firstDeltaAt - startedAt,
    firstTextToAudioMs:
      firstAudioAt === null || firstTextAt === null ? null : firstAudioAt - firstTextAt,
    lastAudioMs: lastAudioAt === null ? null : lastAudioAt - startedAt,
    mode,
    run,
    textChunks,
    totalMs: performance.now() - startedAt,
  };
}

function createRouteTtsBridge(options: BenchOptions): RemoteTtsRequest {
  return {
    provider: 'fish-speech',
    text: '',
    streamingMode: 'live-bridge',
    chunkingStrategy: options.routeBridgeChunkingStrategy,
    voiceId: options.fishVoiceId,
    modelId: options.fishModel,
    latency: options.fishLatency,
    conditionOnPreviousChunks: options.conditionOnPreviousChunks,
    chunkLength: options.fishChunkLength,
    minBufferChars: options.routeBridgeMinChars,
    maxBufferChars: options.routeBridgeMaxChars,
    softBufferChars: options.routeBridgeSoftChars,
  };
}

function createRouteHeaders(config: StreamBotConfig) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-yourwifey-llm-provider': 'openai-responses',
  };
  if (config.aiApiKey) {
    headers['x-yourwifey-llm-provider-key'] = config.aiApiKey;
  }
  if (config.fishSpeechApiKey) {
    headers['x-yourwifey-tts-provider-key'] = config.fishSpeechApiKey;
  }
  return headers;
}

function createRouteBody(options: BenchOptions, useWebSocket: boolean) {
  return {
    activeChatters: 1,
    disableState: options.routeStateMode === 'stateless',
    llmProvider: 'openai-responses',
    maxTokens: options.llmMaxOutputTokens,
    messages: [
      {
        content:
          'You are a live VTuber assistant. Reply briefly and naturally. Do not include hidden reasoning.',
        role: 'system',
      },
      { content: options.prompt, role: 'user' },
    ],
    mode: 'direct',
    model: options.llmModel,
    openAiStateMode: options.routeStateMode,
    stateKey: `${options.routeStateKey}:${useWebSocket ? 'ws' : 'http'}`,
    stateScope: 'chat',
    stream: true,
    temperature: 0.4,
    transportMode: useWebSocket ? 'websocket' : 'http-stream',
    ttsBridge: createRouteTtsBridge(options),
  };
}

async function readRouteSse(
  response: Response,
  options: BenchOptions,
  mode: ResultRow['mode'],
  run: number,
  startedAt: number,
  stats: {
    audioBytes: number;
    audioChunks: number;
    deltaChars: number;
    deltaCount: number;
    firstAudioAt: number | null;
    firstDeltaAt: number | null;
    firstTextAt: number | null;
    lastAudioAt: number | null;
    textChunks: number;
  },
) {
  if (!response.body) {
    throw new Error('/ai/chat did not return a readable stream.');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const handleBlock = (block: string) => {
    const dataText = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n')
      .trim();
    if (!dataText) {
      return;
    }
    const event = JSON.parse(dataText) as {
      audio?: string;
      delta?: string;
      error?: string;
      mimeType?: string;
      ok?: boolean;
      sampleRate?: number;
      text?: string;
      type?: string;
    };
    if (event.type === 'delta' && event.delta) {
      const now = performance.now();
      stats.firstDeltaAt ??= now;
      stats.deltaCount += 1;
      stats.deltaChars += event.delta.length;
      if (options.progress) {
        console.log(
          `[${mode} run ${run}] delta ${stats.deltaCount} ${Math.round(now - startedAt)}ms chars=${event.delta.length}`,
        );
      }
      return;
    }
    if (event.type === 'audio' && event.audio) {
      const now = performance.now();
      stats.firstAudioAt ??= now;
      stats.lastAudioAt = now;
      stats.audioChunks += 1;
      stats.audioBytes += Buffer.from(event.audio, 'base64').length;
      if (options.progress) {
        console.log(
          `[${mode} run ${run}] audio ${stats.audioChunks} ${Math.round(now - startedAt)}ms`,
        );
      }
      return;
    }
    if (event.type === 'tts-error') {
      throw new Error(event.error || 'Route live TTS bridge failed.');
    }
    if (event.type === 'error' || event.ok === false) {
      throw new Error(event.error || 'Route AI request failed.');
    }
  };

  try {
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
  } finally {
    reader.releaseLock();
  }
}

async function runRoutePipeline(
  config: StreamBotConfig,
  options: BenchOptions,
  run: number,
  useWebSocket: boolean,
): Promise<ResultRow> {
  const startedAt = performance.now();
  const mode: ResultRow['mode'] = useWebSocket ? 'route-ws' : 'route-http';
  const controller = new AbortController();
  const stats = {
    audioBytes: 0,
    audioChunks: 0,
    deltaChars: 0,
    deltaCount: 0,
    firstAudioAt: null as number | null,
    firstDeltaAt: null as number | null,
    firstTextAt: null as number | null,
    lastAudioAt: null as number | null,
    textChunks: 0,
  };

  await withHardTimeout(
    options,
    mode,
    async () => {
      const response = await fetch(`${options.routeServerUrl.replace(/\/$/, '')}/ai/chat`, {
        body: JSON.stringify(createRouteBody(options, useWebSocket)),
        headers: createRouteHeaders(config),
        method: 'POST',
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`/ai/chat failed with HTTP ${response.status}: ${await response.text()}`);
      }
      await readRouteSse(response, options, mode, run, startedAt, stats);
    },
    () => controller.abort(),
  );

  return {
    audioBytes: stats.audioBytes,
    audioChunks: stats.audioChunks,
    deltaChars: stats.deltaChars,
    deltaCount: stats.deltaCount,
    firstAudioMs: stats.firstAudioAt === null ? null : stats.firstAudioAt - startedAt,
    firstDeltaMs: stats.firstDeltaAt === null ? null : stats.firstDeltaAt - startedAt,
    firstTextToAudioMs:
      stats.firstAudioAt === null || stats.firstDeltaAt === null
        ? null
        : stats.firstAudioAt - stats.firstDeltaAt,
    lastAudioMs: stats.lastAudioAt === null ? null : stats.lastAudioAt - startedAt,
    mode,
    run,
    textChunks: stats.deltaCount > 0 ? 1 : 0,
    totalMs: performance.now() - startedAt,
  };
}

function modesToRun(mode: Mode): Array<Exclude<Mode, 'all'>> {
  if (mode === 'all') {
    return [
      'fish',
      'llm-http',
      'llm-ws',
      'pipeline-http',
      'pipeline-ws',
      'direct-http',
      'direct-ws',
      'route-http',
      'route-ws',
    ];
  }
  return [mode];
}

function formatMs(value: number | null | undefined) {
  return value === null || value === undefined ? 'n/a' : `${Math.round(value)}ms`;
}

function average(values: Array<number | null | undefined>) {
  const real = values.filter((value): value is number => Number.isFinite(value));
  if (!real.length) {
    return null;
  }
  return real.reduce((sum, value) => sum + value, 0) / real.length;
}

function printResults(options: BenchOptions, results: ResultRow[]) {
  console.log('OpenAI Responses + Fish Speech benchmark');
  console.log(`llm_model=${options.llmModel}`);
  console.log(`fish_model=${options.fishModel}`);
  console.log(`fish_latency=${options.fishLatency}`);
  console.log(`chunk_length=${options.fishChunkLength}`);
  console.log(`condition_on_previous_chunks=${options.conditionOnPreviousChunks}`);
  console.log(`reasoning=${options.openAiReasoningEffort}`);
  console.log(`openai_warmup=${options.openAiWarmup}`);
  console.log(`fish_warmup=${options.fishWarmup}`);
  if (options.mode === 'route-http' || options.mode === 'route-ws' || options.mode === 'all') {
    console.log(
      `bridge_chunking=${options.routeBridgeChunkingStrategy} min=${options.routeBridgeMinChars} max=${options.routeBridgeMaxChars} soft=${options.routeBridgeSoftChars}`,
    );
  }
  console.log('');
  console.table(
    results.map((result) => ({
      mode: result.mode,
      run: result.run,
      firstDelta: formatMs(result.firstDeltaMs),
      firstAudio: formatMs(result.firstAudioMs),
      deltaToAudio:
        result.firstAudioMs !== undefined &&
        result.firstAudioMs !== null &&
        result.firstDeltaMs !== undefined &&
        result.firstDeltaMs !== null
          ? formatMs(result.firstAudioMs - result.firstDeltaMs)
          : 'n/a',
      textToAudio: formatMs(result.firstTextToAudioMs),
      lastAudio: formatMs(result.lastAudioMs),
      total: formatMs(result.totalMs),
      deltas: result.deltaCount ?? 0,
      deltaChars: result.deltaChars ?? 0,
      fishTextChunks: result.textChunks ?? 0,
      audioChunks: result.audioChunks ?? 0,
      audioBytes: result.audioBytes ?? 0,
      error: result.error ?? '',
    })),
  );
  const modes = Array.from(new Set(results.map((result) => result.mode)));
  const summary = modes.map((mode) => {
    const rows = results.filter((result) => result.mode === mode && !result.error);
    const avgFirstDelta = average(rows.map((row) => row.firstDeltaMs));
    const avgFirstAudio = average(rows.map((row) => row.firstAudioMs));
    const avgDeltaToAudio = average(
      rows.map((row) =>
        row.firstAudioMs !== undefined &&
        row.firstAudioMs !== null &&
        row.firstDeltaMs !== undefined &&
        row.firstDeltaMs !== null
          ? row.firstAudioMs - row.firstDeltaMs
          : null,
      ),
    );
    const avgTotal = average(rows.map((row) => row.totalMs));
    return {
      mode,
      ok: rows.length,
      avgFirstDelta: formatMs(avgFirstDelta),
      avgFirstAudio: formatMs(avgFirstAudio),
      avgDeltaToAudio: formatMs(avgDeltaToAudio),
      avgTotal: formatMs(avgTotal),
      avgFirstAudioSeconds:
        avgFirstAudio === null ? 'n/a' : `${(avgFirstAudio / 1000).toFixed(3)}s`,
      avgTotalSeconds: avgTotal === null ? 'n/a' : `${(avgTotal / 1000).toFixed(3)}s`,
    };
  });
  console.log('');
  console.table(summary);
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printHelp();
    return;
  }
  const config = loadConfig();
  const options = parseOptions(config);
  hydrateFromBackup(config, options);
  const modes = modesToRun(options.mode);
  const needsFish = modes.some(
    (mode) =>
      mode === 'fish' ||
      mode.startsWith('pipeline-') ||
      mode.startsWith('direct-') ||
      mode.startsWith('route-'),
  );
  const needsOpenAi = modes.some(
    (mode) =>
      mode.startsWith('llm-') ||
      mode.startsWith('pipeline-') ||
      mode.startsWith('direct-') ||
      mode.startsWith('route-'),
  );
  if (needsFish && !config.fishSpeechApiKey) {
    throw new Error('Missing Fish key. Set FISH_AUDIO_API_KEY or pass --backup.');
  }
  if (needsOpenAi && !config.aiApiKey) {
    throw new Error('Missing OpenAI key. Set OPENAI_API_KEY or pass --backup.');
  }
  if (needsFish && !options.fishVoiceId) {
    throw new Error('Missing Fish voice id. Set FISH_SPEECH_VOICE_ID or pass --voice/--backup.');
  }

  const results: ResultRow[] = [];
  for (const mode of modes) {
    const directWsSession =
      mode === 'direct-ws' ? new DirectOpenAiWsSession(config, options) : null;
    try {
      if (directWsSession && options.openAiWarmup) {
        await directWsSession.warmup();
      }
      if ((mode === 'direct-http' || mode === 'direct-ws') && options.fishWarmup) {
        await warmFish(config, options);
      }
      for (let run = 1; run <= options.repeat; run += 1) {
        try {
          if (mode === 'fish') {
            results.push(await runFishOnly(config, options, run));
          } else if (mode === 'llm-http') {
            results.push(await runLlmOnly(config, options, run, false));
          } else if (mode === 'llm-ws') {
            results.push(await runLlmOnly(config, options, run, true));
          } else if (mode === 'pipeline-http') {
            results.push(await runPipeline(config, options, run, false));
          } else if (mode === 'pipeline-ws') {
            results.push(await runPipeline(config, options, run, true));
          } else if (mode === 'direct-http') {
            results.push(await runDirectPipeline(config, options, run, 'http'));
          } else if (mode === 'direct-ws') {
            results.push(
              await runDirectPipeline(config, options, run, 'ws', directWsSession ?? undefined),
            );
          } else if (mode === 'route-http') {
            results.push(await runRoutePipeline(config, options, run, false));
          } else {
            results.push(await runRoutePipeline(config, options, run, true));
          }
        } catch (error) {
          results.push({
            error: error instanceof Error ? error.message : String(error),
            mode,
            run,
            totalMs: 0,
          });
        }
      }
    } finally {
      directWsSession?.dispose();
    }
  }

  if (options.json) {
    console.log(
      JSON.stringify({ options: { ...options, fishVoiceId: '[redacted]' }, results }, null, 2),
    );
    return;
  }
  printResults(options, results);
}

main()
  .then(() => {
    setTimeout(() => {
      process.exit(process.exitCode ?? 0);
    }, 50);
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    setTimeout(() => {
      process.exit(1);
    }, 50);
  });
