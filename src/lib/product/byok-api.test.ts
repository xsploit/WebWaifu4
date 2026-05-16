import { describe, expect, it } from 'vitest';
import {
  buildAuthenticatedByokRequest,
  buildOverlayTokenRequest,
  fetchByokOverlayConfig,
  fetchByokSettings,
  getSupabaseAccessToken,
  parseOverlayTokenClaims,
  patchByokSetting,
} from './byok-api';
import { SUPABASE_AUTH_SESSION_STORAGE_KEY } from './supabase-auth-session';

describe('BYOK API client helpers', () => {
  it('reads the current Supabase access token from local storage', () => {
    const storage = createStorage({
      [SUPABASE_AUTH_SESSION_STORAGE_KEY]: JSON.stringify({
        accessToken: 'access-token',
        expiresAt: new Date('2030-01-01T00:00:00.000Z').toISOString(),
        refreshToken: null,
        tokenType: 'bearer',
      }),
    });

    expect(getSupabaseAccessToken(storage, Date.parse('2026-05-15T00:00:00.000Z'))).toBe(
      'access-token',
    );
  });

  it('attaches bearer auth and JSON bodies without provider keys', () => {
    const request = buildAuthenticatedByokRequest({
      accessToken: 'access-token',
      body: {
        displayName: 'Subsect',
      },
      method: 'PATCH',
      path: '/api/byok/profile',
    });

    expect(request.url).toBe('/api/byok/profile');
    expect(request.init).toMatchObject({
      body: '{"displayName":"Subsect"}',
      headers: {
        authorization: 'Bearer access-token',
        'content-type': 'application/json',
      },
      method: 'PATCH',
    });
    expect(JSON.stringify(request)).not.toMatch(/apiKey|secret|sk-/i);
  });

  it('fails before making an unauthenticated cloud request', () => {
    expect(() =>
      buildAuthenticatedByokRequest({
        accessToken: null,
        path: '/api/byok/profile',
      }),
    ).toThrow('requires a signed-in Supabase session');
  });

  it('patches cloud settings through the per-workspace route', async () => {
    const fetchImpl = async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe('/api/byok/workspaces/workspace-1/settings/visualSettings');
      expect(init).toMatchObject({
        body: '{"characterId":null,"key":"visualSettings","sceneId":null,"storageClass":"public-overlay","valueJson":"{}"}',
        method: 'PATCH',
      });
      return new Response(
        JSON.stringify({
          ok: true,
          setting: {
            id: 'visualSettings',
            key: 'visualSettings',
            storageClass: 'public-overlay',
            updatedAt: '2026-05-15T00:00:00.000Z',
            valueJson: '{}',
            workspaceId: 'workspace-1',
          },
        }),
        { status: 200 },
      );
    };

    await expect(
      patchByokSetting({
        accessToken: 'access-token',
        fetchImpl,
        record: {
          id: 'visualSettings',
          key: 'visualSettings',
          storageClass: 'public-overlay',
          updatedAt: '2026-05-15T00:00:00.000Z',
          valueJson: '{}',
          workspaceId: 'workspace-1',
        },
      }),
    ).resolves.toMatchObject({
      setting: {
        id: 'visualSettings',
      },
    });
  });

  it('fetches workspace cloud settings as a list', async () => {
    const fetchImpl = async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe('/api/byok/workspaces/workspace-1/settings');
      expect(init?.method).toBe('GET');
      return new Response(
        JSON.stringify({
          ok: true,
          settings: [
            {
              id: 'scene.twitchChannel',
              key: 'scene.twitchChannel',
              storageClass: 'public-overlay',
              updatedAt: '2026-05-15T00:00:00.000Z',
              valueJson: '"subsect"',
              workspaceId: 'workspace-1',
            },
          ],
        }),
        { status: 200 },
      );
    };

    await expect(
      fetchByokSettings({
        accessToken: 'access-token',
        fetchImpl,
        workspaceId: 'workspace-1',
      }),
    ).resolves.toMatchObject({
      settings: [
        {
          key: 'scene.twitchChannel',
        },
      ],
    });
  });

  it('builds overlay-token requests without dashboard bearer state', () => {
    expect(
      buildOverlayTokenRequest({
        path: '/api/byok/overlay/scene-1/config',
        token: 'signed-token',
      }),
    ).toEqual({
      init: {
        headers: {
          authorization: 'Bearer signed-token',
        },
        method: 'GET',
      },
      url: '/api/byok/overlay/scene-1/config',
    });
  });

  it('fetches public overlay config with the scoped overlay token only', async () => {
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('/api/byok/overlay/scene-1/config');
      expect(init).toMatchObject({
        headers: {
          authorization: 'Bearer signed-token',
        },
        method: 'GET',
      });
      expect(JSON.stringify(init)).not.toContain('access-token');
      return new Response(
        JSON.stringify({
          ok: true,
          scene: {
            activeCharacterId: '',
            createdAt: '2026-05-15T00:00:00.000Z',
            id: 'scene-1',
            name: 'Main Overlay',
            twitchChannel: 'subsect',
            updatedAt: '2026-05-15T00:00:00.000Z',
            workspaceId: 'workspace-1',
          },
          settings: [],
          workspaceId: 'workspace-1',
        }),
      );
    };

    await expect(
      fetchByokOverlayConfig({
        fetchImpl,
        sceneId: 'scene-1',
        token: 'signed-token',
      }),
    ).resolves.toMatchObject({
      scene: {
        id: 'scene-1',
      },
      settings: [],
      workspaceId: 'workspace-1',
    });
  });

  it('parses overlay token claims for UI diagnostics', () => {
    const payload = btoa(
      JSON.stringify({
        expiresAt: '2026-05-16T00:00:00.000Z',
        sceneId: 'scene-1',
        scopes: ['overlay:read'],
        workspaceId: 'workspace-1',
      }),
    )
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    expect(parseOverlayTokenClaims(`ywot1.${payload}.signature`)).toMatchObject({
      sceneId: 'scene-1',
      workspaceId: 'workspace-1',
    });
  });
});

function createStorage(initial: Record<string, string>) {
  const values = new Map(Object.entries(initial));
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
