import type { SupabaseAuthIdentity } from '../../../src/lib/product/account-mode.js';
import type {
  ByokProfile,
  ByokSceneSummary,
  ByokWorkspaceSummary,
} from '../../../src/lib/product/byok-api.js';
import type { ProductStorageMode, ProviderKeyMode } from '../../../src/lib/product/byok.js';
import { assertSettingCanSync, type SyncedSettingRecord } from '../../../src/lib/product/byok.js';
import type { SupabaseServerConfig } from '../../../src/lib/product/supabase-env.js';
import { fetchSupabaseRest, type SupabaseFetch } from './supabase-context.js';

const DEFAULT_WORKSPACE_NAME = 'My Stream';
const DEFAULT_SCENE_NAME = 'Main Overlay';
const DEFAULT_TWITCH_CHANNEL = 'subsect';

type ProfileRow = {
  avatar_url?: unknown;
  created_at?: unknown;
  display_name?: unknown;
  email?: unknown;
  id?: unknown;
  updated_at?: unknown;
};

type WorkspaceRow = {
  created_at?: unknown;
  id?: unknown;
  name?: unknown;
  owner_user_id?: unknown;
  provider_key_mode?: unknown;
  storage_mode?: unknown;
  updated_at?: unknown;
};

type SceneRow = {
  active_character_id?: unknown;
  created_at?: unknown;
  id?: unknown;
  name?: unknown;
  twitch_channel?: unknown;
  updated_at?: unknown;
  workspace_id?: unknown;
};

type SyncedSettingRow = {
  character_id?: unknown;
  id?: unknown;
  key?: unknown;
  scene_id?: unknown;
  storage_class?: unknown;
  updated_at?: unknown;
  value_json?: unknown;
  workspace_id?: unknown;
};

