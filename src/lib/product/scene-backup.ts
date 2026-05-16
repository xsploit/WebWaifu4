import type { PersistedChatState } from '../chat/types';
import type { SyncedSettingRecord } from './byok';
import {
  applyCloudSettingRecords,
  buildCloudSettingRecords,
  type CloudSyncSettingKey,
} from './cloud-settings';

export type SceneBackupFile = {
  app: 'yourwifey-byok';
  exportedAt: string;
  formatVersion: 1;
  localOnly: {
    chatHistoryCount: number;
    relationshipMemoryIncluded: false;
  };
  safeSettings: SyncedSettingRecord[];
  sceneId: string | null;
  workspaceId: string;
};

export function createSceneBackup(input: {
  exportedAt?: string;
  sceneId?: string | null;
  state: PersistedChatState;
  workspaceId?: string | null;
}): SceneBackupFile {
  const workspaceId = input.workspaceId?.trim() || 'local-backup';
  return {
    app: 'yourwifey-byok',
    exportedAt: input.exportedAt ?? new Date().toISOString(),
    formatVersion: 1,
    localOnly: {
      chatHistoryCount: input.state.chatHistory.length,
      relationshipMemoryIncluded: false,
    },
    safeSettings: buildCloudSettingRecords({
      now: input.exportedAt,
      sceneId: input.sceneId ?? null,
      state: input.state,
      workspaceId,
    }),
    sceneId: input.sceneId ?? null,
    workspaceId,
  };
}

export function serializeSceneBackup(backup: SceneBackupFile) {
  return `${JSON.stringify(backup, null, 2)}\n`;
}

export function parseSceneBackup(value: string): SceneBackupFile {
  const parsed = JSON.parse(value) as Partial<SceneBackupFile>;
  if (
    parsed.app !== 'yourwifey-byok' ||
    parsed.formatVersion !== 1 ||
    !Array.isArray(parsed.safeSettings)
  ) {
    throw new Error('This is not a compatible YourWifey BYOK backup.');
  }
  return {
    app: 'yourwifey-byok',
    exportedAt:
      typeof parsed.exportedAt === 'string' ? parsed.exportedAt : new Date().toISOString(),
    formatVersion: 1,
    localOnly: {
      chatHistoryCount:
        typeof parsed.localOnly?.chatHistoryCount === 'number'
          ? Math.max(0, Math.round(parsed.localOnly.chatHistoryCount))
          : 0,
      relationshipMemoryIncluded: false,
    },
    safeSettings: parsed.safeSettings.filter(isBackupSettingRecord),
    sceneId: typeof parsed.sceneId === 'string' ? parsed.sceneId : null,
    workspaceId: typeof parsed.workspaceId === 'string' ? parsed.workspaceId : 'local-backup',
  };
}

export function applySceneBackup(state: PersistedChatState, backup: SceneBackupFile) {
  return applyCloudSettingRecords(state, backup.safeSettings);
}

function isBackupSettingRecord(value: unknown): value is SyncedSettingRecord {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const source = value as Partial<SyncedSettingRecord>;
  return (
    typeof source.id === 'string' &&
    isBackupSettingKey(source.key) &&
    (source.storageClass === 'public-overlay' || source.storageClass === 'synced-private') &&
    typeof source.valueJson === 'string' &&
    typeof source.workspaceId === 'string'
  );
}

function isBackupSettingKey(value: unknown): value is CloudSyncSettingKey {
  return (
    value === 'aiSettings' ||
    value === 'character.personaId' ||
    value === 'character.vrmModelId' ||
    value === 'personas' ||
    value === 'scene.twitchChannel' ||
    value === 'sequencerSettings' ||
    value === 'uiState' ||
    value === 'visualSettings'
  );
}
