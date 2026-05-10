import {
  DEFAULT_PERSONA,
  HIKARI_PERSONA,
  createDefaultAiSettings,
  createDefaultRelationshipMemory,
  createDefaultPersonas,
  createDefaultUiState,
  STORAGE_KEYS,
} from './defaults';
import { createDefaultSequencerSettings, createDefaultVisualSettings } from '../menu/defaults';
import { DEFAULT_ANIMATIONS } from '../vrm/sequencer';
import type {
  AiSettings,
  ChatMessage,
  PersistedChatState,
  PersonaProfile,
  RelationshipMemory,
  UiState,
} from './types';
import type { AnimationEntry, AnimationFormat, SettingsTabId, VisualSettings } from '../menu/types';
import {
  appendDiaryHistory,
  clampRelationshipStat,
  dedupeFacts,
  deriveRelationshipStage,
  normalizeRelationshipActionTag,
  normalizeRelationshipMood,
  sanitizeDiaryEntry,
} from './memory-shared';

const RUN_GAME_SDK_ENABLED = import.meta.env['VITE_RUN_GAME_SDK_ENABLED'] === 'true';

let runGameSdkPromise: Promise<typeof import('@series-inc/rundot-game-sdk/api').default> | null =
  null;

async function getRunGameSdk() {
  if (!RUN_GAME_SDK_ENABLED) {
    throw new Error('RUN.game SDK is disabled for standalone stream mode.');
  }

  runGameSdkPromise ??= import('@series-inc/rundot-game-sdk/api').then((module) => module.default);
  return runGameSdkPromise;
}

function getLocalStorage() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

async function getPersistedItem(key: string) {
  if (RUN_GAME_SDK_ENABLED) {
    try {
      const runGameSdk = await getRunGameSdk();
      return await runGameSdk.appStorage.getItem(key);
    } catch {
      // Fall through to browser storage for standalone resilience.
    }
  }

  return getLocalStorage()?.getItem(key) ?? null;
}

async function setPersistedItem(key: string, value: string) {
  if (RUN_GAME_SDK_ENABLED) {
    try {
      const runGameSdk = await getRunGameSdk();
      await runGameSdk.appStorage.setItem(key, value);
      return;
    } catch {
      // Fall through to browser storage for standalone resilience.
    }
  }

  getLocalStorage()?.setItem(key, value);
}

function safeParse<T>(value: string | null, fallback: T): T {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function normalizePersonaProfile(value: unknown): PersonaProfile | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const source = value as Partial<PersonaProfile>;
  if (!source.id || !source.name) {
    return null;
  }

  return {
    id: String(source.id),
    name: String(source.name),
    systemPrompt: String(source.systemPrompt ?? ''),
    description: String(source.description ?? ''),
    userNickname: String(source.userNickname ?? ''),
  };
}

function normalizeChatMessage(value: unknown): ChatMessage | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const source = value as Partial<ChatMessage>;
  if (
    !source.id ||
    !source.role ||
    (source.role !== 'system' && source.role !== 'user' && source.role !== 'assistant') ||
    typeof source.content !== 'string'
  ) {
    return null;
  }

  return {
    id: String(source.id),
    role: source.role,
    content: source.content,
    createdAt: Number(source.createdAt ?? Date.now()),
  };
}

