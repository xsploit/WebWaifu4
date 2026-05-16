import { describe, expect, it, vi } from 'vitest';
import type { SupabaseServerConfig } from '../../../src/lib/product/supabase-env.js';
import {
  ensureByokProfile,
  ensureDefaultScene,
  ensureDefaultWorkspace,
  fetchSyncedSetting,
  upsertSyncedSetting,
} from './product-data.js';
import type { SupabaseFetch } from './supabase-context.js';

const config: SupabaseServerConfig = {
  adminReady: true,
  anonKey: 'anon',
  authProvider: 'supabase',
  databaseProvider: 'supabase-postgres',
  jwtSecret: null,
  missing: [],
  problems: [],
  serverMissing: [],
  serviceRoleKey: 'service-role',
  status: 'configured',
  storageBucket: 'yourwifey-assets',
  storageProvider: 'supabase-storage',
  url: 'https://project-ref.supabase.co',
};

describe('BYOK product data bootstrap', () => {
  it('creates profile, workspace, and scene rows only when missing', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/rest/v1/profiles?') && init?.method !== 'POST') {
        return jsonResponse([]);
      }
      if (url.endsWith('/rest/v1/profiles?on_conflict=id')) {
        return jsonResponse([
          {
            avatar_url: null,
            created_at: '2026-05-15T00:00:00.000Z',
            display_name: 'Subsect',
            email: 'subsect@example.com',
            id: 'user-1',
            updated_at: '2026-05-15T00:00:00.000Z',
          },
        ]);
      }
      if (url.includes('/rest/v1/workspaces?') && init?.method !== 'POST') {
        return jsonResponse([]);
      }
      if (url.endsWith('/rest/v1/workspaces')) {
        return jsonResponse([
          {
            created_at: '2026-05-15T00:00:00.000Z',
            id: 'workspace-1',
            name: 'My Stream',
            owner_user_id: 'user-1',
            provider_key_mode: 'local-indexeddb',
            storage_mode: 'cloud-sync',
            updated_at: '2026-05-15T00:00:00.000Z',
          },
        ]);
      }
      if (url.includes('/rest/v1/scenes?') && init?.method !== 'POST') {
        return jsonResponse([]);
      }
      if (url.endsWith('/rest/v1/scenes')) {
        return jsonResponse([
          {
            active_character_id: '',
            created_at: '2026-05-15T00:00:00.000Z',
            id: 'scene-1',
            name: 'Main Overlay',
            twitch_channel: 'subsect',
            updated_at: '2026-05-15T00:00:00.000Z',
            workspace_id: 'workspace-1',
          },
        ]);
      }
      return jsonResponse([], 404);
    });
    const fetchFn = fetchMock as unknown as SupabaseFetch;

    const authUser = {
      email: 'subsect@example.com',
      id: 'user-1',
      user_metadata: { name: 'Subsect' },
    };

    await expect(ensureByokProfile({ authUser, config, fetchFn })).resolves.toMatchObject({
      displayName: 'Subsect',
      id: 'user-1',
    });
    await expect(
      ensureDefaultWorkspace({ config, fetchFn, userId: 'user-1' }),
    ).resolves.toMatchObject({
      id: 'workspace-1',
      memberRole: 'owner',
      name: 'My Stream',
    });
    await expect(
      ensureDefaultScene({ config, fetchFn, workspaceId: 'workspace-1' }),
    ).resolves.toMatchObject({
      id: 'scene-1',
      name: 'Main Overlay',
      twitchChannel: 'subsect',
    });

    const postCalls = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(postCalls).toHaveLength(3);
    expect(postCalls.map(([, init]) => init?.body).join('\n')).not.toMatch(/apiKey|secret|sk-/i);
  });

  it('upserts and reads synced settings without accepting secret-shaped keys', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/rest/v1/synced_settings?on_conflict=id') && init?.method === 'POST') {
        return jsonResponse([
          {
            id: 'visualSettings',
            key: 'visualSettings',
            storage_class: 'public-overlay',
            updated_at: '2026-05-15T00:00:00.000Z',
            value_json: '{}',
            workspace_id: 'workspace-1',
          },
        ]);
      }
      if (url.includes('/rest/v1/synced_settings?')) {
        return jsonResponse([
          {
            id: 'visualSettings',
            key: 'visualSettings',
            storage_class: 'public-overlay',
            updated_at: '2026-05-15T00:00:00.000Z',
            value_json: '{}',
            workspace_id: 'workspace-1',
          },
        ]);
      }
      return jsonResponse([], 404);
    });
    const fetchFn = fetchMock as unknown as SupabaseFetch;

    await expect(
      upsertSyncedSetting({
        body: {
          key: 'visualSettings',
          storageClass: 'public-overlay',
          valueJson: '{}',
        },
        config,
        fetchFn,
        settingId: 'visualSettings',
        workspaceId: 'workspace-1',
      }),
    ).resolves.toMatchObject({
      key: 'visualSettings',
      storageClass: 'public-overlay',
    });

    await expect(
      fetchSyncedSetting({
        config,
        fetchFn,
        settingId: 'visualSettings',
        workspaceId: 'workspace-1',
      }),
    ).resolves.toMatchObject({
      id: 'visualSettings',
      valueJson: '{}',
    });

    await expect(
      upsertSyncedSetting({
        body: {
          key: 'openai.apiKey',
          storageClass: 'synced-private',
          valueJson: '"sk-test"',
        },
        config,
        fetchFn,
        settingId: 'openai.apiKey',
        workspaceId: 'workspace-1',
      }),
    ).rejects.toThrow(/key vault/i);
  });
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status,
  });
}
