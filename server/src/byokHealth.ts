export type ByokRuntimeHealth = {
  adminReady: boolean;
  browserSecretLeakDetected: boolean;
  missing: string[];
  overlaySigningConfigured: boolean;
  publicReady: boolean;
  serviceKeyConfigured: boolean;
  storageBucketConfigured: boolean;
  urlConfigured: boolean;
};

const BROWSER_SECRET_ENV_NAMES = [
  'VITE_SUPABASE_SERVICE_ROLE_KEY',
  'VITE_SUPABASE_SECRET_KEY',
  'VITE_SUPABASE_JWT_SECRET',
  'VITE_OVERLAY_SIGNING_SECRET',
  'VITE_SUPABASE_DB_PASSWORD',
] as const;

export function summarizeByokRuntimeHealth(
  env: Record<string, string | undefined> = process.env,
): ByokRuntimeHealth {
  const urlConfigured = hasValue(env.SUPABASE_URL) || hasValue(env.VITE_SUPABASE_URL);
  const publicKeyConfigured =
    hasValue(env.SUPABASE_PUBLISHABLE_KEY) ||
    hasValue(env.SUPABASE_ANON_KEY) ||
    hasValue(env.VITE_SUPABASE_PUBLISHABLE_KEY) ||
    hasValue(env.VITE_SUPABASE_ANON_KEY);
  const serviceKeyConfigured = hasValue(env.SUPABASE_SECRET_KEY) || hasValue(env.SUPABASE_SERVICE_ROLE_KEY);
  const storageBucketConfigured = hasValue(env.SUPABASE_STORAGE_BUCKET);
  const overlaySigningConfigured = hasValue(env.OVERLAY_SIGNING_SECRET);
  const browserSecretLeakDetected = BROWSER_SECRET_ENV_NAMES.some((name) => hasValue(env[name]));

  const missing = [
    ...(urlConfigured ? [] : ['SUPABASE_URL']),
    ...(publicKeyConfigured ? [] : ['SUPABASE_PUBLISHABLE_KEY']),
    ...(serviceKeyConfigured ? [] : ['SUPABASE_SECRET_KEY']),
  ];

  return {
    adminReady: urlConfigured && publicKeyConfigured && serviceKeyConfigured,
    browserSecretLeakDetected,
    missing,
    overlaySigningConfigured,
    publicReady: urlConfigured && publicKeyConfigured,
    serviceKeyConfigured,
    storageBucketConfigured,
    urlConfigured,
  };
}

function hasValue(value: string | undefined) {
  return Boolean(value?.trim());
}
