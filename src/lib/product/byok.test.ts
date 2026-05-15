import { describe, expect, it, vi } from 'vitest';
import {
  assertOverlayTokenClaims,
  assertSettingCanSync,
  classifyByokSetting,
  createProviderSecretDescriptor,
  isValidTwitchChannelName,
  redactProviderSecret,
  type SyncedSettingRecord,
} from './byok';

describe('BYOK product contracts', () => {
  it('keeps provider keys out of synced settings by default', () => {
    expect(classifyByokSetting('openai.apiKey', 'local-indexeddb')).toBe('local-secret');
    expect(classifyByokSetting('openai.apiKey', 'hosted-encrypted-vault')).toBe('hosted-secret');
    expect(classifyByokSetting('visualSettings', 'local-indexeddb')).toBe('public-overlay');
    expect(classifyByokSetting('aiSettings.model', 'local-indexeddb')).toBe('synced-private');
  });

  it('rejects accidental API key sync records', () => {
    const record: SyncedSettingRecord = {
      id: 'setting_1',
      workspaceId: 'workspace_1',
      key: 'openai.apiKey',
      storageClass: 'synced-private',
      valueJson: '"sk-test"',
      updatedAt: '2026-05-15T12:00:00.000Z',
    };

    expect(() => assertSettingCanSync(record)).toThrow(/key vault/i);
  });

  it('redacts provider secrets and stores only descriptors', () => {
    expect(redactProviderSecret('sk-proj-1234567890')).toBe('sk-pro...7890');
    expect(
      createProviderSecretDescriptor({
        id: 'secret_1',
        workspaceId: 'workspace_1',
        provider: 'openai',
        keyName: ' openai.apiKey ',
        mode: 'local-indexeddb',
        secretPreview: 'sk-proj-1234567890',
        createdAt: '2026-05-15T12:00:00.000Z',
      }),
    ).toMatchObject({
      keyName: 'openai.apiKey',
      redactedLabel: 'sk-pro...7890',
    });
  });

  it('validates Twitch channel names for scene ownership', () => {
    expect(isValidTwitchChannelName('#subsect')).toBe(true);
    expect(isValidTwitchChannelName('bad channel')).toBe(false);
  });

  it('requires scoped future-dated overlay tokens', () => {
    vi.setSystemTime(new Date('2026-05-15T12:00:00.000Z'));

    expect(() =>
      assertOverlayTokenClaims({
        workspaceId: 'workspace_1',
        sceneId: 'scene_1',
        scopes: ['overlay:read'],
        expiresAt: '2026-05-15T13:00:00.000Z',
      }),
    ).not.toThrow();

    expect(() =>
      assertOverlayTokenClaims({
        workspaceId: 'workspace_1',
        sceneId: 'scene_1',
        scopes: [],
        expiresAt: '2026-05-15T13:00:00.000Z',
      }),
    ).toThrow(/scope/i);
  });
});
