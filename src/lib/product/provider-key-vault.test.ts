import { describe, expect, it } from 'vitest';
import {
  createBrowserProviderKeyVault,
  exportProviderSecretDescriptorsForSync,
  type ProviderKeyVaultStorage,
} from './provider-key-vault';

function createStorage(): ProviderKeyVaultStorage & { dump(): Record<string, string> } {
  const values = new Map<string, string>();
  return {
    dump: () => Object.fromEntries(values.entries()),
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

describe('provider key vault', () => {
  it('stores secrets locally and returns only redacted descriptors for sync', async () => {
    const storage = createStorage();
    const vault = createBrowserProviderKeyVault({
      workspaceId: 'workspace-1',
      storage,
    });

    const descriptor = await vault.setSecret({
      provider: 'openai',
      keyName: 'openai.apiKey',
      secret: 'sk-test-1234567890',
      now: '2026-05-15T12:00:00.000Z',
    });

    expect(descriptor).toEqual({
      id: 'workspace-1:openai:openai.apiKey',
      workspaceId: 'workspace-1',
      provider: 'openai',
      keyName: 'openai.apiKey',
      mode: 'local-indexeddb',
      redactedLabel: 'sk-tes...7890',
      createdAt: '2026-05-15T12:00:00.000Z',
      updatedAt: '2026-05-15T12:00:00.000Z',
    });
    expect(await vault.getSecret('openai', 'openai.apiKey')).toBe('sk-test-1234567890');

    const syncPayload = exportProviderSecretDescriptorsForSync(await vault.listSecretDescriptors());
    expect(JSON.stringify(syncPayload)).not.toContain('sk-test-1234567890');
    expect(syncPayload[0]?.redactedLabel).toBe('sk-tes...7890');
  });

  it('updates an existing provider key without changing its createdAt timestamp', async () => {
    const storage = createStorage();
    const vault = createBrowserProviderKeyVault({
      workspaceId: 'workspace-1',
      storage,
    });

    await vault.setSecret({
      provider: 'fish_speech',
      keyName: 'fishSpeech.apiKey',
      secret: 'fish-old-secret',
      now: '2026-05-15T12:00:00.000Z',
    });
    const updated = await vault.setSecret({
      provider: 'fish_speech',
      keyName: 'fishSpeech.apiKey',
      secret: 'fish-new-secret',
      now: '2026-05-15T12:05:00.000Z',
    });

    expect(updated.createdAt).toBe('2026-05-15T12:00:00.000Z');
    expect(updated.updatedAt).toBe('2026-05-15T12:05:00.000Z');
    expect(await vault.getSecret('fish_speech', 'fishSpeech.apiKey')).toBe('fish-new-secret');
  });

  it('stores OpenRouter keys as local-only provider secrets', async () => {
    const storage = createStorage();
    const vault = createBrowserProviderKeyVault({
      workspaceId: 'workspace-1',
      storage,
    });

    const descriptor = await vault.setSecret({
      provider: 'openrouter',
      keyName: 'openrouter.apiKey',
      secret: 'or-test-secret-123456',
      now: '2026-05-15T12:00:00.000Z',
    });

    expect(descriptor).toMatchObject({
      id: 'workspace-1:openrouter:openrouter.apiKey',
      keyName: 'openrouter.apiKey',
      provider: 'openrouter',
      redactedLabel: 'or-tes...3456',
    });
    expect(await vault.getSecret('openrouter', 'openrouter.apiKey')).toBe('or-test-secret-123456');
    expect(JSON.stringify(exportProviderSecretDescriptorsForSync([descriptor]))).not.toContain(
      'or-test-secret-123456',
    );
  });

  it('deletes secret material and removes the descriptor from the local index', async () => {
    const storage = createStorage();
    const vault = createBrowserProviderKeyVault({
      workspaceId: 'workspace-1',
      storage,
    });

    await vault.setSecret({
      provider: 'inworld',
      keyName: 'inworld.apiKey',
      secret: 'inworld-secret',
      now: '2026-05-15T12:00:00.000Z',
    });
    await vault.deleteSecret('inworld', 'inworld.apiKey');

    expect(await vault.getSecret('inworld', 'inworld.apiKey')).toBeNull();
    expect(await vault.listSecretDescriptors()).toEqual([]);
    expect(JSON.stringify(storage.dump())).not.toContain('inworld-secret');
  });

  it('fails closed when browser storage is unavailable', async () => {
    const vault = createBrowserProviderKeyVault({
      workspaceId: 'workspace-1',
      storage: null,
    });

    await expect(
      vault.setSecret({
        provider: 'tavily',
        keyName: 'tavily.apiKey',
        secret: 'tvly-test',
      }),
    ).rejects.toThrow('Provider key vault storage is not available');
    await expect(vault.getSecret('tavily', 'tavily.apiKey')).resolves.toBeNull();
  });
});
