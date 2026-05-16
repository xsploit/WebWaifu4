import { describe, expect, it, vi } from 'vitest';
import { readSupabaseBrowserEnv } from './supabase-env';
import {
  SUPABASE_AUTH_SESSION_STORAGE_KEY,
  buildSupabaseUserRequest,
  clearPersistedSupabaseAuthSession,
  getSupabaseAuthSessionExpiryDelayMs,
  hydrateSupabaseAuthSession,
  loadPersistedSupabaseAuthSession,
  parseSupabaseAuthCallbackUrl,
  persistSupabaseAuthSession,
  startSupabaseAuthSessionLifecycle,
} from './supabase-auth-session';

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

const configuredSupabase = readSupabaseBrowserEnv({
  VITE_SUPABASE_URL: 'https://project-ref.supabase.co/',
  VITE_SUPABASE_ANON_KEY: 'anon-public-key',
});

describe('Supabase auth session hydration', () => {
  it('parses magic-link callback tokens and strips auth material from the URL', () => {
    const parsed = parseSupabaseAuthCallbackUrl(
      'https://overlay.example.test/settings#access_token=access-123&refresh_token=refresh-456&expires_in=3600&provider_token=oauth-provider-token',
      Date.parse('2026-05-15T12:00:00.000Z'),
    );

    expect(parsed).toMatchObject({
      kind: 'session',
      cleanUrl: 'https://overlay.example.test/settings',
      session: {
        accessToken: 'access-123',
        refreshToken: 'refresh-456',
        tokenType: 'bearer',
        expiresAt: '2026-05-15T13:00:00.000Z',
      },
    });
    expect(JSON.stringify(parsed)).not.toContain('oauth-provider-token');
  });

  it('hydrates a Supabase auth identity through the public anon user endpoint', async () => {
    const storage = createStorage();
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          id: 'user-1',
          email: 'streamer@example.com',
          user_metadata: {
            full_name: 'Streamer One',
            openaiApiKey: 'metadata-value-that-must-not-copy',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    const result = await hydrateSupabaseAuthSession({
      config: configuredSupabase,
      fetchImpl,
      href: 'https://overlay.example.test/settings#access_token=access-123&refresh_token=refresh-456&expires_in=3600',
      nowMs: Date.parse('2026-05-15T12:00:00.000Z'),
      storage,
    });

    expect(result).toMatchObject({
      status: 'authenticated',
      cleanUrl: 'https://overlay.example.test/settings',
      user: {
        id: 'user-1',
        email: 'streamer@example.com',
        user_metadata: {
          full_name: 'Streamer One',
        },
      },
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://project-ref.supabase.co/auth/v1/user',
      expect.objectContaining({
        headers: expect.objectContaining({
          apikey: 'anon-public-key',
          Authorization: 'Bearer access-123',
        }),
        method: 'GET',
      }),
    );
    expect(storage.getItem(SUPABASE_AUTH_SESSION_STORAGE_KEY)).toContain('access-123');
    expect(JSON.stringify(result)).not.toContain('anon-public-key');
    expect(JSON.stringify(result)).not.toContain('metadata-value-that-must-not-copy');
  });

  it('loads an existing unexpired session and clears a local sign-out', () => {
    const storage = createStorage();
    persistSupabaseAuthSession(
      {
        accessToken: 'access-123',
        expiresAt: '2026-05-15T13:00:00.000Z',
        refreshToken: null,
        tokenType: 'bearer',
      },
      storage,
    );

    expect(
      loadPersistedSupabaseAuthSession(storage, Date.parse('2026-05-15T12:00:00.000Z')),
    ).toMatchObject({
      accessToken: 'access-123',
    });

    clearPersistedSupabaseAuthSession(storage);
    expect(loadPersistedSupabaseAuthSession(storage)).toBeNull();
  });

  it('keeps local-only mode when no session is available', async () => {
    const fetchImpl = vi.fn();
    const result = await hydrateSupabaseAuthSession({
      config: configuredSupabase,
      fetchImpl,
      href: 'https://overlay.example.test/settings',
      storage: createStorage(),
    });

    expect(result).toMatchObject({
      status: 'no-session',
      user: null,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('does not hydrate expired sessions', async () => {
    const storage = createStorage();
    persistSupabaseAuthSession(
      {
        accessToken: 'access-123',
        expiresAt: '2026-05-15T11:59:00.000Z',
        refreshToken: 'refresh-456',
        tokenType: 'bearer',
      },
      storage,
    );

    const result = await hydrateSupabaseAuthSession({
      config: configuredSupabase,
      fetchImpl: vi.fn(),
      nowMs: Date.parse('2026-05-15T12:00:00.000Z'),
      storage,
    });

    expect(result).toMatchObject({
      status: 'no-session',
      user: null,
    });
    expect(storage.getItem(SUPABASE_AUTH_SESSION_STORAGE_KEY)).toBeNull();
  });

  it('keeps PKCE code callbacks out of cloud-sync mode until code exchange exists', async () => {
    const result = await hydrateSupabaseAuthSession({
      config: configuredSupabase,
      fetchImpl: vi.fn(),
      href: 'https://overlay.example.test/settings?code=pkce-code-123',
      storage: createStorage(),
    });

    expect(result).toMatchObject({
      status: 'pkce-code-unsupported',
      cleanUrl: 'https://overlay.example.test/settings',
      user: null,
    });
  });

  it('builds no user request when Supabase config or session input is unsafe', () => {
    expect(
      buildSupabaseUserRequest({
        config: readSupabaseBrowserEnv({}),
        session: {
          accessToken: 'access-123',
          expiresAt: null,
          refreshToken: null,
          tokenType: 'bearer',
        },
      }),
    ).toMatchObject({
      ok: false,
      reason: 'cloud-sync-unavailable',
    });

    expect(
      buildSupabaseUserRequest({
        config: configuredSupabase,
        session: {
          accessToken: '',
          expiresAt: null,
          refreshToken: null,
          tokenType: 'bearer',
        },
      }),
    ).toMatchObject({
      ok: false,
      reason: 'missing-access-token',
    });
  });

  it('calculates expiry delay so the app can re-hydrate stale sessions', () => {
    expect(
      getSupabaseAuthSessionExpiryDelayMs(
        {
          accessToken: 'access-123',
          expiresAt: '2026-05-15T12:00:10.000Z',
          refreshToken: null,
          tokenType: 'bearer',
        },
        Date.parse('2026-05-15T12:00:00.000Z'),
      ),
    ).toBe(10_000);

    expect(
      getSupabaseAuthSessionExpiryDelayMs(
        {
          accessToken: 'access-123',
          expiresAt: '2026-05-15T11:59:59.000Z',
          refreshToken: null,
          tokenType: 'bearer',
        },
        Date.parse('2026-05-15T12:00:00.000Z'),
      ),
    ).toBe(0);
  });

  it('watches storage changes so cross-tab logout updates account mode', async () => {
    const storage = createStorage();
    const listeners = new Map<string, (event: Event) => void>();
    persistSupabaseAuthSession(
      {
        accessToken: 'access-123',
        expiresAt: '2026-05-15T13:00:00.000Z',
        refreshToken: null,
        tokenType: 'bearer',
      },
      storage,
    );
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          id: 'user-1',
          email: 'streamer@example.com',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });
    const results: string[] = [];

    const lifecycle = startSupabaseAuthSessionLifecycle({
      config: configuredSupabase,
      fetchImpl,
      nowMs: () => Date.parse('2026-05-15T12:00:00.000Z'),
      onResult: (result) => results.push(result.status),
      storage,
      windowTarget: {
        addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
          listeners.set(type, listener as (event: Event) => void);
        },
        removeEventListener(type: string) {
          listeners.delete(type);
        },
      },
    });

    await vi.waitFor(() => expect(results).toEqual(['authenticated']));
    clearPersistedSupabaseAuthSession(storage);
    listeners.get('storage')?.({ key: SUPABASE_AUTH_SESSION_STORAGE_KEY } as StorageEvent);

    await vi.waitFor(() => expect(results).toEqual(['authenticated', 'no-session']));
    lifecycle.stop();
    expect(listeners.has('storage')).toBe(false);
  });
});
