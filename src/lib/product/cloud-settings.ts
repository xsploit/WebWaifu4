import { STORAGE_KEYS } from '../chat/defaults';
import type { PersistedChatState } from '../chat/types';
import type { SyncedSettingRecord } from './byok';
import { assertSettingCanSync, classifyByokSetting, normalizeSettingKey } from './byok';

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
    const record: SyncedSettingRecord = {
      id: cloudSettingId(key),
      key,
      sceneId:
        key.startsWith('scene.') || key.startsWith('character.')
          ? (input.sceneId ?? undefined)
          : undefined,
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

export function cloudSettingId(key: string) {
  return normalizeSettingKey(key).replace(/[^a-zA-Z0-9._-]/g, '_');
}

export function isSafeCloudSyncKey(key: string): key is CloudSyncSettingKey {
  const normalized = key.trim();
  return SAFE_STATE_TO_CLOUD_SETTINGS.some((entry) => entry.key === normalized);
}