function normalizeAiSettings(value: unknown): AiSettings {
  const defaults = createDefaultAiSettings();

  if (!value || typeof value !== 'object') {
    return defaults;
  }

  const source = value as Partial<AiSettings>;
  const requestedModel = String(source.model ?? defaults.model);
  const normalizedModel = requestedModel === 'gpt-5-mini' ? defaults.model : requestedModel;
  const requestedMemoryAgentModel = String(
    source.memoryAgentModel ?? defaults.memoryAgentModel,
  ).trim();
  const playbackRate =
    typeof source.ttsPlaybackRate === 'number' && Number.isFinite(source.ttsPlaybackRate)
      ? Math.max(0.7, Math.min(1.35, source.ttsPlaybackRate))
      : defaults.ttsPlaybackRate;
  const ttsVolume =
    typeof source.ttsVolume === 'number' && Number.isFinite(source.ttsVolume)
      ? Math.max(0, Math.min(2, source.ttsVolume))
      : defaults.ttsVolume;
  const ttsProvider =
    source.ttsProvider === 'fish-speech' || source.ttsProvider === 'inworld'
      ? source.ttsProvider
      : defaults.ttsProvider;
  const fishSpeechLatency =
    source.fishSpeechLatency === 'balanced' || source.fishSpeechLatency === 'normal'
      ? source.fishSpeechLatency
      : defaults.fishSpeechLatency;
  const fishSpeechModel =
    typeof source.fishSpeechModel === 'string' && source.fishSpeechModel.trim()
      ? source.fishSpeechModel.trim() === 's2-pro'
        ? 's2'
        : source.fishSpeechModel.trim()
      : defaults.fishSpeechModel;
  const fishSpeechChunkLength =
    typeof source.fishSpeechChunkLength === 'number' &&
    Number.isFinite(source.fishSpeechChunkLength)
      ? Math.max(100, Math.min(300, Math.round(source.fishSpeechChunkLength)))
      : defaults.fishSpeechChunkLength;
  const inworldBufferCharThreshold =
    typeof source.inworldBufferCharThreshold === 'number' &&
    Number.isFinite(source.inworldBufferCharThreshold)
      ? Math.max(20, Math.min(1000, Math.round(source.inworldBufferCharThreshold)))
      : defaults.inworldBufferCharThreshold;
  const inworldDeliveryMode =
    source.inworldDeliveryMode === 'STABLE' ||
    source.inworldDeliveryMode === 'BALANCED' ||
    source.inworldDeliveryMode === 'CREATIVE'
      ? source.inworldDeliveryMode
      : source.inworldDeliveryMode === 'EXPRESSIVE'
        ? 'CREATIVE'
        : source.inworldDeliveryMode === 'LOW_LATENCY'
          ? 'STABLE'
          : defaults.inworldDeliveryMode;

  return {
    model: normalizedModel,
    memoryAgentModel: requestedMemoryAgentModel || defaults.memoryAgentModel,
    temperature: typeof source.temperature === 'number' ? source.temperature : defaults.temperature,
    maxTokens: typeof source.maxTokens === 'number' ? source.maxTokens : defaults.maxTokens,
    includeHostContext:
      typeof source.includeHostContext === 'boolean'
        ? source.includeHostContext
        : defaults.includeHostContext,
    localDevApiKey: String(source.localDevApiKey ?? defaults.localDevApiKey),
    ttsEnabled: typeof source.ttsEnabled === 'boolean' ? source.ttsEnabled : defaults.ttsEnabled,
    ttsAutoSpeak:
      typeof source.ttsAutoSpeak === 'boolean' ? source.ttsAutoSpeak : defaults.ttsAutoSpeak,
    ttsSimulatedStreaming:
      typeof source.ttsSimulatedStreaming === 'boolean'
        ? source.ttsSimulatedStreaming
        : defaults.ttsSimulatedStreaming,
    ttsExpressionTagsEnabled:
      typeof source.ttsExpressionTagsEnabled === 'boolean'
        ? source.ttsExpressionTagsEnabled
        : defaults.ttsExpressionTagsEnabled,
    ttsProvider,
    ttsVoice: String(source.ttsVoice ?? defaults.ttsVoice),
    fishSpeechVoiceId: String(source.fishSpeechVoiceId ?? defaults.fishSpeechVoiceId),
    fishSpeechModel,
    fishSpeechLatency,
    fishSpeechConditionOnPreviousChunks:
      typeof source.fishSpeechConditionOnPreviousChunks === 'boolean'
        ? source.fishSpeechConditionOnPreviousChunks
        : defaults.fishSpeechConditionOnPreviousChunks,
    fishSpeechChunkLength,
    inworldVoiceId: String(source.inworldVoiceId ?? defaults.inworldVoiceId),
    inworldModelId: String(source.inworldModelId ?? defaults.inworldModelId),
    inworldDeliveryMode,
    inworldBufferCharThreshold,
    ttsPlaybackRate: playbackRate,
    ttsVolume,
  };
}

