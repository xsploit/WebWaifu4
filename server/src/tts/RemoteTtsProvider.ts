import { InworldTTS, type DeliveryMode, type VoiceInfo } from '@inworld/tts';
import {
  FishAudioClient,
  RealtimeEvents,
  type Backends,
  type ModelEntity,
  type TTSRequest,
} from 'fish-audio';
import type { StreamBotConfig } from '../config.js';

export type RemoteTtsProvider = 'fish-speech' | 'inworld';
export type RemoteTtsMode = 'live-bridge' | 'full-response' | 'sentence-chunks';
export type FishSpeechVoiceScope = 'all' | 'mine' | 'public';

export type FishSpeechLatency = 'balanced' | 'normal';
export type InworldDeliveryMode = 'STABLE' | 'BALANCED' | 'CREATIVE';

export type RemoteTtsRequest = {
  provider: RemoteTtsProvider;
  text: string;
  streamingMode?: RemoteTtsMode | string;
  voiceId?: string;
  modelId?: string;
  latency?: FishSpeechLatency;
  conditionOnPreviousChunks?: boolean;
  chunkLength?: number;
  deliveryMode?: InworldDeliveryMode | string;
  bufferCharThreshold?: number;
};

export type RemoteTtsAudioChunk = {
  audio: Buffer;
  mimeType: string;
  sampleRate?: number;
};

export type RemoteTtsVoice = {
  provider: RemoteTtsProvider;
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  languages?: string[];
  source?: string;
};

type StreamHandlers = {
  onAudioChunk: (chunk: RemoteTtsAudioChunk) => void;
};

type FishTtsRequest = TTSRequest & {
  condition_on_previous_chunks?: boolean;
  min_chunk_length?: number;
};

type FishRealtimeConnection = {
  close: () => void;
  on: (event: RealtimeEvents, listener: (...args: unknown[]) => void) => void;
};

export type RemoteTextStream = AsyncIterable<string>;

const REMOTE_TTS_TIMEOUT_MS = 45000;

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function normalizeRemoteText(value: string) {
  return value.replace(/\s+/g, ' ').trim().slice(0, 2000);
}

function getFishMimeType(format: string) {
  switch (format) {
    case 'wav':
      return 'audio/wav';
    case 'pcm':
      return 'audio/pcm';
    case 'opus':
      return 'audio/ogg; codecs=opus';
    default:
      return 'audio/mpeg';
  }
}

function getInworldMimeType(encoding: string) {
  switch (encoding) {
    case 'LINEAR16':
    case 'PCM':
      return 'audio/pcm';
    case 'WAV':
      return 'audio/wav';
    case 'OGG_OPUS':
      return 'audio/ogg; codecs=opus';
    case 'FLAC':
      return 'audio/flac';
    default:
      return 'audio/mpeg';
  }
}

function bufferFromAudioChunk(value: unknown) {
  if (Buffer.isBuffer(value)) {
    return value;
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value);
  }
  if (value instanceof ArrayBuffer) {
    return Buffer.from(value);
  }
  if (Array.isArray(value)) {
    return Buffer.from(value);
  }
  return null;
}

function normalizeFishLatency(value: unknown): FishSpeechLatency {
  return value === 'normal' ? 'normal' : 'balanced';
}

function normalizeRemoteTtsMode(value: unknown, provider: RemoteTtsProvider): RemoteTtsMode {
  if (provider === 'inworld' && value === 'live-bridge') {
    return 'full-response';
  }
  if (value === 'live-bridge' || value === 'sentence-chunks') {
    return value;
  }
  return 'full-response';
}

function normalizeInworldDeliveryMode(value: unknown): DeliveryMode | undefined {
  const normalized = String(value ?? '')
    .trim()
    .toUpperCase();
  if (normalized === 'STABLE' || normalized === 'BALANCED' || normalized === 'CREATIVE') {
    return normalized;
  }
  if (normalized === 'EXPRESSIVE') {
    return 'CREATIVE';
  }
  return undefined;
}

