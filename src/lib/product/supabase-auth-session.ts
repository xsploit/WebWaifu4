import type { SupabaseAuthIdentity } from './account-mode.js';
import type { SupabasePublicConfig } from './supabase-env.js';

export const SUPABASE_AUTH_SESSION_STORAGE_KEY = 'yourwifey.byok.supabase.authSession.v1';
export const SUPABASE_AUTH_STATE_STORAGE_KEY = 'yourwifey.byok.supabase.authState.v1';

export type SupabaseAuthSession = {
  accessToken: string;
  refreshToken: string | null;
  tokenType: 'bearer';
  expiresAt: string | null;
};

export type SupabaseAuthCallbackResult =
  | {
      kind: 'none';
      cleanUrl: null;
    }
  | {
      kind: 'session';
      cleanUrl: string;
      session: SupabaseAuthSession;
      state: string | null;
    }
  | {
      kind: 'pkce-code';
      cleanUrl: string;
      code: string;
      message: string;
    }
  | {
      kind: 'error';
      cleanUrl: string;
      error: string;
      message: string;
    };

export type SupabaseAuthHydrationResult =
  | {
      status:
        | 'callback-error'
        | 'disabled'
        | 'expired'
        | 'misconfigured'
        | 'no-session'
        | 'pkce-code-unsupported'
        | 'user-fetch-failed';
      cleanUrl?: string;
      message: string;
      statusCode?: number;
      user: null;
    }
  | {
      status: 'authenticated';
      cleanUrl?: string;
      message: string;
      user: SupabaseAuthIdentity;
    };

type SupabaseAuthStorage = Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>;
type SupabaseAuthLifecycleWindow = Pick<Window, 'addEventListener' | 'removeEventListener'>;

type SupabaseAuthPendingState = {
  expiresAt: number;
  issuedAt: number;
  state: string;
};

export type SupabaseAuthSessionLifecycle = {
  stop: () => void;
};

const CALLBACK_PARAM_NAMES = [
  'access_token',
  'code',
  'error',
  'error_code',
  'error_description',
  'expires_at',
  'expires_in',
  'provider_refresh_token',
  'provider_token',
  'refresh_token',
  'state',
  'token_type',
  'type',
  'yw_auth_state',
] as const;

const SUPABASE_AUTH_STATE_TTL_MS = 10 * 60 * 1000;

const FORBIDDEN_USER_METADATA_KEY_PATTERN =
  /(?:api[_-]?key|apikey|secret|password|service[_-]?role|jwt|token|credential)/i;

export function parseSupabaseAuthCallbackUrl(
  href: string,
  nowMs = Date.now(),
): SupabaseAuthCallbackResult {
  const parsed = parseUrl(href);
  if (!parsed) {
    return { kind: 'none', cleanUrl: null };
  }

  const hashParams = readHashParams(parsed);
  if (hasKnownCallbackParam(hashParams)) {
    if (!hashParams.has('state')) {
      const state = parsed.searchParams.get('state') ?? parsed.searchParams.get('yw_auth_state');
      if (state) {
        hashParams.set('state', state);
      }
    }
    return parseCallbackParams(hashParams, cleanUrl(parsed, 'hash'), nowMs);
  }

  if (hasKnownCallbackParam(parsed.searchParams)) {
    return parseCallbackParams(parsed.searchParams, cleanUrl(parsed, 'search'), nowMs);
  }

  return { kind: 'none', cleanUrl: null };
}

export function getBrowserSupabaseAuthStorage(): SupabaseAuthStorage | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function persistSupabaseAuthSession(
  session: SupabaseAuthSession,
  storage: SupabaseAuthStorage | null = getBrowserSupabaseAuthStorage(),
) {
  if (!storage) {
    return false;
  }
  storage.setItem(SUPABASE_AUTH_SESSION_STORAGE_KEY, JSON.stringify(session));
  return true;
}

export function loadPersistedSupabaseAuthSession(
  storage: SupabaseAuthStorage | null = getBrowserSupabaseAuthStorage(),
  nowMs = Date.now(),
) {
  if (!storage) {
    return null;
  }

  const session = normalizeSupabaseAuthSession(storage.getItem(SUPABASE_AUTH_SESSION_STORAGE_KEY));
  if (session && isSupabaseAuthSessionExpired(session, nowMs)) {
    clearPersistedSupabaseAuthSession(storage);
    return null;
  }
  return session;
}

export function clearPersistedSupabaseAuthSession(
  storage: SupabaseAuthStorage | null = getBrowserSupabaseAuthStorage(),
) {
  storage?.removeItem(SUPABASE_AUTH_SESSION_STORAGE_KEY);
}

