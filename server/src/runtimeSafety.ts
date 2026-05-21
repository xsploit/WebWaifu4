export function canUseServerProviderProxy(providerProxyEnabled: boolean, proxyAuthOk: boolean) {
  return providerProxyEnabled && proxyAuthOk;
}

export type ServerProviderProxyModelDecision =
  | {
      allowed: true;
      model: string;
    }
  | {
      allowed: false;
      error: string;
    };

export function resolveServerProviderProxyModel(input: {
  allowlistEnvNames?: readonly string[];
  browserProviderKeyPresent: boolean;
  configuredModel: string;
  defaultModel: string;
  env?: Record<string, string | undefined>;
  requestedModel?: unknown;
}): ServerProviderProxyModelDecision {
  const configuredModel = normalizeModelName(input.configuredModel) || input.defaultModel;
  const requestedModel = normalizeModelName(input.requestedModel);
  if (input.browserProviderKeyPresent) {
    return { allowed: true, model: requestedModel || configuredModel };
  }

  if (!requestedModel || requestedModel === configuredModel) {
    return { allowed: true, model: configuredModel };
  }

  const allowlist = readServerProviderModelAllowlist(input.env ?? process.env, [
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
