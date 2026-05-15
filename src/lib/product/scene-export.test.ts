import { describe, expect, it } from 'vitest';
import type {
  CharacterProfile,
  ProviderSecretDescriptor,
  Scene,
  SyncedSettingRecord,
  Workspace,
} from './byok';
import {
  assertByokSceneExportHasNoSecretMaterial,
  createByokSceneExport,
  parseByokSceneExport,
} from './scene-export';

const workspace: Workspace = {
  id: 'workspace-1',
  ownerUserId: 'user-1',
  name: 'Main Stream',
  storageMode: 'local-only',
  providerKeyMode: 'local-indexeddb',
  createdAt: '2026-05-15T12:00:00.000Z',
  updatedAt: '2026-05-15T12:00:00.000Z',
};

const scene: Scene = {
  id: 'scene-1',
  workspaceId: 'workspace-1',
  name: 'OBS Overlay',
  twitchChannel: 'subsect',
  activeCharacterId: 'character-1',
  createdAt: '2026-05-15T12:00:00.000Z',
  updatedAt: '2026-05-15T12:00:00.000Z',
};

const character: CharacterProfile = {
  id: 'character-1',
  workspaceId: 'workspace-1',
  sceneId: 'scene-1',
  personaId: 'hikari-chan',
  name: 'Hikari',
  vrmModelId: 'hikari-vrm',
  backgroundAssetId: 'hikari-bg',
  ttsProvider: 'fish_speech',
  ttsVoiceId: 'fish-voice',
  createdAt: '2026-05-15T12:00:00.000Z',
  updatedAt: '2026-05-15T12:00:00.000Z',
};

const setting: SyncedSettingRecord = {
  id: 'setting-1',
  workspaceId: 'workspace-1',
  sceneId: 'scene-1',
  characterId: 'character-1',
  key: 'visualSettings',
  storageClass: 'public-overlay',
  valueJson: JSON.stringify({ outline: true, sceneExposure: 1.1 }),
  updatedAt: '2026-05-15T12:00:00.000Z',
};

const descriptor: ProviderSecretDescriptor = {
  id: 'workspace-1:openai:openai.apiKey',
  workspaceId: 'workspace-1',
  provider: 'openai',
  keyName: 'openai.apiKey',
  mode: 'local-indexeddb',
  redactedLabel: 'sk-tes...7890',
  createdAt: '2026-05-15T12:00:00.000Z',
  updatedAt: '2026-05-15T12:00:00.000Z',
};

describe('BYOK scene export', () => {
  it('exports scene settings without provider secret descriptors by default', () => {
    const exported = createByokSceneExport({
      workspace,
      scene,
      characters: [character],
      syncedSettings: [setting],
      providerSecretDescriptors: [descriptor],
      exportedAt: '2026-05-15T12:10:00.000Z',
    });

    expect(exported.providerSecretDescriptors).toEqual([]);
    expect(exported.syncedSettings).toEqual([setting]);
    expect(JSON.stringify(exported)).not.toContain('sk-test');
    expect(parseByokSceneExport(JSON.stringify(exported))).toEqual(exported);
  });

  it('can include redacted provider descriptors without exporting secret material', () => {
    const exported = createByokSceneExport({
      workspace,
      scene,
      characters: [character],
      syncedSettings: [setting],
      providerSecretDescriptors: [descriptor],
      includeProviderDescriptors: true,
      exportedAt: '2026-05-15T12:10:00.000Z',
    });

    expect(exported.providerSecretDescriptors).toEqual([descriptor]);
    expect(JSON.stringify(exported)).toContain('sk-tes...7890');
    expect(JSON.stringify(exported)).not.toContain('sk-test-1234567890');
    expect(() => assertByokSceneExportHasNoSecretMaterial(exported)).not.toThrow();
  });

  it('rejects synced settings that try to export provider API keys', () => {
    expect(() =>
      createByokSceneExport({
        workspace,
        scene,
        characters: [character],
        syncedSettings: [
          {
            ...setting,
            id: 'setting-secret',
            key: 'openai.apiKey',
            storageClass: 'synced-private',
            valueJson: JSON.stringify({ value: 'sk-test-1234567890' }),
          },
        ],
      }),
    ).toThrow('Provider API keys must use the key vault');
  });

  it('rejects nested secret-shaped values in otherwise syncable settings', () => {
    expect(() =>
      createByokSceneExport({
        workspace,
        scene,
        characters: [character],
        syncedSettings: [
          {
            ...setting,
            id: 'setting-nested-secret',
            key: 'aiSettings',
            storageClass: 'synced-private',
            valueJson: JSON.stringify({ provider: { apiKey: 'sk-test-1234567890' } }),
          },
        ],
      }),
    ).toThrow('Synced setting value contains secret-shaped fields');
  });
});
