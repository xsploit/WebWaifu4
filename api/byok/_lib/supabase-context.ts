import {
  resolveByokAccountMode,
  type SupabaseAuthIdentity,
} from '../../../src/lib/product/account-mode.js';
import type { ByokRouteStubContext } from '../../../src/lib/product/byok-route-stub.js';
import type {
  ByokCloudRouteId,
  ByokWorkspaceAccessSnapshot,
} from '../../../src/lib/product/server-route-ownership.js';
import {
  readSupabaseServerEnv,
  toSupabasePublicConfig,
  type SupabaseEnvSource,
  type SupabaseServerConfig,
} from '../../../src/lib/product/supabase-env.js';
import { readOverlayTokenFromRequest, verifyOverlayToken } from './overlay-token.js';

export type ByokApiRequestLike = {
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
};

export type SupabaseFetch = typeof fetch;

export type ResolvedByokApiRouteRequest = {
  authUser: SupabaseAuthIdentity | null;
  config: SupabaseServerConfig;
  context: ByokRouteStubContext;
  fetchFn: SupabaseFetch;
};

type SupabaseUserResponse = {
  id?: unknown;
  email?: unknown;
  user_metadata?: unknown;
};

type WorkspaceRow = {
  id?: unknown;
  owner_user_id?: unknown;
};

type WorkspaceMemberRow = {
  user_id?: unknown;
};

export async function resolveByokApiRouteContext(input: {
  env?: SupabaseEnvSource;
  fetchFn?: SupabaseFetch;
  request: ByokApiRequestLike;
  routeId: ByokCloudRouteId;
}): Promise<ByokRouteStubContext | null> {
  const resolved = await resolveByokApiRouteRequest(input);
  return resolved?.context ?? null;
}

export async function resolveByokApiRouteRequest(input: {
  env?: SupabaseEnvSource;
  fetchFn?: SupabaseFetch;
  request: ByokApiRequestLike;
  routeId: ByokCloudRouteId;
}): Promise<ResolvedByokApiRouteRequest | null> {
  const config = readSupabaseServerEnv(input.env ?? process.env);
  if (!config.adminReady || !config.url || !config.anonKey || !config.serviceRoleKey) {
    return null;
  }

  const fetchFn = input.fetchFn ?? fetch;
  if (input.routeId === 'overlay.scene.read') {
    const overlayToken = verifyOverlayToken(config, readOverlayTokenFromRequest(input.request));
    return {
      authUser: null,
      config,
      fetchFn,
      context: {
        accountMode: null,
        overlayToken,
        targetSceneId: readRouteParam(input.request, 'sceneId'),
        workspace: overlayToken
          ? {
              memberUserIds: [],
              ownerUserId: '',
              workspaceId: overlayToken.workspaceId,
            }
          : null,
      },
    };
  }

  const accessToken = readBearerToken(input.request);
  const authUser = accessToken
    ? await fetchSupabaseAuthIdentity(config, accessToken, fetchFn).catch(() => null)
    : null;
  const accountMode = resolveByokAccountMode({
    authUser,
    supabaseConfig: toSupabasePublicConfig(config),
  });
  const workspaceId = readRouteParam(input.request, 'workspaceId');
  const workspace =
    authUser && workspaceId
      ? await fetchWorkspaceAccessSnapshot(config, workspaceId, fetchFn).catch(() => null)
      : null;

  return {
    authUser,
    config,
    fetchFn,
    context: {
      accountMode,
      workspace,
      settingStorageClass: readSettingStorageClass(input.request.body),
      targetUserId: input.routeId.startsWith('profile.self.') ? (authUser?.id ?? null) : null,
    },
  };
}

export function readBearerToken(request: ByokApiRequestLike) {
  const authorization = readHeader(request, 'authorization');
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function readRouteParam(request: ByokApiRequestLike, name: string) {
  const value = request.query?.[name];
  if (Array.isArray(value)) {
    return value[0]?.trim() || null;
  }
  return value?.trim() || null;
}

async function fetchSupabaseAuthIdentity(
  config: SupabaseServerConfig,
  accessToken: string,
  fetchFn: SupabaseFetch,
): Promise<SupabaseAuthIdentity | null> {
  const response = await fetchFn(`${config.url}/auth/v1/user`, {
    headers: {
      apikey: config.anonKey ?? '',
      authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as SupabaseUserResponse;
  if (typeof data.id !== 'string' || !data.id.trim()) {
    return null;
  }
  return {
    id: data.id.trim(),
    email: typeof data.email === 'string' ? data.email : null,
    user_metadata:
      data.user_metadata &&
      typeof data.user_metadata === 'object' &&
      !Array.isArray(data.user_metadata)
        ? (data.user_metadata as Record<string, unknown>)
        : null,
  };
}

async function fetchWorkspaceAccessSnapshot(
  config: SupabaseServerConfig,
  workspaceId: string,
  fetchFn: SupabaseFetch,
): Promise<ByokWorkspaceAccessSnapshot | null> {
  const workspaceRows = await fetchSupabaseRest<WorkspaceRow>(
    config,
    `/rest/v1/workspaces?id=eq.${encodeURIComponent(workspaceId)}&select=id,owner_user_id`,
    fetchFn,
  );
  const workspace = workspaceRows[0];
  if (
    typeof workspace?.id !== 'string' ||
    typeof workspace.owner_user_id !== 'string' ||
    !workspace.id.trim() ||
    !workspace.owner_user_id.trim()
  ) {
    return null;
  }

  const memberRows = await fetchSupabaseRest<WorkspaceMemberRow>(
    config,
    `/rest/v1/workspace_members?workspace_id=eq.${encodeURIComponent(workspaceId)}&select=user_id`,
    fetchFn,
  );
  return {
    workspaceId: workspace.id,
    ownerUserId: workspace.owner_user_id,
    memberUserIds: memberRows
      .map((item) => (typeof item.user_id === 'string' ? item.user_id.trim() : ''))
      .filter(Boolean),
  };
}

export async function fetchSupabaseRest<T>(
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
    return [];
  }
  const data = await response.json();
  return Array.isArray(data) ? (data as T[]) : [];
}

function readHeader(request: ByokApiRequestLike, name: string) {
  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(request.headers ?? {})) {
    if (key.toLowerCase() !== lowerName) {
      continue;
    }
    return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
  }
  return '';
}

function readSettingStorageClass(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return null;
  }
  const value = (body as Record<string, unknown>)['storageClass'];
  return value === 'public-overlay' || value === 'synced-private' ? value : null;
}