export async function ensureByokProfile(input: {
  authUser: SupabaseAuthIdentity;
  config: SupabaseServerConfig;
  fetchFn: SupabaseFetch;
}) {
  const existing = await selectProfile(input);
  if (existing) {
    return existing;
  }

  const displayName =
    stringOrNull(input.authUser.user_metadata?.['name']) ??
    stringOrNull(input.authUser.user_metadata?.['full_name']) ??
    emailPrefix(input.authUser.email) ??
    'Streamer';
  const rows = await fetchSupabaseRest<ProfileRow>(
    input.config,
    '/rest/v1/profiles?on_conflict=id',
    input.fetchFn,
    {
      body: JSON.stringify({
        avatar_url: null,
        display_name: displayName,
        email: input.authUser.email ?? null,
        id: input.authUser.id,
      }),
      headers: {
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      method: 'POST',
    },
  );
  return (
    normalizeProfile(rows[0], input.authUser) ?? {
      avatarUrl: null,
      createdAt: new Date().toISOString(),
      displayName,
      email: input.authUser.email ?? null,
      id: input.authUser.id,
      updatedAt: new Date().toISOString(),
    }
  );
}

export async function updateByokProfile(input: {
  authUser: SupabaseAuthIdentity;
  body: unknown;
  config: SupabaseServerConfig;
  fetchFn: SupabaseFetch;
}) {
  const body =
    input.body && typeof input.body === 'object' ? (input.body as Record<string, unknown>) : {};
  const patch: Record<string, unknown> = {};
  const displayName = normalizeText(body['displayName'], 80);
  if (displayName !== null) {
    patch['display_name'] = displayName || 'Streamer';
  }
  const avatarUrl = normalizeNullableText(body['avatarUrl'], 500);
  if (avatarUrl !== undefined) {
    patch['avatar_url'] = avatarUrl;
  }
  patch['updated_at'] = new Date().toISOString();

  if (Object.keys(patch).length === 1) {
    return ensureByokProfile(input);
  }

  const rows = await fetchSupabaseRest<ProfileRow>(
    input.config,
    `/rest/v1/profiles?id=eq.${encodeURIComponent(input.authUser.id)}`,
    input.fetchFn,
    {
      body: JSON.stringify(patch),
      headers: {
        Prefer: 'return=representation',
      },
      method: 'PATCH',
    },
  );
  return normalizeProfile(rows[0], input.authUser) ?? ensureByokProfile(input);
}

export async function ensureDefaultWorkspace(input: {
  config: SupabaseServerConfig;
  fetchFn: SupabaseFetch;
  userId: string;
}) {
  const existingRows = await fetchSupabaseRest<WorkspaceRow>(
    input.config,
    `/rest/v1/workspaces?owner_user_id=eq.${encodeURIComponent(input.userId)}&select=${WORKSPACE_SELECT}&limit=1`,
    input.fetchFn,
  );
  const existing = normalizeWorkspace(existingRows[0], input.userId);
  if (existing) {
    return existing;
  }

  const rows = await fetchSupabaseRest<WorkspaceRow>(
    input.config,
    '/rest/v1/workspaces',
    input.fetchFn,
    {
      body: JSON.stringify({
        id: createId(),
        name: DEFAULT_WORKSPACE_NAME,
        owner_user_id: input.userId,
        provider_key_mode: 'local-indexeddb',
        storage_mode: 'cloud-sync',
      }),
      headers: {
        Prefer: 'return=representation',
      },
      method: 'POST',
    },
  );
  const workspace = normalizeWorkspace(rows[0], input.userId);
  if (!workspace) {
    throw new Error('Supabase did not return a default workspace.');
  }
  return workspace;
}

export async function ensureDefaultScene(input: {
  config: SupabaseServerConfig;
  fetchFn: SupabaseFetch;
  workspaceId: string;
}) {
  const existingRows = await fetchSupabaseRest<SceneRow>(
    input.config,
    `/rest/v1/scenes?workspace_id=eq.${encodeURIComponent(input.workspaceId)}&select=${SCENE_SELECT}&limit=1`,
    input.fetchFn,
  );
  const existing = normalizeScene(existingRows[0], input.workspaceId);
  if (existing) {
    return existing;
  }

  const rows = await fetchSupabaseRest<SceneRow>(input.config, '/rest/v1/scenes', input.fetchFn, {
    body: JSON.stringify({
      active_character_id: null,
      id: createId(),
      name: DEFAULT_SCENE_NAME,
      twitch_channel: DEFAULT_TWITCH_CHANNEL,
      workspace_id: input.workspaceId,
    }),
    headers: {
      Prefer: 'return=representation',
    },
    method: 'POST',
  });
  const scene = normalizeScene(rows[0], input.workspaceId);
  if (!scene) {
    throw new Error('Supabase did not return a default scene.');
  }
  return scene;
}

export async function fetchSceneSummary(input: {
  config: SupabaseServerConfig;
  fetchFn: SupabaseFetch;
  sceneId: string;
  workspaceId: string;
}) {
  const rows = await fetchSupabaseRest<SceneRow>(
    input.config,
    `/rest/v1/scenes?workspace_id=eq.${encodeURIComponent(input.workspaceId)}&id=eq.${encodeURIComponent(input.sceneId)}&select=${SCENE_SELECT}&limit=1`,
    input.fetchFn,
  );
  return normalizeScene(rows[0], input.workspaceId);
}

export async function fetchWorkspaceSummary(input: {
  config: SupabaseServerConfig;
  fetchFn: SupabaseFetch;
  userId: string;
  workspaceId: string;
}) {
  const rows = await fetchSupabaseRest<WorkspaceRow>(
    input.config,
    `/rest/v1/workspaces?id=eq.${encodeURIComponent(input.workspaceId)}&select=${WORKSPACE_SELECT}&limit=1`,
    input.fetchFn,
  );
  const workspace = normalizeWorkspace(rows[0], input.userId);
  if (!workspace) {
    return null;
  }
  return attachDefaultScene({
    config: input.config,
    fetchFn: input.fetchFn,
    workspace,
  });
}

export async function updateWorkspace(input: {
  body: unknown;
  config: SupabaseServerConfig;
  fetchFn: SupabaseFetch;
  userId: string;
  workspaceId: string;
}) {
  const body =
    input.body && typeof input.body === 'object' ? (input.body as Record<string, unknown>) : {};
  const patch: Record<string, unknown> = {};
  const name = normalizeText(body['name'], 120);
  if (name !== null) {
    patch['name'] = name || DEFAULT_WORKSPACE_NAME;
  }
  const storageMode = normalizeStorageMode(body['storageMode']);
  if (storageMode) {
    patch['storage_mode'] = storageMode;
  }
  const providerKeyMode = normalizeProviderKeyMode(body['providerKeyMode']);
  if (providerKeyMode) {
    patch['provider_key_mode'] = providerKeyMode;
  }
  patch['updated_at'] = new Date().toISOString();

  if (Object.keys(patch).length > 1) {
    await fetchSupabaseRest<WorkspaceRow>(
      input.config,
      `/rest/v1/workspaces?id=eq.${encodeURIComponent(input.workspaceId)}`,
      input.fetchFn,
      {
        body: JSON.stringify(patch),
        headers: {
          Prefer: 'return=representation',
        },
        method: 'PATCH',
      },
    );
  }

  const summary = await fetchWorkspaceSummary(input);
  if (!summary) {
    throw new Error('Workspace was not found after update.');
  }
  return summary;
}

export async function fetchSyncedSetting(input: {
  config: SupabaseServerConfig;
  fetchFn: SupabaseFetch;
  settingId: string;
  workspaceId: string;
}) {
  const rows = await fetchSupabaseRest<SyncedSettingRow>(
    input.config,
    `/rest/v1/synced_settings?workspace_id=eq.${encodeURIComponent(input.workspaceId)}&id=eq.${encodeURIComponent(input.settingId)}&select=${SYNCED_SETTING_SELECT}&limit=1`,
    input.fetchFn,
  );
  return normalizeSyncedSetting(rows[0], input.workspaceId);
}

export async function fetchSyncedSettings(input: {
  config: SupabaseServerConfig;
  fetchFn: SupabaseFetch;
  workspaceId: string;
}) {
  const rows = await fetchSupabaseRest<SyncedSettingRow>(
    input.config,
    `/rest/v1/synced_settings?workspace_id=eq.${encodeURIComponent(input.workspaceId)}&select=${SYNCED_SETTING_SELECT}&order=updated_at.desc`,
    input.fetchFn,
  );
  return rows
    .map((row) => normalizeSyncedSetting(row, input.workspaceId))
    .filter((record): record is SyncedSettingRecord => Boolean(record));
}

export async function fetchPublicOverlayConfig(input: {
  config: SupabaseServerConfig;
  fetchFn: SupabaseFetch;
  sceneId: string;
  workspaceId: string;
}) {
  const scene = await fetchSceneSummary(input);
  const settings = (await fetchSyncedSettings(input)).filter(
    (record) =>
      record.storageClass === 'public-overlay' &&
      (!record.sceneId || record.sceneId === input.sceneId),
  );
  return {
    scene,
    settings,
    workspaceId: input.workspaceId,
  };
}

export async function upsertSyncedSetting(input: {
  body: unknown;
  config: SupabaseServerConfig;
  fetchFn: SupabaseFetch;
  settingId: string;
  workspaceId: string;
}) {
  const body =
    input.body && typeof input.body === 'object' ? (input.body as Record<string, unknown>) : {};
  const key = normalizeText(body['key'], 160) || input.settingId;
  const storageClass = normalizeSyncedStorageClass(body['storageClass']);
  const valueJson = normalizeText(body['valueJson'], 250000);
  if (!storageClass || valueJson === null) {
    throw new Error('Synced setting requires storageClass and valueJson.');
  }

  const record: SyncedSettingRecord = {
    characterId: normalizeNullableText(body['characterId'], 160) ?? undefined,
    id: input.settingId,
    key,
    sceneId: normalizeNullableText(body['sceneId'], 160) ?? undefined,
    storageClass,
    updatedAt: new Date().toISOString(),
    valueJson,
    workspaceId: input.workspaceId,
  };
  assertSettingCanSync(record);

  const rows = await fetchSupabaseRest<SyncedSettingRow>(
    input.config,
    '/rest/v1/synced_settings?on_conflict=id',
    input.fetchFn,
    {
      body: JSON.stringify({
        character_id: record.characterId ?? null,
        id: record.id,
        key: record.key,
        scene_id: record.sceneId ?? null,
        storage_class: record.storageClass,
        updated_at: record.updatedAt,
        value_json: record.valueJson,
        workspace_id: record.workspaceId,
      }),
      headers: {
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      method: 'POST',
    },
  );
  return normalizeSyncedSetting(rows[0], input.workspaceId) ?? record;
}

export async function attachDefaultScene(input: {
  config: SupabaseServerConfig;
  fetchFn: SupabaseFetch;
  workspace: Omit<ByokWorkspaceSummary, 'defaultScene'>;
}): Promise<ByokWorkspaceSummary> {
  const scenes = await fetchSupabaseRest<SceneRow>(
    input.config,
    `/rest/v1/scenes?workspace_id=eq.${encodeURIComponent(input.workspace.id)}&select=${SCENE_SELECT}&limit=1`,
    input.fetchFn,
  );
  return {
    ...input.workspace,
    defaultScene: normalizeScene(scenes[0], input.workspace.id),
  };
}

const WORKSPACE_SELECT =
  'id,owner_user_id,name,storage_mode,provider_key_mode,created_at,updated_at';
const SCENE_SELECT =
  'id,workspace_id,name,twitch_channel,active_character_id,created_at,updated_at';
const SYNCED_SETTING_SELECT =
  'id,workspace_id,scene_id,character_id,key,storage_class,value_json,updated_at';

async function selectProfile(input: {
  authUser: SupabaseAuthIdentity;
  config: SupabaseServerConfig;
  fetchFn: SupabaseFetch;
}) {
  const rows = await fetchSupabaseRest<ProfileRow>(
    input.config,
    `/rest/v1/profiles?id=eq.${encodeURIComponent(input.authUser.id)}&select=id,email,display_name,avatar_url,created_at,updated_at&limit=1`,
    input.fetchFn,
  );
  return normalizeProfile(rows[0], input.authUser);
}

function normalizeProfile(
  row: ProfileRow | undefined,
  authUser: SupabaseAuthIdentity,
): ByokProfile | null {
  if (!row || typeof row.id !== 'string' || !row.id.trim()) {
    return null;
  }
  const fallbackNow = new Date().toISOString();
  return {
    avatarUrl: stringOrNull(row.avatar_url),
    createdAt: stringOrNull(row.created_at) ?? fallbackNow,
    displayName: stringOrNull(row.display_name) ?? emailPrefix(authUser.email) ?? 'Streamer',
    email: stringOrNull(row.email) ?? authUser.email ?? null,
    id: row.id.trim(),
    updatedAt: stringOrNull(row.updated_at) ?? fallbackNow,
  };
}

function normalizeWorkspace(
  row: WorkspaceRow | undefined,
  userId: string,
): Omit<ByokWorkspaceSummary, 'defaultScene'> | null {
  if (!row || typeof row.id !== 'string' || typeof row.owner_user_id !== 'string') {
    return null;
  }
  const fallbackNow = new Date().toISOString();
  return {
    createdAt: stringOrNull(row.created_at) ?? fallbackNow,
    id: row.id.trim(),
    memberRole: row.owner_user_id === userId ? 'owner' : 'member',
    name: stringOrNull(row.name) ?? DEFAULT_WORKSPACE_NAME,
    ownerUserId: row.owner_user_id,
    providerKeyMode: normalizeProviderKeyMode(row.provider_key_mode) ?? 'local-indexeddb',
    storageMode: normalizeStorageMode(row.storage_mode) ?? 'cloud-sync',
    updatedAt: stringOrNull(row.updated_at) ?? fallbackNow,
  };
}

function normalizeScene(row: SceneRow | undefined, workspaceId: string): ByokSceneSummary | null {
  if (!row || typeof row.id !== 'string') {
    return null;
  }
  const fallbackNow = new Date().toISOString();
  return {
    activeCharacterId: stringOrNull(row.active_character_id) ?? '',
    createdAt: stringOrNull(row.created_at) ?? fallbackNow,
    id: row.id.trim(),
    name: stringOrNull(row.name) ?? DEFAULT_SCENE_NAME,
    twitchChannel: stringOrNull(row.twitch_channel) ?? DEFAULT_TWITCH_CHANNEL,
    updatedAt: stringOrNull(row.updated_at) ?? fallbackNow,
    workspaceId: stringOrNull(row.workspace_id) ?? workspaceId,
  };
}

function normalizeSyncedSetting(
  row: SyncedSettingRow | undefined,
  workspaceId: string,
): SyncedSettingRecord | null {
  if (!row || typeof row.id !== 'string') {
    return null;
  }
  const storageClass = normalizeSyncedStorageClass(row.storage_class);
  const key = stringOrNull(row.key);
  const valueJson = typeof row.value_json === 'string' ? row.value_json : null;
  if (!storageClass || !key || valueJson === null) {
    return null;
  }
  return {
    characterId: stringOrNull(row.character_id) ?? undefined,
    id: row.id,
    key,
    sceneId: stringOrNull(row.scene_id) ?? undefined,
    storageClass,
    updatedAt: stringOrNull(row.updated_at) ?? new Date().toISOString(),
    valueJson,
    workspaceId: stringOrNull(row.workspace_id) ?? workspaceId,
  };
}

function normalizeSyncedStorageClass(value: unknown): SyncedSettingRecord['storageClass'] | null {
  return value === 'public-overlay' || value === 'synced-private' ? value : null;
}

function normalizeStorageMode(value: unknown): ProductStorageMode | null {
  return value === 'local-only' || value === 'cloud-sync' ? value : null;
}

function normalizeProviderKeyMode(value: unknown): ProviderKeyMode | null {
  return value === 'local-indexeddb' || value === 'hosted-encrypted-vault' ? value : null;
}

function normalizeText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') {
    return null;
  }
  return value.trim().slice(0, maxLength);
}

function normalizeNullableText(value: unknown, maxLength: number) {
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    return undefined;
  }
  return value.trim().slice(0, maxLength) || null;
}

function stringOrNull(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function emailPrefix(email: string | null | undefined) {
  return email?.split('@')[0]?.trim() || null;
}

function createId() {
  return (
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}
