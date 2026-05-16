import { type ProductStorageMode, type ProductUser, type ProviderKeyMode } from './byok.js';
import type { SupabaseEnvStatus, SupabasePublicConfig } from './supabase-env.js';

export type AccountModeKind = 'guest-local-only' | 'supabase-cloud-sync';

export type GuestLocalReason = 'not-signed-in' | 'supabase-disabled' | 'supabase-misconfigured';

export type SupabaseAuthIdentity = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

export type AccountSupabaseSummary = {
  status: SupabaseEnvStatus;
  projectUrl: string | null;
  missing: string[];
  problems: string[];
};

export type GuestLocalAccountMode = {
  kind: 'guest-local-only';
  reason: GuestLocalReason;
  storageMode: Extract<ProductStorageMode, 'local-only'>;
  providerKeyMode: Extract<ProviderKeyMode, 'local-indexeddb'>;
  localOnlyAvailable: true;
  loginAvailable: boolean;
  cloudSyncReady: false;
  user: null;
  supabase: AccountSupabaseSummary;
};

export type SupabaseCloudSyncAccountMode = {
  kind: 'supabase-cloud-sync';
  reason: 'authenticated';
  storageMode: Extract<ProductStorageMode, 'cloud-sync'>;
  providerKeyMode: Extract<ProviderKeyMode, 'local-indexeddb'>;
  localOnlyAvailable: true;
  loginAvailable: true;
  cloudSyncReady: true;
  user: ProductUser;
  supabase: AccountSupabaseSummary & { status: 'configured'; projectUrl: string };
};

export type ByokAccountMode = GuestLocalAccountMode | SupabaseCloudSyncAccountMode;

const ACCOUNT_PROVIDER_KEY_MODE: Extract<ProviderKeyMode, 'local-indexeddb'> = 'local-indexeddb';

export function resolveByokAccountMode(input: {
  authUser?: SupabaseAuthIdentity | null;
  now?: string;
  supabaseConfig: SupabasePublicConfig;
}): ByokAccountMode {
  const authUser = normalizeAuthIdentity(input.authUser);
  const supabase = summarizeSupabaseConfig(input.supabaseConfig);
  const projectUrl = input.supabaseConfig.url;

  if (input.supabaseConfig.status === 'configured' && authUser && projectUrl) {
    return {
      kind: 'supabase-cloud-sync',
      reason: 'authenticated',
      storageMode: 'cloud-sync',
      providerKeyMode: ACCOUNT_PROVIDER_KEY_MODE,
      localOnlyAvailable: true,
      loginAvailable: true,
      cloudSyncReady: true,
      user: createProductUserFromSupabaseAuth(authUser, input.now),
      supabase: {
        ...supabase,
        status: 'configured',
        projectUrl,
      },
    };
  }

  return {
    kind: 'guest-local-only',
    reason: getGuestLocalReason(input.supabaseConfig.status),
    storageMode: 'local-only',
    providerKeyMode: ACCOUNT_PROVIDER_KEY_MODE,
    localOnlyAvailable: true,
    loginAvailable: input.supabaseConfig.status === 'configured',
    cloudSyncReady: false,
    user: null,
    supabase,
  };
}

export function createProductUserFromSupabaseAuth(
  identity: SupabaseAuthIdentity,
  now = new Date().toISOString(),
): ProductUser {
  const normalized = normalizeAuthIdentity(identity);
  if (!normalized) {
    throw new Error('Supabase auth identity requires a stable user id.');
  }

  const email = normalizeOptionalString(normalized.email);
  return {
    id: normalized.id,
    authProvider: 'supabase',
    authSubject: normalized.id,
    displayName: getDisplayName(normalized, email),
    createdAt: now,
    updatedAt: now,
    ...(email ? { email } : {}),
  };
}

export function assertCloudSyncAccountMode(
  mode: ByokAccountMode,
): asserts mode is SupabaseCloudSyncAccountMode {
  if (mode.kind !== 'supabase-cloud-sync') {
    throw new Error('Supabase cloud sync requires a signed-in account with configured Supabase.');
  }
}

function summarizeSupabaseConfig(config: SupabasePublicConfig): AccountSupabaseSummary {
  return {
    status: config.status,
    projectUrl: config.url,
    missing: [...config.missing],
    problems: [...config.problems],
  };
}

function getGuestLocalReason(status: SupabaseEnvStatus): GuestLocalReason {
  if (status === 'configured') {
    return 'not-signed-in';
  }
  if (status === 'misconfigured') {
    return 'supabase-misconfigured';
  }
  return 'supabase-disabled';
}

function normalizeAuthIdentity(
  identity?: SupabaseAuthIdentity | null,
): SupabaseAuthIdentity | null {
  const id = normalizeOptionalString(identity?.id);
  if (!id) {
    return null;
  }
  return {
    id,
    email: normalizeOptionalString(identity?.email),
    user_metadata: identity?.user_metadata ?? null,
  };
}

function getDisplayName(identity: SupabaseAuthIdentity, email?: string) {
  return (
    readMetadataString(identity.user_metadata, [
      'display_name',
      'full_name',
      'name',
      'preferred_username',
      'user_name',
    ]) ??
    (email ? getEmailLocalPart(email) : null) ??
    'Supabase user'
  );
}

function readMetadataString(metadata: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!metadata) {
    return null;
  }

  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'string') {
      const normalized = normalizeOptionalString(value);
      if (normalized) {
        return normalized;
      }
    }
  }
  return null;
}

function getEmailLocalPart(email: string) {
  const atIndex = email.indexOf('@');
  return atIndex > 0 ? email.slice(0, atIndex) : email;
}

function normalizeOptionalString(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}
