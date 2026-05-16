import type { AssetStorageProvider, AuthProvider, DatabaseProvider } from './byok.js';

export type SupabaseEnvSource = Record<string, string | undefined>;

export const SUPABASE_BROWSER_ENV = {
  url: 'VITE_SUPABASE_URL',
  anonKey: 'VITE_SUPABASE_ANON_KEY',
} as const;

export const SUPABASE_SERVER_ENV = {
  url: 'SUPABASE_URL',
  anonKey: 'SUPABASE_ANON_KEY',
  serviceRoleKey: 'SUPABASE_SERVICE_ROLE_KEY',
  jwtSecret: 'SUPABASE_JWT_SECRET',
  storageBucket: 'SUPABASE_STORAGE_BUCKET',
} as const;

export const DEFAULT_SUPABASE_STORAGE_BUCKET = 'yourwifey-assets';

export type SupabaseEnvStatus = 'disabled' | 'configured' | 'misconfigured';

export type SupabaseBrowserEnvName =
  (typeof SUPABASE_BROWSER_ENV)[keyof typeof SUPABASE_BROWSER_ENV];

export type SupabaseServerEnvName = (typeof SUPABASE_SERVER_ENV)[keyof typeof SUPABASE_SERVER_ENV];

export type SupabasePublicConfig = {
  status: SupabaseEnvStatus;
  authProvider: AuthProvider;
  databaseProvider: DatabaseProvider;
  storageProvider: Extract<AssetStorageProvider, 'supabase-storage'>;
  url: string | null;
  anonKey: string | null;
  missing: SupabaseBrowserEnvName[];
  problems: string[];
};

export type SupabaseServerConfig = SupabasePublicConfig & {
  serviceRoleKey: string | null;
  jwtSecret: string | null;
  storageBucket: string;
  adminReady: boolean;
  serverMissing: SupabaseServerEnvName[];
};

const BROWSER_SECRET_ENV_NAMES = [
  'VITE_SUPABASE_SERVICE_ROLE_KEY',
  'VITE_SUPABASE_JWT_SECRET',
  'VITE_SUPABASE_DB_PASSWORD',
] as const;

const BASE_PUBLIC_CONFIG = {
  authProvider: 'supabase',
  databaseProvider: 'supabase-postgres',
  storageProvider: 'supabase-storage',
} as const satisfies Pick<
  SupabasePublicConfig,
  'authProvider' | 'databaseProvider' | 'storageProvider'
>;

export function readSupabaseBrowserEnv(env: SupabaseEnvSource): SupabasePublicConfig {
  const url = normalizeSupabaseUrl(readTrimmed(env, SUPABASE_BROWSER_ENV.url));
  const anonKey = readTrimmed(env, SUPABASE_BROWSER_ENV.anonKey);
  const missing = requiredMissing(
    [
      [SUPABASE_BROWSER_ENV.url, url],
      [SUPABASE_BROWSER_ENV.anonKey, anonKey],
    ],
    isBrowserEnvName,
  );
  const problems = [
    ...validateSupabaseUrl(url, SUPABASE_BROWSER_ENV.url),
    ...validateBrowserSecretLeak(env),
  ];

  return {
    ...BASE_PUBLIC_CONFIG,
    status: resolveEnvStatus(missing.length, 2, problems),
    url,
    anonKey,
    missing,
    problems,
  };
}

export function readSupabaseServerEnv(env: SupabaseEnvSource): SupabaseServerConfig {
  const url = normalizeSupabaseUrl(
    readFirstTrimmed(env, [SUPABASE_SERVER_ENV.url, SUPABASE_BROWSER_ENV.url]),
  );
  const anonKey = readFirstTrimmed(env, [
    SUPABASE_SERVER_ENV.anonKey,
    SUPABASE_BROWSER_ENV.anonKey,
  ]);
  const serviceRoleKey = readTrimmed(env, SUPABASE_SERVER_ENV.serviceRoleKey);
  const jwtSecret = readTrimmed(env, SUPABASE_SERVER_ENV.jwtSecret);
  const storageBucket =
    readTrimmed(env, SUPABASE_SERVER_ENV.storageBucket) ?? DEFAULT_SUPABASE_STORAGE_BUCKET;
  const serverMissing = requiredMissing(
    [
      [SUPABASE_SERVER_ENV.url, url],
      [SUPABASE_SERVER_ENV.anonKey, anonKey],
      [SUPABASE_SERVER_ENV.serviceRoleKey, serviceRoleKey],
    ],
    isServerEnvName,
  );
  const publicMissing = requiredMissing(
    [
      [SUPABASE_BROWSER_ENV.url, url],
      [SUPABASE_BROWSER_ENV.anonKey, anonKey],
    ],
    isBrowserEnvName,
  );
  const problems = [
    ...validateSupabaseUrl(url, SUPABASE_SERVER_ENV.url),
    ...validateStorageBucket(storageBucket),
  ];
  const status = resolveEnvStatus(publicMissing.length, 2, problems);

  return {
    ...BASE_PUBLIC_CONFIG,
    status,
    url,
    anonKey,
    missing: publicMissing,
    problems,
    serviceRoleKey,
    jwtSecret,
    storageBucket,
    adminReady: status === 'configured' && Boolean(serviceRoleKey),
    serverMissing,
  };
}

