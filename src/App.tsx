import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { ChatBar } from './components/chat/ChatBar';
import { ChatLog } from './components/chat/ChatLog';
import { VrmStage } from './components/VrmStage';
import { MenuFab } from './components/menu/MenuFab';
import { SettingsPanel } from './components/menu/SettingsPanel';
import {
  COMMON_RUN_MODELS,
  DEFAULT_MEMORY_AGENT_MODEL,
  DEFAULT_PERSONA,
  DEFAULT_RUN_MODEL,
  createDefaultAiSettings,
  createDefaultRelationshipMemory,
  createDefaultPersonas,
  createEmptyRuntimeContext,
  createDefaultUiState,
} from './lib/chat/defaults';
import { extractSpeakableChunks, getChunkRevealDelay } from './lib/chat/chunking';
import {
  buildMemoryAgentMessages,
  getMemoryAgentModelCandidates,
  shouldRunMemoryAgent,
} from './lib/chat/memory-agent';
import { updateRelationshipMemory } from './lib/chat/memory';
import { buildChatCompletionMessages, trimChatHistory } from './lib/chat/prompt';
import { loadPersistedChatState, savePersistedChatState } from './lib/chat/storage';
import type {
  AiSettings,
  ChatMessage,
  PersonaDraft,
  PersonaProfile,
  RelationshipMemory,
  RuntimeContextSnapshot,
} from './lib/chat/types';
import { createDefaultSequencerSettings, createDefaultVisualSettings } from './lib/menu/defaults';
import type {
  AnimationFormat,
  BundledVrmOption,
  ManualPlayRequest,
  SettingsTabId,
  VisualSettings,
} from './lib/menu/types';
import { fetchGameAssetBlob } from './lib/cdn/assets';
import {
  CUSTOM_RIKO_PIPER_VOICES,
  RIKO_PIPER_VOICE_KEY,
  cachePiperVoice,
  getStoredPiperVoiceKeys,
  listPiperVoices,
  loadPiperVoiceSession,
  NEURO_PIPER_VOICE_KEY,
} from './lib/tts/piper';
import type { PiperVoiceProfile, WordBoundary } from './lib/tts/piper';
import { getTtsManager } from './lib/tts/manager';
import {
  getOverlaySocketUrl,
  parseOverlayServerEvent,
  type OverlayServerEvent,
} from './lib/stream/overlay-events';
import { DirectTwitchIrcClient, type DirectTwitchChatMessage } from './lib/twitch/direct-irc';
import './style.css';

type SafeAreaInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

function getAnimationFormatFromFileName(fileName: string): AnimationFormat {
  const extension = fileName.split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'vrma':
      return 'vrma';
    case 'bvh':
      return 'bvh';
    case 'glb':
      return 'glb';
    case 'gltf':
      return 'gltf';
    default:
      return 'fbx';
  }
}

type PersonaScenePreset = {
  id: string;
  personaSelectors: string[];
  bundledModelId: string;
  ttsVoice: string;
  backgroundImage: string;
  backgroundOverlay: string;
  backgroundFilter: string;
  accent: string;
  border: string;
  panel: string;
  textMuted: string;
};

const DEFAULT_SAFE_AREA: SafeAreaInsets = {
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
};

const BUNDLED_VRM_MODELS: BundledVrmOption[] = [
  {
    id: 'riko-final-fixed-v2',
    label: 'Riko Final Fixed',
    assetPath: 'models/riko-final-fixed-v2.vrm',
  },
  {
    id: 'rikov343',
    label: 'RIKOV343',
    assetPath: 'models/rikov343.vrm',
  },
  {
    id: 'rikov3',
    label: 'RIKOV3',
    assetPath: 'models/rikov3.vrm',
  },
  {
    id: 'peakriko',
    label: 'Peak Riko',
    assetPath: 'models/peakriko.vrm',
  },
  {
    id: 'hikkyc2',
    label: 'Hikky Sample',
    assetPath: 'models/hikkyc2.vrm',
  },
  {
    id: 'neuro-sama',
    label: 'Neuro-sama',
    assetPath: 'models/neuro-sama.vrm',
  },
  {
    id: 'neuro-clown',
    label: 'Neuro Clown',
    assetPath: 'models/neuro-clown.vrm',
  },
];

const RIKO_BUNDLED_MODEL_ID = 'riko-final-fixed-v2';
const DEFAULT_BUNDLED_MODEL_ID = 'neuro-sama';
const PERSONA_SCENE_PRESETS: PersonaScenePreset[] = [
  {
    id: 'riko',
    personaSelectors: ['default-waifu', 'riko'],
    bundledModelId: RIKO_BUNDLED_MODEL_ID,
    ttsVoice: RIKO_PIPER_VOICE_KEY,
    backgroundImage: '/cdn-assets/backgrounds/red-stream-room.png',
    backgroundOverlay: 'linear-gradient(180deg, rgba(2, 2, 5, 0.03), rgba(9, 1, 3, 0.22))',
    backgroundFilter: 'saturate(1.08) brightness(0.9) contrast(1.04)',
    accent: '#ff4156',
    border: 'rgba(255, 69, 85, 0.34)',
    panel: 'rgba(8, 7, 10, 0.82)',
    textMuted: '#d7aaa4',
  },
  {
    id: 'neuro',
    personaSelectors: ['neuro-sama', 'neuro', 'neurosama'],
    bundledModelId: 'neuro-sama',
    ttsVoice: NEURO_PIPER_VOICE_KEY,
    backgroundImage: '/cdn-assets/backgrounds/neuro-bedroom.png',
    backgroundOverlay:
      'linear-gradient(180deg, rgba(255, 237, 245, 0.04), rgba(126, 43, 72, 0.16))',
    backgroundFilter: 'saturate(1.02) brightness(0.95) contrast(1.02)',
    accent: '#ff6fa6',
    border: 'rgba(255, 136, 177, 0.38)',
    panel: 'rgba(42, 20, 32, 0.76)',
    textMuted: '#f0b8ce',
  },
];
const PERSIST_DEBOUNCE_MS = 900;
const MEMORY_AGENT_DELAY_MS = 2500;
const OVERLAY_RECONNECT_MS = 3000;
const DIRECT_TWITCH_CHANNEL = (import.meta.env['VITE_TWITCH_CHANNEL'] || 'subsect').trim();
const DIRECT_TWITCH_CHAT_ENABLED = import.meta.env['VITE_DIRECT_TWITCH_CHAT'] !== 'false';
const STREAM_BOT_WS_ENABLED =
  import.meta.env['VITE_STREAM_BOT_WS_ENABLED'] === 'true' ||
  import.meta.env['VITE_OVERLAY_WS_ENABLED'] === 'true';
const DIRECT_COMMAND_PREFIXES = ['!yw', '!yourwifey', '!waifu'];
const CONFIGURED_OPENAI_MODEL = (
  import.meta.env['VITE_OPENAI_MODEL'] ||
  import.meta.env['VITE_AI_MODEL'] ||
  ''
).trim();
const AI_PROXY_URL = (import.meta.env['VITE_AI_PROXY_URL'] || '').trim();
const AI_PROXY_ENABLED =
  import.meta.env['VITE_AI_PROXY_ENABLED'] === 'true' || Boolean(AI_PROXY_URL);
const RUN_GAME_SDK_ENABLED = import.meta.env['VITE_RUN_GAME_SDK_ENABLED'] === 'true';
const BROWSER_URL_PARAMS =
  typeof window === 'undefined'
    ? new URLSearchParams()
    : new URLSearchParams(window.location.search);
const ROUTELET_MODE = BROWSER_URL_PARAMS.get('routelet') === '1';
const AUTO_RESUME_BROWSER_AUDIO =
  import.meta.env['VITE_AUTO_RESUME_AUDIO'] === 'true' || ROUTELET_MODE;
const ROUTELET_SAY_TEXT = ROUTELET_MODE
  ? (BROWSER_URL_PARAMS.get('routeletSay') ?? '').trim().slice(0, 240)
  : '';
const ROUTELET_SAY_DELAY_MS = ROUTELET_MODE
  ? Math.min(Math.max(Number(BROWSER_URL_PARAMS.get('routeletSayDelayMs') ?? 0) || 0, 0), 60000)
  : 0;

function getRouteletVisualSettings(settings: VisualSettings): VisualSettings {
  return {
    ...settings,
    postProcessingEnabled: false,
    outline: false,
    bloom: false,
    chroma: false,
    grain: false,
    glitch: false,
    fxaa: false,
    smaa: false,
    taa: false,
    bleach: false,
    colorCorr: false,
  };
}
const PIPER_TIMING_TICKS_PER_SECOND = 10000000;
const SUBTITLE_WORD_WINDOW = 14;
const SUBTITLE_CLEAR_DELAY_MS = 1200;
const STREAM_DISPLAY_TICK_MS = 22;
const STREAM_DISPLAY_CHARS_PER_TICK = 4;
const STREAM_DISPLAY_PUNCTUATION_PAUSE_MS = 70;
const TWITCH_ACTIVE_CHATTER_WINDOW_MS = 120000;
const TWITCH_DIRECT_CHATTER_LIMIT = 10;
const TWITCH_REPLY_GAP_MS = 2000;
const TWITCH_CONTEXT_LIMIT = 80;
const TWITCH_BATCH_DEFAULT_MAX_WAIT_MS = 30000;

type TwitchAiJob = {
  id: string;
  mode: 'direct' | 'batch';
  activeChatterCount: number;
  context: DirectTwitchChatMessage[];
  messages: DirectTwitchChatMessage[];
};

type AppCompletionMessage = {
  role: string;
  content: string;
};

type AppCompletionResponse = {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
};

type AiProxyStreamEvent = {
  type?: 'delta' | 'done' | 'error';
  delta?: string;
  error?: string;
  ok?: boolean;
  text?: string;
};

type StreamingSpeechPlayer = {
  finish: (finalText?: string) => Promise<string>;
  pushDelta: (delta: string) => void;
};

let runGameSdkPromise: Promise<typeof import('@series-inc/rundot-game-sdk/api').default> | null =
  null;

async function getRunGameSdk() {
  if (!RUN_GAME_SDK_ENABLED) {
    throw new Error('RUN.game SDK is disabled for standalone stream mode.');
  }

  runGameSdkPromise ??= import('@series-inc/rundot-game-sdk/api').then((module) => module.default);
  return runGameSdkPromise;
}

function mergeModels(...sources: Array<readonly string[]>) {
  const merged: string[] = [];
  const seen = new Set<string>();

  sources.forEach((source) => {
    source.forEach((value) => {
      const normalized = value.trim();
      if (!normalized || seen.has(normalized)) {
        return;
      }

      seen.add(normalized);
      merged.push(normalized);
    });
  });

  return merged;
}

function pickAvailableModel(
  preferredModel: string | undefined,
  availableModels: readonly string[],
  fallbackModel: string = DEFAULT_RUN_MODEL,
) {
  const normalizedPreferred = preferredModel?.trim();
  if (normalizedPreferred && availableModels.includes(normalizedPreferred)) {
    return normalizedPreferred;
  }

  const normalizedFallback = fallbackModel.trim();
  if (normalizedFallback && availableModels.includes(normalizedFallback)) {
    return normalizedFallback;
  }

  return availableModels[0]?.trim() ?? normalizedPreferred ?? normalizedFallback;
}

function sanitizeAiModels(current: AiSettings, availableModels: readonly string[]) {
  const nextModel = pickAvailableModel(current.model, availableModels, DEFAULT_RUN_MODEL);
  const nextMemoryAgentModel = pickAvailableModel(
    current.memoryAgentModel,
    availableModels,
    pickAvailableModel(DEFAULT_MEMORY_AGENT_MODEL, availableModels, nextModel),
  );

  return {
    ...current,
    model: nextModel,
    memoryAgentModel: nextMemoryAgentModel,
  };
}

function createChatMessage(role: ChatMessage['role'], content: string): ChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    createdAt: Date.now(),
  };
}

function getAiProxyUrl() {
  if (AI_PROXY_URL) {
    return AI_PROXY_URL;
  }

  const isLocalDev =
    ['localhost', '127.0.0.1', '0.0.0.0'].includes(window.location.hostname) ||
    window.location.hostname.endsWith('.local');
  const url = new URL('/ai/chat', window.location.href);
  if (isLocalDev && (url.port === '5173' || url.port === '4173')) {
    url.port = '8787';
  } else if (!isLocalDev) {
    url.pathname = '/api/ai/chat';
  }
  return url.toString();
}

function getClientAiRouteLabel() {
  return AI_PROXY_ENABLED ? `local AI proxy ${getAiProxyUrl()}` : 'RUN.game host AI';
}