function normalizeRelationshipMemory(value: unknown): RelationshipMemory {
  const defaults = createDefaultRelationshipMemory();

  if (!value || typeof value !== 'object') {
    return defaults;
  }

  const source = value as Partial<RelationshipMemory>;
  const facts = Array.isArray(source.facts)
    ? dedupeFacts(source.facts.map((fact) => String(fact).trim()).filter(Boolean))
    : defaults.facts;
  const diaryEntry = sanitizeDiaryEntry((source as { diaryEntry?: unknown }).diaryEntry);
  const diaryHistory = Array.isArray((source as { diaryHistory?: unknown[] }).diaryHistory)
    ? (source as { diaryHistory: unknown[] }).diaryHistory
        .map((entry) => sanitizeDiaryEntry(entry))
        .filter(Boolean)
        .slice(-3)
    : [];
  const mood = normalizeRelationshipMood((source as { mood?: unknown }).mood);
  const lastActionTag = normalizeRelationshipActionTag(
    (source as { lastActionTag?: unknown }).lastActionTag,
  );
  const trust = clampRelationshipStat(
    Number((source as { trust?: unknown }).trust ?? defaults.trust),
  );
  const attraction = clampRelationshipStat(
    Number((source as { attraction?: unknown }).attraction ?? defaults.attraction),
  );
  const respect = clampRelationshipStat(
    Number((source as { respect?: unknown }).respect ?? defaults.respect),
  );
  const irritation = clampRelationshipStat(
    Number((source as { irritation?: unknown }).irritation ?? defaults.irritation),
  );
  const jealousy = clampRelationshipStat(
    Number((source as { jealousy?: unknown }).jealousy ?? defaults.jealousy),
  );
  const guard = clampRelationshipStat(
    Number((source as { guard?: unknown }).guard ?? defaults.guard),
  );
  const turnCount =
    typeof source.turnCount === 'number' && Number.isFinite(source.turnCount)
      ? Math.max(0, source.turnCount)
      : 0;
  const lastDiaryTurnCountRaw = Number(
    (source as { lastDiaryTurnCount?: unknown }).lastDiaryTurnCount ?? 0,
  );
  const lastDiaryTurnCount = Number.isFinite(lastDiaryTurnCountRaw)
    ? Math.max(0, Math.min(turnCount, Math.round(lastDiaryTurnCountRaw)))
    : 0;
  const next: RelationshipMemory = {
    version: 2,
    turnCount,
    lastSeenAt:
      typeof source.lastSeenAt === 'number' && Number.isFinite(source.lastSeenAt)
        ? source.lastSeenAt
        : null,
    lastDiaryTurnCount,
    relationshipStage: 'new',
    mood,
    trust,
    attraction,
    respect,
    irritation,
    jealousy,
    guard,
    lastActionTag,
    facts,
    summary: String(source.summary ?? defaults.summary).slice(0, 900),
    diaryEntry,
    diaryHistory: appendDiaryHistory(diaryHistory, diaryEntry),
  };

  next.relationshipStage = deriveRelationshipStage(next);
  return next;
}

function normalizeUiState(value: unknown): UiState {
  const defaults = createDefaultUiState();

  if (!value || typeof value !== 'object') {
    return defaults;
  }

  const source = value as Partial<UiState>;

  return {
    menuOpen: false,
    chatLogOpen:
      typeof source.chatLogOpen === 'boolean' ? source.chatLogOpen : defaults.chatLogOpen,
    chatDraft:
      typeof source.chatDraft === 'string' ? source.chatDraft.slice(0, 4000) : defaults.chatDraft,
  };
}

function normalizeSettingsTab(value: string | null): SettingsTabId {
  switch (value) {
    case 'anim':
    case 'character':
    case 'ai':
    case 'context':
    case 'tts':
    case 'vrm':
      return value;
    default:
      return 'vrm';
  }
}

