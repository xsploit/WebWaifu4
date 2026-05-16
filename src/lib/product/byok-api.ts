import type {
  OverlayTokenClaims,
  ProductStorageMode,
  ProviderKeyMode,
  Scene,
  SyncedSettingRecord,
  Workspace,
} from './byok.js';
import {
  loadPersistedSupabaseAuthSession,
  type SupabaseAuthSession,
} from './supabase-auth-session.js';

export type ByokProfile = {
  id: string;
  email: string | null;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ByokSceneSummary = Pick<
  Scene,
  'activeCharacterId' | 'createdAt' | 'id' | 'name' | 'twitchChannel' | 'updatedAt' | 'workspaceId'
>;

export type ByokWorkspaceSummary = Pick<
  Workspace,
  'createdAt' | 'id' | 'name' | 'ownerUserId' | 'providerKeyMode' | 'storageMode' | 'updatedAt'
> & {
  defaultScene: ByokSceneSummary | null;
  memberRole: 'owner' | 'member';
};

export type ByokBootstrapResponse = {
  workspace: ByokWorkspaceSummary;
  scene: ByokSceneSummary;
};

export type ByokProfileResponse = {
  ok: true;
  profile: ByokProfile;
  bootstrap: ByokBootstrapResponse;
};

export type ByokWorkspaceResponse = {
  ok: true;
  workspace: ByokWorkspaceSummary;
};

export type ByokSettingResponse = {
  ok: true;
  setting: SyncedSettingRecord;
};

export type ByokSettingsResponse = {
  ok: true;
  settings: SyncedSettingRecord[];
};

export type ByokOverlayTokenResponse = {
  ok: true;
  expiresAt: string | null;
  scene: ByokSceneSummary;
  token: string;
};

export type ByokOverlayConfigResponse = {
  ok: true;
  scene: ByokSceneSummary;
  settings: SyncedSettingRecord[];
  workspaceId: string;
};

export type ByokApiError = {
  ok: false;
  status: number;
  reason: string;
  message: string;
  findings?: string[];
};

export type AuthenticatedByokRequest = {
  init: RequestInit;
  url: string;
};

type StorageLike = Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>;

export function getSupabaseAccessToken(
  storage?: StorageLike | null,
  nowMs = Date.now(),
): string | null {
  return loadPersistedSupabaseAuthSession(storage ?? undefined, nowMs)?.accessToken ?? null;
}

export function buildAuthenticatedByokRequest(input: {
  accessToken?: string | null;
  body?: unknown;
  method?: 'GET' | 'PATCH' | 'POST' | 'DELETE';
  path: string;
}): AuthenticatedByokRequest {
  const accessToken = input.accessToken ?? getSupabaseAccessToken();
  if (!accessToken) {
    throw new Error('Cloud sync request requires a signed-in Supabase session.');
  }

  const headers: Record<string, string> = {
    authorization: `Bearer ${accessToken}`,
  };
  let body: string | undefined;
  if (input.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(input.body);
  }

  return {
    url: normalizeByokApiPath(input.path),
    init: {
      body,
      headers,
      method: input.method ?? (body ? 'PATCH' : 'GET'),
    },
  };
}

export async function fetchByokProfile(
  input: {
    accessToken?: string | null;
    fetchImpl?: typeof fetch;
    session?: SupabaseAuthSession | null;
  } = {},
) {
  const request = buildAuthenticatedByokRequest({
    accessToken: input.accessToken ?? input.session?.accessToken,
    path: '/api/byok/profile',
  });
  return fetchByokJson<ByokProfileResponse>(request, input.fetchImpl);
}

export async function patchByokProfile(input: {
  accessToken?: string | null;
  avatarUrl?: string | null;
  displayName?: string;
  fetchImpl?: typeof fetch;
}) {
  const request = buildAuthenticatedByokRequest({
    accessToken: input.accessToken,
    body: {
      ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
      ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
    },
    method: 'PATCH',
    path: '/api/byok/profile',
  });
  return fetchByokJson<ByokProfileResponse>(request, input.fetchImpl);
}

export async function fetchByokWorkspace(input: {
  accessToken?: string | null;
  fetchImpl?: typeof fetch;
  workspaceId: string;
}) {
  const request = buildAuthenticatedByokRequest({
    accessToken: input.accessToken,
    path: `/api/byok/workspaces/${encodeURIComponent(input.workspaceId)}`,
  });
  return fetchByokJson<ByokWorkspaceResponse>(request, input.fetchImpl);
}

export async function patchByokWorkspace(input: {
  accessToken?: string | null;
  fetchImpl?: typeof fetch;
  name?: string;
  storageMode?: ProductStorageMode;
  providerKeyMode?: ProviderKeyMode;
  workspaceId: string;
}) {
  const request = buildAuthenticatedByokRequest({
    accessToken: input.accessToken,
    body: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.storageMode !== undefined ? { storageMode: input.storageMode } : {}),
      ...(input.providerKeyMode !== undefined ? { providerKeyMode: input.providerKeyMode } : {}),
    },
    method: 'PATCH',
    path: `/api/byok/workspaces/${encodeURIComponent(input.workspaceId)}`,
  });
  return fetchByokJson<ByokWorkspaceResponse>(request, input.fetchImpl);
}

