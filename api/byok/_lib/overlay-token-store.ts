import type { OverlayTokenClaims } from '../../../src/lib/product/byok.js';
import type { SupabaseServerConfig } from '../../../src/lib/product/supabase-env.js';
import { hashOverlayToken } from './overlay-token.js';

export type SupabaseFetch = typeof fetch;

type OverlayTokenRow = {
  expires_at?: unknown;
  revoked_at?: unknown;
  scopes?: unknown;
  token_hash?: unknown;
};

export async function storeOverlayTokenRecord(input: {
  claims: OverlayTokenClaims;
  config: SupabaseServerConfig;
  fetchFn: SupabaseFetch;
  token: string;
}) {
  await fetchSupabaseRest<OverlayTokenRow>(
    input.config,
    '/rest/v1/overlay_tokens?on_conflict=token_hash',
    input.fetchFn,
    {
      body: JSON.stringify({
        expires_at: input.claims.expiresAt,
        revoked_at: null,
        scene_id: input.claims.sceneId,
        scopes: input.claims.scopes,
        token_hash: hashOverlayToken(input.config, input.token),
        workspace_id: input.claims.workspaceId,
      }),
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      method: 'POST',
    },
  );
}

export async function revokeOverlayTokensForScene(input: {
  config: SupabaseServerConfig;
  fetchFn: SupabaseFetch;
  sceneId: string;
  workspaceId: string;
}) {
  const rows = await fetchSupabaseRest<OverlayTokenRow>(
    input.config,
    [
      '/rest/v1/overlay_tokens',
      `?workspace_id=eq.${encodeURIComponent(input.workspaceId)}`,
      `&scene_id=eq.${encodeURIComponent(input.sceneId)}`,
      '&revoked_at=is.null',
      '&select=token_hash',
    ].join(''),
    input.fetchFn,
    {
      body: JSON.stringify({
        revoked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
      headers: {
        Prefer: 'return=representation',
      },
      method: 'PATCH',
    },
  );
  return rows.length;
}

export async function isOverlayTokenRecordActive(input: {
  claims: OverlayTokenClaims;
  config: SupabaseServerConfig;
  fetchFn: SupabaseFetch;
  token: string;
}) {
  const rows = await fetchSupabaseRest<OverlayTokenRow>(
    input.config,
    [
      '/rest/v1/overlay_tokens',
      `?token_hash=eq.${encodeURIComponent(hashOverlayToken(input.config, input.token))}`,
      `&workspace_id=eq.${encodeURIComponent(input.claims.workspaceId)}`,
      `&scene_id=eq.${encodeURIComponent(input.claims.sceneId)}`,
      '&select=token_hash,scopes,expires_at,revoked_at',
      '&limit=1',
    ].join(''),
    input.fetchFn,
  );
  const row = rows[0];
  if (!row || typeof row.token_hash !== 'string') {
    return false;
  }
  const expiresAt = Date.parse(typeof row.expires_at === 'string' ? row.expires_at : '');
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return false;
  }
  if (row.revoked_at !== null && row.revoked_at !== undefined) {
    return false;
  }
  const scopes = Array.isArray(row.scopes) ? row.scopes : [];
  return scopes.includes('overlay:read') || scopes.includes('scene:read');
}

async function fetchSupabaseRest<T>(
  config: SupabaseServerConfig,
  pathAndQuery: string,
  fetchFn: SupabaseFetch,
  init?: RequestInit,
): Promise<T[]> {
  const response = await fetchFn(`${config.url}${pathAndQuery}`, {
    ...init,
    headers: {
      apikey: config.serviceRoleKey ?? '',
      authorization: `Bearer ${config.serviceRoleKey ?? ''}`,
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(`Supabase overlay token request failed with HTTP ${response.status}.`);
  }
  if (response.status === 204) {
    return [];
  }
  const text = await response.text();
  if (!text.trim()) {
    return [];
  }
  const data = JSON.parse(text);
  return Array.isArray(data) ? (data as T[]) : [];
}