function normalizeVisualSettings(value: unknown): VisualSettings {
  const defaults = createDefaultVisualSettings();

  if (!value || typeof value !== 'object') {
    return defaults;
  }

  const source = value as Partial<VisualSettings>;
  const numericKeys: Array<keyof VisualSettings> = [
    'cameraVerticalOffset',
    'cameraOffsetX',
    'cameraOffsetY',
    'cameraOffsetZ',
    'cameraTargetOffsetX',
    'cameraTargetOffsetY',
    'cameraTargetOffsetZ',
    'cameraFov',
    'modelPositionX',
    'modelPositionZ',
    'modelRotationX',
    'modelRotationY',
    'modelRotationZ',
    'modelVerticalOffset',
    'modelScale',
    'blinkInterval',
    'blinkIntensity',
    'gazeIntensity',
    'gazeHeadFollow',
    'gazeHeadDrift',
    'gazeEyeMotion',
    'gazeAudienceYOffset',
    'armClipGuardStrength',
    'armClipTorsoRadius',
    'crossfadeDuration',
    'bloomStrength',
    'bloomRadius',
    'bloomThreshold',
    'chromaAmount',
    'chromaAngle',
    'grainAmount',
    'vignetteAmount',
    'vignetteHardness',
    'bleachOpacity',
    'colorPowR',
    'colorPowG',
    'colorPowB',
    'taaSampleLevel',
    'keyLight',
    'fillLight',
    'rimLight',
    'hemiLight',
    'ambientLight',
  ];
  const booleanKeys: Array<keyof VisualSettings> = [
    'realisticMode',
    'autoBlink',
    'autoGaze',
    'gazePointerFollow',
    'armClipGuard',
    'postProcessingEnabled',
    'outline',
    'bloom',
    'chroma',
    'grain',
    'glitch',
    'fxaa',
    'smaa',
    'taa',
    'bleach',
    'colorCorr',
  ];

  const next = { ...defaults };

  numericKeys.forEach((key) => {
    if (typeof source[key] === 'number') {
      (next[key] as number) = source[key] as number;
    }
  });

  booleanKeys.forEach((key) => {
    if (typeof source[key] === 'boolean') {
      (next[key] as boolean) = source[key] as boolean;
    }
  });

  if (source.cameraViewMode === 'full-body' || source.cameraViewMode === 'half-body') {
    next.cameraViewMode = source.cameraViewMode;
  }
  if (source.cameraRigMode === 'locked' || source.cameraRigMode === 'custom') {
    next.cameraRigMode = source.cameraRigMode;
  }
  next.cameraVerticalOffset = Math.max(-0.9, Math.min(0.9, next.cameraVerticalOffset));
  next.cameraOffsetX = Math.max(-3, Math.min(3, next.cameraOffsetX));
  next.cameraOffsetY = Math.max(-1.5, Math.min(1.5, next.cameraOffsetY));
  next.cameraOffsetZ = Math.max(-4, Math.min(4, next.cameraOffsetZ));
  next.cameraTargetOffsetX = Math.max(-3, Math.min(3, next.cameraTargetOffsetX));
  next.cameraTargetOffsetY = Math.max(-1.5, Math.min(1.5, next.cameraTargetOffsetY));
  next.cameraTargetOffsetZ = Math.max(-4, Math.min(4, next.cameraTargetOffsetZ));
  next.cameraFov = Math.max(18, Math.min(70, next.cameraFov));
  next.modelPositionX = Math.max(-3, Math.min(3, next.modelPositionX));
  next.modelPositionZ = Math.max(-3, Math.min(3, next.modelPositionZ));
  next.modelRotationX = Math.max(-45, Math.min(45, next.modelRotationX));
  next.modelRotationY = Math.max(-180, Math.min(180, next.modelRotationY));
  next.modelRotationZ = Math.max(-45, Math.min(45, next.modelRotationZ));
  next.modelVerticalOffset = Math.max(-2, Math.min(2, next.modelVerticalOffset));
  next.modelScale = Math.max(0.25, Math.min(4, next.modelScale));
  next.blinkInterval = Math.max(1.5, Math.min(10, next.blinkInterval));
  next.blinkIntensity = Math.max(0, Math.min(1, next.blinkIntensity));
  next.gazeIntensity = Math.max(0, Math.min(1, next.gazeIntensity));
  next.gazeHeadFollow = Math.max(0, Math.min(1, next.gazeHeadFollow));
  next.gazeHeadDrift = Math.max(0, Math.min(1, next.gazeHeadDrift));
  next.gazeEyeMotion = Math.max(0, Math.min(1, next.gazeEyeMotion));
  next.gazeAudienceYOffset = Math.max(-0.25, Math.min(0.15, next.gazeAudienceYOffset));
  next.armClipGuardStrength = Math.max(0, Math.min(1, next.armClipGuardStrength));
  next.armClipTorsoRadius = Math.max(0.08, Math.min(0.55, next.armClipTorsoRadius));

  return next;
}

