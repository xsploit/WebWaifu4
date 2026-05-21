import { STORAGE_KEYS } from '../chat/defaults';
import type {
  AiSettings,
  PersistedChatState,
  PersonaProfile,
  PersonaVoiceBinding,
  TwitchSettings,
  UiState,
  VoiceLabSample,
  VoiceLabVoice,
} from '../chat/types';
import type { SequencerSettings, VisualSettings } from '../menu/types';
import type { SyncedSettingRecord } from './byok';
import { assertSettingCanSync, classifyByokSetting } from './byok';
import { cloudSettingId } from './cloud-setting-id';

export type CloudSyncSettingKey =
  | 'aiSettings'
  | 'character.personaId'
  | 'character.vrmModelId'
  | 'personaVoiceBindings'
  | 'personas'
  | 'scene.twitchChannel'
  | 'sequencerSettings'
  | 'twitchSettings'
  | 'uiState'
  | 'visualSettings'
  | 'voiceLabVoices';

export type CloudSettingPayload = {
  key: CloudSyncSettingKey;
  value: unknown;
};

const SAFE_STATE_TO_CLOUD_SETTINGS = [
  {
    key: 'personas',
    read: (state: PersistedChatState) => state.personas,
  },
  {
    key: 'personaVoiceBindings',
    read: (state: PersistedChatState) => state.personaVoiceBindings,
  },
  {
    key: 'voiceLabVoices',
    read: (state: PersistedChatState) => state.voiceLabVoices,
  },
  {
    key: 'character.personaId',
    read: (state: PersistedChatState) => state.activePersonaId,
  },
  {
    key: 'aiSettings',
    read: (state: PersistedChatState) => state.aiSettings,
  },
  {
    key: 'uiState',
    read: (state: PersistedChatState) => state.uiState,
  },
  {
    key: 'character.vrmModelId',
    read: (state: PersistedChatState) => state.currentBundledModelId,
  },
  {
    key: 'scene.twitchChannel',
    read: (state: PersistedChatState) => state.twitchChannel,
  },
  {
    key: 'twitchSettings',
    read: (state: PersistedChatState) => state.twitchSettings,
  },
  {
    key: 'sequencerSettings',
    read: (state: PersistedChatState) => ({
      ...state.sequencerSettings,
      playlist: state.sequencerSettings.playlist.filter((entry) => !entry.url.startsWith('blob:')),
    }),
  },
  {
    key: 'visualSettings',
    read: (state: PersistedChatState) => state.visualSettings,
  },
] as const satisfies readonly {
  key: CloudSyncSettingKey;
  read: (state: PersistedChatState) => unknown;
}[];

export const LOCAL_ONLY_PERSISTED_SETTING_KEYS = [
  STORAGE_KEYS.chatHistory,
  STORAGE_KEYS.currentCustomVrmModelId,
  STORAGE_KEYS.relationshipMemory,
  STORAGE_KEYS.relationshipMemories,
] as const;

export function buildCloudSettingRecords(input: {
  now?: string;
  sceneId?: string | null;
  state: PersistedChatState;
  workspaceId: string;
}): SyncedSettingRecord[] {
  const now = input.now ?? new Date().toISOString();
  return SAFE_STATE_TO_CLOUD_SETTINGS.map(({ key, read }) => {
    const sceneId =
      key.startsWith('scene.') || key.startsWith('character.')
        ? (input.sceneId ?? undefined)
        : undefined;
    const record: SyncedSettingRecord = {
      id: cloudSettingId({
        key,
        sceneId,
        workspaceId: input.workspaceId,
      }),
      key,
      sceneId,
      storageClass: classifyByokSetting(
        key,
        'local-indexeddb',
      ) as SyncedSettingRecord['storageClass'],
      updatedAt: now,
      valueJson: JSON.stringify(read(input.state)),
      workspaceId: input.workspaceId,
    };
    assertSettingCanSync(record);
    return record;
  });
}

export function buildCloudSettingPatchBody(record: SyncedSettingRecord) {
  assertSettingCanSync(record);
  return {
    characterId: record.characterId ?? null,
    key: record.key,
    sceneId: record.sceneId ?? null,
    storageClass: record.storageClass,
    valueJson: record.valueJson,
  };
}

