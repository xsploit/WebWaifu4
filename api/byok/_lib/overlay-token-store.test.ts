import { describe, expect, it, vi } from 'vitest';
import type { SupabaseServerConfig } from '../../../src/lib/product/supabase-env.js';
import { hashOverlayToken } from './overlay-token.js';
import {
  isOverlayTokenRecordActive,
  revokeOverlayTokensForScene,
  storeOverlayTokenRecord,
  type SupabaseFetch,
} from './overlay-token-store.js';

const config: SupabaseServerConfig = {
  adminReady: true,
  anonKey: 'anon',
  authProvider: 'supabase',
  databaseProvider: 'supabase-postgres',
  jwtSecret: null,
  missing: [],
  overlaySigningSecret: 'overlay-secret',
  problems: [],
  serverMissing: [],
  serviceRoleKey: 'service-role',
  status: 'configured',
  storageBucket: 'yourwifey-assets',
  storageProvider: 'supabase-storage',
  url: 'https://project-ref.supabase.co',
};

const claims = {
  expiresAt: '2099-01-01T00:00:00.000Z',
  sceneId: 'scene-1',
  scopes: ['overlay:read' as const, 'scene:read' as const],
  workspaceId: 'workspace-1',
};

describe('overlay token store', () => {
  it('stores only hashed overlay tokens', async () => {
    const fetchFn = vi.fn(
      async () => new Response(null, { status: 204 }),
    ) as unknown as SupabaseFetch;

    await storeOverlayTokenRecord({
      claims,
      config,
      fetchFn,
      token: 'raw-overlay-token',
    });

    const body = JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body));
    expect(body.token_hash).toBe(hashOverlayToken(config, 'raw-overlay-token'));
    expect(JSON.stringify(body)).not.toContain('raw-overlay-token');
  });

  it('rejects revoked overlay token rows and can revoke all scene rows', async () => {
    const token = 'raw-overlay-token';
    const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        expect(url).toContain('/rest/v1/overlay_tokens?workspace_id=eq.workspace-1');
        return jsonResponse([{ token_hash: hashOverlayToken(config, token) }]);
      }
      return jsonResponse([
        {
          expires_at: '2099-01-01T00:00:00.000Z',
          revoked_at: '2026-05-20T00:00:00.000Z',
          scopes: ['overlay:read'],
          token_hash: hashOverlayToken(config, token),
        },
      ]);
    }) as unknown as SupabaseFetch;

    await expect(
      isOverlayTokenRecordActive({
        claims,
        config,
        fetchFn,
        token,
      }),
    ).resolves.toBe(false);

    await expect(
      revokeOverlayTokensForScene({
        config,
        fetchFn,
        sceneId: 'scene-1',
        workspaceId: 'workspace-1',
      }),
    ).resolves.toBe(1);
  });
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status,
  });
}
