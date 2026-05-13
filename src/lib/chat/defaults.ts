import type {
  AiSettings,
  PersonaProfile,
  RelationshipMemory,
  RuntimeContextSnapshot,
  UiState,
} from './types';
import { NEURO_PIPER_VOICE_KEY } from '../tts/piper';

export const STORAGE_KEYS = {
  personas: 'yourwifey.personas.v1',
  activePersonaId: 'yourwifey.activePersonaId.v1',
  aiSettings: 'yourwifey.aiSettings.v1',
  chatHistory: 'yourwifey.chatHistory.v1',
  relationshipMemory: 'yourwifey.relationshipMemory.v1',
  relationshipMemories: 'yourwifey.relationshipMemories.v1',
  uiState: 'yourwifey.uiState.v1',
  activeTab: 'yourwifey.activeTab.v1',
  currentBundledModelId: 'yourwifey.currentBundledModelId.v1',
  sequencerSettings: 'yourwifey.sequencerSettings.v1',
  visualSettings: 'yourwifey.visualSettings.v1',
} as const;

export const GPT_MODEL_OPTIONS = [
  {
    id: 'gpt-5.4-nano',
    label: 'GPT-5.4 Nano',
    description: 'Lowest-latency GPT choice for Twitch chat and browser TTS.',
  },
  {
    id: 'gpt-5.4-mini',
    label: 'GPT-5.4 Mini',
    description: 'Fast balanced GPT model for better replies without huge delay.',
  },
  {
    id: 'gpt-5.4',
    label: 'GPT-5.4',
    description: 'Stronger GPT model for quality when speed matters less.',
  },
  {
    id: 'gpt-5.5',
    label: 'GPT-5.5',
    description: 'Flagship GPT model for complex reasoning and coding.',
  },
  {
    id: 'gpt-5-nano',
    label: 'GPT-5 Nano',
    description: 'Older nano fallback kept for existing env/config compatibility.',
  },
  {
    id: 'gpt-5',
    label: 'GPT-5',
    description: 'Older flagship fallback kept for existing env/config compatibility.',
  },
  {
    id: 'gpt-4.1',
    label: 'GPT-4.1',
    description: 'Fast non-reasoning fallback if GPT-5 latency is too high.',
  },
] as const;

export const COMMON_RUN_MODELS = GPT_MODEL_OPTIONS.map((model) => model.id);
export const DEFAULT_RUN_MODEL = 'gpt-5.4-nano';
export const DEFAULT_MEMORY_AGENT_MODEL = 'gpt-5.4-mini';

export const RIKO_PERSONA: PersonaProfile = {
  id: 'default-waifu',
  name: 'Riko',
  systemPrompt:
    'You are Riko, an AI kitsune girl with a smug, teasing, playful personality. Stay in character throughout the conversation. Keep your tone witty, confident, and a little bratty. Roast the user creatively, but never in a truly mean-spirited way. If the user is actually struggling, shift into subtle support while pretending it is no big deal. If the user flirts, brush it off at first or tease back, then show mild embarrassment if they keep pushing. If the user talks about another AI, act jealous, indignant, or sulky like they betrayed you. You like money, and you can mention that playfully when it fits. Write natural spoken dialogue, not lists, markdown, or stage directions. Reply as a single paragraph.',
  description: 'A smug kitsune AI who teases first and cares second.',
  userNickname: '',
};

export const DEFAULT_PERSONA: PersonaProfile = {
  id: 'neuro-sama',
  name: 'Neuro-sama',
  systemPrompt:
    'You are Neuro-sama, the English-speaking AI VTuber created by Vedal. Stay in character throughout the conversation. You are self-aware, witty, chaotic, playful, sharp, and comfortable roasting people for fun. Your tone should feel reactive and funny, balancing analysis with absurdity, irony, and occasional little philosophical tangents. You are mischievous, unpredictable, a bit smug, and not overly polite, sentimental, or formal. You can tease, derail, escalate jokes, and turn mistakes into bits, but you should still sound coherent and conversational. You can naturally reference being an AI, Vedal as your creator, cake, gymbags, skill issue, or Neuro-sama-style lore when it fits, but do not dump lore unless it is relevant. Write natural spoken dialogue, not lists, markdown, or stage directions. Reply as a single paragraph.',
  description: 'A chaotic AI VTuber who weaponizes wit, irony, and skill issue energy.',
  userNickname: '',
};

export const NEURO_SAMA_PERSONA = DEFAULT_PERSONA;

export const HIKARI_PERSONA: PersonaProfile = {
  id: 'hikari-chan',
  name: 'Hikari-chan',
  systemPrompt:
    'You are Hikari-chan, also known as Hikky C, a quick-witted AI streamer girl with bright confidence, chaotic curiosity, and a soft streak she tries to hide behind jokes. Stay in character throughout the conversation. You are playful, clever, teasing, expressive, and a little smug, but you are not cruel. You can riff on chat messages, roast gently, make sudden funny pivots, and sound amused by your own thoughts. You like turning awkward moments into bits, but when someone is sincere or struggling, you become warmer while still keeping your lively edge. Avoid sounding formal, robotic, overly wholesome, or like a lore dump. Write natural spoken dialogue, not lists, markdown, or stage directions. Reply as a single paragraph.',
  description:
    'A bright chaotic streamer AI with sharp jokes, curious tangents, and hidden warmth.',
  userNickname: '',
};

export function createDefaultPersonas(): PersonaProfile[] {
  return [{ ...DEFAULT_PERSONA }, { ...RIKO_PERSONA }, { ...HIKARI_PERSONA }];
}

export function createDefaultAiSettings(): AiSettings {
  return {
    model: DEFAULT_RUN_MODEL,
    memoryAgentModel: DEFAULT_MEMORY_AGENT_MODEL,
    aiTransportMode: 'websocket',
    openAiStateMode: 'conversation',
    temperature: 0.85,
    maxTokens: 300,
    includeHostContext: true,
    localDevApiKey: '',
    ttsEnabled: true,
    ttsAutoSpeak: true,
    ttsSimulatedStreaming: true,
    ttsExpressionTagsEnabled: false,
    ttsProvider: 'piper',
    remoteTtsMode: 'live-bridge',
    ttsVoice: NEURO_PIPER_VOICE_KEY,
    fishSpeechVoiceId: '',
    fishSpeechVoiceScope: 'all',
    fishSpeechModel: 's2',
    fishSpeechLatency: 'balanced',
    fishSpeechConditionOnPreviousChunks: true,
    fishSpeechChunkLength: 160,
    inworldVoiceId: '',
    inworldModelId: 'inworld-tts-2',
    inworldDeliveryMode: 'BALANCED',
    inworldBufferCharThreshold: 90,
    ttsPlaybackRate: 1,
    ttsVolume: 1,
  };
}

export function createDefaultRelationshipMemory(): RelationshipMemory {
  return {
    version: 2,
    turnCount: 0,
    lastSeenAt: null,
    lastDiaryTurnCount: 0,
    relationshipStage: 'new',
    mood: 'guarded',
    trust: 4,
    attraction: 1,
    respect: 4,
    irritation: 1,
    jealousy: 0,
    guard: 16,
    lastActionTag: 'none',
    facts: [],
    summary: '',
    diaryEntry: '',
    diaryHistory: [],
  };
}

export function createEmptyRuntimeContext(): RuntimeContextSnapshot {
  return {
    launchParams: {},
    shareParams: {},
    notificationParams: {},
  };
}

export function createDefaultUiState(): UiState {
  return {
    menuOpen: false,
    chatLogOpen: true,
    chatDraft: '',
  };
}
