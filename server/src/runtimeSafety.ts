export type ServerProviderProxyModelDecision =
  | {
      allowed: true;
      model: string;
    }
  | {
      allowed: false;
      error: string;
    };

const SAFE_TRANSCRIPTION_MODELS = new Map([
  ['whisper-1', 'openai/whisper-1'],
  ['openai/whisper-1', 'openai/whisper-1'],
  ['whisper-large-v3', 'openai/whisper-large-v3'],
  ['openai/whisper-large-v3', 'openai/whisper-large-v3'],
  ['gpt-4o-transcribe', 'openai/gpt-4o-transcribe'],
  ['openai/gpt-4o-transcribe', 'openai/gpt-4o-transcribe'],
  ['gpt-4o-mini-transcribe', 'openai/gpt-4o-mini-transcribe'],
  ['openai/gpt-4o-mini-transcribe', 'openai/gpt-4o-mini-transcribe'],
]);

const SAFE_EMBEDDING_MODELS = new Set([
  'text-embedding-3-small',
  'text-embedding-3-large',
  'text-embedding-ada-002',
  'openai/text-embedding-3-small',
  'openai/text-embedding-3-large',
  'openai/text-embedding-ada-002',
]);

export function isPremiumCostModelId(value: unknown) {
  if (typeof value !== 'string') {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  const parts = normalized.split('/');
  const provider = parts.length > 1 ? parts[0] : '';
  const leaf = (normalized.split('/').pop() ?? normalized).replace(/_/g, '.');
  const isOpenAiModel = !provider || provider === 'openai';
  const isO1Model =
    leaf === 'o1' || leaf.startsWith('o1-') || leaf.startsWith('o1.') || leaf.startsWith('o1pro');
  const isProModel = /(^|[.-])pro([.-]|$)/.test(leaf);
  return isOpenAiModel && (isO1Model || isProModel);
}

export function normalizeTranscriptionModel(value: unknown, fallback = 'openai/whisper-large-v3') {
  const model = normalizeModelName(value);
  return SAFE_TRANSCRIPTION_MODELS.get(model.toLowerCase()) ?? fallback;
}

export function normalizeEmbeddingModel(value: unknown, fallback: string) {
  const model = normalizeModelName(value);
  if (!model || isPremiumCostModelId(model)) {
    return fallback;
  }
  return SAFE_EMBEDDING_MODELS.has(model.toLowerCase()) ? model : fallback;
}

export function resolveServerProviderProxyModel(input: {
  allowlistEnvNames?: readonly string[];
  browserProviderKeyPresent: boolean;
  configuredModel: string;
  defaultModel: string;
  env?: Record<string, string | undefined>;
  requestedModel?: unknown;
}): ServerProviderProxyModelDecision {
  const env = input.env ?? process.env;
  const premiumModelsAllowed = isPremiumModelOptInEnabled(env);
  const configuredModel = normalizeModelName(input.configuredModel) || input.defaultModel;
  const requestedModel = normalizeModelName(input.requestedModel);
  const effectiveModel = requestedModel || configuredModel;
  if (isPremiumCostModelId(effectiveModel) && !premiumModelsAllowed) {
    return {
      allowed: false,
      error:
        'This high-cost model is blocked by default. Set YOURWIFEY_ALLOW_PREMIUM_MODELS=true only if you intentionally want to allow it.',
    };
  }
  if (input.browserProviderKeyPresent) {
    return { allowed: true, model: effectiveModel };
  }

  if (!requestedModel || requestedModel === configuredModel) {
    return { allowed: true, model: configuredModel };
  }

  const allowlist = readServerProviderModelAllowlist(env, [
    ...(input.allowlistEnvNames ?? []),
    'BYOK_SERVER_PROVIDER_PROXY_MODEL_ALLOWLIST',
    'SERVER_PROVIDER_PROXY_MODEL_ALLOWLIST',
  ]);
  if (allowlist.has(requestedModel)) {
    return { allowed: true, model: requestedModel };
  }

  return {
    allowed: false,
    error:
      'Server provider proxy cannot be steered to an unapproved model. Use a browser-vault provider key or configure the server model allowlist.',
  };
}

function isPremiumModelOptInEnabled(env: Record<string, string | undefined>) {
  return ['YOURWIFEY_ALLOW_PREMIUM_MODELS', 'ALLOW_PREMIUM_MODELS'].some((name) =>
    ['1', 'true', 'yes', 'on'].includes((env[name] ?? '').trim().toLowerCase()),
  );
}

export function getRawPathParts(pathname: string) {
  return pathname.split('/').filter(Boolean);
}

export function safeDecodePathParts(pathname: string) {
  try {
    return getRawPathParts(pathname).map((part) => decodeURIComponent(part));
  } catch {
    return null;
  }
}

export function resolveRuntimeHealthStateKey(input: {
  browserProviderKeyPresent: boolean;
  requestedStateKey?: string | null;
}) {
  const requestedStateKey = input.requestedStateKey?.trim();
  if (!requestedStateKey) {
    return undefined;
  }
  return input.browserProviderKeyPresent ? requestedStateKey : undefined;
}

function normalizeModelName(value: unknown) {
  return typeof value === 'string' ? value.trim().slice(0, 160) : '';
}

function readServerProviderModelAllowlist(
  env: Record<string, string | undefined>,
  names: readonly string[],
) {
  const models = new Set<string>();
  for (const name of names) {
    for (const item of (env[name] ?? '').split(',')) {
      const model = normalizeModelName(item);
      if (model) {
        models.add(model);
      }
    }
  }
  return models;
}
