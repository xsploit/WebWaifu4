export type RuntimeLlmProvider =
  | 'openrouter-responses'
  | 'vercel-gateway';

export const OPENAI_BASE_URL = 'https://api.openai.com/v1';
export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
export const VERCEL_AI_GATEWAY_BASE_URL = 'https://ai-gateway.vercel.sh/v1';

export function normalizeRuntimeLlmProvider(value: unknown): RuntimeLlmProvider {
  if (value === 'vercel-gateway') {
    return 'vercel-gateway';
  }
  if (value === 'openrouter-responses') {
    return 'openrouter-responses';
  }
  return 'vercel-gateway';
}

export function resolveRuntimeLlmProvider(...values: unknown[]): RuntimeLlmProvider {
  for (const value of values) {
    if (value === 'openrouter-responses' || value === 'vercel-gateway') {
      return value;
    }
  }
  return 'vercel-gateway';
}

export function getRuntimeProviderBaseUrl(provider: RuntimeLlmProvider, openAiBaseUrl: string) {
  if (provider === 'vercel-gateway') {
    return VERCEL_AI_GATEWAY_BASE_URL;
  }
  if (provider === 'openrouter-responses') {
    return OPENROUTER_BASE_URL;
  }
  return VERCEL_AI_GATEWAY_BASE_URL;
}

export function providerUsesAppOwnedState(provider: RuntimeLlmProvider) {
  return provider === 'openrouter-responses' || provider === 'vercel-gateway';
}

export function providerModelsCanBeListedWithoutKey(provider: RuntimeLlmProvider) {
  return provider === 'openrouter-responses' || provider === 'vercel-gateway';
}

export function getProviderEnvApiKey(
  provider: RuntimeLlmProvider,
  env: Record<string, string | undefined> = process.env,
) {
  if (provider === 'openrouter-responses') {
    return env['OPENROUTER_API_KEY']?.trim() || '';
  }
  if (provider === 'vercel-gateway') {
    return env['AI_GATEWAY_API_KEY']?.trim() || env['VERCEL_OIDC_TOKEN']?.trim() || '';
  }
  return '';
}

export function getProviderEmbeddingModel(provider: RuntimeLlmProvider, fallback: string) {
  return provider === 'openrouter-responses' || provider === 'vercel-gateway'
    ? 'openai/text-embedding-3-small'
    : fallback;
}
