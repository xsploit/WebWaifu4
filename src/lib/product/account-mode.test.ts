import { describe, expect, it } from 'vitest';
import {
  assertCloudSyncAccountMode,
  createProductUserFromSupabaseAuth,
  resolveByokAccountMode,
} from './account-mode';
import { readSupabaseBrowserEnv } from './supabase-env';

describe('BYOK account mode contracts', () => {
  it('keeps guests in local-only mode when Supabase browser env is absent', () => {
    const mode = resolveByokAccountMode({
      supabaseConfig: readSupabaseBrowserEnv({}),
    });

    expect(mode).toMatchObject({
      kind: 'guest-local-only',
      reason: 'supabase-disabled',
      storageMode: 'local-only',
      providerKeyMode: 'local-indexeddb',
      localOnlyAvailable: true,
      loginAvailable: false,
      cloudSyncReady: false,
      user: null,
    });
    expect(() => assertCloudSyncAccountMode(mode)).toThrow(/signed-in account/i);
  });

  it('shows login as available without switching storage modes before sign-in', () => {
    const mode = resolveByokAccountMode({
      supabaseConfig: readSupabaseBrowserEnv({
        VITE_SUPABASE_URL: 'https://project-ref.supabase.co',
        VITE_SUPABASE_ANON_KEY: 'anon-public-key',
      }),
    });

    expect(mode).toMatchObject({
      kind: 'guest-local-only',
      reason: 'not-signed-in',
      storageMode: 'local-only',
      providerKeyMode: 'local-indexeddb',
      loginAvailable: true,
      cloudSyncReady: false,
    });
  });

  it('promotes a Supabase-authenticated user to cloud sync without changing key storage', () => {
    const mode = resolveByokAccountMode({
      now: '2026-05-15T12:00:00.000Z',
      supabaseConfig: readSupabaseBrowserEnv({
        VITE_SUPABASE_URL: 'https://project-ref.supabase.co/',
        VITE_SUPABASE_ANON_KEY: 'anon-public-key',
      }),
      authUser: {
        id: 'user-1',
        email: 'hikari@example.com',
        user_metadata: {
          full_name: 'Hikari Chan',
          apiKey: 'metadata-value-that-must-not-copy',
        },
      },
    });

    expect(mode).toMatchObject({
      kind: 'supabase-cloud-sync',
      reason: 'authenticated',
      storageMode: 'cloud-sync',
      providerKeyMode: 'local-indexeddb',
      loginAvailable: true,
      cloudSyncReady: true,
      user: {
        id: 'user-1',
        authProvider: 'supabase',
        authSubject: 'user-1',
        email: 'hikari@example.com',
        displayName: 'Hikari Chan',
        createdAt: '2026-05-15T12:00:00.000Z',
        updatedAt: '2026-05-15T12:00:00.000Z',
      },
      supabase: {
        status: 'configured',
        projectUrl: 'https://project-ref.supabase.co',
      },
    });
    expect(() => assertCloudSyncAccountMode(mode)).not.toThrow();
    expect(JSON.stringify(mode)).not.toContain('anon-public-key');
    expect(JSON.stringify(mode)).not.toContain('metadata-value-that-must-not-copy');
  });

  it('does not enable cloud sync for an authenticated user when Supabase env is partial', () => {
    const mode = resolveByokAccountMode({
      supabaseConfig: readSupabaseBrowserEnv({
        VITE_SUPABASE_URL: 'https://project-ref.supabase.co',
      }),
      authUser: {
        id: 'user-1',
        email: 'hikari@example.com',
      },
    });

    expect(mode).toMatchObject({
      kind: 'guest-local-only',
      reason: 'supabase-misconfigured',
      storageMode: 'local-only',
      loginAvailable: false,
      cloudSyncReady: false,
      supabase: {
        status: 'misconfigured',
        missing: ['VITE_SUPABASE_ANON_KEY'],
      },
    });
  });

  it('normalizes Supabase user profiles without requiring metadata', () => {
    expect(
      createProductUserFromSupabaseAuth(
        {
          id: ' user-2 ',
          email: ' streamer@example.com ',
        },
        '2026-05-15T12:30:00.000Z',
      ),
    ).toEqual({
      id: 'user-2',
      authProvider: 'supabase',
      authSubject: 'user-2',
      email: 'streamer@example.com',
      displayName: 'streamer',
      createdAt: '2026-05-15T12:30:00.000Z',
      updatedAt: '2026-05-15T12:30:00.000Z',
    });
  });
});
