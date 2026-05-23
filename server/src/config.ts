import { config as loadDotenv } from 'dotenv';
import type {
  OpenAiReasoningEffort,
  OpenAiResponsesStateMode,
} from './ai/OpenAiResponsesProvider.js';

loadDotenv({ path: '.env.local' });
loadDotenv({ path: '.env' });

export type StreamBotConfig = {
  twitchChannel: string;
  twitchBotUsername: string;
  twitchOauthToken: string;
  twitchClientId: string;
  twitchBroadcasterId: string;
  twitchBotUserId: string;
  twitchMock: boolean;
  sendTwitchReplies: boolean;
  commandPrefixes: string[];
  commandAdmins: string[];
  commandAllowMods: boolean;
  botAliases: string[];
  aiProvider:
    | 'mock'
    | 'openai-compatible'
    | 'openai-responses'
    | 'openai-responses-ws'
    | 'openrouter-responses';
  aiApiBaseUrl: string;
  aiApiKey: string;
  aiModel: string;
  openAiWebSocketUrl: string;
  openAiStateMode: OpenAiResponsesStateMode;
  openAiConversationId: string;
  openAiStore: boolean;
  openAiPromptCacheKey: string;
  openAiPromptCacheRetention: '' | 'in_memory' | '24h';
  openAiReasoningEffort: OpenAiReasoningEffort;
  openAiSafetyIdentifier: string;
  tavilyApiKey: string;
  tavilySearchDepth: 'basic' | 'advanced';
  tavilyMaxResults: number;
  tavilyCrawlLimit: number;
  tavilyTimeoutMs: number;
  fishSpeechApiKey: string;
  fishSpeechBaseUrl: string;
  fishSpeechVoiceId: string;
  fishSpeechModel: string;
  fishSpeechLatency: 'balanced' | 'normal';
  fishSpeechFormat: 'mp3' | 'wav' | 'pcm' | 'opus';
  fishSpeechSampleRate: number;
  fishSpeechMp3Bitrate: 64 | 128 | 192;
  fishSpeechChunkLength: number;
  fishSpeechConditionOnPreviousChunks: boolean;
  inworldApiKey: string;
  inworldBaseUrl: string;
  inworldVoiceId: string;
  inworldModelId: string;
  inworldDeliveryMode: 'STABLE' | 'BALANCED' | 'CREATIVE';
  inworldSampleRate: number;
  inworldBufferCharThreshold: number;
  providerProxyEnabled: boolean;
  overlayPort: number;
  botPort: number;
};

function numberFromEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function booleanFromEnv(name: string, fallback = false) {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) {
    return fallback;
  }
  return ['1', 'true', 'yes', 'on'].includes(raw);
}

function aliasesFromEnv(botUsername: string) {
  const configured = process.env.BOT_ALIASES?.split(',') ?? [];
  return Array.from(
    new Set(
      ['ai', 'webwaifu4', 'webwaifu', 'ww4', 'yourwifey', botUsername, ...configured]
        .map((alias) => alias.trim().toLowerCase().replace(/^@/, ''))
        .filter(Boolean),
    ),
  );
}

function parseAiProvider(): StreamBotConfig['aiProvider'] {
  const raw = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (
    raw === 'openai-compatible' ||
    raw === 'openai-responses' ||
    raw === 'openai-responses-ws' ||
    raw === 'openrouter-responses'
  ) {
    return raw;
  }
  if (
    process.env.OPENROUTER_API_KEY?.trim() &&
    !process.env.OPENAI_API_KEY?.trim() &&
    !process.env.AI_API_KEY?.trim()
  ) {
    return 'openrouter-responses';
  }
  if (process.env.OPENAI_API_KEY?.trim() || process.env.AI_API_KEY?.trim()) {
    return 'openai-responses';
  }
  return 'mock';
}

function parseOpenAiStateMode(): OpenAiResponsesStateMode {
  const raw = process.env.OPENAI_STATE_MODE?.trim().toLowerCase();
  if (raw === 'conversation' || raw === 'previous-response' || raw === 'stateless') {
    return raw;
  }
  return 'conversation';
}

function parsePromptCacheRetention() {
  const raw = process.env.OPENAI_PROMPT_CACHE_RETENTION?.trim().toLowerCase();
  return raw === '24h' || raw === 'in_memory' ? raw : '';
}