async function readAiProxyStream(
  response: Response,
  onTextDelta?: (delta: string) => void,
): Promise<string> {
  if (!response.body) {
    throw new Error('Stream bot AI proxy did not return a readable stream.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let streamedText = '';
  let finalText = '';

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

    const event = JSON.parse(data) as AiProxyStreamEvent;
    if (event.type === 'error' || event.ok === false) {
      throw new Error(event.error ?? 'Stream bot AI proxy stream failed.');
    }
    if (event.type === 'delta' && event.delta) {
      streamedText += event.delta;
      onTextDelta?.(event.delta);
      return;
    }
    if (event.type === 'done') {
      finalText = event.text?.trim() || streamedText.trim();
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

  return finalText || streamedText.trim();
}

async function requestChatCompletion({
  activeChatters = 1,
  apiKey,
  disableState,
  maxTokens,
  messages,
  mode = 'direct',
  model,
  onTextDelta,
  stateKey,
  stateScope = 'chat',
  temperature,
}: {
  activeChatters?: number;
  apiKey?: string;
  disableState?: boolean;
  maxTokens: number;
  messages: AppCompletionMessage[];
  mode?: 'direct' | 'batch';
  model: string;
  onTextDelta?: (delta: string) => void;
  stateKey?: string;
  stateScope?: 'chat' | 'memory';
  temperature: number;
}): Promise<AppCompletionResponse> {
  if (!AI_PROXY_ENABLED) {
    const runGameSdk = await getRunGameSdk();
    return runGameSdk.ai.requestChatCompletionAsync({
      model,
      messages,
      maxTokens,
      temperature,
      ...(apiKey?.trim()
        ? {
            apiKey: apiKey.trim(),
          }
        : {}),
    }) as Promise<AppCompletionResponse>;
  }

  const response = await fetch(getAiProxyUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      activeChatters,
      disableState,
      maxTokens,
      messages,
      mode,
      model,
      stateKey,
      stateScope,
      stream: Boolean(onTextDelta),
      temperature,
    }),
  });

  if (!response.ok) {
    throw new Error(`Stream bot AI proxy failed with HTTP ${response.status}.`);
  }

  if (onTextDelta && response.headers.get('content-type')?.includes('text/event-stream')) {
    const text = await readAiProxyStream(response, onTextDelta);
    if (!text.trim()) {
      throw new Error('Stream bot AI proxy returned an empty response.');
    }

    return {
      choices: [
        {
          message: {
            content: text,
          },
        },
      ],
    };
  }

  const data = (await response.json()) as { ok?: boolean; text?: string; error?: string };
  if (!data.ok || !data.text?.trim()) {
    throw new Error(data.error ?? 'Stream bot AI proxy returned an empty response.');
  }

  return {
    choices: [
      {
        message: {
          content: data.text,
        },
      },
    ],
  };
}

function normalizeCommandSelector(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function resolveBundledModelId(selector: string, models: readonly BundledVrmOption[]) {
  const normalized = normalizeCommandSelector(selector);
  return (
    models.find(
      (model) =>
        normalizeCommandSelector(model.id) === normalized ||
        normalizeCommandSelector(model.label) === normalized ||
        normalizeCommandSelector(model.assetPath) === normalized,
    )?.id ?? null
  );
}

function resolveAnimationIndex(
  selector: string,
  playlist: readonly { id: string; name: string; url: string }[],
) {
  const trimmed = selector.trim();
  const numeric = Number.parseInt(trimmed, 10);
  if (Number.isFinite(numeric) && String(numeric) === trimmed) {
    const oneBasedIndex = numeric - 1;
    if (oneBasedIndex >= 0 && oneBasedIndex < playlist.length) {
      return oneBasedIndex;
    }
    if (numeric >= 0 && numeric < playlist.length) {
      return numeric;
    }
  }

  const normalized = normalizeCommandSelector(selector);
  const exactIndex = playlist.findIndex(
    (entry) =>
      normalizeCommandSelector(entry.id) === normalized ||
      normalizeCommandSelector(entry.name) === normalized,
  );
  if (exactIndex !== -1) {
    return exactIndex;
  }

  return playlist.findIndex(
    (entry) =>
      normalizeCommandSelector(entry.name).includes(normalized) ||
      normalizeCommandSelector(entry.id).includes(normalized) ||
      normalizeCommandSelector(entry.url).includes(normalized),
  );
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function tokenizeCommand(input: string) {
  const tokens: string[] = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(input)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[3] ?? '');
  }
  return tokens;
}

function parseCommandBoolean(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (['on', 'yes', 'true', '1', 'enable', 'enabled'].includes(normalized)) {
    return true;
  }
  if (['off', 'no', 'false', '0', 'disable', 'disabled'].includes(normalized)) {
    return false;
  }
  return null;
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function normalizeMentionTag(value: string) {
  return value
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/[^a-z0-9_]+/g, '');
}

function getPersonaMentionTags(persona: PersonaProfile | null) {
  const tags = new Set<string>(['riko', 'rico']);
  if (persona?.name) {
    tags.add(normalizeMentionTag(persona.name));
  }
  if (persona?.id) {
    tags.add(normalizeMentionTag(persona.id));
  }

  return [...tags].filter(Boolean);
}

function normalizePersonaSelector(value: string | undefined | null) {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/[^a-z0-9]+/g, '');
}

function personaMatchesScenePreset(persona: PersonaProfile | null, preset: PersonaScenePreset) {
  if (!persona) {
    return false;
  }

  const candidates = [persona.id, persona.name].map(normalizePersonaSelector);
  return preset.personaSelectors
    .map(normalizePersonaSelector)
    .some((selector) => selector && candidates.includes(selector));
}

function getPersonaScenePreset(persona: PersonaProfile | null) {
  return (
    PERSONA_SCENE_PRESETS.find((preset) => personaMatchesScenePreset(persona, preset)) ??
    PERSONA_SCENE_PRESETS[0]!
  );
}

function resolvePersonaSelector(selector: string, personas: readonly PersonaProfile[]) {
  const normalized = normalizePersonaSelector(selector);
  if (!normalized) {
    return null;
  }

  const exactPersona = personas.find((persona) =>
    [persona.id, persona.name].some(
      (candidate) => normalizePersonaSelector(candidate) === normalized,
    ),
  );
  if (exactPersona) {
    return exactPersona;
  }

  const preset = PERSONA_SCENE_PRESETS.find((entry) =>
    entry.personaSelectors.some((candidate) => normalizePersonaSelector(candidate) === normalized),
  );
  if (preset) {
    return personas.find((persona) => personaMatchesScenePreset(persona, preset)) ?? null;
  }

  return (
    personas.find((persona) =>
      [persona.id, persona.name].some((candidate) =>
        normalizePersonaSelector(candidate).includes(normalized),
      ),
    ) ?? null
  );
}

function getPersonaPrimaryMentionTag(persona: PersonaProfile | null) {
  return normalizeMentionTag(persona?.name ?? DEFAULT_PERSONA.name) || 'riko';
}

