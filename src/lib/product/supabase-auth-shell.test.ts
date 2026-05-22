import { describe, expect, it, vi } from 'vitest';
import { resolveByokAccountMode } from './account-mode';
import {
  buildSupabaseOAuthRequest,
  buildSupabaseMagicLinkRequest,
  describeByokAccountShell,
  fetchSupabaseEnabledOAuthProviders,
  getEnabledSupabaseOAuthProviders,
  requestSupabaseMagicLink,
} from './supabase-auth-shell';
import { getProductAuthCallbackUrl } from './auth-redirect';
import { readSupabaseBrowserEnv } from './supabase-env';
import { SUPABASE_AUTH_STATE_STORAGE_KEY } from './supabase-auth-session';

describe('Supabase auth shell', () => {
  it('keeps the account shell local-only when Supabase browser env is absent', () => {
    const mode = resolveByokAccountMode({
      supabaseConfig: readSupabaseBrowserEnv({}),
    });

    expect(describeByokAccountShell(mode)).toMatchObject({
      modeLabel: 'Guest',
      storageLabel: 'Local only',
      cloudSyncLabel: 'Disabled',
      localOnlyLabel: 'Active',
      providerKeyLabel: 'Browser local',
      loginLabel: 'Unavailable',
    });
  });

  it('builds a Supabase magic-link request with only public anon auth material', () => {
    const config = readSupabaseBrowserEnv({
      VITE_SUPABASE_URL: 'https://project-ref.supabase.co/',
      VITE_SUPABASE_ANON_KEY: 'anon-public-key',
      VITE_SUPABASE_OAUTH_PROVIDERS: 'google,github',
    });
    const request = buildSupabaseMagicLinkRequest({
      config,
      email: ' Streamer@Example.COM ',
      redirectTo: 'https://overlay.example.test/settings',
    });

    expect(request).toMatchObject({
      ok: true,
      email: 'streamer@example.com',
      url: 'https://project-ref.supabase.co/auth/v1/otp',
    });
    expect(request.ok && request.init.method).toBe('POST');
    expect(JSON.stringify(request)).toContain('anon-public-key');
    expect(JSON.stringify(request)).toContain('streamer@example.com');
    expect(JSON.stringify(request)).toContain('https://overlay.example.test/settings');
    expect(JSON.stringify(request)).not.toMatch(/service[_-]?role|jwt|openai|fish|inworld|tavily/i);
  });

  it('builds a Supabase OAuth redirect URL for Google and GitHub', () => {
    const config = readSupabaseBrowserEnv({
      VITE_SUPABASE_URL: 'https://project-ref.supabase.co/',
      VITE_SUPABASE_ANON_KEY: 'anon-public-key',
      VITE_SUPABASE_OAUTH_PROVIDERS: 'google,github',
    });

    expect(
      buildSupabaseOAuthRequest({
        config,
        provider: 'google',
        redirectTo: 'https://overlay.example.test/auth/callback',
      }),
    ).toEqual({
      ok: true,
      provider: 'google',
      url: 'https://project-ref.supabase.co/auth/v1/authorize?provider=google&redirect_to=https%3A%2F%2Foverlay.example.test%2Fauth%2Fcallback',
    });

    expect(
      buildSupabaseOAuthRequest({
        config,
        provider: 'github',
        redirectTo: 'https://overlay.example.test/auth/callback',
      }),
    ).toMatchObject({
      ok: true,
      provider: 'github',
    });
  });

  it('stores OAuth callback state when browser storage is available', () => {
    const storage = createStorage();
    const config = readSupabaseBrowserEnv({
      VITE_SUPABASE_URL: 'https://project-ref.supabase.co/',
      VITE_SUPABASE_ANON_KEY: 'anon-public-key',
      VITE_SUPABASE_OAUTH_PROVIDERS: 'google,github',
    });

    const request = buildSupabaseOAuthRequest({
      config,
      provider: 'github',
      redirectTo: 'https://overlay.example.test/auth/callback',
      storage,
    });

    expect(request).toMatchObject({ ok: true });
    expect(request.ok && new URL(request.url).searchParams.get('state')).toBeTruthy();
    expect(storage.getItem(SUPABASE_AUTH_STATE_STORAGE_KEY)).toContain(
      request.ok ? new URL(request.url).searchParams.get('state') : '',
    );
  });

  it('adds callback state to magic-link redirect URLs when storage is available', () => {
    const storage = createStorage();
    const request = buildSupabaseMagicLinkRequest({
      config: readSupabaseBrowserEnv({
        VITE_SUPABASE_URL: 'https://project-ref.supabase.co',
        VITE_SUPABASE_ANON_KEY: 'anon-public-key',
      }),
      email: 'streamer@example.com',
      redirectTo: 'https://overlay.example.test/auth/callback',
      storage,
    });

    expect(request).toMatchObject({ ok: true });
    const body = request.ok ? JSON.parse(String(request.init.body)) : {};
    expect(new URL(String(body.email_redirect_to)).searchParams.get('yw_auth_state')).toBeTruthy();
    expect(storage.getItem(SUPABASE_AUTH_STATE_STORAGE_KEY)).toContain(
      new URL(String(body.email_redirect_to)).searchParams.get('yw_auth_state'),
    );
  });

  it('can force a canonical public OAuth callback instead of the current localhost page', () => {
    vi.stubEnv('VITE_PUBLIC_APP_URL', 'https://yourwifey-byok.vercel.app/');

    expect(getProductAuthCallbackUrl('http://localhost:3000/login')).toBe(
      'https://yourwifey-byok.vercel.app/auth/callback',
    );

    vi.unstubAllEnvs();
    vi.stubEnv('VITE_PUBLIC_APP_URL', '');
    expect(getProductAuthCallbackUrl('http://localhost:3000/login')).toBe(
      'http://localhost:3000/auth/callback',
    );
    vi.unstubAllEnvs();
  });

  it('does not build an OAuth redirect when cloud sync is unavailable', () => {
    expect(
      buildSupabaseOAuthRequest({
        config: readSupabaseBrowserEnv({}),
        provider: 'google',
        redirectTo: 'https://overlay.example.test/auth/callback',
      }),
    ).toMatchObject({
      ok: false,
      reason: 'cloud-sync-disabled',
    });
  });

  it('does not build an OAuth redirect for a provider that is not enabled in config', () => {
    const config = readSupabaseBrowserEnv({
      VITE_SUPABASE_URL: 'https://project-ref.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'anon-public-key',
      VITE_SUPABASE_OAUTH_PROVIDERS: 'google',
    });

    expect(getEnabledSupabaseOAuthProviders(config)).toEqual(['google']);
    expect(
      buildSupabaseOAuthRequest({
        config,
        provider: 'github',
        redirectTo: 'https://overlay.example.test/auth/callback',
      }),
    ).toMatchObject({
      ok: false,
      message: 'GitHub login is not enabled for this deployment.',
    });
  });

  it('does not request login when cloud-sync config is missing or the email is invalid', () => {
    expect(
      buildSupabaseMagicLinkRequest({
        config: readSupabaseBrowserEnv({}),
        email: 'streamer@example.com',
      }),
    ).toMatchObject({
      ok: false,
      reason: 'cloud-sync-disabled',
    });

    expect(
      buildSupabaseMagicLinkRequest({
        config: readSupabaseBrowserEnv({
          VITE_SUPABASE_URL: 'https://project-ref.supabase.co',
          VITE_SUPABASE_ANON_KEY: 'anon-public-key',
        }),
        email: 'not-an-email',
      }),
    ).toMatchObject({
      ok: false,
      reason: 'invalid-email',
    });
  });

  it('posts the magic-link request through an injected fetch implementation', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }));
    const result = await requestSupabaseMagicLink({
      config: readSupabaseBrowserEnv({
        VITE_SUPABASE_URL: 'https://project-ref.supabase.co',
        VITE_SUPABASE_ANON_KEY: 'anon-public-key',
      }),
      email: 'streamer@example.com',
      fetchImpl,
    });

    expect(result).toEqual({
      ok: true,
      message: 'Login link requested for streamer@example.com.',
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://project-ref.supabase.co/auth/v1/otp',
      expect.objectContaining({
        method: 'POST',
      }),
    );
  });

  it('reads enabled OAuth providers from Supabase Auth settings', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ external: { google: true, github: false } }), {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        }),
    );

    const result = await fetchSupabaseEnabledOAuthProviders({
      config: readSupabaseBrowserEnv({
        VITE_SUPABASE_URL: 'https://project-ref.supabase.co',
        VITE_SUPABASE_ANON_KEY: 'anon-public-key',
      }),
      fetchImpl,
    });

    expect(result).toEqual({
      ok: true,
      providers: ['google'],
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://project-ref.supabase.co/auth/v1/settings',
      expect.objectContaining({
        headers: {
          apikey: 'anon-public-key',
          Authorization: 'Bearer anon-public-key',
        },
        method: 'GET',
      }),
    );
  });

  it('returns an empty OAuth provider list when Supabase Auth has providers disabled', async () => {
    const result = await fetchSupabaseEnabledOAuthProviders({
      config: readSupabaseBrowserEnv({
        VITE_SUPABASE_URL: 'https://project-ref.supabase.co',
        VITE_SUPABASE_ANON_KEY: 'anon-public-key',
        VITE_SUPABASE_OAUTH_PROVIDERS: 'google,github',
      }),
      fetchImpl: vi.fn(
        async () =>
          new Response(JSON.stringify({ external: { google: false, github: false } }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          }),
      ),
    });

    expect(result).toEqual({
      ok: true,
      providers: [],
    });
  });
});

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => {
      values.delete(key);
    },
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}