function inferAnimationFormat(url: string): AnimationFormat {
  const cleanUrl = url.split('?')[0]?.split('#')[0]?.toLowerCase() ?? '';
  if (cleanUrl.endsWith('.vrma')) return 'vrma';
  if (cleanUrl.endsWith('.bvh')) return 'bvh';
  if (cleanUrl.endsWith('.glb')) return 'glb';
  if (cleanUrl.endsWith('.gltf')) return 'gltf';
  return 'fbx';
}

function normalizeAnimationFormat(value: unknown, url: string): AnimationFormat {
  switch (value) {
    case 'fbx':
    case 'glb':
    case 'gltf':
    case 'vrma':
    case 'bvh':
      return value;
    default:
      return inferAnimationFormat(url);
  }
}

function isRejectedGeneratedAnimation(id: string, url: string, format: AnimationFormat): boolean {
  const cleanUrl = url.split('?')[0]?.split('#')[0]?.toLowerCase() ?? '';
  const retiredDipBvh =
    id.startsWith('dip-') &&
    format === 'bvh' &&
    cleanUrl.startsWith('/assets/animations/dip/dip_') &&
    cleanUrl.endsWith('.bvh');
  const retiredDipVrma =
    id.startsWith('dip-vrma-') &&
    format === 'vrma' &&
    cleanUrl.startsWith('/assets/animations/dip/vrma/') &&
    cleanUrl.endsWith('.vrma');
  return retiredDipBvh || retiredDipVrma;
}

function normalizeAnimationEntry(value: unknown): AnimationEntry | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const source = value as Partial<AnimationEntry>;
  if (!source.id || !source.name || !source.url) {
    return null;
  }

  const url = String(source.url);
  if (url.startsWith('blob:')) {
    return null;
  }

  const id = String(source.id);
  const format = normalizeAnimationFormat(source.format, url);
  if (isRejectedGeneratedAnimation(id, url, format)) {
    return null;
  }

  return {
    id,
    name: String(source.name),
    url,
    format,
    enabled: typeof source.enabled === 'boolean' ? source.enabled : true,
    experimental: typeof source.experimental === 'boolean' ? source.experimental : false,
  };
}

function normalizeSequencerSettings(value: unknown) {
  const defaults = createDefaultSequencerSettings();

  if (!value || typeof value !== 'object') {
    return defaults;
  }

  const source = value as Partial<PersistedChatState['sequencerSettings']>;
  const persistedPlaylist = Array.isArray(source.playlist)
    ? source.playlist
        .map(normalizeAnimationEntry)
        .filter((entry): entry is AnimationEntry => Boolean(entry))
    : [];

  const persistedById = new Map(persistedPlaylist.map((entry) => [entry.id, entry]));
  const mergedDefaults = DEFAULT_ANIMATIONS.map((entry) => {
    const persisted = persistedById.get(entry.id);
    const merged = persisted
      ? {
          ...entry,
          enabled: persisted.enabled,
        }
      : { ...entry };
    return entry.id === 'idle' && entry.url.endsWith('/Idle.fbx')
      ? { ...merged, enabled: false }
      : merged;
  });

  const extraPersisted = persistedPlaylist.filter(
    (entry) => !mergedDefaults.some((defaultEntry) => defaultEntry.id === entry.id),
  );

  const playlist = [...mergedDefaults, ...extraPersisted];
  const currentIndex =
    typeof source.currentIndex === 'number' &&
    source.currentIndex >= -1 &&
    source.currentIndex < playlist.length
      ? source.currentIndex
      : -1;

  return {
    playing: typeof source.playing === 'boolean' ? source.playing : defaults.playing,
    shuffle: typeof source.shuffle === 'boolean' ? source.shuffle : defaults.shuffle,
    loop: typeof source.loop === 'boolean' ? source.loop : defaults.loop,
    speed: typeof source.speed === 'number' ? source.speed : defaults.speed,
    duration: typeof source.duration === 'number' ? source.duration : defaults.duration,
    currentIndex,
    playlist,
  };
}