export function toSupabasePublicConfig(config: SupabaseServerConfig): SupabasePublicConfig {
  return {
    ...BASE_PUBLIC_CONFIG,
    status: config.status,
    url: config.url,
    anonKey: config.anonKey,
    missing: [...config.missing],
    problems: [...config.problems],
  };
}

export function assertSupabaseCloudSyncReady(config: SupabasePublicConfig) {
  if (config.status !== 'configured') {
    throw new Error(buildSupabaseConfigError(config));
  }
}

export function assertSupabaseAdminReady(config: SupabaseServerConfig) {
  assertSupabaseCloudSyncReady(config);
  if (!config.serviceRoleKey) {
    throw new Error(
      `Supabase admin routes require ${SUPABASE_SERVER_ENV.serviceRoleKey} on the server only.`,
    );
  }
}

function buildSupabaseConfigError(config: SupabasePublicConfig) {
  const missing = config.missing.length > 0 ? ` Missing: ${config.missing.join(', ')}.` : '';
  const problems = config.problems.length > 0 ? ` Problems: ${config.problems.join(' ')}` : '';
  return `Supabase cloud sync is not configured.${missing}${problems}`;
}

function resolveEnvStatus(
  missingCount: number,
  requiredCount: number,
  problems: readonly string[],
): SupabaseEnvStatus {
  if (problems.length > 0) {
    return 'misconfigured';
  }
  if (missingCount === 0) {
    return 'configured';
  }
  if (missingCount === requiredCount) {
    return 'disabled';
  }
  return 'misconfigured';
}

function requiredMissing<T extends string>(
  pairs: Array<readonly [string, string | null]>,
  isExpectedName: (name: string) => name is T,
): T[] {
  return pairs
    .filter(([, value]) => !value)
    .map(([name]) => name)
    .filter(isExpectedName);
}

function validateSupabaseUrl(url: string | null, envName: string) {
  if (!url) {
    return [];
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:') {
      return [];
    }
    if (
      parsed.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)
    ) {
      return [];
    }
    return [`${envName} must be HTTPS unless it points at local Supabase.`];
  } catch {
    return [`${envName} must be a valid Supabase URL.`];
  }
}

function validateBrowserSecretLeak(env: SupabaseEnvSource) {
  return BROWSER_SECRET_ENV_NAMES.filter((name) => Boolean(readTrimmed(env, name))).map(
    (name) => `${name} must not be exposed to browser code.`,
  );
}

function validateStorageBucket(value: string) {
  if (/^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$/.test(value)) {
    return [];
  }
  return [`${SUPABASE_SERVER_ENV.storageBucket} must be a stable storage bucket name.`];
}

function normalizeSupabaseUrl(value: string | null) {
  return value?.replace(/\/+$/, '') ?? null;
}

function readFirstTrimmed(env: SupabaseEnvSource, names: readonly string[]) {
  for (const name of names) {
    const value = readTrimmed(env, name);
    if (value) {
      return value;
    }
  }
  return null;
}

function readTrimmed(env: SupabaseEnvSource, name: string) {
  const value = env[name]?.trim();
  return value ? value : null;
}

function isBrowserEnvName(name: string): name is SupabaseBrowserEnvName {
  return Object.values(SUPABASE_BROWSER_ENV).includes(name as SupabaseBrowserEnvName);
}

function isServerEnvName(name: string): name is SupabaseServerEnvName {
  return Object.values(SUPABASE_SERVER_ENV).includes(name as SupabaseServerEnvName);
}