function normalizeBaseUrl(value: string, endpointSuffix: string) {
  const raw = value.trim();
  if (!raw) {
    return undefined;
  }

  try {
    const url = new URL(raw);
    if (url.protocol === 'wss:') {
      url.protocol = 'https:';
    } else if (url.protocol === 'ws:') {
      url.protocol = 'http:';
    }
    if (url.pathname.endsWith(endpointSuffix)) {
      url.pathname = url.pathname.slice(0, -endpointSuffix.length) || '/';
      url.search = '';
      url.hash = '';
    }
    return url.toString().replace(/\/$/, '');
  } catch {
    return raw.replace(new RegExp(`${endpointSuffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), '');
  }
}

async function* createSingleTextStream(text: string) {
  yield text.endsWith(' ') ? text : `${text} `;
}

function splitTextForStreaming(text: string, threshold: number) {
  const maxLength = clampNumber(threshold, 20, 1000, 90);
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  let pending = text.trim();
  while (pending.length > maxLength) {
    const window = pending.slice(0, maxLength + 1);
    const breakIndex = Math.max(
      window.lastIndexOf('. '),
      window.lastIndexOf('! '),
      window.lastIndexOf('? '),
      window.lastIndexOf(', '),
      window.lastIndexOf(' '),
    );
    const splitAt = breakIndex > 20 ? breakIndex + 1 : maxLength;
    chunks.push(pending.slice(0, splitAt).trim());
    pending = pending.slice(splitAt).trim();
  }
  if (pending) {
    chunks.push(pending);
  }
  return chunks.filter(Boolean);
}

function withTimeout<T>(work: Promise<T>, onTimeout: () => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      onTimeout();
      reject(new Error('Remote TTS timed out.'));
    }, REMOTE_TTS_TIMEOUT_MS);

    work.then(resolve, reject).finally(() => {
      clearTimeout(timeout);
    });
  });
}

export async function streamRemoteTts(
  config: StreamBotConfig,
  request: RemoteTtsRequest,
  handlers: StreamHandlers,
) {
  const text = normalizeRemoteText(request.text);
  if (!text) {
    return;
  }

  if (request.provider === 'fish-speech') {
    await streamFishSpeech(config, { ...request, text }, handlers);
    return;
  }

  await streamInworld(config, { ...request, text }, handlers);
}

export async function streamFishSpeechTextStream(
  config: StreamBotConfig,
  request: Omit<RemoteTtsRequest, 'provider' | 'text'>,
  textStream: RemoteTextStream,
  handlers: StreamHandlers,
) {
  await streamFishSpeech(config, { ...request, provider: 'fish-speech', text: '' }, handlers, {
    forcePcm: true,
    textStream,
  });
}

export async function listRemoteTtsVoices(
  config: StreamBotConfig,
  provider: RemoteTtsProvider,
  options: { fishScope?: FishSpeechVoiceScope } = {},
): Promise<RemoteTtsVoice[]> {
  if (provider === 'fish-speech') {
    return listFishSpeechVoices(config, options.fishScope ?? 'all');
  }
  return listInworldVoices(config);
}

async function listFishSpeechVoices(config: StreamBotConfig, scope: FishSpeechVoiceScope) {
  if (!config.fishSpeechApiKey) {
    throw new Error('FishSpeech voices require FISH_AUDIO_API_KEY or FISHSPEECH_API_KEY.');
  }

  const client = new FishAudioClient({
    apiKey: config.fishSpeechApiKey,
    ...(config.fishSpeechBaseUrl ? { baseUrl: config.fishSpeechBaseUrl } : {}),
  });
  const searchFish = async (request: Record<string, unknown>) => {
    const response = await client.voices.search(
      {
        page_number: 1,
        page_size: 100,
        sort_by: 'created_at',
        ...request,
      },
      { timeoutInSeconds: 20 },
    );
    return response.items.map(mapFishVoice).filter((voice) => voice.id);
  };

  if (scope === 'mine') {
    return searchFish({ self: true, visibility: 'private' }).catch(() =>
      searchFish({ self: true }),
    );
  }

  const publicVoices = scope === 'public' || scope === 'all' ? await searchFish({}) : [];
  if (scope === 'public') {
    return publicVoices;
  }

  const myVoices = await searchFish({ self: true, visibility: 'private' }).catch(() =>
    searchFish({ self: true }).catch(() => []),
  );
  const byId = new Map<string, RemoteTtsVoice>();
  for (const voice of [...myVoices, ...publicVoices]) {
    byId.set(voice.id, voice);
  }
  return Array.from(byId.values());
}

async function listInworldVoices(config: StreamBotConfig) {
  if (!config.inworldApiKey) {
    throw new Error('Inworld voices require INWORLD_API_KEY.');
  }

  const client = InworldTTS({
    apiKey: config.inworldApiKey,
    timeout: 20000,
    ...(config.inworldBaseUrl ? { baseUrl: config.inworldBaseUrl } : {}),
  });
  const voices = await client.listVoices();
  return voices.map(mapInworldVoice).filter((voice) => voice.id);
}

function mapFishVoice(voice: ModelEntity): RemoteTtsVoice {
  return {
    provider: 'fish-speech',
    id: voice._id,
    name: voice.title || voice._id,
    description: voice.description || undefined,
    tags: voice.tags,
    languages: voice.languages,
    source: voice.author?.nickname,
  };
}

function mapInworldVoice(voice: VoiceInfo): RemoteTtsVoice {
  return {
    provider: 'inworld',
    id: voice.voiceId,
    name: voice.displayName || voice.name || voice.voiceId,
    description: voice.description,
    tags: voice.tags,
    languages: voice.langCode ? [voice.langCode] : undefined,
    source: voice.source,
  };
}

async function streamFishSpeech(
  config: StreamBotConfig,
  request: RemoteTtsRequest & { text: string },
  handlers: StreamHandlers,
  options: {
    forcePcm?: boolean;
    textStream?: RemoteTextStream;
  } = {},
) {
  if (!config.fishSpeechApiKey) {
    throw new Error('FishSpeech TTS requires FISH_AUDIO_API_KEY or FISHSPEECH_API_KEY.');
  }

  const referenceId = request.voiceId?.trim() || config.fishSpeechVoiceId;
  if (!referenceId) {
    throw new Error('FishSpeech TTS requires a voice/reference id.');
  }

  const format = options.forcePcm ? 'pcm' : config.fishSpeechFormat || 'mp3';
  const mimeType = getFishMimeType(format);
  const modelId = request.modelId?.trim() || config.fishSpeechModel || 's1';
  const latency = normalizeFishLatency(request.latency ?? config.fishSpeechLatency);
  const chunkLength = clampNumber(
    request.chunkLength ?? config.fishSpeechChunkLength,
    100,
    300,
    160,
  );
  const conditionOnPreviousChunks =
    request.conditionOnPreviousChunks ?? config.fishSpeechConditionOnPreviousChunks;

  const client = new FishAudioClient({
    apiKey: config.fishSpeechApiKey,
    ...(config.fishSpeechBaseUrl ? { baseUrl: config.fishSpeechBaseUrl } : {}),
  });

  const requestBody: FishTtsRequest = {
    text: '',
    reference_id: referenceId,
    format,
    sample_rate: config.fishSpeechSampleRate,
    mp3_bitrate: config.fishSpeechMp3Bitrate,
    latency,
    chunk_length: chunkLength,
    min_chunk_length: 20,
    condition_on_previous_chunks: conditionOnPreviousChunks,
    normalize: true,
    prosody: {
      speed: 1,
      volume: 0,
    },
  };

  let connection: FishRealtimeConnection | null = null;
  await withTimeout(
    new Promise<void>(async (resolve, reject) => {
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) {
          return;
        }
        settled = true;
        if (error) {
          connection?.close();
          reject(error);
        } else {
          resolve();
        }
      };

      try {
        connection = await client.textToSpeech.convertRealtime(
          requestBody,
          options.textStream ?? createSingleTextStream(request.text),
          modelId as Backends,
        );
        connection.on(RealtimeEvents.AUDIO_CHUNK, (audio: unknown) => {
          const chunk = bufferFromAudioChunk(audio);
          if (chunk?.length) {
            handlers.onAudioChunk({
              audio: chunk,
              mimeType,
              sampleRate: config.fishSpeechSampleRate,
            });
          }
        });
        connection.on(RealtimeEvents.ERROR, (error: unknown) => {
          finish(error instanceof Error ? error : new Error(String(error)));
        });
        connection.on(RealtimeEvents.CLOSE, () => {
          finish();
        });
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    }),
    () => connection?.close(),
  );
}

async function streamInworld(
  config: StreamBotConfig,
  request: RemoteTtsRequest & { text: string },
  handlers: StreamHandlers,
) {
  if (!config.inworldApiKey) {
    throw new Error('Inworld TTS requires INWORLD_API_KEY.');
  }

  const voiceId = request.voiceId?.trim() || config.inworldVoiceId;
  if (!voiceId) {
    throw new Error('Inworld TTS requires a voice id.');
  }

  const modelId = request.modelId?.trim() || config.inworldModelId || 'inworld-tts-2';
  const deliveryMode = normalizeInworldDeliveryMode(
    request.deliveryMode ?? config.inworldDeliveryMode,
  );
  const bufferCharThreshold = clampNumber(
    request.bufferCharThreshold ?? config.inworldBufferCharThreshold,
    20,
    1000,
    90,
  );
  const encoding = 'LINEAR16';
  const mimeType = getInworldMimeType(encoding);

  const client = InworldTTS({
    apiKey: config.inworldApiKey,
    timeout: REMOTE_TTS_TIMEOUT_MS,
    ...(config.inworldBaseUrl ? { baseUrl: config.inworldBaseUrl } : {}),
  });

  const streamingMode = normalizeRemoteTtsMode(request.streamingMode, 'inworld');
  const textChunks =
    streamingMode === 'sentence-chunks'
      ? splitTextForStreaming(request.text, bufferCharThreshold)
      : [request.text];

  for (const textChunk of textChunks) {
    const stream = client.stream({
      text: textChunk,
      voice: voiceId,
      model: modelId,
      encoding,
      sampleRate: config.inworldSampleRate,
      deliveryMode,
    });

    for await (const audio of stream) {
      const chunk = bufferFromAudioChunk(audio);
      if (chunk?.length) {
        handlers.onAudioChunk({
          audio: chunk,
          mimeType,
          sampleRate: config.inworldSampleRate,
        });
      }
    }
  }
}

export function normalizeFishSpeechBaseUrl(value: string) {
  return normalizeBaseUrl(value, '/v1/tts/live');
}

export function normalizeInworldBaseUrl(value: string) {
  return normalizeBaseUrl(
    normalizeBaseUrl(value, '/tts/v1/voice:stream') ?? value,
    '/tts/v1/voice:streamBidirectional',
  );
}