function isLegacyDefaultPersona(persona: PersonaProfile) {
  return (
    persona.id === DEFAULT_PERSONA.id &&
    (persona.name.trim().toLowerCase() === 'wifey' ||
      persona.systemPrompt.includes('You are Wifey'))
  );
}

function isLegacyHikariPersona(persona: PersonaProfile) {
  return (
    persona.id === 'hikari-jen' ||
    persona.name.trim().toLowerCase() === 'hikari-jen' ||
    persona.systemPrompt.includes('Hikari-jen') ||
    persona.systemPrompt.includes('HickeyC')
  );
}

function mergeBuiltInPersonas(
  persistedPersonas: PersonaProfile[],
  defaultPersonas: PersonaProfile[],
) {
  const persistedById = new Map(persistedPersonas.map((persona) => [persona.id, persona]));
  const builtInIds = new Set(defaultPersonas.map((persona) => persona.id));

  const mergedBuiltIns = defaultPersonas.map((defaultPersona) => {
    const persistedPersona =
      persistedById.get(defaultPersona.id) ??
      (defaultPersona.id === HIKARI_PERSONA.id ? persistedById.get('hikari-jen') : undefined);
    if (!persistedPersona) {
      return { ...defaultPersona };
    }

    if (isLegacyDefaultPersona(persistedPersona)) {
      return {
        ...DEFAULT_PERSONA,
        userNickname: persistedPersona.userNickname ?? '',
      };
    }

    if (defaultPersona.id === HIKARI_PERSONA.id && isLegacyHikariPersona(persistedPersona)) {
      return {
        ...HIKARI_PERSONA,
        userNickname: persistedPersona.userNickname ?? '',
      };
    }

    return persistedPersona;
  });

  const customPersonas = persistedPersonas.filter(
    (persona) => !builtInIds.has(persona.id) && !isLegacyHikariPersona(persona),
  );
  return [...mergedBuiltIns, ...customPersonas];
}