export function applyCloudSettingRecords(
  state: PersistedChatState,
  records: readonly SyncedSettingRecord[],
): PersistedChatState {
  const next: PersistedChatState = {
    ...state,
    aiSettings: { ...state.aiSettings },
    personas: state.personas.map((persona) => ({ ...persona })),
    sequencerSettings: {
      ...state.sequencerSettings,
      playlist: state.sequencerSettings.playlist.map((entry) => ({ ...entry })),
    },
    uiState: { ...state.uiState },
    visualSettings: { ...state.visualSettings },
    twitchSettings: { ...state.twitchSettings },
  };

  for (const record of records) {
    if (!isSafeCloudSyncKey(record.key)) {
      continue;
    }
    assertSettingCanSync(record);
    const value = safeJson(record.valueJson);
    if (value === undefined) {
      continue;
    }

    switch (record.key) {
      case 'personas': {
        const personas = normalizePersonas(value);
        if (personas.length > 0) {
          next.personas = personas;
          if (!personas.some((persona) => persona.id === next.activePersonaId)) {
            next.activePersonaId = personas[0]?.id ?? next.activePersonaId;
          }
        }
        break;
      }
      case 'personaVoiceBindings':
        next.personaVoiceBindings = normalizePersonaVoiceBindings(value);
        break;
      case 'voiceLabVoices':
        next.voiceLabVoices = normalizeVoiceLabVoices(value);
        break;
      case 'character.personaId':
        if (typeof value === 'string' && value.trim()) {
          next.activePersonaId = value.trim();
        }
        break;
      case 'aiSettings':
        if (isPlainObject(value)) {
          next.aiSettings = { ...next.aiSettings, ...(value as Partial<AiSettings>) };
        }
        break;
      case 'uiState':
        next.uiState = normalizeUiState(value, next.uiState);
        break;
      case 'character.vrmModelId':
        if (typeof value === 'string' && value.trim()) {
          next.currentBundledModelId = value.trim();
          next.currentCustomVrmModelId = '';
        }
        break;
      case 'scene.twitchChannel':
        if (typeof value === 'string') {
          next.twitchChannel = value.trim().toLowerCase().replace(/^#/, '');
        }
        break;
      case 'twitchSettings':
        next.twitchSettings = normalizeTwitchSettings(value, next.twitchSettings);
        break;
      case 'sequencerSettings':
        if (isPlainObject(value)) {
          next.sequencerSettings = {
            ...next.sequencerSettings,
            ...(value as Partial<SequencerSettings>),
          };
        }
        break;
      case 'visualSettings':
        if (isPlainObject(value)) {
          next.visualSettings = {
            ...next.visualSettings,
            ...(value as Partial<VisualSettings>),
          };
        }
        break;
    }
  }

  return next;
}

function normalizeTwitchSettings(value: unknown, fallback: TwitchSettings): TwitchSettings {
  if (!isPlainObject(value)) {
    return fallback;
  }

  const source = value as Partial<TwitchSettings>;
  const localDisplayName = String(source.localDisplayName ?? fallback.localDisplayName)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40);
  const numberValue = (raw: unknown, current: number, min: number, max: number) => {
    const next = typeof raw === 'number' && Number.isFinite(raw) ? Math.round(raw) : current;
    return Math.max(min, Math.min(max, next));
  };

  return {
    aiEnabled: typeof source.aiEnabled === 'boolean' ? source.aiEnabled : fallback.aiEnabled,
    batchFastWaitMs: numberValue(source.batchFastWaitMs, fallback.batchFastWaitMs, 5000, 120000),
    batchHighSize: numberValue(source.batchHighSize, fallback.batchHighSize, 1, 200),
    batchLowSize: numberValue(source.batchLowSize, fallback.batchLowSize, 1, 200),
    batchMaxSize: numberValue(source.batchMaxSize, fallback.batchMaxSize, 1, 300),
    batchMidSize: numberValue(source.batchMidSize, fallback.batchMidSize, 1, 200),
    batchWaitMs: numberValue(source.batchWaitMs, fallback.batchWaitMs, 5000, 120000),
    commandsEnabled:
      typeof source.commandsEnabled === 'boolean' ? source.commandsEnabled : fallback.commandsEnabled,
    contextLimit: numberValue(source.contextLimit, fallback.contextLimit, 10, 300),
    directChatterLimit: numberValue(source.directChatterLimit, fallback.directChatterLimit, 0, 250),
    localDisplayName: localDisplayName || fallback.localDisplayName,
    localTrustedControls:
      typeof source.localTrustedControls === 'boolean'
        ? source.localTrustedControls
        : fallback.localTrustedControls,
    maxBatchMessages: numberValue(source.maxBatchMessages, fallback.maxBatchMessages, 10, 500),
    maxPendingJobs: numberValue(source.maxPendingJobs, fallback.maxPendingJobs, 1, 50),
    mentionRequiredUnderThreshold:
      typeof source.mentionRequiredUnderThreshold === 'boolean'
        ? source.mentionRequiredUnderThreshold
        : fallback.mentionRequiredUnderThreshold,
    replyGapMs: numberValue(source.replyGapMs, fallback.replyGapMs, 0, 30000),
    streamTranscriptionContextLimit: numberValue(
      source.streamTranscriptionContextLimit,
      fallback.streamTranscriptionContextLimit,
      1,
      20,
    ),
    streamTranscriptionEnabled:
      typeof source.streamTranscriptionEnabled === 'boolean'
        ? source.streamTranscriptionEnabled
        : fallback.streamTranscriptionEnabled,
    streamTranscriptionIntervalSeconds: numberValue(
      source.streamTranscriptionIntervalSeconds,
      fallback.streamTranscriptionIntervalSeconds,
      30,
      600,
    ),
    streamTranscriptionModel:
      typeof source.streamTranscriptionModel === 'string' &&
      source.streamTranscriptionModel.trim()
        ? source.streamTranscriptionModel.trim().slice(0, 80)
        : fallback.streamTranscriptionModel,
    streamTranscriptionSampleSeconds: numberValue(
      source.streamTranscriptionSampleSeconds,
      fallback.streamTranscriptionSampleSeconds,
      5,
      60,
    ),
    streamVisionContextEnabled:
      typeof source.streamVisionContextEnabled === 'boolean'
        ? source.streamVisionContextEnabled
        : fallback.streamVisionContextEnabled,
    streamVisionDetail:
      source.streamVisionDetail === 'auto' ||
      source.streamVisionDetail === 'high' ||
      source.streamVisionDetail === 'low'
        ? source.streamVisionDetail
        : fallback.streamVisionDetail,
    streamVisionIntervalSeconds: numberValue(
      source.streamVisionIntervalSeconds,
      fallback.streamVisionIntervalSeconds,
      30,
      600,
    ),
    streamVisionMaxAgeSeconds: numberValue(
      source.streamVisionMaxAgeSeconds,
      fallback.streamVisionMaxAgeSeconds,
      15,
      600,
    ),
  };
}