export async function fetchByokSetting(input: {
  accessToken?: string | null;
  fetchImpl?: typeof fetch;
  settingId: string;
  workspaceId: string;
}) {
  const request = buildAuthenticatedByokRequest({
    accessToken: input.accessToken,
    path: `/api/byok/workspaces/${encodeURIComponent(input.workspaceId)}/settings/${encodeURIComponent(input.settingId)}`,
  });
  return fetchByokJson<ByokSettingResponse>(request, input.fetchImpl);
}

export async function fetchByokSettings(input: {
  accessToken?: string | null;
  fetchImpl?: typeof fetch;
  workspaceId: string;
}) {
  const request = buildAuthenticatedByokRequest({
    accessToken: input.accessToken,
    path: `/api/byok/workspaces/${encodeURIComponent(input.workspaceId)}/settings`,
  });
  return fetchByokJson<ByokSettingsResponse>(request, input.fetchImpl);
}

export async function patchByokSetting(input: {
  accessToken?: string | null;
  fetchImpl?: typeof fetch;
  record: SyncedSettingRecord;
}) {
  const request = buildAuthenticatedByokRequest({
    accessToken: input.accessToken,
    body: {
      characterId: input.record.characterId ?? null,
      key: input.record.key,
      sceneId: input.record.sceneId ?? null,
      storageClass: input.record.storageClass,
      valueJson: input.record.valueJson,
    },
    method: 'PATCH',
    path: `/api/byok/workspaces/${encodeURIComponent(input.record.workspaceId)}/settings/${encodeURIComponent(input.record.id)}`,
  });
  return fetchByokJson<ByokSettingResponse>(request, input.fetchImpl);
}

export async function issueByokOverlayToken(input: {
  accessToken?: string | null;
  expiresInHours?: number;
  fetchImpl?: typeof fetch;
  sceneId: string;
  workspaceId: string;
}) {
  const request = buildAuthenticatedByokRequest({
    accessToken: input.accessToken,
    body: {
      expiresInHours: input.expiresInHours ?? 24 * 30,
    },
    method: 'POST',
    path: `/api/byok/workspaces/${encodeURIComponent(input.workspaceId)}/scenes/${encodeURIComponent(input.sceneId)}/overlay-tokens`,
  });
  return fetchByokJson<ByokOverlayTokenResponse>(request, input.fetchImpl);
}

export async function fetchByokOverlayConfig(input: {
  fetchImpl?: typeof fetch;
  sceneId: string;
  token: string;
}) {
  const request = buildOverlayTokenRequest({
    path: `/api/byok/overlay/${encodeURIComponent(input.sceneId)}/config`,
    token: input.token,
  });
  return fetchByokJson<ByokOverlayConfigResponse>(request, input.fetchImpl);
}

export function buildOverlayTokenRequest(input: { path: string; token: string }) {
  return {
    init: {
      headers: {
        authorization: `Bearer ${input.token}`,
      },
      method: 'GET',
    },
    url: normalizeByokApiPath(input.path),
  } satisfies AuthenticatedByokRequest;
}

export function parseOverlayTokenClaims(token: string): OverlayTokenClaims | null {
  try {
    const [, payload] = token.split('.');
    if (!payload) {
      return null;
    }
    return JSON.parse(decodeBase64Url(payload)) as OverlayTokenClaims;
  } catch {
    return null;
  }
}

async function fetchByokJson<T>(request: AuthenticatedByokRequest, fetchImpl = fetch): Promise<T> {
  const response = await fetchImpl(request.url, request.init);
  const body = (await response.json().catch(() => null)) as T | ByokApiError | null;
  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'message' in body
        ? String(body.message)
        : `BYOK API failed with HTTP ${response.status}.`;
    throw new Error(message);
  }
  return body as T;
}

function normalizeByokApiPath(path: string) {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  return path.startsWith('/') ? path : `/${path}`;
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  if (typeof atob === 'function') {
    return atob(padded);
  }
  return Buffer.from(value, 'base64url').toString('utf8');
}