export async function loadPersistedChatState(): Promise<PersistedChatState> {
  const defaultPersonas = createDefaultPersonas();
  const defaultActivePersonaId = defaultPersonas[0]?.id ?? '';
  const defaults: PersistedChatState = {
    personas: defaultPersonas,
    activePersonaId: defaultActivePersonaId,
    aiSettings: createDefaultAiSettings(),
    chatHistory: [],
    relationshipMemory: createDefaultRelationshipMemory(),
    uiState: createDefaultUiState(),
    activeTab: 'vrm',
    currentBundledModelId: 'neuro-sama',
    sequencerSettings: createDefaultSequencerSettings(),
    visualSettings: createDefaultVisualSettings(),
  };

  try {
    const [
      personasRaw,
      activePersonaIdRaw,
      aiSettingsRaw,
      chatHistoryRaw,
      relationshipMemoryRaw,
      uiStateRaw,
      activeTabRaw,
      currentBundledModelIdRaw,
      sequencerSettingsRaw,
      visualSettingsRaw,
    ] = await Promise.all([
      getPersistedItem(STORAGE_KEYS.personas),
      getPersistedItem(STORAGE_KEYS.activePersonaId),
      getPersistedItem(STORAGE_KEYS.aiSettings),
      getPersistedItem(STORAGE_KEYS.chatHistory),
      getPersistedItem(STORAGE_KEYS.relationshipMemory),
      getPersistedItem(STORAGE_KEYS.uiState),
      getPersistedItem(STORAGE_KEYS.activeTab),
      getPersistedItem(STORAGE_KEYS.currentBundledModelId),
      getPersistedItem(STORAGE_KEYS.sequencerSettings),
      getPersistedItem(STORAGE_KEYS.visualSettings),
    ]);

    const personas =
      safeParse<unknown[]>(personasRaw, [])
        .map(normalizePersonaProfile)
        .filter((value): value is PersonaProfile => Boolean(value)) || [];

    const aiSettings = normalizeAiSettings(safeParse(aiSettingsRaw, null));
    const chatHistory = safeParse<unknown[]>(chatHistoryRaw, [])
      .map(normalizeChatMessage)
      .filter((value): value is ChatMessage => Boolean(value));
    const relationshipMemory = normalizeRelationshipMemory(safeParse(relationshipMemoryRaw, null));
    const uiState = normalizeUiState(safeParse(uiStateRaw, null));
    const activeTab = normalizeSettingsTab(activeTabRaw);
    const currentBundledModelId =
      typeof currentBundledModelIdRaw === 'string' && currentBundledModelIdRaw.trim().length > 0
        ? currentBundledModelIdRaw
        : defaults.currentBundledModelId;
    const sequencerSettings = normalizeSequencerSettings(safeParse(sequencerSettingsRaw, null));
    const visualSettings = normalizeVisualSettings(safeParse(visualSettingsRaw, null));

    const nextPersonas =
      personas.length > 0
        ? mergeBuiltInPersonas(personas, defaultPersonas)
        : defaultPersonas.map((persona) => ({ ...persona }));
    const requestedActivePersonaId =
      activePersonaIdRaw ?? nextPersonas[0]?.id ?? defaultActivePersonaId;
    const activePersonaId = nextPersonas.some((persona) => persona.id === requestedActivePersonaId)
      ? requestedActivePersonaId
      : (nextPersonas[0]?.id ?? defaultActivePersonaId);

    return {
      personas: nextPersonas,
      activePersonaId,
      aiSettings,
      chatHistory,
      relationshipMemory,
      uiState,
      activeTab,
      currentBundledModelId,
      sequencerSettings,
      visualSettings,
    };
  } catch {
    return defaults;
  }
}

export async function savePersistedChatState(state: PersistedChatState) {
  const fallbackActivePersonaId = state.personas[0]?.id ?? createDefaultPersonas()[0]?.id ?? '';
  const activePersonaId =
    typeof state.activePersonaId === 'string' && state.activePersonaId.trim().length > 0
      ? state.activePersonaId
      : fallbackActivePersonaId;

  const entries = [
    [STORAGE_KEYS.personas, JSON.stringify(state.personas)],
    [STORAGE_KEYS.activePersonaId, activePersonaId],
    [STORAGE_KEYS.aiSettings, JSON.stringify(state.aiSettings)],
    [STORAGE_KEYS.chatHistory, JSON.stringify(state.chatHistory)],
    [STORAGE_KEYS.relationshipMemory, JSON.stringify(state.relationshipMemory)],
    [STORAGE_KEYS.uiState, JSON.stringify(state.uiState)],
    [STORAGE_KEYS.activeTab, state.activeTab],
    [STORAGE_KEYS.currentBundledModelId, state.currentBundledModelId],
    [
      STORAGE_KEYS.sequencerSettings,
      JSON.stringify({
        ...state.sequencerSettings,
        playlist: state.sequencerSettings.playlist.filter(
          (entry) => !entry.url.startsWith('blob:'),
        ),
      }),
    ],
    [STORAGE_KEYS.visualSettings, JSON.stringify(state.visualSettings)],
  ] as const;

  await Promise.all(
    entries.map(([key, value]) => {
      if (!key || typeof value !== 'string') {
        throw new Error(`Invalid chat persistence entry for key "${String(key)}"`);
      }

      return setPersistedItem(key, value);
    }),
  );
}