export function isSafeCloudSyncKey(key: string): key is CloudSyncSettingKey {
  const normalized = key.trim();
  return SAFE_STATE_TO_CLOUD_SETTINGS.some((entry) => entry.key === normalized);
}

function safeJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function isPlainObject(value: unknown) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizePersonas(value: unknown): PersonaProfile[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => {
      if (!isPlainObject(item)) {
        return null;
      }
      const source = item as Partial<PersonaProfile>;
      if (typeof source.id !== 'string' || typeof source.name !== 'string') {
        return null;
      }
      return {
        description: String(source.description ?? ''),
        id: source.id,
        name: source.name,
        systemPrompt: String(source.systemPrompt ?? ''),
        userNickname: String(source.userNickname ?? ''),
      } satisfies PersonaProfile;
    })
    .filter((persona): persona is PersonaProfile => Boolean(persona));
}

function normalizePersonaVoiceBindings(value: unknown): Record<string, PersonaVoiceBinding> {
  if (!isPlainObject(value)) {
    return {};
  }

  const entries: Array<[string, PersonaVoiceBinding]> = [];
  for (const [personaId, rawBinding] of Object.entries(value as Record<string, unknown>)) {
    if (!isPlainObject(rawBinding)) {
      continue;
    }
    const source = rawBinding as Partial<PersonaVoiceBinding>;
    const rawProvider = source.provider as string | undefined;
    const provider = rawProvider === 'orpheus' ? 'fish-speech' : source.provider;
    const voiceId = String(source.voiceId ?? '').trim();
    if (
      !voiceId ||
      (provider !== 'piper' && provider !== 'fish-speech' && provider !== 'inworld')
    ) {
      continue;
    }
    entries.push([
      personaId,
      {
        customVoiceId:
          typeof source.customVoiceId === 'string' && source.customVoiceId.trim()
            ? source.customVoiceId.trim()
            : undefined,
        label: String(source.label ?? voiceId),
        modelId:
          typeof source.modelId === 'string' && source.modelId.trim()
            ? source.modelId.trim()
            : undefined,
        provider,
        updatedAt:
          typeof source.updatedAt === 'number' && Number.isFinite(source.updatedAt)
            ? source.updatedAt
            : 0,
        voiceId,
      },
    ]);
  }
  return Object.fromEntries(entries);
}