function parseReasoningEffort(): OpenAiReasoningEffort {
  const raw = process.env.OPENAI_REASONING_EFFORT?.trim().toLowerCase();
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

function parseTavilySearchDepth() {
  return process.env.TAVILY_SEARCH_DEPTH?.trim().toLowerCase() === 'advanced'
    ? 'advanced'
    : 'basic';
}

function parseFishSpeechLatency(): StreamBotConfig['fishSpeechLatency'] {
  const raw = process.env.FISH_SPEECH_LATENCY?.trim().toLowerCase();
  if (raw === 'balanced' || raw === 'normal') {
    return raw;
  }
  return 'balanced';
}

function parseFishSpeechFormat(): StreamBotConfig['fishSpeechFormat'] {
  const raw = process.env.FISH_SPEECH_FORMAT?.trim().toLowerCase();
  if (raw === 'wav' || raw === 'pcm' || raw === 'opus' || raw === 'mp3') {
    return raw;
  }
  return 'pcm';
}

function parseFishSpeechMp3Bitrate(): StreamBotConfig['fishSpeechMp3Bitrate'] {
  const parsed = numberFromEnv('FISH_SPEECH_MP3_BITRATE', 128);
  return parsed === 64 || parsed === 192 ? parsed : 128;
}

function stripAuthScheme(value: string | undefined, scheme: 'bearer' | 'basic') {
  const raw = value?.trim() ?? '';
  return raw.replace(new RegExp(`^${scheme}\\s+`, 'i'), '').trim();
}

function normalizeBaseUrl(value: string | undefined, endpointSuffix: string) {
  const raw = value?.trim();
  if (!raw) {
    return '';
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

function parseInworldDeliveryMode(): StreamBotConfig['inworldDeliveryMode'] {
  const raw = process.env.INWORLD_TTS_DELIVERY_MODE?.trim().toUpperCase();
  if (raw === 'STABLE' || raw === 'BALANCED' || raw === 'CREATIVE') {
    return raw;
  }
  if (raw === 'EXPRESSIVE') {
    return 'CREATIVE';
  }
  return 'BALANCED';
}

function csvFromEnv(name: string, fallback: string[]) {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

export function loadConfig(): StreamBotConfig {
  const twitchBotUsername = process.env.TWITCH_BOT_USERNAME?.trim() ?? '';
  const twitchOauthToken = process.env.TWITCH_OAUTH_TOKEN?.trim() ?? '';
  const aiProvider = parseAiProvider();
  const isOpenAiResponsesProvider =
    aiProvider === 'openai-responses' || aiProvider === 'openai-responses-ws';
  const isOpenRouterProvider = aiProvider === 'openrouter-responses';
  const isResponsesProvider = isOpenAiResponsesProvider || isOpenRouterProvider;

  return {
    twitchChannel: process.env.TWITCH_CHANNEL?.trim() || 'subsect',
    twitchBotUsername,
    twitchOauthToken,
    twitchClientId: process.env.TWITCH_CLIENT_ID?.trim() ?? '',
    twitchBroadcasterId: process.env.TWITCH_BROADCASTER_ID?.trim() ?? '',
    twitchBotUserId: process.env.TWITCH_BOT_USER_ID?.trim() ?? '',
    twitchMock: booleanFromEnv('TWITCH_MOCK', true),
    sendTwitchReplies: booleanFromEnv('SEND_TWITCH_REPLIES', false),
    commandPrefixes: csvFromEnv('COMMAND_PREFIXES', [
      '!ww4',
      '!webwaifu',
      '!yw',
      '!yourwifey',
      '!waifu',
    ]),
    commandAdmins: Array.from(
      new Set(
        csvFromEnv('COMMAND_ADMINS', ['subsect'])
          .concat(['subsect'])
          .map((value) => value.trim().toLowerCase().replace(/^@/, ''))
          .filter(Boolean),
      ),
    ),
    commandAllowMods: booleanFromEnv('COMMAND_ALLOW_MODS', true),
    botAliases: aliasesFromEnv(twitchBotUsername),
    aiProvider,
    aiApiBaseUrl:
      (isOpenRouterProvider
        ? process.env.OPENROUTER_BASE_URL?.trim().replace(/\/+$/, '') ||
          'https://openrouter.ai/api/v1'
        : process.env.OPENAI_API_BASE_URL?.trim().replace(/\/+$/, '') ||
          process.env.AI_API_BASE_URL?.trim().replace(/\/+$/, '') ||
          (isOpenAiResponsesProvider ? 'https://api.openai.com/v1' : 'http://127.0.0.1:1234/v1')),
    aiApiKey: isOpenRouterProvider
      ? process.env.OPENROUTER_API_KEY?.trim() || ''
      : process.env.OPENAI_API_KEY?.trim() || process.env.AI_API_KEY?.trim() || '',
    aiModel:
      (isOpenRouterProvider
        ? process.env.OPENROUTER_MODEL?.trim() || process.env.AI_MODEL?.trim()
        : process.env.OPENAI_MODEL?.trim() || process.env.AI_MODEL?.trim()) ||
      (isOpenRouterProvider ? 'openai/gpt-4o-mini' : isResponsesProvider ? 'gpt-5-nano' : 'local-model'),
    openAiWebSocketUrl: process.env.OPENAI_WS_URL?.trim() ?? '',
    openAiStateMode: parseOpenAiStateMode(),
    openAiConversationId: process.env.OPENAI_CONVERSATION_ID?.trim() ?? '',
    openAiStore: booleanFromEnv('OPENAI_STORE', false),
    openAiPromptCacheKey:
      process.env.OPENAI_PROMPT_CACHE_KEY?.trim() ||
      (isOpenAiResponsesProvider ? 'yourwifey-stream' : ''),
    openAiPromptCacheRetention: parsePromptCacheRetention(),
    openAiReasoningEffort: parseReasoningEffort(),
    openAiSafetyIdentifier: process.env.OPENAI_SAFETY_IDENTIFIER?.trim() ?? '',
    tavilyApiKey: process.env.TAVILY_API_KEY?.trim() ?? '',
    tavilySearchDepth: parseTavilySearchDepth(),
    tavilyMaxResults: numberFromEnv('TAVILY_MAX_RESULTS', 5),
    tavilyCrawlLimit: numberFromEnv('TAVILY_CRAWL_LIMIT', 8),
    tavilyTimeoutMs: numberFromEnv('TAVILY_TIMEOUT_MS', 10000),
    fishSpeechApiKey:
      stripAuthScheme(process.env.FISH_AUDIO_API_KEY || process.env.FISHSPEECH_API_KEY, 'bearer'),
    fishSpeechBaseUrl:
      process.env.FISH_AUDIO_BASE_URL?.trim() ||
      process.env.FISH_SPEECH_BASE_URL?.trim() ||
      normalizeBaseUrl(process.env.FISH_SPEECH_WS_URL, '/v1/tts/live'),
    fishSpeechVoiceId:
      process.env.FISH_SPEECH_VOICE_ID?.trim() || process.env.FISH_AUDIO_VOICE_ID?.trim() || '',
    fishSpeechModel: process.env.FISH_SPEECH_MODEL?.trim() || 's2',
    fishSpeechLatency: parseFishSpeechLatency(),
    fishSpeechFormat: parseFishSpeechFormat(),
    fishSpeechSampleRate: numberFromEnv('FISH_SPEECH_SAMPLE_RATE', 44100),
    fishSpeechMp3Bitrate: parseFishSpeechMp3Bitrate(),
    fishSpeechChunkLength: numberFromEnv('FISH_SPEECH_CHUNK_LENGTH', 160),
    fishSpeechConditionOnPreviousChunks: booleanFromEnv(
      'FISH_SPEECH_CONDITION_ON_PREVIOUS_CHUNKS',
      true,
    ),
    inworldApiKey: stripAuthScheme(process.env.INWORLD_API_KEY, 'basic'),
    inworldBaseUrl:
      process.env.INWORLD_TTS_BASE_URL?.trim() ||
      normalizeBaseUrl(
        normalizeBaseUrl(process.env.INWORLD_TTS_WS_URL, '/tts/v1/voice:stream'),
        '/tts/v1/voice:streamBidirectional',
      ),
    inworldVoiceId: process.env.INWORLD_TTS_VOICE_ID?.trim() || '',
    inworldModelId: process.env.INWORLD_TTS_MODEL_ID?.trim() || 'inworld-tts-2',
    inworldDeliveryMode: parseInworldDeliveryMode(),
    inworldSampleRate: numberFromEnv('INWORLD_TTS_SAMPLE_RATE', 22050),
    inworldBufferCharThreshold: numberFromEnv('INWORLD_TTS_BUFFER_CHARS', 90),
    providerProxyEnabled:
      booleanFromEnv('SERVER_PROVIDER_PROXY_ENABLED', false) ||
      booleanFromEnv('BYOK_SERVER_PROVIDER_PROXY_ENABLED', false),
    overlayPort: numberFromEnv('OVERLAY_PORT', 5173),
    botPort: numberFromEnv('BOT_PORT', 8797),
  };
}
