import { STORAGE_KEYS } from '../chat/defaults';
import type { AiSettings, PersistedChatState, PersonaProfile, UiState } from '../chat/types';
import type { SequencerSettings, VisualSettings } from '../menu/types';
import type { SyncedSettingRecord } from './byok';
import { assertSettingCanSync, classifyByokSetting } from './byok';
import { cloudSettingId } from './cloud-setting-id';

export type CloudSyncSettingKey =
  | 'aiSettings'
  | 'character.personaId'
  | 'character.vrmModelId'
  | 'personas'
  | 'scene.twitchChannel'
  | 'sequencerSettings'
  | 'uiState'
  | 'visualSettings';

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
