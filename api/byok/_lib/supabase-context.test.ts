import { describe, expect, it, vi } from 'vitest';
import {
  readBearerToken,
  readRouteParam,
  resolveByokApiRouteContext,
  type SupabaseFetch,
} from './supabase-context.js';
import { createByokApiRoute, resolveByokCorsOrigin } from './route-stub.js';
import { hashOverlayToken, issueOverlayToken } from './overlay-token.js';
import { readSupabaseServerEnv } from '../../../src/lib/product/supabase-env.js';

const serverEnv = {
  SUPABASE_URL: 'https://project-ref.supabase.co',
  SUPABASE_ANON_KEY: 'anon-public-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
};

const overlayServerEnv = {
  ...serverEnv,
  OVERLAY_SIGNING_SECRET: 'overlay-secret',
};

describe('BYOK Supabase route context', () => {
  it('fails closed when Supabase admin env is not configured', async () => {
    await expect(
      resolveByokApiRouteContext({
        env: {},
        request: {
          headers: {
            authorization: 'Bearer user-access-token',
          },
        },
        routeId: 'profile.self.read',
      }),
    ).resolves.toBeNull();
  });

  it('hydrates signed-in user and workspace ownership from Supabase REST', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.endsWith('/auth/v1/user')) {
        return jsonResponse({
          id: 'owner-user',
          email: 'owner@example.com',
          user_metadata: { name: 'Owner' },
        });
      }
      if (url.includes('/rest/v1/workspaces?')) {
        return jsonResponse([{ id: 'workspace-1', owner_user_id: 'owner-user' }]);
      }
      if (url.includes('/rest/v1/workspace_members?')) {
        return jsonResponse([{ user_id: 'member-user' }]);
      }
      return jsonResponse({}, 404);
    }) as unknown as SupabaseFetch;

    const context = await resolveByokApiRouteContext({
      env: serverEnv,
      fetchFn,
      request: {
        headers: {
          Authorization: 'Bearer user-access-token',
        },
        query: {
          workspaceId: 'workspace-1',
        },
      },
      routeId: 'workspace.write',
    });

    expect(context?.accountMode?.kind).toBe('supabase-cloud-sync');
    expect(context?.workspace).toEqual({
      workspaceId: 'workspace-1',
      ownerUserId: 'owner-user',
      memberUserIds: ['member-user'],
    });
    expect(fetchFn).toHaveBeenCalledWith(
      'https://project-ref.supabase.co/auth/v1/user',
      expect.objectContaining({
        headers: expect.objectContaining({
          apikey: 'anon-public-key',
          authorization: 'Bearer user-access-token',
        }),
      }),
    );
    expect(fetchFn).toHaveBeenCalledWith(
      'https://project-ref.supabase.co/rest/v1/workspaces?id=eq.workspace-1&select=id,owner_user_id',
      expect.objectContaining({
        headers: expect.objectContaining({
          apikey: 'service-role-key',
          authorization: 'Bearer service-role-key',
        }),
      }),
    );
  });

  it('keeps invalid or missing bearer sessions in guest local-only mode', async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({ error: 'bad token' }, 401),
    ) as unknown as SupabaseFetch;

    const context = await resolveByokApiRouteContext({
      env: serverEnv,
      fetchFn,
      request: {
        headers: {
          authorization: 'Bearer expired-token',
        },
        query: {
          workspaceId: 'workspace-1',
        },
      },
      routeId: 'workspace.read',
    });

    expect(context?.accountMode?.kind).toBe('guest-local-only');
    expect(context?.workspace).toBeNull();
  });

  it('reads bearer tokens and route params case-insensitively', () => {
    expect(
      readBearerToken({
        headers: {
          Authorization: 'Bearer abc123',
        },
      }),
    ).toBe('abc123');
    expect(
      readRouteParam(
        {
          query: {
            workspaceId: ['workspace-1', 'workspace-2'],
          },
        },
        'workspaceId',
      ),
    ).toBe('workspace-1');
  });

  it('requires overlay scene tokens to have an active stored hash row', async () => {
    const config = readSupabaseServerEnv(overlayServerEnv);
    const token = issueOverlayToken({
      config,
      expiresInHours: 24,
      sceneId: 'scene-1',
      workspaceId: 'workspace-1',
    });
    const fetchFn = vi.fn(async (url: string) => {
      if (url.includes('/rest/v1/overlay_tokens?')) {
        return jsonResponse([
          {
            expires_at: '2099-01-01T00:00:00.000Z',
            revoked_at: null,
            scopes: ['overlay:read'],
            token_hash: hashOverlayToken(config, token),
          },
        ]);
      }
      return jsonResponse([], 404);
    }) as unknown as SupabaseFetch;

    await expect(
      resolveByokApiRouteContext({
        env: overlayServerEnv,
        fetchFn,
        request: {
          headers: {
            authorization: `Bearer ${token}`,
          },
          query: {
            sceneId: 'scene-1',
          },
        },
        routeId: 'overlay.scene.read',
      }),
    ).resolves.toMatchObject({
      overlayToken: {
        sceneId: 'scene-1',
        workspaceId: 'workspace-1',
      },
    });

    fetchFn.mockResolvedValueOnce(
      jsonResponse([
        {
          expires_at: '2099-01-01T00:00:00.000Z',
          revoked_at: '2026-05-20T00:00:00.000Z',
          scopes: ['overlay:read'],
          token_hash: hashOverlayToken(config, token),
        },
      ]),
    );

    await expect(
      resolveByokApiRouteContext({
        env: overlayServerEnv,
        fetchFn,
        request: {
          headers: {
            authorization: `Bearer ${token}`,
          },
          query: {
            sceneId: 'scene-1',
          },
        },
        routeId: 'overlay.scene.read',
      }),
    ).resolves.toMatchObject({
      overlayToken: null,
    });
  });

  it('uses an explicit CORS allowlist instead of wildcarding BYOK bearer routes', () => {
    expect(
      resolveByokCorsOrigin({
        env: {
          BYOK_CORS_ALLOWED_ORIGINS:
            'https://overlay.example.test, https://studio.example.test/settings',
        },
        origin: 'https://overlay.example.test',
      }),
    ).toBe('https://overlay.example.test');

    expect(
      resolveByokCorsOrigin({
        env: {
          BYOK_CORS_ALLOWED_ORIGINS: 'https://overlay.example.test',
        },
        origin: 'https://evil.example.test',
      }),
    ).toBe('https://overlay.example.test');

    expect(
      resolveByokCorsOrigin({
        env: {},
        origin: 'http://localhost:4173',
      }),
    ).toBe('http://localhost:4173');

    expect(
      resolveByokCorsOrigin({
        env: {
          NODE_ENV: 'production',
          BYOK_CORS_ALLOWED_ORIGINS: 'http://localhost:4173, https://overlay.example.test',
        },
        origin: 'http://localhost:4173',
      }),
    ).toBe('https://overlay.example.test');
  });

  it('rejects unsupported route methods before resolving sibling contracts', async () => {
    const response = createMockApiResponse();
    const implementation = vi.fn();
    const handler = createByokApiRoute(
      {
        PATCH: 'profile.self.write',
      },
      {
        PATCH: implementation,
      },
    );

    await handler(
      {
        body: {},
        headers: {},
        method: 'GET',
      },
      response,
    );

    expect(response.statusCode).toBe(405);
    expect(response.body).toMatchObject({
      reason: 'method-not-allowed',
      status: 405,
    });
    expect(implementation).not.toHaveBeenCalled();
  });
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status,
  });
}

function createMockApiResponse() {
  return {
    body: null as unknown,
    headers: new Map<string, string>(),
    statusCode: 200,
    json(body: unknown) {
      this.body = body;
    },
    setHeader(name: string, value: string) {
      this.headers.set(name, value);
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
  };
}