function normalizeVoiceLabVoices(value: unknown): VoiceLabVoice[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item): VoiceLabVoice | null => {
      if (!isPlainObject(item)) {
        return null;
      }
      const source = item as Partial<VoiceLabVoice>;
      const rawProvider = source.provider as string | undefined;
      const provider = rawProvider === 'orpheus' ? 'fish-speech' : source.provider;
      if (
        typeof source.id !== 'string' ||
        typeof source.name !== 'string' ||
        (provider !== 'inworld' && provider !== 'fish-speech')
      ) {
        return null;
      }
      return {
        accent: String(source.accent ?? ''),
        ageVibe: String(source.ageVibe ?? ''),
        assignedPersonaIds: Array.isArray(source.assignedPersonaIds)
          ? source.assignedPersonaIds.map(String)
          : [],
        createdAt:
          typeof source.createdAt === 'number' && Number.isFinite(source.createdAt)
            ? source.createdAt
            : 0,
        description: String(source.description ?? ''),
        emotionalTone: String(source.emotionalTone ?? ''),
        expressiveness:
          typeof source.expressiveness === 'number' && Number.isFinite(source.expressiveness)
            ? source.expressiveness
            : 0.65,
        id: source.id,
        modelId: String(source.modelId ?? ''),
        name: source.name,
        provider,
        providerVoiceId: String(source.providerVoiceId ?? ''),
        sample: normalizeVoiceLabSample(source.sample),
        speakingStyle: String(source.speakingStyle ?? ''),
        stability:
          typeof source.stability === 'number' && Number.isFinite(source.stability)
            ? source.stability
            : 0.5,
        status: source.status === 'ready' ? 'ready' : 'draft',
        updatedAt:
          typeof source.updatedAt === 'number' && Number.isFinite(source.updatedAt)
            ? source.updatedAt
            : 0,
      } satisfies VoiceLabVoice;
    })
    .filter((voice): voice is VoiceLabVoice => Boolean(voice));
}

function normalizeVoiceLabSample(value: unknown): VoiceLabSample | null {
  if (!isPlainObject(value)) {
    return null;
  }
  const source = value as Partial<VoiceLabSample>;
  const sample: VoiceLabSample = {
    fileName: String(source.fileName ?? ''),
    mimeType: String(source.mimeType ?? ''),
    size: typeof source.size === 'number' && Number.isFinite(source.size) ? source.size : 0,
  };
  if (typeof source.lastModified === 'number' && Number.isFinite(source.lastModified)) {
    sample.lastModified = source.lastModified;
  }
  return sample;
}

function normalizeUiState(value: unknown, fallback: UiState): UiState {
  if (!isPlainObject(value)) {
    return fallback;
  }
  const source = value as Partial<UiState>;
  return {
    chatDraft:
      typeof source.chatDraft === 'string' ? source.chatDraft.slice(0, 4000) : fallback.chatDraft,
    chatLogOpen:
      typeof source.chatLogOpen === 'boolean' ? source.chatLogOpen : fallback.chatLogOpen,
    menuOpen: false,
  };
}