export function createSupabaseAuthRequestState(
  storage: SupabaseAuthStorage | null = getBrowserSupabaseAuthStorage(),
  nowMs = Date.now(),
) {
  if (!storage) {
    return null;
  }
  const state = createRandomState();
  const pending: SupabaseAuthPendingState = {
    expiresAt: nowMs + SUPABASE_AUTH_STATE_TTL_MS,
    issuedAt: nowMs,
    state,
  };
  storage.setItem(SUPABASE_AUTH_STATE_STORAGE_KEY, JSON.stringify(pending));
  return state;
}

export function consumeSupabaseAuthRequestState(
  returnedState: string | null | undefined,
  storage: SupabaseAuthStorage | null = getBrowserSupabaseAuthStorage(),
  nowMs = Date.now(),
) {
  if (!storage || !returnedState?.trim()) {
    return false;
  }

  const pending = normalizePendingState(storage.getItem(SUPABASE_AUTH_STATE_STORAGE_KEY));
  storage.removeItem(SUPABASE_AUTH_STATE_STORAGE_KEY);
  return Boolean(pending && pending.expiresAt > nowMs && pending.state === returnedState.trim());
}

export function getSupabaseAuthSessionExpiryDelayMs(
  session: SupabaseAuthSession | null,
  nowMs = Date.now(),
) {
  if (!session?.expiresAt) {
    return null;
  }

  const expiresAtMs = Date.parse(session.expiresAt);
  if (!Number.isFinite(expiresAtMs)) {
    return null;
  }

  return Math.max(0, expiresAtMs - nowMs);
}

export function startSupabaseAuthSessionLifecycle(input: {
  config: SupabasePublicConfig;
  fetchImpl?: typeof fetch;
  href?: string;
  nowMs?: () => number;
  onResult: (result: SupabaseAuthHydrationResult) => void;
  onStatus?: (message: string) => void;
  storage?: SupabaseAuthStorage | null;
  windowTarget?: SupabaseAuthLifecycleWindow | null;
}): SupabaseAuthSessionLifecycle {
  const storage = input.storage ?? getBrowserSupabaseAuthStorage();
  const windowTarget =
    input.windowTarget ??
    (typeof window === 'undefined' ? null : (window as SupabaseAuthLifecycleWindow));
  const now = () => input.nowMs?.() ?? Date.now();
  let stopped = false;
  let callbackHref: string | undefined = input.href;
  let expiryTimer: ReturnType<typeof setTimeout> | null = null;

  const clearExpiryTimer = () => {
    if (expiryTimer) {
      clearTimeout(expiryTimer);
      expiryTimer = null;
    }
  };

  const scheduleExpiryHydration = () => {
    clearExpiryTimer();
    const session = loadPersistedSupabaseAuthSession(storage, now());
    const delay = getSupabaseAuthSessionExpiryDelayMs(session, now());
    if (delay === null) {
      return;
    }

    expiryTimer = setTimeout(() => {
      void hydrateOnce();
    }, delay);
  };

  const hydrateOnce = async () => {
    if (stopped) {
      return;
    }

    input.onStatus?.('Checking Supabase session state.');
    const result = await hydrateSupabaseAuthSession({
      config: input.config,
      fetchImpl: input.fetchImpl,
      href: callbackHref,
      nowMs: now(),
      storage,
    });
    callbackHref = undefined;
    if (stopped) {
      return;
    }

    input.onResult(result);
    scheduleExpiryHydration();
  };

  const handleStorageEvent = (event: Event) => {
    if ((event as StorageEvent).key === SUPABASE_AUTH_SESSION_STORAGE_KEY) {
      void hydrateOnce();
    }
  };

  windowTarget?.addEventListener('storage', handleStorageEvent);
  void hydrateOnce();

  return {
    stop() {
      stopped = true;
      clearExpiryTimer();
      windowTarget?.removeEventListener('storage', handleStorageEvent);
    },
  };
}

export function isSupabaseAuthSessionExpired(session: SupabaseAuthSession, nowMs = Date.now()) {
  if (!session.expiresAt) {
    return false;
  }

  const expiresAtMs = Date.parse(session.expiresAt);
  return Number.isFinite(expiresAtMs) && expiresAtMs <= nowMs;
}

