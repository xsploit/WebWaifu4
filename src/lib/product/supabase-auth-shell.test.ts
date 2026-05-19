import { describe, expect, it, vi } from 'vitest';
import { resolveByokAccountMode } from './account-mode';
import {
  buildSupabaseOAuthRequest,
  buildSupabaseMagicLinkRequest,
  describeByokAccountShell,
  getEnabledSupabaseOAuthProviders,
  requestSupabaseMagicLink,
} from './supabase-auth-shell';
import { readSupabaseBrowserEnv } from './supabase-env';

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
});