function normalizeStateKeyPart(value: string | undefined, fallback: string) {
  const key = (value || fallback)
    .trim()
    .toLowerCase()
    .replace(/^#/, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return key || fallback;
}

function getPersonaStateKey(persona: PersonaProfile | null) {
  return normalizeStateKeyPart(persona?.id || persona?.name, DEFAULT_PERSONA.id || 'riko');
}

function getTwitchConversationStateKey(channel: string, persona: PersonaProfile | null) {
  return `twitch:${normalizeStateKeyPart(channel, DIRECT_TWITCH_CHANNEL || 'subsect')}:persona:${getPersonaStateKey(persona)}`;
}

function getLocalConversationStateKey(persona: PersonaProfile | null) {
  return `local:persona:${getPersonaStateKey(persona)}`;
}

function getMemoryStateKey(baseStateKey: string) {
  return `memory:${baseStateKey}`.slice(0, 160);
}

function twitchMessageMentionsPersona(text: string, persona: PersonaProfile | null) {
  const tags = getPersonaMentionTags(persona);
  const mentions = new Set(
    Array.from(text.matchAll(/@([a-z0-9_][a-z0-9_-]*)/gi)).map((match) =>
      normalizeMentionTag(match[1] ?? ''),
    ),
  );

  return tags.some((tag) => mentions.has(tag));
}

function getTwitchBatchSize(activeChatters: number) {
  if (activeChatters <= 25) {
    return 10;
  }
  if (activeChatters <= 50) {
    return 20;
  }
  if (activeChatters <= 100) {
    return 50;
  }
  return 100;
}

function getTwitchBatchWaitMs(activeChatters: number) {
  return activeChatters > 100 ? 45000 : TWITCH_BATCH_DEFAULT_MAX_WAIT_MS;
}

function pruneActiveTwitchChatters(chatters: Map<string, number>, now: number) {
  for (const [user, lastSeenAt] of chatters) {
    if (now - lastSeenAt > TWITCH_ACTIVE_CHATTER_WINDOW_MS) {
      chatters.delete(user);
    }
  }
  return chatters.size;
}

function getSubtitleLine(text: string, wordBoundaries: WordBoundary[], elapsedSeconds: number) {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (wordBoundaries.length === 0) {
    return cleaned;
  }

  const elapsedTicks = elapsedSeconds * PIPER_TIMING_TICKS_PER_SECOND;
  const nextWordIndex = wordBoundaries.findIndex((boundary) => elapsedTicks < boundary.offset);
  const visibleCount = nextWordIndex === -1 ? wordBoundaries.length : Math.max(1, nextWordIndex);
  const start = Math.max(0, visibleCount - SUBTITLE_WORD_WINDOW);
  const visibleWords = wordBoundaries.slice(start, visibleCount).map((boundary) => boundary.word);

  return visibleWords.join(' ').trim() || cleaned;
}

function formatTwitchMessages(messages: DirectTwitchChatMessage[], limit: number) {
  return messages
    .slice(-limit)
    .map((message) => {
      const text = message.text.replace(/\s+/g, ' ').trim();
      return `${message.displayName}: ${text}`;
    })
    .join('\n');
}

function buildTwitchAiPrompt(job: TwitchAiJob, persona: PersonaProfile | null) {
  const personaName = persona?.name ?? DEFAULT_PERSONA.name;
  const recentContext = formatTwitchMessages(job.context, 18);

  if (job.mode === 'direct') {
    const [target] = job.messages;
    return [
      `Live Twitch chat mode: tagged queue for ${personaName}.`,
      `Approx active chatters in the last two minutes: ${job.activeChatterCount}.`,
      `Viewer ${target?.displayName ?? 'chat'} tagged you: "${target?.text ?? ''}"`,
      'Reply directly to that viewer in one or two short spoken sentences.',
      'Do not mention command syntax, queues, batching, or system internals.',
      recentContext ? `Recent chat context:\n${recentContext}` : null,
    ]
      .filter((value): value is string => Boolean(value))
      .join('\n\n');
  }

  return [
    `Live Twitch chat mode: balanced batch for ${personaName}.`,
    `Approx active chatters in the last two minutes: ${job.activeChatterCount}.`,
    'The chat is busy, so answer the overall energy or strongest shared topic instead of replying to every line.',
    'Keep it stream-safe and concise: one or two spoken sentences.',
    `Current batch:\n${formatTwitchMessages(job.messages, 30)}`,
    recentContext ? `Recent chat context:\n${recentContext}` : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join('\n\n');
}

function getRunAiErrorMessage(error: unknown, context: 'chat' | 'models' = 'chat') {
  if (!(error instanceof Error)) {
    return context === 'models'
      ? 'RUN AI model list unavailable right now.'
      : 'RUN AI request failed unexpectedly.';
  }

  const message = error.message.trim();
  const accessDenied =
    error.name === 'AccessDeniedError' ||
    message.includes('Access denied. Required tier: authenticated_18plus');

  if (accessDenied) {
    return context === 'models'
      ? 'RUN AI model list requires a logged-in RUN.game account. Sign in and refresh models.'
      : 'RUN AI now requires a logged-in RUN.game account. Sign in and retry.';
  }

  if (message.includes('Failed to process AI completion request')) {
    return 'RUN AI host rejected the completion request. Refresh the session and retry.';
  }

  if (message.includes('HTTP error! status: 500')) {
    return context === 'models'
      ? 'RUN AI model list failed with a server error.'
      : 'RUN AI backend returned a server error while generating a reply.';
  }

  return (
    message ||
    (context === 'models'
      ? 'RUN AI model list unavailable right now.'
      : 'RUN AI request failed unexpectedly.')
  );
}

function mergeRelationshipMemoryInWorker(
  worker: Worker,
  currentMemory: RelationshipMemory,
  rawContent: string,
  targetTurnCount: number,
) {
  return new Promise<RelationshipMemory>((resolve, reject) => {
    const requestId = `memory-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const cleanup = () => {
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleError);
    };

    const handleMessage = (event: MessageEvent<{ id?: string; memory?: RelationshipMemory }>) => {
      if (event.data?.id !== requestId || !event.data.memory) {
        return;
      }

      cleanup();
      resolve(event.data.memory);
    };

    const handleError = (error: ErrorEvent) => {
      cleanup();
      reject(error.error ?? new Error(error.message));
    };

    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', handleError);
    worker.postMessage({
      id: requestId,
      type: 'merge',
      currentMemory,
      rawContent,
      targetTurnCount,
    });
  });
}

function App() {
  const [safeArea, setSafeArea] = useState<SafeAreaInsets>(DEFAULT_SAFE_AREA);
  const [sceneActive, setSceneActive] = useState(true);
  const [menuOpen, setMenuOpen] = useState(() => createDefaultUiState().menuOpen);
  const [chatBarOpen, setChatBarOpen] = useState(false);
  const [chatLogOpen, setChatLogOpen] = useState(() => createDefaultUiState().chatLogOpen);
  const [activeTab, setActiveTab] = useState<SettingsTabId>('vrm');
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const [currentBundledModelId, setCurrentBundledModelId] =
    useState<string>(DEFAULT_BUNDLED_MODEL_ID);
  const [manualPlayRequest, setManualPlayRequest] = useState<ManualPlayRequest | null>(null);
  const [visualSettings, setVisualSettings] = useState(createDefaultVisualSettings);
  const [sequencerSettings, setSequencerSettings] = useState(createDefaultSequencerSettings);
  const [personas, setPersonas] = useState<PersonaProfile[]>(createDefaultPersonas);
  const [activePersonaId, setActivePersonaId] = useState(DEFAULT_PERSONA.id);
  const [aiSettings, setAiSettings] = useState<AiSettings>(createDefaultAiSettings);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState(() => createDefaultUiState().chatDraft);
  const [chatGenerating, setChatGenerating] = useState(false);
  const [chatDisplayOverrides, setChatDisplayOverrides] = useState<Record<string, string>>({});
  const [twitchChannel, setTwitchChannel] = useState(DIRECT_TWITCH_CHANNEL);
  const [twitchConnectionLabel, setTwitchConnectionLabel] = useState(
    DIRECT_TWITCH_CHAT_ENABLED ? 'Connecting' : 'Offline',
  );
  const [twitchActiveChatterCount, setTwitchActiveChatterCount] = useState(0);
  const [runtimeContext, setRuntimeContext] =
    useState<RuntimeContextSnapshot>(createEmptyRuntimeContext);
  const [relationshipMemory, setRelationshipMemory] = useState<RelationshipMemory>(
    createDefaultRelationshipMemory,
  );
  const [availableModels, setAvailableModels] = useState<string[]>(() => [...COMMON_RUN_MODELS]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [memoryAgentBusy, setMemoryAgentBusy] = useState(false);
  const [memoryAgentStatus, setMemoryAgentStatus] = useState('Diary idle.');
  const [ttsVoices, setTtsVoices] = useState<PiperVoiceProfile[]>(() => [
    ...CUSTOM_RIKO_PIPER_VOICES,
  ]);
  const [ttsCachedVoiceKeys, setTtsCachedVoiceKeys] = useState<string[]>([]);
  const [ttsVoicesLoading, setTtsVoicesLoading] = useState(false);
  const [ttsVoicesError, setTtsVoicesError] = useState<string | null>(null);
  const [ttsBusy, setTtsBusy] = useState(false);
  const [ttsStatus, setTtsStatus] = useState('Voice idle.');
  const [ttsActiveVoiceKey, setTtsActiveVoiceKey] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [subtitleText, setSubtitleText] = useState('');
  const blobAnimationUrlsRef = useRef<Set<string>>(new Set());
  const bundledModelUrlCacheRef = useRef<Map<string, string>>(new Map());
  const didHydrateAvatarRef = useRef(false);
  const ttsWarmVoicesRef = useRef<Set<string>>(new Set());
  const assistantRenderRunRef = useRef(0);
  const chatRequestRunRef = useRef(0);
  const chatHistoryRef = useRef<ChatMessage[]>([]);
  const relationshipMemoryRef = useRef<RelationshipMemory>(createDefaultRelationshipMemory());
  const aiSettingsRef = useRef<AiSettings>(createDefaultAiSettings());
  const availableModelsRef = useRef<string[]>([...COMMON_RUN_MODELS]);
  const sequencerSettingsRef = useRef(createDefaultSequencerSettings());
  const directTwitchClientRef = useRef<DirectTwitchIrcClient | null>(null);
  const directTwitchCommandHandlerRef = useRef<(message: DirectTwitchChatMessage) => boolean>(
    () => false,
  );
  const directTwitchAiHandlerRef = useRef<(message: DirectTwitchChatMessage) => void>(() => {});
  const twitchActiveChattersRef = useRef<Map<string, number>>(new Map());
  const twitchContextRef = useRef<DirectTwitchChatMessage[]>([]);
  const twitchBatchRef = useRef<DirectTwitchChatMessage[]>([]);
  const twitchAiQueueRef = useRef<TwitchAiJob[]>([]);
  const twitchAiProcessingRef = useRef(false);
  const twitchLastReplyAtRef = useRef(0);
  const twitchBatchTimerRef = useRef<number | null>(null);
  const overlayAiStreamsRef = useRef<Map<string, { player: StreamingSpeechPlayer }>>(new Map());
  const subtitleDataRef = useRef<{ text: string; wordBoundaries: WordBoundary[] } | null>(null);
  const subtitleIntervalRef = useRef<number | null>(null);
  const subtitleClearTimeoutRef = useRef<number | null>(null);
  const startupStatusSentRef = useRef(false);
  const routeletSaySpokenRef = useRef(false);
  const appliedPersonaSceneKeyRef = useRef<string | null>(null);
  const memoryAgentWorkerRef = useRef<Worker | null>(null);
  const memoryAgentTimeoutRef = useRef<number | null>(null);
  const memoryAgentRunRef = useRef(0);
  const memoryAgentFailedModelsRef = useRef<Set<string>>(new Set());
  const ttsManager = useMemo(() => getTtsManager(), []);

  const activePersona = useMemo(
    () => personas.find((persona) => persona.id === activePersonaId) ?? personas[0] ?? null,
    [activePersonaId, personas],
  );
  const activePersonaScenePreset = useMemo(
    () => getPersonaScenePreset(activePersona ?? DEFAULT_PERSONA),
    [activePersona],
  );
  const activePersonaMentionTag = useMemo(
    () => `@${getPersonaPrimaryMentionTag(activePersona ?? DEFAULT_PERSONA)}`,
    [activePersona],
  );
  const twitchModeLabel =
    twitchConnectionLabel === 'Live'
      ? twitchActiveChatterCount > TWITCH_DIRECT_CHATTER_LIMIT
        ? 'Batch'
        : 'Queue'
      : twitchConnectionLabel;
  const latestAssistantMessage = useMemo(
    () => [...chatHistory].reverse().find((message) => message.role === 'assistant') ?? null,
    [chatHistory],
  );
  const selectedTtsVoice = useMemo(
    () => ttsVoices.find((voice) => voice.key === aiSettings.ttsVoice) ?? ttsVoices[0] ?? null,
    [aiSettings.ttsVoice, ttsVoices],
  );
  const selectedTtsCached = selectedTtsVoice
    ? ttsCachedVoiceKeys.includes(selectedTtsVoice.key)
    : false;
  const activeTtsVoice = useMemo(
    () => ttsVoices.find((voice) => voice.key === ttsActiveVoiceKey) ?? null,
    [ttsActiveVoiceKey, ttsVoices],
  );

  useEffect(() => {
    chatHistoryRef.current = chatHistory;
  }, [chatHistory]);

  useEffect(() => {
    relationshipMemoryRef.current = relationshipMemory;
  }, [relationshipMemory]);

  useEffect(() => {
    aiSettingsRef.current = aiSettings;
  }, [aiSettings]);

  useEffect(() => {
    availableModelsRef.current = availableModels;
  }, [availableModels]);

  useEffect(() => {
    sequencerSettingsRef.current = sequencerSettings;
  }, [sequencerSettings]);

  useEffect(() => {
    memoryAgentFailedModelsRef.current.clear();
  }, [aiSettings.memoryAgentModel]);

  useEffect(() => {
    setMenuOpen(false);
  }, []);

  useEffect(() => {
    const worker = new Worker(new URL('./lib/chat/memory-agent-worker.ts', import.meta.url), {
      type: 'module',
    });
    memoryAgentWorkerRef.current = worker;

    return () => {
      if (memoryAgentTimeoutRef.current !== null) {
        window.clearTimeout(memoryAgentTimeoutRef.current);
      }
      memoryAgentTimeoutRef.current = null;
      memoryAgentRunRef.current += 1;
      worker.terminate();
      memoryAgentWorkerRef.current = null;
    };
  }, []);

  const shellStyle = useMemo(
    () =>
      ({
        '--safe-top': `${safeArea.top}px`,
        '--safe-right': `${safeArea.right}px`,
        '--safe-bottom': `${safeArea.bottom}px`,
        '--safe-left': `${safeArea.left}px`,
        '--stream-bg-image': `url("${activePersonaScenePreset.backgroundImage}")`,
        '--stream-bg-overlay': activePersonaScenePreset.backgroundOverlay,
        '--stream-bg-filter': activePersonaScenePreset.backgroundFilter,
        '--c-text-accent': activePersonaScenePreset.accent,
        '--c-border': activePersonaScenePreset.border,
        '--c-panel': activePersonaScenePreset.panel,
        '--text-muted': activePersonaScenePreset.textMuted,
      }) as CSSProperties,
    [activePersonaScenePreset, safeArea],
  );

  const loadAvailableModels = useCallback(async () => {
    setModelsLoading(true);
    setModelsError(null);

    try {
      if (AI_PROXY_ENABLED) {
        const proxyModels = mergeModels(
          CONFIGURED_OPENAI_MODEL ? [CONFIGURED_OPENAI_MODEL] : [],
          COMMON_RUN_MODELS,
        );
        setAvailableModels(proxyModels);
        setAiSettings((current) => sanitizeAiModels(current, proxyModels));
        return;
      }

      const runGameSdk = await getRunGameSdk();
      const fetchedModels = mergeModels(
        CONFIGURED_OPENAI_MODEL ? [CONFIGURED_OPENAI_MODEL] : [],
        await runGameSdk.ai.getAvailableCompletionModels(),
      );
      const resolvedModels = fetchedModels.length > 0 ? fetchedModels : [...COMMON_RUN_MODELS];

      setAvailableModels(resolvedModels);
      setAiSettings((current) => sanitizeAiModels(current, resolvedModels));
    } catch (error) {
      const message = getRunAiErrorMessage(error, 'models');
      setModelsError(message);
      const fallbackModels = mergeModels(
        CONFIGURED_OPENAI_MODEL ? [CONFIGURED_OPENAI_MODEL] : [],
        COMMON_RUN_MODELS,
      );
      setAvailableModels(fallbackModels);
      setAiSettings((current) => sanitizeAiModels(current, fallbackModels));
    } finally {
      setModelsLoading(false);
    }
  }, []);

  const stopTtsPlayback = useCallback(() => {
    ttsManager.stop();
  }, [ttsManager]);

  const clearChatDisplayOverride = useCallback((messageId: string) => {
    setChatDisplayOverrides((current) => {
      if (!(messageId in current)) {
        return current;
      }

      const next = { ...current };
      delete next[messageId];
      return next;
    });
  }, []);

  const cancelAssistantPresentation = useCallback(
    (stopAudio = false) => {
      assistantRenderRunRef.current += 1;
      chatRequestRunRef.current += 1;
      memoryAgentRunRef.current += 1;
      if (memoryAgentTimeoutRef.current !== null) {
        window.clearTimeout(memoryAgentTimeoutRef.current);
        memoryAgentTimeoutRef.current = null;
      }
      setChatDisplayOverrides({});
      if (stopAudio) {
        stopTtsPlayback();
      }
    },
    [stopTtsPlayback],
  );

  const refreshStoredTtsVoices = useCallback(async () => {
    try {
      setTtsCachedVoiceKeys(await getStoredPiperVoiceKeys());
    } catch (error) {
      console.warn('[TTS] Could not read cached Piper voices', error);
    }
  }, []);

  const loadTtsVoices = useCallback(async () => {
    setTtsVoicesLoading(true);
    setTtsVoicesError(null);

    try {
      const voices = await listPiperVoices();
      setTtsVoices(voices);
      setAiSettings((current) => ({
        ...current,
        ttsVoice: voices.some((voice) => voice.key === current.ttsVoice)
          ? current.ttsVoice
          : (voices[0]?.key ?? current.ttsVoice),
      }));
      setTtsStatus('Piper voices ready.');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Voice registry unavailable right now.';
      setTtsVoicesError(message);
      setTtsVoices([...CUSTOM_RIKO_PIPER_VOICES]);
      setTtsStatus(`Voice fallback active: ${message}`);
    } finally {
      await refreshStoredTtsVoices();
      setTtsVoicesLoading(false);
    }
  }, [refreshStoredTtsVoices]);

  const speakWithPiper = useCallback(
    async (text: string, label: string) => {
      const content = text.trim();
      if (!content || !selectedTtsVoice) {
        return;
      }

      setTtsBusy(true);
      setTtsVoicesError(null);
      setTtsStatus(`Synthesizing ${selectedTtsVoice.name}...`);

      try {
        ttsManager.enableTts = aiSettings.ttsEnabled;
        await ttsManager.speakPiperText(content, selectedTtsVoice.key);
        setTtsActiveVoiceKey(selectedTtsVoice.key);
        await refreshStoredTtsVoices();
        setTtsStatus(`${label} finished.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown Piper synthesis failure.';
        setTtsVoicesError(message);
        setTtsStatus(`TTS failed: ${message}`);
        console.error('[TTS] Piper synthesis failed:', error);
      } finally {
        setTtsBusy(false);
      }
    },
    [aiSettings.ttsEnabled, refreshStoredTtsVoices, selectedTtsVoice, ttsManager],
  );

  useEffect(() => {
    if (!ROUTELET_MODE) {
      return;
    }

    window.__yourwifeyRouteletSpeak = (text: string) =>
      speakWithPiper(String(text ?? '').slice(0, 240), 'routelet speech');

    return () => {
      delete window.__yourwifeyRouteletSpeak;
    };
  }, [speakWithPiper]);

  const updateAssistantMessageContent = useCallback((messageId: string, content: string) => {
    setChatHistory((current) =>
      trimChatHistory(
        current.map((message) =>
          message.id === messageId
            ? {
                ...message,
                content,
              }
            : message,
        ),
      ),
    );
  }, []);

  const createStreamingAssistantPlayer = useCallback(
    (assistantMessage: ChatMessage, shouldSpeak: boolean, label: string) => {
      const thisRun = ++assistantRenderRunRef.current;
      const voice = selectedTtsVoice;
      const canSpeak = shouldSpeak && Boolean(voice);
      let fullText = '';
      let displayText = '';
      let queuedDisplayText = '';
      let displayPumpTimer: number | null = null;
      let finalDisplayPending = false;
      let pendingText = '';
      let sawDelta = false;
      let queuedSpeech = false;
      const speechPromises: Promise<void>[] = [];
      const displaySettledResolvers: Array<() => void> = [];

      if (canSpeak) {
        ttsManager.enableTts = aiSettings.ttsEnabled;
        ttsManager.resetSpeechQueue();
        setTtsBusy(true);
        setTtsVoicesError(null);
        setTtsActiveVoiceKey(voice!.key);
        setTtsStatus(`Streaming ${voice!.name}...`);
      }

      const isStale = () => assistantRenderRunRef.current !== thisRun;

      const resolveDisplaySettled = () => {
        while (displaySettledResolvers.length > 0) {
          displaySettledResolvers.shift()?.();
        }
      };

      const waitForDisplaySettled = () => {
        if (!queuedDisplayText && displayPumpTimer === null) {
          return Promise.resolve();
        }

        return new Promise<void>((resolve) => {
          displaySettledResolvers.push(resolve);
        });
      };

      const setDisplayOverride = (value: string) => {
        setChatDisplayOverrides((current) => ({
          ...current,
          [assistantMessage.id]: value,
        }));
      };

      setDisplayOverride('');

      const pumpDisplay = () => {
        displayPumpTimer = null;
        if (isStale()) {
          resolveDisplaySettled();
          return;
        }

        if (!queuedDisplayText) {
          resolveDisplaySettled();
          if (finalDisplayPending && displayText.trim() === fullText.trim()) {
            window.setTimeout(() => {
              if (!isStale()) {
                clearChatDisplayOverride(assistantMessage.id);
              }
            }, STREAM_DISPLAY_PUNCTUATION_PAUSE_MS);
          }
          return;
        }

        const nextText = queuedDisplayText.slice(0, STREAM_DISPLAY_CHARS_PER_TICK);
        queuedDisplayText = queuedDisplayText.slice(nextText.length);
        displayText += nextText;
        setDisplayOverride(displayText);

        const pause =
          /[.!?]["')\]]?\s*$/.test(displayText) && queuedDisplayText
            ? STREAM_DISPLAY_PUNCTUATION_PAUSE_MS
            : STREAM_DISPLAY_TICK_MS;
        displayPumpTimer = window.setTimeout(pumpDisplay, pause);
      };

      const queueDisplayText = (text: string) => {
        if (!text || isStale()) {
          return;
        }

        queuedDisplayText += text;
        if (displayPumpTimer === null) {
          displayPumpTimer = window.setTimeout(pumpDisplay, 0);
        }
      };

      const enqueueSpeech = (chunk: string) => {
        if (!canSpeak || !voice || isStale()) {
          return;
        }

        queuedSpeech = true;
        const task = ttsManager.queuePiperText(chunk, voice.key).catch((error) => {
          const message =
            error instanceof Error ? error.message : 'Unknown Piper synthesis failure.';
          setTtsVoicesError(message);
          setTtsStatus(`TTS failed: ${message}`);
          console.error('[TTS] Streaming Piper synthesis failed:', error);
        });
        speechPromises.push(task);
      };

      const consumeSpeakableChunks = (force = false) => {
        const extracted = extractSpeakableChunks(pendingText, force);
        pendingText = extracted.remaining;
        for (const chunk of extracted.chunks) {
          enqueueSpeech(chunk);
        }
      };

      const pushDelta = (delta: string) => {
        if (!delta || isStale()) {
          return;
        }

        sawDelta = true;
        fullText += delta;
        pendingText += delta;
        queueDisplayText(delta);
        consumeSpeakableChunks(false);
      };

      const finish = async (finalText?: string) => {
        const normalizedFinal = finalText?.trim() ?? '';
        if (!isStale() && normalizedFinal && normalizedFinal !== fullText.trim()) {
          if (!sawDelta) {
            fullText = normalizedFinal;
            pendingText = normalizedFinal;
            queueDisplayText(normalizedFinal);
          } else if (normalizedFinal.startsWith(fullText)) {
            const suffix = normalizedFinal.slice(fullText.length);
            fullText = normalizedFinal;
            pendingText += suffix;
            queueDisplayText(suffix);
          } else {
            const visiblePrefix = displayText + queuedDisplayText;
            fullText = normalizedFinal;
            pendingText = normalizedFinal;
            if (normalizedFinal.startsWith(visiblePrefix)) {
              queueDisplayText(normalizedFinal.slice(visiblePrefix.length));
            } else {
              displayText = '';
              queuedDisplayText = '';
              queueDisplayText(normalizedFinal);
            }
          }
        }
        if (!isStale() && fullText.trim()) {
          updateAssistantMessageContent(assistantMessage.id, fullText);
        }

        consumeSpeakableChunks(true);
        finalDisplayPending = true;
        void waitForDisplaySettled().then(() => {
          if (!isStale() && displayText.trim() === fullText.trim()) {
            clearChatDisplayOverride(assistantMessage.id);
          }
        });

        await waitForDisplaySettled();

        if (!isStale() && canSpeak) {
          if (speechPromises.length > 0) {
            await Promise.allSettled(speechPromises);
            if (!isStale() && queuedSpeech) {
              await refreshStoredTtsVoices();
            }
          }

          if (!isStale()) {
            setTtsBusy(false);
            setTtsStatus(`${label} finished.`);
          }
        }

        return fullText.trim() || normalizedFinal;
      };

      return { finish, pushDelta };
    },
    [
      aiSettings.ttsEnabled,
      refreshStoredTtsVoices,
      selectedTtsVoice,
      ttsManager,
      updateAssistantMessageContent,
      clearChatDisplayOverride,
    ],
  );

  const createStreamingSpeechPlayer = useCallback(
    (shouldSpeak: boolean, label: string): StreamingSpeechPlayer => {
      const thisRun = ++assistantRenderRunRef.current;
      const voice = selectedTtsVoice;
      const canSpeak = shouldSpeak && Boolean(voice);
      let fullText = '';
      let pendingText = '';
      let sawDelta = false;
      let queuedSpeech = false;
      const speechPromises: Promise<void>[] = [];

      if (canSpeak) {
        ttsManager.enableTts = aiSettings.ttsEnabled;
        ttsManager.resetSpeechQueue();
        setTtsBusy(true);
        setTtsVoicesError(null);
        setTtsActiveVoiceKey(voice!.key);
        setTtsStatus(`Streaming ${voice!.name}...`);
      }

      const isStale = () => assistantRenderRunRef.current !== thisRun;

      const enqueueSpeech = (chunk: string) => {
        if (!canSpeak || !voice || isStale()) {
          return;
        }

        queuedSpeech = true;
        const task = ttsManager.queuePiperText(chunk, voice.key).catch((error) => {
          const message =
            error instanceof Error ? error.message : 'Unknown Piper synthesis failure.';
          setTtsVoicesError(message);
          setTtsStatus(`TTS failed: ${message}`);
          console.error('[TTS] Streaming Piper synthesis failed:', error);
        });
        speechPromises.push(task);
      };

      const consumeSpeakableChunks = (force = false) => {
        const extracted = extractSpeakableChunks(pendingText, force);
        pendingText = extracted.remaining;
        for (const chunk of extracted.chunks) {
          enqueueSpeech(chunk);
        }
      };

      const pushDelta = (delta: string) => {
        if (!delta || isStale()) {
          return;
        }

        sawDelta = true;
        fullText += delta;
        pendingText += delta;
        consumeSpeakableChunks(false);
      };

      const finish = async (finalText?: string) => {
        const normalizedFinal = finalText?.trim() ?? '';
        if (!isStale() && normalizedFinal && normalizedFinal !== fullText.trim()) {
          if (!sawDelta) {
            fullText = normalizedFinal;
            pendingText = normalizedFinal;
          } else if (normalizedFinal.startsWith(fullText)) {
            const suffix = normalizedFinal.slice(fullText.length);
            fullText = normalizedFinal;
            pendingText += suffix;
          } else {
            fullText = normalizedFinal;
            pendingText = normalizedFinal;
          }
        }

        consumeSpeakableChunks(true);

        if (!isStale() && canSpeak) {
          if (speechPromises.length > 0) {
            await Promise.allSettled(speechPromises);
            if (!isStale() && queuedSpeech) {
              await refreshStoredTtsVoices();
            }
          }

          if (!isStale()) {
            setTtsBusy(false);
            setTtsStatus(`${label} finished.`);
          }
        }

        return fullText.trim() || normalizedFinal;
      };

      return { finish, pushDelta };
    },
    [aiSettings.ttsEnabled, refreshStoredTtsVoices, selectedTtsVoice, ttsManager],
  );

  const handleCacheTtsVoice = useCallback(async () => {
    if (!selectedTtsVoice) {
      setTtsStatus('Pick a Piper voice first.');
      return;
    }

    assistantRenderRunRef.current += 1;
    ttsManager.stop();
    setTtsBusy(true);
    setTtsVoicesError(null);
    setTtsStatus(`Loading ${selectedTtsVoice.name} model...`);

    try {
      ttsManager.enableTts = aiSettings.ttsEnabled;
      const audioState = await ttsManager.primeAudio();
      await cachePiperVoice(selectedTtsVoice.key);
      setTtsStatus(`Activating ${selectedTtsVoice.name} model...`);
      await loadPiperVoiceSession(selectedTtsVoice.key);
      setTtsActiveVoiceKey(selectedTtsVoice.key);
      await refreshStoredTtsVoices();
      setTtsStatus(`${selectedTtsVoice.name} model loaded. Audio ${audioState}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Voice model load failed.';
      setTtsVoicesError(message);
      setTtsStatus(`Voice load failed: ${message}`);
      console.error('[TTS] Voice model load failed:', error);
    } finally {
      setTtsBusy(false);
    }
  }, [aiSettings.ttsEnabled, refreshStoredTtsVoices, selectedTtsVoice, ttsManager]);

  const handleSelectTtsVoice = useCallback(
    (voiceId: string) => {
      assistantRenderRunRef.current += 1;
      ttsManager.stop();
      setTtsBusy(false);
      setTtsVoicesError(null);
      setAiSettings((current) => ({
        ...current,
        ttsVoice: voiceId,
      }));

      const nextVoice = ttsVoices.find((voice) => voice.key === voiceId);
      const activeVoice = ttsVoices.find((voice) => voice.key === ttsActiveVoiceKey);
      if (ttsActiveVoiceKey === voiceId) {
        setTtsStatus(`${nextVoice?.name ?? voiceId} is the active Piper model.`);
        return;
      }

      setTtsStatus(
        `Selected ${nextVoice?.name ?? voiceId}. Active model is ${
          activeVoice?.name ?? 'none'
        }; Load Model or Test Voice to switch.`,
      );
    },
    [ttsActiveVoiceKey, ttsManager, ttsVoices],
  );

  const handleTestTtsVoice = useCallback(() => {
    if (!aiSettings.ttsEnabled) {
      setTtsStatus('Enable TTS first.');
      return;
    }

    if (!selectedTtsVoice) {
      setTtsStatus('Pick a Piper voice first.');
      return;
    }

    void speakWithPiper(
      `${selectedTtsVoice.name} voice check. This model is active now.`,
      `${selectedTtsVoice.name} test`,
    );
  }, [aiSettings.ttsEnabled, selectedTtsVoice, speakWithPiper]);

  const handleSpeakLastReply = useCallback(() => {
    if (!aiSettings.ttsEnabled) {
      setTtsStatus('Enable TTS first.');
      return;
    }

    if (!latestAssistantMessage) {
      setTtsStatus('No assistant reply to speak yet.');
      return;
    }

    void speakWithPiper(latestAssistantMessage.content, 'latest reply');
  }, [aiSettings.ttsEnabled, latestAssistantMessage, speakWithPiper]);

  useEffect(() => {
    if (
      !hydrated ||
      !ROUTELET_SAY_TEXT ||
      routeletSaySpokenRef.current ||
      !aiSettings.ttsEnabled ||
      !selectedTtsVoice
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (routeletSaySpokenRef.current) {
        return;
      }

      routeletSaySpokenRef.current = true;
      void speakWithPiper(ROUTELET_SAY_TEXT, 'routelet smoke line');
    }, ROUTELET_SAY_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [aiSettings.ttsEnabled, hydrated, selectedTtsVoice, speakWithPiper]);

  const stopSubtitleTracking = useCallback((clearNow = false) => {
    if (subtitleIntervalRef.current !== null) {
      window.clearInterval(subtitleIntervalRef.current);
      subtitleIntervalRef.current = null;
    }
    if (subtitleClearTimeoutRef.current !== null) {
      window.clearTimeout(subtitleClearTimeoutRef.current);
      subtitleClearTimeoutRef.current = null;
    }
    if (clearNow) {
      subtitleDataRef.current = null;
      setSubtitleText('');
    }
  }, []);

  const refreshSubtitleFromAudio = useCallback(() => {
    const subtitleData = subtitleDataRef.current;
    if (!subtitleData) {
      return;
    }

    const elapsedSeconds = ttsManager.currentAudio?.currentTime ?? 0;
    setSubtitleText(
      getSubtitleLine(subtitleData.text, subtitleData.wordBoundaries, elapsedSeconds),
    );
  }, [ttsManager]);

  const startSubtitleTracking = useCallback(
    (subtitleData: { text: string; wordBoundaries: WordBoundary[] }) => {
      stopSubtitleTracking(false);
      subtitleDataRef.current = subtitleData;
      setSubtitleText(getSubtitleLine(subtitleData.text, subtitleData.wordBoundaries, 0));
      subtitleIntervalRef.current = window.setInterval(refreshSubtitleFromAudio, 80);
      refreshSubtitleFromAudio();
    },
    [refreshSubtitleFromAudio, stopSubtitleTracking],
  );

  const handleStopTts = useCallback(() => {
    stopTtsPlayback();
    stopSubtitleTracking(true);
    setTtsStatus('Playback stopped.');
  }, [stopSubtitleTracking, stopTtsPlayback]);

  const playAssistantResponse = useCallback(
    async (assistantMessage: ChatMessage, shouldSpeak: boolean, label: string) => {
      const content = assistantMessage.content.trim();
      if (!content) {
        clearChatDisplayOverride(assistantMessage.id);
        return;
      }

      const thisRun = ++assistantRenderRunRef.current;
      const extracted = extractSpeakableChunks(content, true);
      const revealChunks = [...extracted.chunks];
      const remainingChunk = extracted.remaining.trim();
      if (remainingChunk) {
        revealChunks.push(remainingChunk);
      }
      if (revealChunks.length === 0) {
        revealChunks.push(content);
      }

      const isStale = () => assistantRenderRunRef.current !== thisRun;

      if (!aiSettings.ttsSimulatedStreaming || revealChunks.length === 1) {
        clearChatDisplayOverride(assistantMessage.id);
        if (shouldSpeak) {
          await speakWithPiper(content, label);
        }
        if (!isStale()) {
          clearChatDisplayOverride(assistantMessage.id);
        }
        return;
      }

      let revealed = '';

      for (const chunk of revealChunks) {
        if (isStale()) {
          return;
        }

        revealed = revealed ? `${revealed} ${chunk}` : chunk;
        setChatDisplayOverrides((current) => ({
          ...current,
          [assistantMessage.id]: revealed,
        }));

        if (shouldSpeak) {
          await speakWithPiper(chunk, label);
        } else {
          await new Promise<void>((resolve) => {
            window.setTimeout(resolve, getChunkRevealDelay(chunk));
          });
        }
      }

      if (!isStale()) {
        clearChatDisplayOverride(assistantMessage.id);
      }
    },
    [aiSettings.ttsSimulatedStreaming, clearChatDisplayOverride, speakWithPiper],
  );

  useEffect(() => {
    const disposers: Array<{ unsubscribe?: () => void } | undefined> = [];
    let cancelled = false;

    if (RUN_GAME_SDK_ENABLED) {
      void getRunGameSdk()
        .then((runGameSdk) => {
          if (cancelled) {
            return;
          }

          const nextSafeArea = runGameSdk.system.getSafeArea();
          setSafeArea({
            top: nextSafeArea.top ?? 0,
            right: nextSafeArea.right ?? 0,
            bottom: nextSafeArea.bottom ?? 0,
            left: nextSafeArea.left ?? 0,
          });

          disposers.push(
            runGameSdk.lifecycles.onPause(() => setSceneActive(false)),
            runGameSdk.lifecycles.onSleep(() => setSceneActive(false)),
            runGameSdk.lifecycles.onResume(() => setSceneActive(true)),
            runGameSdk.lifecycles.onAwake(() => setSceneActive(true)),
          );
        })
        .catch(() => {});
    }

    return () => {
      cancelled = true;
      disposers.forEach((disposer) => disposer?.unsubscribe?.());
    };
  }, []);

  useEffect(() => {
    ttsManager.onSpeechStarted = () => {
      setTtsStatus('Playing speech.');
    };
    ttsManager.onSpeechFinished = () => {
      stopSubtitleTracking(false);
      subtitleClearTimeoutRef.current = window.setTimeout(() => {
        subtitleDataRef.current = null;
        setSubtitleText('');
        subtitleClearTimeoutRef.current = null;
      }, SUBTITLE_CLEAR_DELAY_MS);
      setTtsStatus('Speech finished.');
    };
    ttsManager.onLipSyncData = (data) => {
      startSubtitleTracking(data);
    };
    ttsManager.onError = (error) => {
      stopSubtitleTracking(true);
      setTtsVoicesError(error.message);
      setTtsStatus(`TTS failed: ${error.message}`);
    };

    return () => {
      ttsManager.onSpeechStarted = null;
      ttsManager.onSpeechFinished = null;
      ttsManager.onLipSyncData = null;
      ttsManager.onError = null;
      stopSubtitleTracking(true);
    };
  }, [startSubtitleTracking, stopSubtitleTracking, ttsManager]);

  useEffect(() => {
    let cancelled = false;
    const resumeBrowserAudio = async () => {
      try {
        const state = await ttsManager.primeAudio();
        if (!cancelled) {
          setTtsStatus(
            state === 'running'
              ? 'Browser audio ready.'
              : 'Browser audio armed; click once if playback is blocked.',
          );
        }
        return state;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Browser audio setup failed.';
        if (!cancelled) {
          setTtsVoicesError(message);
          setTtsStatus(`Browser audio failed: ${message}`);
        }
        throw error;
      }
    };

    window.__yourwifeyAudio = {
      getState: () => ttsManager.getAudioState(),
      getStream: () => ttsManager.getOutputStream(),
      resume: resumeBrowserAudio,
    };
    window.__YOURWIFEY_AUDIO_STREAM__ = () => ttsManager.getOutputStream();

    if (AUTO_RESUME_BROWSER_AUDIO) {
      void resumeBrowserAudio().catch(() => {});
    }

    const unlockOnce = () => {
      void resumeBrowserAudio().catch(() => {});
    };

    window.addEventListener('pointerdown', unlockOnce, { capture: true, once: true });
    window.addEventListener('keydown', unlockOnce, { capture: true, once: true });

    return () => {
      cancelled = true;
      window.removeEventListener('pointerdown', unlockOnce, { capture: true });
      window.removeEventListener('keydown', unlockOnce, { capture: true });
      delete window.__yourwifeyAudio;
      delete window.__YOURWIFEY_AUDIO_STREAM__;
    };
  }, [ttsManager]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateHostState() {
      const persistedState = await loadPersistedChatState();

      if (cancelled) {
        return;
      }

      setPersonas(persistedState.personas);
      setActivePersonaId(persistedState.activePersonaId);
      setAiSettings(
        CONFIGURED_OPENAI_MODEL
          ? {
              ...persistedState.aiSettings,
              memoryAgentModel: CONFIGURED_OPENAI_MODEL,
              model: CONFIGURED_OPENAI_MODEL,
            }
          : persistedState.aiSettings,
      );
      setChatHistory(trimChatHistory(persistedState.chatHistory));
      setRelationshipMemory(persistedState.relationshipMemory);
      setMenuOpen(false);
      setChatLogOpen(true);
      setChatInput(persistedState.uiState.chatDraft);
      setActiveTab(persistedState.activeTab);
      setCurrentBundledModelId(persistedState.currentBundledModelId || DEFAULT_BUNDLED_MODEL_ID);
      setSequencerSettings(persistedState.sequencerSettings);
      setVisualSettings(
        ROUTELET_MODE
          ? getRouteletVisualSettings(persistedState.visualSettings)
          : persistedState.visualSettings,
      );

      try {
        const runGameSdk = await getRunGameSdk();
        if (cancelled) {
          return;
        }
        setRuntimeContext({
          launchParams: { ...(runGameSdk.context.launchParams ?? {}) },
          shareParams: { ...(runGameSdk.context.shareParams ?? {}) },
          notificationParams: { ...(runGameSdk.context.notificationParams ?? {}) },
        });
      } catch {
        // RUN.game context is optional in standalone stream mode.
      }

      setHydrated(true);
      void loadAvailableModels();
      void loadTtsVoices();
    }

    void hydrateHostState();

    return () => {
      cancelled = true;
    };
  }, [loadAvailableModels, loadTtsVoices]);

  useEffect(() => {
    if (!personas.some((persona) => persona.id === activePersonaId)) {
      setActivePersonaId(personas[0]?.id ?? DEFAULT_PERSONA.id);
    }
  }, [activePersonaId, personas]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    let cancelled = false;
    let idleHandle: number | null = null;
    const persistTimer = window.setTimeout(() => {
      const persist = () => {
        if (cancelled) {
          return;
        }

        void savePersistedChatState({
          personas,
          activePersonaId: activePersona?.id ?? DEFAULT_PERSONA.id,
          aiSettings,
          chatHistory,
          relationshipMemory,
          uiState: {
            menuOpen: false,
            chatLogOpen,
            chatDraft: chatInput,
          },
          activeTab,
          currentBundledModelId,
          sequencerSettings,
          visualSettings,
        }).catch((error) => {
          console.warn('[App] Failed to persist chat state', error);
        });
      };

      if ('requestIdleCallback' in window) {
        idleHandle = window.requestIdleCallback(
          () => {
            persist();
          },
          { timeout: 1500 },
        );
        return;
      }

      persist();
    }, PERSIST_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(persistTimer);
      if (idleHandle !== null) {
        window.cancelIdleCallback(idleHandle);
      }
    };
  }, [
    activePersona,
    activeTab,
    aiSettings,
    chatHistory,
    chatInput,
    chatLogOpen,
    currentBundledModelId,
    hydrated,
    menuOpen,
    personas,
    relationshipMemory,
    sequencerSettings,
    visualSettings,
  ]);

  useEffect(() => {
    const currentBlobUrls = new Set(
      sequencerSettings.playlist.map((entry) => entry.url).filter((url) => url.startsWith('blob:')),
    );

    blobAnimationUrlsRef.current.forEach((url) => {
      if (!currentBlobUrls.has(url)) {
        URL.revokeObjectURL(url);
      }
    });
    blobAnimationUrlsRef.current = currentBlobUrls;
  }, [sequencerSettings.playlist]);

  useEffect(() => {
    return () => {
      assistantRenderRunRef.current += 1;
      if (
        modelUrl?.startsWith('blob:') &&
        ![...bundledModelUrlCacheRef.current.values()].includes(modelUrl)
      ) {
        URL.revokeObjectURL(modelUrl);
      }
      bundledModelUrlCacheRef.current.forEach((url) => {
        URL.revokeObjectURL(url);
      });
      bundledModelUrlCacheRef.current.clear();
      blobAnimationUrlsRef.current.forEach((url) => {
        URL.revokeObjectURL(url);
      });
    };
  }, []);

  useEffect(() => () => stopTtsPlayback(), [stopTtsPlayback]);

  useEffect(() => {
    ttsManager.enableTts = aiSettings.ttsEnabled;
    if (!aiSettings.ttsEnabled) {
      stopTtsPlayback();
    }
  }, [aiSettings.ttsEnabled, stopTtsPlayback, ttsManager]);

  useEffect(() => {
    ttsManager.setPlaybackRate(aiSettings.ttsPlaybackRate);
    ttsManager.setVolume(aiSettings.ttsVolume);
  }, [aiSettings.ttsPlaybackRate, aiSettings.ttsVolume, ttsManager]);

  useEffect(() => {
    if (
      !hydrated ||
      !aiSettings.ttsEnabled ||
      !selectedTtsVoice ||
      selectedTtsCached ||
      ttsBusy ||
      ttsVoicesLoading ||
      ttsWarmVoicesRef.current.has(selectedTtsVoice.key)
    ) {
      return;
    }

    ttsWarmVoicesRef.current.add(selectedTtsVoice.key);

    let cancelled = false;
    let timeoutId: number | null = null;
    const idleHandle =
      'requestIdleCallback' in window
        ? window.requestIdleCallback(
            async () => {
              if (cancelled) {
                return;
              }

              try {
                setTtsStatus(`Warming ${selectedTtsVoice.name} in background...`);
                await cachePiperVoice(selectedTtsVoice.key);
                await refreshStoredTtsVoices();
                if (!cancelled) {
                  setTtsStatus(`${selectedTtsVoice.name} ready.`);
                }
              } catch (error) {
                console.warn('[TTS] Background voice warm failed:', error);
                ttsWarmVoicesRef.current.delete(selectedTtsVoice.key);
              }
            },
            { timeout: 3000 },
          )
        : null;

    if (idleHandle === null) {
      timeoutId = window.setTimeout(() => {
        void (async () => {
          if (cancelled) {
            return;
          }

          try {
            setTtsStatus(`Warming ${selectedTtsVoice.name} in background...`);
            await cachePiperVoice(selectedTtsVoice.key);
            await refreshStoredTtsVoices();
            if (!cancelled) {
              setTtsStatus(`${selectedTtsVoice.name} ready.`);
            }
          } catch (error) {
            console.warn('[TTS] Background voice warm failed:', error);
            ttsWarmVoicesRef.current.delete(selectedTtsVoice.key);
          }
        })();
      }, 1200);
    }

    return () => {
      cancelled = true;
      if (idleHandle !== null) {
        window.cancelIdleCallback(idleHandle);
      }
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [
    aiSettings.ttsEnabled,
    hydrated,
    refreshStoredTtsVoices,
    selectedTtsCached,
    selectedTtsVoice,
    ttsBusy,
    ttsVoicesLoading,
  ]);

  const loadModelUrl = (nextUrl: string | null) => {
    setModelUrl((current) => {
      if (
        current &&
        current !== nextUrl &&
        current.startsWith('blob:') &&
        ![...bundledModelUrlCacheRef.current.values()].includes(current)
      ) {
        URL.revokeObjectURL(current);
      }
      return nextUrl;
    });
  };

  const prepareForModelSwap = useCallback(() => {
    setManualPlayRequest(null);
    setSequencerSettings((current) => ({
      ...current,
      playing: false,
      currentIndex: -1,
    }));
  }, []);

  const handleLoadBundledModel = useCallback(
    async (modelId: string) => {
      const bundledModel = BUNDLED_VRM_MODELS.find((model) => model.id === modelId);
      if (!bundledModel) {
        return;
      }

      prepareForModelSwap();
      let cachedUrl = bundledModelUrlCacheRef.current.get(bundledModel.id);
      if (!cachedUrl) {
        const assetBlob = await fetchGameAssetBlob(bundledModel.assetPath);
        cachedUrl = URL.createObjectURL(assetBlob);
        bundledModelUrlCacheRef.current.set(bundledModel.id, cachedUrl);
      }
      loadModelUrl(cachedUrl);
      setCurrentBundledModelId(bundledModel.id);
    },
    [prepareForModelSwap],
  );

  useEffect(() => {
    if (!hydrated || didHydrateAvatarRef.current) {
      return;
    }

    didHydrateAvatarRef.current = true;
    void handleLoadBundledModel(currentBundledModelId || DEFAULT_BUNDLED_MODEL_ID).catch(
      (error) => {
        console.error('[App] Failed to load hydrated avatar asset:', error);
      },
    );
  }, [currentBundledModelId, handleLoadBundledModel, hydrated]);

  const handleSavePersona = useCallback((draft: PersonaDraft, personaId?: string) => {
    const nextId = personaId ?? `persona-${Date.now()}`;
    const nextPersona: PersonaProfile = {
      id: nextId,
      ...draft,
    };

    setPersonas((current) =>
      current.some((persona) => persona.id === nextId)
        ? current.map((persona) => (persona.id === nextId ? nextPersona : persona))
        : [...current, nextPersona],
    );
    setActivePersonaId(nextId);
  }, []);

  const handleDeletePersona = useCallback((personaId: string) => {
    setPersonas((current) => {
      const next = current.filter((persona) => persona.id !== personaId);
      return next.length > 0 ? next : createDefaultPersonas();
    });
  }, []);

  const handleClearChat = useCallback(() => {
    cancelAssistantPresentation(true);
    setChatGenerating(false);
    setChatHistory([]);
  }, [cancelAssistantPresentation]);

  const handleClearDraft = useCallback(() => {
    setChatInput('');
  }, []);

  const handleClearMemory = useCallback(() => {
    setRelationshipMemory(createDefaultRelationshipMemory());
  }, []);

  const handleResetContext = useCallback(() => {
    cancelAssistantPresentation(true);
    setChatGenerating(false);
    setChatInput('');
    setChatHistory([]);
    setRelationshipMemory(createDefaultRelationshipMemory());
  }, [cancelAssistantPresentation]);

  const runRelationshipMemoryRefresh = useCallback(
    async (
      historySnapshot: ChatMessage[],
      memorySnapshot: RelationshipMemory,
      scheduledRun: number,
      reason: 'scheduled' | 'manual',
    ) => {
      const worker = memoryAgentWorkerRef.current;
      if (!worker) {
        return;
      }

      setMemoryAgentBusy(true);
      setMemoryAgentStatus(
        reason === 'manual' ? 'Running diary pass...' : 'Running background diary pass...',
      );

      try {
        const excludedModels = Array.from(memoryAgentFailedModelsRef.current);
        const modelCandidates = getMemoryAgentModelCandidates(
          availableModels,
          aiSettings.model,
          excludedModels,
          aiSettings.memoryAgentModel,
        );

        let rawContent = '';
        let lastError: unknown = null;

        for (const model of modelCandidates) {
          try {
            const response = await requestChatCompletion({
              model,
              messages: buildMemoryAgentMessages(
                historySnapshot,
                memorySnapshot,
                activePersona ?? DEFAULT_PERSONA,
              ),
              maxTokens: 260,
              stateKey: getMemoryStateKey(
                getTwitchConversationStateKey(twitchChannel, activePersona ?? DEFAULT_PERSONA),
              ),
              stateScope: 'memory',
              disableState: true,
              temperature: 0.35,
              apiKey: aiSettings.localDevApiKey,
            });

            if (memoryAgentRunRef.current !== scheduledRun) {
              return;
            }

            rawContent = response.choices[0]?.message.content?.trim() ?? '';
            if (rawContent) {
              setMemoryAgentStatus(`Diary model: ${model}`);
              break;
            }
          } catch (error) {
            lastError = error;
            memoryAgentFailedModelsRef.current.add(model.toLowerCase());
          }
        }

        if (memoryAgentRunRef.current !== scheduledRun) {
          return;
        }

        if (!rawContent) {
          if (lastError) {
            throw lastError;
          }
          setMemoryAgentStatus('Diary pass returned no JSON.');
          return;
        }

        const mergedMemory = await mergeRelationshipMemoryInWorker(
          worker,
          relationshipMemoryRef.current,
          rawContent,
          memorySnapshot.turnCount,
        );

        if (memoryAgentRunRef.current !== scheduledRun) {
          return;
        }

        setRelationshipMemory(mergedMemory);
        setMemoryAgentStatus('Diary updated.');
      } catch (error) {
        setMemoryAgentStatus('Diary pass failed.');
      } finally {
        if (memoryAgentRunRef.current === scheduledRun) {
          setMemoryAgentBusy(false);
        }
      }
    },
    [
      activePersona,
      aiSettings.localDevApiKey,
      aiSettings.memoryAgentModel,
      aiSettings.model,
      availableModels,
      twitchChannel,
    ],
  );

  const scheduleRelationshipMemoryRefresh = useCallback(
    (historySnapshot: ChatMessage[], memorySnapshot: RelationshipMemory) => {
      if (!shouldRunMemoryAgent(memorySnapshot)) {
        return;
      }

      if (memoryAgentTimeoutRef.current !== null) {
        window.clearTimeout(memoryAgentTimeoutRef.current);
      }

      const scheduledRun = ++memoryAgentRunRef.current;
      memoryAgentTimeoutRef.current = window.setTimeout(() => {
        memoryAgentTimeoutRef.current = null;
        void runRelationshipMemoryRefresh(
          historySnapshot,
          memorySnapshot,
          scheduledRun,
          'scheduled',
        );
      }, MEMORY_AGENT_DELAY_MS);
    },
    [runRelationshipMemoryRefresh],
  );

  const handleRunMemoryAgentNow = useCallback(() => {
    if (memoryAgentTimeoutRef.current !== null) {
      window.clearTimeout(memoryAgentTimeoutRef.current);
      memoryAgentTimeoutRef.current = null;
    }

    const historySnapshot = [...chatHistory];
    const memorySnapshot = relationshipMemoryRef.current;
    const scheduledRun = ++memoryAgentRunRef.current;
    void runRelationshipMemoryRefresh(historySnapshot, memorySnapshot, scheduledRun, 'manual');
  }, [chatHistory, runRelationshipMemoryRefresh]);

  const handleSendMessage = useCallback(
    async (overrideInput?: string) => {
      const message = (overrideInput ?? chatInput).trim();
      if (!message || chatGenerating) {
        return;
      }

      cancelAssistantPresentation(true);

      const selectedModel = pickAvailableModel(
        aiSettings.model,
        availableModels,
        DEFAULT_RUN_MODEL,
      );
      const userMessage = createChatMessage('user', message);
      const nextHistory = trimChatHistory([...chatHistory, userMessage]);
      const assistantMessage = createChatMessage('assistant', '');
      const streamingPlayer = createStreamingAssistantPlayer(
        assistantMessage,
        aiSettings.ttsEnabled && aiSettings.ttsAutoSpeak,
        `${activePersona?.name ?? DEFAULT_PERSONA.name} reply`,
      );
      const requestRun = ++chatRequestRunRef.current;

      setChatInput('');
      setChatHistory(trimChatHistory([...nextHistory, assistantMessage]));
      setChatGenerating(true);

      try {
        const response = await requestChatCompletion({
          model: selectedModel,
          messages: buildChatCompletionMessages({
            history: nextHistory,
            includeHostContext: aiSettings.includeHostContext,
            persona: activePersona ?? DEFAULT_PERSONA,
            relationshipMemory,
            runtimeContext,
          }),
          maxTokens: aiSettings.maxTokens,
          stateKey: getLocalConversationStateKey(activePersona ?? DEFAULT_PERSONA),
          stateScope: 'chat',
          onTextDelta: streamingPlayer.pushDelta,
          temperature: aiSettings.temperature,
          apiKey: aiSettings.localDevApiKey,
        });

        const assistantContent = await streamingPlayer.finish(response.choices[0]?.message.content);
        if (chatRequestRunRef.current !== requestRun) {
          return;
        }

        if (!assistantContent) {
          throw new Error('RUN AI returned an empty response.');
        }

        const completedAssistantMessage = {
          ...assistantMessage,
          content: assistantContent,
        };
        const updatedHistory = trimChatHistory([...nextHistory, completedAssistantMessage]);
        const nextRelationshipMemory = updateRelationshipMemory(
          relationshipMemory,
          updatedHistory,
          message,
        );
        setChatHistory(updatedHistory);
        setRelationshipMemory(nextRelationshipMemory);
        scheduleRelationshipMemoryRefresh(updatedHistory, nextRelationshipMemory);
        setChatGenerating(false);
      } catch (error) {
        if (chatRequestRunRef.current !== requestRun) {
          return;
        }

        const errorMessage = getRunAiErrorMessage(error, 'chat');

        setChatHistory((current) =>
          trimChatHistory(
            current.map((messageEntry) =>
              messageEntry.id === assistantMessage.id
                ? {
                    ...messageEntry,
                    content: `Request failed: ${errorMessage}`,
                  }
                : messageEntry,
            ),
          ),
        );
      } finally {
        setChatGenerating(false);
      }
    },
    [
      activePersona,
      aiSettings,
      availableModels,
      cancelAssistantPresentation,
      chatGenerating,
      chatHistory,
      chatInput,
      createStreamingAssistantPlayer,
      relationshipMemory,
      runtimeContext,
      scheduleRelationshipMemoryRefresh,
    ],
  );

  const appendSystemMessage = useCallback((content: string) => {
    setChatHistory((current) =>
      trimChatHistory([...current, createChatMessage('system', content)]),
    );
  }, []);

  useEffect(() => {
    if (!hydrated || startupStatusSentRef.current) {
      return;
    }

    startupStatusSentRef.current = true;
    appendSystemMessage(
      `[Startup] Client Twitch IRC ${DIRECT_TWITCH_CHAT_ENABLED ? `listening to #${DIRECT_TWITCH_CHANNEL}` : 'disabled'}; server Twitch is off by default. AI: ${getClientAiRouteLabel()}, model=${aiSettingsRef.current.model}. Browser audio stream exposed at window.__yourwifeyAudio.getStream(). Commands: !yw help, status, audio, state, state reset, refresh, channel <name>, persona <riko|neuro>, llm <model>, vrm <id>, camera close|full, anim <name|index>, tts on|off, autospeak on|off, say <text>, chat on|off.`,
    );
  }, [appendSystemMessage, hydrated]);

  useEffect(() => {
    if (!hydrated || !activePersona) {
      return;
    }

    const sceneKey = `${activePersona.id}:${activePersonaScenePreset.id}`;
    if (appliedPersonaSceneKeyRef.current === sceneKey) {
      return;
    }
    appliedPersonaSceneKeyRef.current = sceneKey;

    stopTtsPlayback();
    setAiSettings((current) =>
      current.ttsVoice === activePersonaScenePreset.ttsVoice
        ? current
        : {
            ...current,
            ttsVoice: activePersonaScenePreset.ttsVoice,
          },
    );

    if (currentBundledModelId !== activePersonaScenePreset.bundledModelId) {
      void handleLoadBundledModel(activePersonaScenePreset.bundledModelId).catch((error) => {
        console.error('[App] Failed to apply persona scene preset:', error);
        appendSystemMessage(
          `Persona scene failed: could not load ${activePersonaScenePreset.bundledModelId}.`,
        );
      });
    }
  }, [
    activePersona,
    activePersonaScenePreset,
    appendSystemMessage,
    currentBundledModelId,
    handleLoadBundledModel,
    hydrated,
    stopTtsPlayback,
  ]);

  const playAnimationByIndex = useCallback(
    (index: number) => {
      const entry = sequencerSettingsRef.current.playlist[index];
      if (!entry) {
        appendSystemMessage(`Stream command failed: animation ${index + 1} does not exist.`);
        return;
      }

      setManualPlayRequest({
        index,
        nonce: Date.now(),
      });
    },
    [appendSystemMessage],
  );

  const handleOverlayCommand = useCallback(
    (command: Extract<OverlayServerEvent, { type: 'overlay:command' }>['payload']) => {
      switch (command.action) {
        case 'reload':
          window.location.reload();
          break;
        case 'set-ai-model':
          setAvailableModels((current) =>
            current.includes(command.model) ? current : [...current, command.model],
          );
          setAiSettings((current) => ({
            ...current,
            model: command.model,
          }));
          appendSystemMessage(`Stream command: LLM model set to ${command.model}.`);
          break;
        case 'set-persona': {
          const nextPersona = resolvePersonaSelector(command.persona, personas);
          if (!nextPersona) {
            appendSystemMessage(`Stream command failed: unknown persona "${command.persona}".`);
            return;
          }

          setActivePersonaId(nextPersona.id);
          appendSystemMessage(`Stream command: persona set to ${nextPersona.name}.`);
          break;
        }
        case 'list-vrms':
          console.info('[StreamBot] Bundled VRMs:', BUNDLED_VRM_MODELS);
          appendSystemMessage(
            `Bundled VRMs: ${BUNDLED_VRM_MODELS.map((model) => model.id).join(', ')}`,
          );
          break;
        case 'load-vrm': {
          const modelId = resolveBundledModelId(command.model, BUNDLED_VRM_MODELS);
          if (!modelId) {
            appendSystemMessage(`Stream command failed: unknown VRM "${command.model}".`);
            return;
          }
          void handleLoadBundledModel(modelId).catch((error) => {
            console.error('[StreamBot] VRM command failed:', error);
            appendSystemMessage(`Stream command failed: could not load VRM ${modelId}.`);
          });
          break;
        }
        case 'set-camera-view':
          setVisualSettings((current) => ({
            ...current,
            cameraViewMode: command.viewMode,
          }));
          appendSystemMessage(
            `Stream command: camera set to ${command.viewMode === 'half-body' ? 'Half Body / Close' : 'Full Body'}.`,
          );
          break;
        case 'list-animations':
          console.info('[StreamBot] Animations:', sequencerSettingsRef.current.playlist);
          appendSystemMessage(
            `Animations: ${sequencerSettingsRef.current.playlist
              .map((entry, index) => `${index + 1}:${entry.name}`)
              .join(', ')}`,
          );
          break;
        case 'play-animation': {
          const index = resolveAnimationIndex(
            command.selector,
            sequencerSettingsRef.current.playlist,
          );
          if (index === -1) {
            appendSystemMessage(`Stream command failed: unknown animation "${command.selector}".`);
            return;
          }
          playAnimationByIndex(index);
          break;
        }
        case 'sequencer':
          if (command.command === 'start') {
            setSequencerSettings((current) => ({
              ...current,
              playing: true,
            }));
            break;
          }
          if (command.command === 'stop') {
            setSequencerSettings((current) => ({
              ...current,
              playing: false,
              currentIndex: -1,
            }));
            break;
          }
          if (command.command === 'next') {
            const playlist = sequencerSettingsRef.current.playlist;
            const enabledIndexes = playlist
              .map((entry, index) => ({ entry, index }))
              .filter(({ entry }) => entry.enabled)
              .map(({ index }) => index);
            if (enabledIndexes.length === 0) {
              appendSystemMessage('Stream command failed: no enabled animations.');
              return;
            }
            const currentPosition = enabledIndexes.indexOf(
              sequencerSettingsRef.current.currentIndex,
            );
            const nextIndex =
              enabledIndexes[(currentPosition + 1) % enabledIndexes.length] ?? enabledIndexes[0]!;
            playAnimationByIndex(nextIndex);
            break;
          }
          if (command.command === 'random') {
            const enabledIndexes = sequencerSettingsRef.current.playlist
              .map((entry, index) => ({ entry, index }))
              .filter(({ entry }) => entry.enabled)
              .map(({ index }) => index);
            if (enabledIndexes.length === 0) {
              appendSystemMessage('Stream command failed: no enabled animations.');
              return;
            }
            const randomIndex = enabledIndexes[Math.floor(Math.random() * enabledIndexes.length)]!;
            playAnimationByIndex(randomIndex);
          }
          break;
        case 'set-animation-speed':
          setSequencerSettings((current) => ({
            ...current,
            speed: clampNumber(command.speed, 0.1, 3),
          }));
          break;
        case 'set-animation-duration':
          setSequencerSettings((current) => ({
            ...current,
            duration: clampNumber(command.duration, 2, 120),
          }));
          break;
        case 'set-tts':
          setAiSettings((current) => ({
            ...current,
            ttsEnabled: command.enabled,
          }));
          break;
        case 'set-auto-speak':
          setAiSettings((current) => ({
            ...current,
            ttsAutoSpeak: command.enabled,
          }));
          break;
        case 'say': {
          const assistantMessage = createChatMessage('assistant', command.text);
          setChatHistory((current) => trimChatHistory([...current, assistantMessage]));
          void playAssistantResponse(
            assistantMessage,
            aiSettingsRef.current.ttsEnabled && aiSettingsRef.current.ttsAutoSpeak,
            `${activePersona?.name ?? DEFAULT_PERSONA.name} manual stream line`,
          );
          break;
        }
      }
    },
    [
      activePersona?.name,
      appendSystemMessage,
      handleLoadBundledModel,
      personas,
      playAnimationByIndex,
      playAssistantResponse,
    ],
  );

  const handleDirectTwitchCommand = useCallback(
    (message: DirectTwitchChatMessage) => {
      const text = message.text.trim();
      const lowerText = text.toLowerCase();
      const prefix = DIRECT_COMMAND_PREFIXES.find(
        (candidate) => lowerText === candidate || lowerText.startsWith(`${candidate} `),
      );
      if (!prefix) {
        return false;
      }

      const isController =
        message.user.toLowerCase() === 'subsect' || message.isBroadcaster || message.isMod;
      if (!isController) {
        console.info(`[DirectTwitch] Ignored command from ${message.displayName}.`);
        return true;
      }

      const commandText = text.slice(prefix.length).trim();
      const tokens = tokenizeCommand(commandText);
      const verb = (tokens.shift() ?? 'help').toLowerCase();
      const rest = tokens.join(' ').trim();
      const respond = (response: string) => {
        appendSystemMessage(`[Command] ${response}`);
      };
      const runOverlayCommand = (
        command: Extract<OverlayServerEvent, { type: 'overlay:command' }>['payload'],
        response: string,
      ) => {
        handleOverlayCommand(command);
        respond(response);
        return true;
      };

      if (verb === 'help' || verb === '?') {
        respond(
          'Commands: status, audio, state, state reset, refresh, channel <name>, persona <riko|neuro>, personas, llm <model>, vrm <id>, vrms, camera full|half|close, anim <name|index>, anims, anim start|stop|next|random, anim speed <n>, anim duration <sec>, tts on|off, autospeak on|off, say <text>, chat on|off.',
        );
        return true;
      }

      if (verb === 'status') {
        const activeChatters = pruneActiveTwitchChatters(
          twitchActiveChattersRef.current,
          Date.now(),
        );
        const currentChannel = directTwitchClientRef.current?.channel ?? twitchChannel;
        const chatStateKey = getTwitchConversationStateKey(
          currentChannel,
          activePersona ?? DEFAULT_PERSONA,
        );
        respond(
          `Direct Twitch IRC: #${currentChannel}, controller=subsect, activeChatters=${activeChatters}, aiQueue=${twitchAiQueueRef.current.length}, batchPending=${twitchBatchRef.current.length}, state=${chatStateKey}.`,
        );
        return true;
      }

      if (verb === 'audio') {
        const stream = ttsManager.getOutputStream();
        respond(
          `Browser audio: context=${ttsManager.getAudioState()}, streamTracks=${stream?.getAudioTracks().length ?? 0}, tts=${aiSettingsRef.current.ttsEnabled ? 'on' : 'off'}, autospeak=${aiSettingsRef.current.ttsAutoSpeak ? 'on' : 'off'}, volume=${aiSettingsRef.current.ttsVolume}.`,
        );
        return true;
      }

      if (['state', 'aistate', 'ai-state'].includes(verb)) {
        const subcommand = (tokens[0] ?? '').toLowerCase();
        if (['reset', 'clear', 'restart'].includes(subcommand)) {
          twitchAiQueueRef.current = [];
          twitchBatchRef.current = [];
          setRelationshipMemory(createDefaultRelationshipMemory());
          respond('Client AI queue and relationship state reset.');
          return true;
        }

        respond(
          `Client AI: route=${getClientAiRouteLabel()}, model=${aiSettingsRef.current.model}, state=${getTwitchConversationStateKey(directTwitchClientRef.current?.channel ?? twitchChannel, activePersona ?? DEFAULT_PERSONA)}, queue=${twitchAiQueueRef.current.length}, batchPending=${twitchBatchRef.current.length}.`,
        );
        return true;
      }

      if (
        ['resetstate', 'reset-state', 'reset-ai-state', 'clearstate', 'clear-state'].includes(verb)
      ) {
        twitchAiQueueRef.current = [];
        twitchBatchRef.current = [];
        setRelationshipMemory(createDefaultRelationshipMemory());
        respond('Client AI queue and relationship state reset.');
        return true;
      }

      if (['refresh', 'reload', 'restart'].includes(verb)) {
        return runOverlayCommand({ action: 'reload' }, 'Refreshing the overlay.');
      }

      if (['channel', 'join', 'room'].includes(verb) && rest) {
        const channel = rest.replace(/^#/, '').toLowerCase();
        directTwitchClientRef.current?.switchChannel(channel);
        setTwitchChannel(channel);
        respond(`Switching Twitch chat to #${channel}.`);
        return true;
      }

      if (['llm', 'model', 'ai'].includes(verb) && rest) {
        return runOverlayCommand(
          { action: 'set-ai-model', model: rest },
          `LLM model set to ${rest}.`,
        );
      }

      if (['personas', 'personalities', 'profiles'].includes(verb)) {
        respond(`Personas: ${personas.map((persona) => persona.name).join(', ')}.`);
        return true;
      }

      if (['persona', 'personality', 'profile', 'character', 'char'].includes(verb) && rest) {
        const nextPersona = resolvePersonaSelector(rest, personas);
        if (nextPersona) {
          setActivePersonaId(nextPersona.id);
          respond(`Persona switched to ${nextPersona.name}; scene preset is applying.`);
          return true;
        }

        if (['persona', 'personality', 'profile'].includes(verb)) {
          respond(
            `Unknown persona "${rest}". Try: ${personas.map((persona) => persona.name).join(', ')}.`,
          );
          return true;
        }
      }

      if (verb === 'vrms') {
        return runOverlayCommand({ action: 'list-vrms' }, 'Asked overlay to list bundled VRMs.');
      }

      if (['vrm', 'avatar', 'character', 'char'].includes(verb) && rest) {
        return runOverlayCommand({ action: 'load-vrm', model: rest }, `Loading VRM ${rest}.`);
      }

      if (['camera', 'frame', 'framing'].includes(verb)) {
        const mode = (tokens[0] ?? '').toLowerCase();
        if (['full', 'full-body', 'fullbody', 'body'].includes(mode)) {
          return runOverlayCommand(
            { action: 'set-camera-view', viewMode: 'full-body' },
            'Camera framing set to Full Body.',
          );
        }
        if (['half', 'half-body', 'halfbody', 'close', 'closeup', 'close-up'].includes(mode)) {
          return runOverlayCommand(
            { action: 'set-camera-view', viewMode: 'half-body' },
            'Camera framing set to Half Body / Close.',
          );
        }
      }

      if (['anims', 'animations'].includes(verb)) {
        return runOverlayCommand(
          { action: 'list-animations' },
          'Asked overlay to list animations.',
        );
      }

      if (['anim', 'animation', 'dance'].includes(verb)) {
        const subcommand = (tokens[0] ?? '').toLowerCase();
        if (['start', 'stop', 'next', 'random'].includes(subcommand)) {
          return runOverlayCommand(
            { action: 'sequencer', command: subcommand as 'start' | 'stop' | 'next' | 'random' },
            `Animation sequencer ${subcommand}.`,
          );
        }
        if (subcommand === 'speed') {
          const speed = Number.parseFloat(tokens[1] ?? '');
          if (Number.isFinite(speed)) {
            return runOverlayCommand(
              { action: 'set-animation-speed', speed },
              `Animation speed set to ${speed}.`,
            );
          }
        }
        if (['duration', 'time'].includes(subcommand)) {
          const duration = Number.parseFloat(tokens[1] ?? '');
          if (Number.isFinite(duration)) {
            return runOverlayCommand(
              { action: 'set-animation-duration', duration },
              `Animation duration set to ${duration}s.`,
            );
          }
        }
        if (rest) {
          return runOverlayCommand(
            { action: 'play-animation', selector: rest },
            `Playing animation ${rest}.`,
          );
        }
      }

      if (verb === 'tts') {
        const enabled = parseCommandBoolean(tokens[0]);
        if (enabled !== null) {
          return runOverlayCommand(
            { action: 'set-tts', enabled },
            `TTS ${enabled ? 'enabled' : 'disabled'}.`,
          );
        }
      }

      if (['autospeak', 'autosay'].includes(verb)) {
        const enabled = parseCommandBoolean(tokens[0]);
        if (enabled !== null) {
          return runOverlayCommand(
            { action: 'set-auto-speak', enabled },
            `Auto-speak ${enabled ? 'enabled' : 'disabled'}.`,
          );
        }
      }

      if (verb === 'say' && rest) {
        return runOverlayCommand(
          { action: 'say', text: rest },
          'Sending manual line to the overlay.',
        );
      }

      if (['chat', 'reply', 'replies'].includes(verb)) {
        const enabled = parseCommandBoolean(tokens[0]);
        if (enabled !== null) {
          setChatLogOpen(enabled);
          respond(`Twitch overlay chat ${enabled ? 'expanded' : 'collapsed'}.`);
          return true;
        }
      }

      respond('Unknown command. Use !yw help.');
      return true;
    },
    [activePersona, appendSystemMessage, handleOverlayCommand, personas, ttsManager, twitchChannel],
  );

  const runTwitchAiJob = useCallback(
    async (job: TwitchAiJob) => {
      const settings = aiSettingsRef.current;
      const persona = activePersona ?? DEFAULT_PERSONA;
      const channel = directTwitchClientRef.current?.channel ?? twitchChannel;
      const selectedModel = pickAvailableModel(
        settings.model,
        availableModelsRef.current,
        DEFAULT_RUN_MODEL,
      );
      const prompt = buildTwitchAiPrompt(job, persona);
      const requestHistory = trimChatHistory([
        ...chatHistoryRef.current,
        createChatMessage('user', prompt),
      ]);
      const assistantMessage = createChatMessage('assistant', '');
      const speechPlayer = createStreamingAssistantPlayer(
        assistantMessage,
        settings.ttsEnabled && settings.ttsAutoSpeak,
        `${persona.name} Twitch reply`,
      );
      setChatHistory((current) => trimChatHistory([...current, assistantMessage]));

      try {
        const response = await requestChatCompletion({
          activeChatters: job.activeChatterCount,
          mode: job.mode,
          model: selectedModel,
          messages: buildChatCompletionMessages({
            history: requestHistory,
            includeHostContext: settings.includeHostContext,
            maxHistoryMessages: job.mode === 'batch' ? 18 : 14,
            persona,
            relationshipMemory: relationshipMemoryRef.current,
            runtimeContext,
          }),
          maxTokens: settings.maxTokens,
          stateKey: getTwitchConversationStateKey(channel, persona),
          stateScope: 'chat',
          onTextDelta: speechPlayer.pushDelta,
          temperature: settings.temperature,
          apiKey: settings.localDevApiKey,
        });

        const assistantContent = await speechPlayer.finish(response.choices[0]?.message.content);
        if (!assistantContent) {
          throw new Error('RUN AI returned an empty Twitch reply.');
        }
        setChatHistory((current) =>
          trimChatHistory(
            current.map((message) =>
              message.id === assistantMessage.id
                ? {
                    ...assistantMessage,
                    content: assistantContent,
                  }
                : message,
            ),
          ),
        );
      } catch (error) {
        const message = getRunAiErrorMessage(error, 'chat');
        appendSystemMessage(`[Twitch] AI reply failed: ${message}`);
      }
    },
    [
      activePersona,
      appendSystemMessage,
      createStreamingAssistantPlayer,
      runtimeContext,
      twitchChannel,
    ],
  );

  const processTwitchAiQueue = useCallback(async () => {
    if (twitchAiProcessingRef.current) {
      return;
    }

    twitchAiProcessingRef.current = true;
    try {
      while (twitchAiQueueRef.current.length > 0) {
        const sinceLastReply = Date.now() - twitchLastReplyAtRef.current;
        const waitMs = Math.max(0, TWITCH_REPLY_GAP_MS - sinceLastReply);
        if (waitMs > 0) {
          await delay(waitMs);
        }

        const job = twitchAiQueueRef.current.shift();
        if (!job) {
          continue;
        }

        await runTwitchAiJob(job);
        twitchLastReplyAtRef.current = Date.now();
      }
    } finally {
      twitchAiProcessingRef.current = false;
      if (twitchAiQueueRef.current.length > 0) {
        void processTwitchAiQueue();
      }
    }
  }, [runTwitchAiJob]);

  const enqueueTwitchAiJob = useCallback(
    (job: TwitchAiJob) => {
      twitchAiQueueRef.current.push(job);
      void processTwitchAiQueue();
    },
    [processTwitchAiQueue],
  );

  const flushTwitchBatch = useCallback(
    (reason: 'count' | 'timer') => {
      if (twitchBatchTimerRef.current !== null) {
        window.clearTimeout(twitchBatchTimerRef.current);
        twitchBatchTimerRef.current = null;
      }

      const messages = twitchBatchRef.current.splice(0);
      if (messages.length === 0) {
        return;
      }

      const activeChatterCount = pruneActiveTwitchChatters(
        twitchActiveChattersRef.current,
        Date.now(),
      );
      console.info(
        `[DirectTwitch] Queued ${reason} batch with ${messages.length} messages and ${activeChatterCount} active chatters.`,
      );
      enqueueTwitchAiJob({
        id: `twitch-batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        mode: 'batch',
        activeChatterCount,
        context: twitchContextRef.current.slice(-TWITCH_CONTEXT_LIMIT),
        messages,
      });
    },
    [enqueueTwitchAiJob],
  );

  const scheduleTwitchBatchFlush = useCallback(
    (activeChatterCount: number) => {
      if (twitchBatchTimerRef.current !== null) {
        return;
      }

      const waitMs = getTwitchBatchWaitMs(activeChatterCount);
      twitchBatchTimerRef.current = window.setTimeout(() => {
        flushTwitchBatch('timer');
      }, waitMs);
    },
    [flushTwitchBatch],
  );

  const handleDirectTwitchAiMessage = useCallback(
    (message: DirectTwitchChatMessage) => {
      const now = Date.now();
      twitchActiveChattersRef.current.set(message.user.toLowerCase(), now);
      const activeChatterCount = pruneActiveTwitchChatters(twitchActiveChattersRef.current, now);
      setTwitchActiveChatterCount(activeChatterCount);
      twitchContextRef.current = [...twitchContextRef.current, message].slice(
        -TWITCH_CONTEXT_LIMIT,
      );

      if (activeChatterCount <= TWITCH_DIRECT_CHATTER_LIMIT) {
        if (!twitchMessageMentionsPersona(message.text, activePersona ?? DEFAULT_PERSONA)) {
          return;
        }

        console.info(
          `[Twitch AI] Queued @${message.displayName}; ${activeChatterCount} active chatters, ${twitchAiQueueRef.current.length + 1} pending.`,
        );
        enqueueTwitchAiJob({
          id: `twitch-direct-${message.id}`,
          mode: 'direct',
          activeChatterCount,
          context: twitchContextRef.current.slice(-TWITCH_CONTEXT_LIMIT),
          messages: [message],
        });
        return;
      }

      twitchBatchRef.current.push(message);
      const batchSize = getTwitchBatchSize(activeChatterCount);
      if (twitchBatchRef.current.length >= batchSize) {
        flushTwitchBatch('count');
      } else {
        scheduleTwitchBatchFlush(activeChatterCount);
      }
    },
    [
      activePersona,
      appendSystemMessage,
      enqueueTwitchAiJob,
      flushTwitchBatch,
      scheduleTwitchBatchFlush,
    ],
  );

  useEffect(() => {
    directTwitchCommandHandlerRef.current = handleDirectTwitchCommand;
  }, [handleDirectTwitchCommand]);

  useEffect(() => {
    directTwitchAiHandlerRef.current = handleDirectTwitchAiMessage;
  }, [handleDirectTwitchAiMessage]);

  useEffect(() => {
    return () => {
      if (twitchBatchTimerRef.current !== null) {
        window.clearTimeout(twitchBatchTimerRef.current);
      }
      twitchBatchTimerRef.current = null;
      twitchAiQueueRef.current = [];
      twitchBatchRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (!DIRECT_TWITCH_CHAT_ENABLED) {
      return;
    }

    const client = new DirectTwitchIrcClient(DIRECT_TWITCH_CHANNEL, {
      onMessage: (message) => {
        setChatHistory((current) =>
          trimChatHistory([
            ...current,
            createChatMessage('user', `[Twitch] ${message.displayName}: ${message.text}`),
          ]),
        );
        const handledCommand = directTwitchCommandHandlerRef.current(message);
        if (!handledCommand) {
          directTwitchAiHandlerRef.current(message);
        }
      },
      onStatus: (message, level = 'info') => {
        if (message.includes('connected to #')) {
          setTwitchConnectionLabel('Live');
        } else if (message.includes('disconnected') || message.includes('reconnecting')) {
          setTwitchConnectionLabel('Reconnect');
        } else if (level === 'error') {
          setTwitchConnectionLabel('Offline');
        }
      },
    });

    directTwitchClientRef.current = client;
    setTwitchChannel(client.channel);
    client.start();

    return () => {
      client.stop();
      setTwitchConnectionLabel('Offline');
      if (directTwitchClientRef.current === client) {
        directTwitchClientRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!STREAM_BOT_WS_ENABLED) {
      return;
    }

    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let closed = false;

    const scheduleReconnect = () => {
      if (closed || reconnectTimer !== null) {
        return;
      }

      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, OVERLAY_RECONNECT_MS);
    };

    const connect = () => {
      socket = new WebSocket(getOverlaySocketUrl());

      socket.addEventListener('open', () => {
        socket?.send(
          JSON.stringify({
            type: 'overlay:ready',
            payload: { page: window.location.pathname || '/' },
          }),
        );
      });

      socket.addEventListener('message', (event) => {
        if (typeof event.data !== 'string') {
          return;
        }

        const parsed = parseOverlayServerEvent(event.data);
        if (!parsed) {
          return;
        }

        if (parsed.type === 'chat:message') {
          const content = `[Twitch] ${parsed.payload.displayName}: ${parsed.payload.text}`;
          setChatHistory((current) =>
            trimChatHistory([...current, createChatMessage('user', content)]),
          );
          return;
        }

        if (parsed.type === 'ai:thinking') {
          const player = createStreamingSpeechPlayer(
            aiSettingsRef.current.ttsEnabled && aiSettingsRef.current.ttsAutoSpeak,
            `${activePersona?.name ?? DEFAULT_PERSONA.name} Twitch reply`,
          );
          overlayAiStreamsRef.current.set(parsed.payload.jobId, {
            player,
          });
          return;
        }

        if (parsed.type === 'ai:delta') {
          const stream = overlayAiStreamsRef.current.get(parsed.payload.jobId);
          if (stream) {
            stream.player.pushDelta(parsed.payload.delta);
          }
          return;
        }

        if (parsed.type === 'ai:reply') {
          const stream = overlayAiStreamsRef.current.get(parsed.payload.jobId);
          if (stream) {
            overlayAiStreamsRef.current.delete(parsed.payload.jobId);
            void stream.player.finish(parsed.payload.text);
          } else {
            const assistantMessage = createChatMessage('assistant', parsed.payload.text);
            void playAssistantResponse(
              assistantMessage,
              aiSettingsRef.current.ttsEnabled && aiSettingsRef.current.ttsAutoSpeak,
              `${activePersona?.name ?? DEFAULT_PERSONA.name} Twitch reply`,
            );
          }
          return;
        }

        if (parsed.type === 'overlay:command') {
          handleOverlayCommand(parsed.payload);
          return;
        }

        if (parsed.type === 'command:response') {
          appendSystemMessage(`[Command] ${parsed.payload.text}`);
          return;
        }

        if (parsed.type === 'system:status') {
          const statusMessage = `[StreamBot] ${parsed.payload.message}`;
          if (parsed.payload.level === 'error') {
            console.error(statusMessage);
            setChatGenerating(false);
            overlayAiStreamsRef.current.clear();
            appendSystemMessage(statusMessage);
          } else if (parsed.payload.level === 'warning') {
            console.warn(statusMessage);
          } else {
            console.info(statusMessage);
          }
        }
      });

      socket.addEventListener('close', () => {
        setChatGenerating(false);
        overlayAiStreamsRef.current.clear();
        scheduleReconnect();
      });
      socket.addEventListener('error', () => {
        setChatGenerating(false);
        overlayAiStreamsRef.current.clear();
        socket?.close();
      });
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }
      socket?.close();
    };
  }, [
    activePersona?.name,
    appendSystemMessage,
    createStreamingSpeechPlayer,
    handleOverlayCommand,
    playAssistantResponse,
  ]);

  return (
    <div
      className="shell"
      onClick={() => {
        if (menuOpen) {
          setMenuOpen(false);
        }
      }}
      style={shellStyle}
    >
      <VrmStage
        active={sceneActive}
        manualPlayRequest={manualPlayRequest}
        modelUrl={modelUrl}
        sequencerSettings={sequencerSettings}
        setSequencerSettings={setSequencerSettings}
        setVisualSettings={setVisualSettings}
        visualSettings={visualSettings}
      />

      <div className="ui-layer">
        <ChatLog
          activePersonaName={activePersona?.name ?? DEFAULT_PERSONA.name}
          botMentionTag={activePersonaMentionTag}
          channelName={twitchChannel}
          displayOverrides={chatDisplayOverrides}
          history={chatHistory}
          isGenerating={chatGenerating}
          modeLabel={twitchModeLabel}
          onClear={handleClearChat}
          onToggle={() => setChatLogOpen((current) => !current)}
          open={chatLogOpen}
        />

        <MenuFab
          onToggle={() => {
            setMenuOpen((current) => !current);
          }}
          open={menuOpen}
        />

        {menuOpen ? (
          <SettingsPanel
            activePersona={activePersona}
            activeTab={activeTab}
            aiSettings={aiSettings}
            availableModels={availableModels}
            bundledModels={BUNDLED_VRM_MODELS}
            chatDraftLength={chatInput.length}
            messageCount={chatHistory.length}
            currentBundledModelId={currentBundledModelId}
            onClearChat={handleClearChat}
            onClearDraft={handleClearDraft}
            onClearMemory={handleClearMemory}
            modelsError={modelsError}
            modelsLoading={modelsLoading}
            onCacheVoice={() => {
              void handleCacheTtsVoice();
            }}
            onActivatePersona={(personaId) => {
              setActivePersonaId(personaId);
            }}
            onClose={() => setMenuOpen(false)}
            onDeletePersona={handleDeletePersona}
            onImportAnimationFile={(file) => {
              const url = URL.createObjectURL(file);
              const format = getAnimationFormatFromFileName(file.name);
              setSequencerSettings((current) => ({
                ...current,
                playlist: [
                  ...current.playlist,
                  {
                    id: `custom-${Date.now()}`,
                    name: file.name.replace(/\.(fbx|glb|gltf|vrma|bvh)$/i, ''),
                    url,
                    format,
                    enabled: true,
                    experimental: false,
                  },
                ],
              }));
            }}
            onLoadModelFile={(file) => {
              prepareForModelSwap();
              loadModelUrl(URL.createObjectURL(file));
              setCurrentBundledModelId('');
            }}
            onLoadBundledModel={(modelId) => {
              void handleLoadBundledModel(modelId).catch(() => {});
            }}
            onLoadSample={() => {
              void handleLoadBundledModel(DEFAULT_BUNDLED_MODEL_ID).catch(() => {});
            }}
            onPlayAnimation={(request) => {
              setManualPlayRequest(request);
            }}
            onRefreshModels={() => {
              void loadAvailableModels();
            }}
            onRefreshVoices={() => {
              void loadTtsVoices();
            }}
            onResetContext={handleResetContext}
            onRunMemoryAgent={handleRunMemoryAgentNow}
            onSavePersona={handleSavePersona}
            onSelectVoice={handleSelectTtsVoice}
            onSpeakLastReply={handleSpeakLastReply}
            onStopTts={handleStopTts}
            onTabChange={setActiveTab}
            onTestVoice={handleTestTtsVoice}
            open={menuOpen}
            personas={personas}
            relationshipMemory={relationshipMemory}
            runtimeContext={runtimeContext}
            memoryAgentBusy={memoryAgentBusy}
            memoryAgentStatus={memoryAgentStatus}
            sequencerSettings={sequencerSettings}
            setAiSettings={setAiSettings}
            setSequencerSettings={setSequencerSettings}
            setVisualSettings={setVisualSettings}
            ttsActiveVoice={activeTtsVoice}
            ttsBusy={ttsBusy}
            ttsCached={selectedTtsCached}
            ttsStatus={ttsStatus}
            ttsVoices={ttsVoices}
            visualSettings={visualSettings}
            voicesError={ttsVoicesError}
            voicesLoading={ttsVoicesLoading}
          />
        ) : null}

        {subtitleText ? (
          <div className="subtitle-overlay" aria-live="polite">
            {subtitleText}
          </div>
        ) : null}

        <button
          className={`chat-bar-toggle ${chatBarOpen ? 'active' : ''}`}
          onClick={(event) => {
            event.stopPropagation();
            setChatBarOpen((current) => !current);
          }}
          title={chatBarOpen ? 'Hide local chat bar' : 'Show local chat bar'}
          type="button"
        >
          <svg
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
          </svg>
        </button>

        {chatBarOpen ? (
          <ChatBar
            activePersonaName={activePersona?.name ?? DEFAULT_PERSONA.name}
            contextEnabled={aiSettings.includeHostContext}
            inputValue={chatInput}
            isGenerating={chatGenerating}
            messageCount={chatHistory.length}
            model={aiSettings.model}
            onInputChange={setChatInput}
            onSend={() => {
              void handleSendMessage();
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

export default App;
