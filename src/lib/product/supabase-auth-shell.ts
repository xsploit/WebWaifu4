import type { ByokAccountMode } from './account-mode';
import type { SupabasePublicConfig } from './supabase-env';

export type AccountShellSummary = {
  modeLabel: string;
  storageLabel: string;
  cloudSyncLabel: string;
  localOnlyLabel: string;
  providerKeyLabel: string;
  loginLabel: string;
  detail: string;
};

export type SupabaseMagicLinkRequest = {
  ok: true;
  url: string;
  init: RequestInit;
  email: string;
};

export type SupabaseMagicLinkUnavailable = {
  ok: false;
  reason: 'cloud-sync-disabled' | 'cloud-sync-misconfigured' | 'invalid-email';
  message: string;
};

export type SupabaseMagicLinkResult =
  | {
      ok: true;
      message: string;
    }
  | {
      ok: false;
      message: string;
      reason: SupabaseMagicLinkUnavailable['reason'] | 'network-error' | 'supabase-request-failed';
      status?: number;
    };

export function describeByokAccountShell(mode: ByokAccountMode): AccountShellSummary {
  if (mode.kind === 'supabase-cloud-sync') {
    return {
      modeLabel: 'Signed in',
      storageLabel: 'Cloud sync',
      cloudSyncLabel: 'Ready',
      localOnlyLabel: 'Available',
      providerKeyLabel: 'Browser local',
      loginLabel: mode.user.email ?? mode.user.displayName,
      detail: 'Supabase account mode is active. Provider keys still stay in the browser vault.',
    };
  }

  if (mode.supabase.status === 'configured') {
    return {
      modeLabel: 'Guest',
      storageLabel: 'Local only',
      cloudSyncLabel: 'Sign-in required',
      localOnlyLabel: 'Active',
      providerKeyLabel: 'Browser local',
      loginLabel: 'Available',
      detail: 'Supabase is configured, but this browser is still using local-only overlay state.',
    };
  }

  if (mode.supabase.status === 'misconfigured') {
    return {
      modeLabel: 'Guest',
      storageLabel: 'Local only',
      cloudSyncLabel: 'Misconfigured',
      localOnlyLabel: 'Active',
      providerKeyLabel: 'Browser local',
      loginLabel: 'Unavailable',
      detail: 'Supabase browser config is incomplete or unsafe, so cloud sync remains disabled.',
    };
  }

  return {
    modeLabel: 'Guest',
    storageLabel: 'Local only',
    cloudSyncLabel: 'Disabled',
    localOnlyLabel: 'Active',
    providerKeyLabel: 'Browser local',
    loginLabel: 'Unavailable',
    detail: 'No Supabase browser config is present, so the overlay stays in local-only mode.',
  };
}

export function normalizeAccountEmail(value: string) {
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function buildSupabaseMagicLinkRequest(input: {
  config: SupabasePublicConfig;
  email: string;
  redirectTo?: string;
}): SupabaseMagicLinkRequest | SupabaseMagicLinkUnavailable {
  const email = normalizeAccountEmail(input.email);
  if (!email) {
    return {
      ok: false,
      reason: 'invalid-email',
      message: 'Enter a valid email address before requesting a login link.',
    };
  }

  const { config } = input;
  if (config.status === 'disabled') {
    return {
      ok: false,
      reason: 'cloud-sync-disabled',
      message: 'Supabase login is disabled because browser cloud-sync config is absent.',
    };
  }
  if (config.status !== 'configured' || !config.url || !config.anonKey) {
    return {
      ok: false,
      reason: 'cloud-sync-misconfigured',
      message: 'Supabase login is unavailable until browser cloud-sync config is complete.',
    };
  }

  const body: Record<string, unknown> = {
    create_user: true,
    email,
    type: 'magiclink',
  };
  const redirectTo = normalizeRedirectUrl(input.redirectTo);
  if (redirectTo) {
    body['email_redirect_to'] = redirectTo;
  }

  return {
    ok: true,
    email,
    url: `${config.url}/auth/v1/otp`,
    init: {
      body: JSON.stringify(body),
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    },
  };
}

export async function requestSupabaseMagicLink(input: {
  config: SupabasePublicConfig;
  email: string;
  fetchImpl?: typeof fetch;
  redirectTo?: string;
}): Promise<SupabaseMagicLinkResult> {
  const request = buildSupabaseMagicLinkRequest(input);
  if (!request.ok) {
    return {
      ok: false,
      reason: request.reason,
      message: request.message,
    };
  }

  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) {
    return {
      ok: false,
      reason: 'network-error',
      message: 'Browser fetch is unavailable, so Supabase login could not be requested.',
    };
  }

  try {
    const response = await fetchImpl(request.url, request.init);
    if (!response.ok) {
      return {
        ok: false,
        reason: 'supabase-request-failed',
        status: response.status,
        message: `Supabase login request failed with HTTP ${response.status}.`,
      };
    }
  } catch (error) {
    return {
      ok: false,
      reason: 'network-error',
      message: error instanceof Error ? error.message : 'Supabase login request failed.',
    };
  }

  return {
    ok: true,
    message: `Login link requested for ${request.email}.`,
  };
}

function normalizeRedirectUrl(value: string | undefined) {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  try {
    const parsed = new URL(normalized);
    return parsed.toString();
  } catch {
    return null;
  }
}