export function buildSupabaseUserRequest(input: {
  config: SupabasePublicConfig;
  session: SupabaseAuthSession;
  nowMs?: number;
}):
  | {
      ok: true;
      init: RequestInit;
      url: string;
    }
  | {
      ok: false;
      reason: 'cloud-sync-unavailable' | 'expired' | 'missing-access-token';
      message: string;
    } {
  const { config, session } = input;
  if (config.status !== 'configured' || !config.url || !config.anonKey) {
    return {
      ok: false,
      reason: 'cloud-sync-unavailable',
      message: 'Supabase user hydration requires configured browser cloud-sync config.',
    };
  }

  if (!session.accessToken.trim()) {
    return {
      ok: false,
      reason: 'missing-access-token',
      message: 'Supabase user hydration requires an access token.',
    };
  }

  if (isSupabaseAuthSessionExpired(session, input.nowMs)) {
    return {
      ok: false,
      reason: 'expired',
      message: 'Supabase session expired; local-only mode remains active.',
    };
  }

  return {
    ok: true,
    url: `${config.url}/auth/v1/user`,
    init: {
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${session.accessToken}`,
      },
      method: 'GET',
    },
  };
}

export async function hydrateSupabaseAuthSession(input: {
  config: SupabasePublicConfig;
  fetchImpl?: typeof fetch;
  href?: string;
  nowMs?: number;
  storage?: SupabaseAuthStorage | null;
}): Promise<SupabaseAuthHydrationResult> {
  const nowMs = input.nowMs ?? Date.now();
  const storage = input.storage ?? getBrowserSupabaseAuthStorage();
  const callback = input.href ? parseSupabaseAuthCallbackUrl(input.href, nowMs) : null;
  const cleanUrl = callback?.cleanUrl ?? undefined;

  if (input.config.status === 'disabled') {
    return {
      status: 'disabled',
      cleanUrl,
      message: 'Supabase login is disabled because browser cloud-sync config is absent.',
      user: null,
    };
  }

  if (input.config.status !== 'configured') {
    return {
      status: 'misconfigured',
      cleanUrl,
      message: 'Supabase login is unavailable until browser cloud-sync config is complete.',
      user: null,
    };
  }

  if (callback?.kind === 'error') {
    clearPersistedSupabaseAuthSession(storage);
    return {
      status: 'callback-error',
      cleanUrl,
      message: callback.message,
      user: null,
    };
  }

  if (callback?.kind === 'pkce-code') {
    return {
      status: 'pkce-code-unsupported',
      cleanUrl,
      message: callback.message,
      user: null,
    };
  }

  const session =
    callback?.kind === 'session'
      ? callback.session
      : loadPersistedSupabaseAuthSession(storage, nowMs);
  if (callback?.kind === 'session') {
    if (!consumeSupabaseAuthRequestState(callback.state, storage, nowMs)) {
      clearPersistedSupabaseAuthSession(storage);
      return {
        status: 'callback-error',
        cleanUrl,
        message: 'Supabase login callback state did not match this browser session.',
        user: null,
      };
    }
    persistSupabaseAuthSession(callback.session, storage);
  }

  if (!session) {
    return {
      status: 'no-session',
      cleanUrl,
      message: 'No Supabase session is present; guest local-only mode remains active.',
      user: null,
    };
  }

  const request = buildSupabaseUserRequest({
    config: input.config,
    nowMs,
    session,
  });
  if (!request.ok) {
    if (request.reason === 'expired') {
      clearPersistedSupabaseAuthSession(storage);
    }
    return {
      status: request.reason === 'expired' ? 'expired' : 'user-fetch-failed',
      cleanUrl,
      message: request.message,
      user: null,
    };
  }

  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) {
    return {
      status: 'user-fetch-failed',
      cleanUrl,
      message: 'Browser fetch is unavailable, so Supabase session could not be hydrated.',
      user: null,
    };
  }

  try {
    const response = await fetchImpl(request.url, request.init);
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        clearPersistedSupabaseAuthSession(storage);
      }
      return {
        status: 'user-fetch-failed',
        cleanUrl,
        message: `Supabase user hydration failed with HTTP ${response.status}.`,
        statusCode: response.status,
        user: null,
      };
    }

    const user = normalizeSupabaseUserPayload(await response.json());
    if (!user) {
      return {
        status: 'user-fetch-failed',
        cleanUrl,
        message: 'Supabase user hydration did not return a stable user identity.',
        user: null,
      };
    }

    return {
      status: 'authenticated',
      cleanUrl,
      message: `Signed in as ${user.email ?? user.id}.`,
      user,
    };
  } catch (error) {
    return {
      status: 'user-fetch-failed',
      cleanUrl,
      message: error instanceof Error ? error.message : 'Supabase user hydration failed.',
      user: null,
    };
  }
}

function parseCallbackParams(
  params: URLSearchParams,
  cleanUrlValue: string,
  nowMs: number,
): SupabaseAuthCallbackResult {
  const error = normalizeOptionalString(params.get('error') ?? params.get('error_code'));
  if (error) {
    return {
      kind: 'error',
      cleanUrl: cleanUrlValue,
      error,
      message:
        normalizeOptionalString(params.get('error_description')) ??
        'Supabase login callback returned an error.',
    };
  }

  const session = readSessionFromCallbackParams(params, nowMs);
  if (session) {
    return {
      kind: 'session',
      cleanUrl: cleanUrlValue,
      session,
      state: normalizeOptionalString(params.get('state')) ?? null,
    };
  }

  const code = normalizeOptionalString(params.get('code'));
  if (code) {
    return {
      kind: 'pkce-code',
      cleanUrl: cleanUrlValue,
      code,
      message: 'Supabase returned a PKCE code; this no-SDK shell does not exchange auth codes yet.',
    };
  }

  return { kind: 'none', cleanUrl: null };
}

function readSessionFromCallbackParams(params: URLSearchParams, nowMs: number) {
  const accessToken = normalizeOptionalString(params.get('access_token'));
  if (!accessToken) {
    return null;
  }

  return {
    accessToken,
    refreshToken: normalizeOptionalString(params.get('refresh_token')) ?? null,
    tokenType: 'bearer',
    expiresAt: readCallbackExpiry(params, nowMs),
  } satisfies SupabaseAuthSession;
}

function readCallbackExpiry(params: URLSearchParams, nowMs: number) {
  const expiresAt = Number(params.get('expires_at') ?? '');
  if (Number.isFinite(expiresAt) && expiresAt > 0) {
    const expiresAtMs = expiresAt > 999999999999 ? expiresAt : expiresAt * 1000;
    return new Date(expiresAtMs).toISOString();
  }

  const expiresIn = Number(params.get('expires_in') ?? '');
  if (Number.isFinite(expiresIn) && expiresIn > 0) {
    return new Date(nowMs + expiresIn * 1000).toISOString();
  }

  return null;
}

function normalizeSupabaseAuthSession(value: string | null): SupabaseAuthSession | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<SupabaseAuthSession>;
    const accessToken = normalizeOptionalString(parsed.accessToken);
    if (!accessToken) {
      return null;
    }

    return {
      accessToken,
      refreshToken: normalizeOptionalString(parsed.refreshToken) ?? null,
      tokenType: 'bearer',
      expiresAt: normalizeOptionalString(parsed.expiresAt) ?? null,
    };
  } catch {
    return null;
  }
}

function normalizePendingState(value: string | null): SupabaseAuthPendingState | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<SupabaseAuthPendingState>;
    const issuedAt = parsed.issuedAt;
    const expiresAt = parsed.expiresAt;
    if (
      typeof parsed.state !== 'string' ||
      !parsed.state.trim() ||
      typeof issuedAt !== 'number' ||
      !Number.isFinite(issuedAt) ||
      typeof expiresAt !== 'number' ||
      !Number.isFinite(expiresAt)
    ) {
      return null;
    }
    return {
      expiresAt,
      issuedAt,
      state: parsed.state.trim(),
    };
  } catch {
    return null;
  }
}

function normalizeSupabaseUserPayload(value: unknown): SupabaseAuthIdentity | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const source = value as Record<string, unknown>;
  const id = normalizeOptionalString(source['id']);
  if (!id) {
    return null;
  }

  const metadata = source['user_metadata'];
  return {
    id,
    email: normalizeOptionalString(source['email']),
    user_metadata: sanitizeUserMetadata(metadata),
  };
}

function sanitizeUserMetadata(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const entries = Object.entries(value as Record<string, unknown>).filter(
    ([key]) => !FORBIDDEN_USER_METADATA_KEY_PATTERN.test(key),
  );
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function readHashParams(url: URL) {
  const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
  return hash.includes('=') ? new URLSearchParams(hash) : new URLSearchParams();
}

function hasKnownCallbackParam(params: URLSearchParams) {
  return CALLBACK_PARAM_NAMES.some((name) => params.has(name));
}

function cleanUrl(url: URL, source: 'hash' | 'search') {
  const next = new URL(url.toString());
  if (source === 'hash') {
    next.hash = '';
    CALLBACK_PARAM_NAMES.forEach((name) => next.searchParams.delete(name));
    return next.toString();
  }

  CALLBACK_PARAM_NAMES.forEach((name) => next.searchParams.delete(name));
  return next.toString();
}

function parseUrl(href: string) {
  try {
    return new URL(href);
  } catch {
    try {
      return new URL(href, 'http://localhost');
    } catch {
      return null;
    }
  }
}

function normalizeOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function createRandomState() {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }
  if (typeof cryptoApi?.getRandomValues === 'function') {
    const bytes = new Uint8Array(24);
    cryptoApi.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
