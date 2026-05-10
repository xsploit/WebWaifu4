import 'dotenv/config';
import type {
  OpenAiReasoningEffort,
  OpenAiResponsesStateMode,
} from './ai/OpenAiResponsesProvider.js';

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
  aiProvider: 'mock' | 'openai-compatible' | 'openai-responses' | 'openai-responses-ws';
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
      ['ai', 'yourwifey', botUsername, ...configured]
        .map((alias) => alias.trim().toLowerCase().replace(/^@/, ''))
        .filter(Boolean),
    ),
  );
}

function parseAiProvider(): StreamBotConfig['aiProvider'] {
  const raw = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (raw === 'openai-compatible' || raw === 'openai-responses' || raw === 'openai-responses-ws') {
    return raw;
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

  return {
    twitchChannel: process.env.TWITCH_CHANNEL?.trim() || 'subsect',
    twitchBotUsername,
    twitchOauthToken,
    twitchClientId: process.env.TWITCH_CLIENT_ID?.trim() ?? '',
    twitchBroadcasterId: process.env.TWITCH_BROADCASTER_ID?.trim() ?? '',
    twitchBotUserId: process.env.TWITCH_BOT_USER_ID?.trim() ?? '',
    twitchMock: booleanFromEnv('TWITCH_MOCK', true),
    sendTwitchReplies: booleanFromEnv('SEND_TWITCH_REPLIES', false),
    commandPrefixes: csvFromEnv('COMMAND_PREFIXES', ['!yw', '!yourwifey', '!waifu']),
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
      process.env.OPENAI_API_BASE_URL?.trim().replace(/\/+$/, '') ||
      process.env.AI_API_BASE_URL?.trim().replace(/\/+$/, '') ||
      (isOpenAiResponsesProvider ? 'https://api.openai.com/v1' : 'http://127.0.0.1:1234/v1'),
    aiApiKey: process.env.OPENAI_API_KEY?.trim() || process.env.AI_API_KEY?.trim() || '',
    aiModel:
      process.env.OPENAI_MODEL?.trim() ||
      process.env.AI_MODEL?.trim() ||
      (isOpenAiResponsesProvider ? 'gpt-5-nano' : 'local-model'),
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
    overlayPort: numberFromEnv('OVERLAY_PORT', 5173),
    botPort: numberFromEnv('BOT_PORT', 8787),
  };
}
