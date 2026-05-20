import { createClient, type Session, type SupabaseClient, type User } from '@supabase/supabase-js';

import type { SupabaseAuthIdentity } from './account-mode.js';
import {
  clearPersistedSupabaseAuthSession,
  persistSupabaseAuthSession,
  type SupabaseAuthHydrationResult,
  type SupabaseAuthSessionLifecycle,
} from './supabase-auth-session.js';
import type { SupabaseOAuthProvider, SupabasePublicConfig } from './supabase-env.js';

type SupabaseSdkClientEntry = {
  anonKey: string;
  client: SupabaseClient;
  url: string;
};

let browserClientEntry: SupabaseSdkClientEntry | null = null;

export function getSupabaseBrowserClient(config: SupabasePublicConfig) {
  if (config.status !== 'configured' || !config.url || !config.anonKey) {
    return null;
  }

  if (
    !browserClientEntry ||
    browserClientEntry.url !== config.url ||
    browserClientEntry.anonKey !== config.anonKey
  ) {
    browserClientEntry = {
      anonKey: config.anonKey,
      client: createClient(config.url, config.anonKey, {
        auth: {
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: 'pkce',
          persistSession: true,
        },
      }),
      url: config.url,
    };
  }

  return browserClientEntry.client;
}

export async function signInWithSupabaseOAuth(input: {
  config: SupabasePublicConfig;
  provider: SupabaseOAuthProvider;
  redirectTo?: string;
}) {
  const client = getSupabaseBrowserClient(input.config);
  if (!client) {
    return {
      ok: false as const,
      message: 'Supabase OAuth is unavailable until browser cloud-sync config is complete.',
    };
  }

  const { data, error } = await client.auth.signInWithOAuth({
    provider: input.provider,
    options: {
      redirectTo: input.redirectTo,
      skipBrowserRedirect: true,
    },
  });

  if (error) {
    return {
      ok: false as const,
      message: error.message,
    };
  }

  if (!data.url) {
    return {
      ok: false as const,
      message: 'Supabase OAuth did not return a provider redirect URL.',
    };
  }

  return {
    ok: true as const,
    url: data.url,
  };
}

export async function signOutSupabaseSdkAuth(config: SupabasePublicConfig) {
  const client = getSupabaseBrowserClient(config);
  clearPersistedSupabaseAuthSession();
  if (!client) {
    return;
  }
  await client.auth.signOut({ scope: 'local' });
}

export function startSupabaseSdkAuthSessionLifecycle(input: {
  config: SupabasePublicConfig;
  onResult: (result: SupabaseAuthHydrationResult) => void;
  onStatus?: (message: string) => void;
}): SupabaseAuthSessionLifecycle {
  const client = getSupabaseBrowserClient(input.config);
  let stopped = false;

  if (input.config.status === 'disabled') {
    input.onResult({
      status: 'disabled',
      message: 'Supabase login is disabled because browser cloud-sync config is absent.',
      user: null,
    });
    return { stop() {} };
  }

  if (!client) {
    input.onResult({
      status: 'misconfigured',
      message: 'Supabase login is unavailable until browser cloud-sync config is complete.',
      user: null,
    });
    return { stop() {} };
  }

  const publishSession = (session: Session | null, message?: string) => {
    if (stopped) {
      return;
    }

    if (!session?.access_token || !session.user) {
      clearPersistedSupabaseAuthSession();
      input.onResult({
        status: 'no-session',
        message: message ?? 'No Supabase session is present; sign in to open the editor.',
        user: null,
      });
      return;
    }

    persistSupabaseSdkSession(session);
    const user = normalizeSupabaseSdkUser(session.user);
    if (!user) {
      input.onResult({
        status: 'user-fetch-failed',
        message: 'Supabase session did not include a stable user identity.',
        user: null,
      });
      return;
    }

    input.onResult({
      status: 'authenticated',
      message: `Signed in as ${user.email ?? user.id}.`,
      user,
    });
  };

  input.onStatus?.('Checking Supabase session state.');
  void client.auth
    .getSession()
    .then(({ data, error }) => {
      publishSession(data.session, error?.message);
    })
    .catch((error: unknown) => {
      clearPersistedSupabaseAuthSession();
      input.onResult({
        status: 'user-fetch-failed',
        message: error instanceof Error ? error.message : 'Supabase session could not be hydrated.',
        user: null,
      });
    });

  const {
    data: { subscription },
  } = client.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      publishSession(null, 'Signed out locally. Sign in to open the editor.');
      return;
    }
    publishSession(session);
  });

  return {
    stop() {
      stopped = true;
      subscription.unsubscribe();
    },
  };
}

export function persistSupabaseSdkSession(session: Session) {
  persistSupabaseAuthSession({
    accessToken: session.access_token,
    expiresAt: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
    refreshToken: session.refresh_token ?? null,
    tokenType: 'bearer',
  });
}

function normalizeSupabaseSdkUser(user: User): SupabaseAuthIdentity | null {
  const id = user.id?.trim();
  if (!id) {
    return null;
  }

  return {
    id,
    email: user.email?.trim() || null,
    user_metadata:
      user.user_metadata && typeof user.user_metadata === 'object' ? user.user_metadata : null,
  };
}
