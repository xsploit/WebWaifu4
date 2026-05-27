export type RuntimeLlmProvider =
  | 'deepseek'
  | 'openai-responses'
  | 'openrouter-responses'
  | 'vercel-gateway';

export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';
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
  if (value === 'deepseek') {
    return 'deepseek';
  }
  return 'openai-responses';
}

export function resolveRuntimeLlmProvider(...values: unknown[]): RuntimeLlmProvider {
  for (const value of values) {
    if (
      value === 'openrouter-responses' ||
      value === 'openai-responses' ||
      value === 'deepseek' ||
      value === 'vercel-gateway'
    ) {
      return value;
    }
  }
  return 'openai-responses';
}

export function getRuntimeProviderBaseUrl(provider: RuntimeLlmProvider, openAiBaseUrl: string) {
  if (provider === 'vercel-gateway') {
    return VERCEL_AI_GATEWAY_BASE_URL;
  }
  if (provider === 'openrouter-responses') {
    return OPENROUTER_BASE_URL;
  }
  if (provider === 'deepseek') {
    return process.env.DEEPSEEK_BASE_URL?.trim().replace(/\/+$/, '') || DEEPSEEK_BASE_URL;
  }
  const normalized = (openAiBaseUrl || OPENAI_BASE_URL).replace(/\/+$/, '');
  return normalized === 'http://127.0.0.1:1234/v1' ? OPENAI_BASE_URL : normalized;
}

export function providerUsesAppOwnedState(provider: RuntimeLlmProvider) {
  return (
    provider === 'openai-responses' ||
    provider === 'deepseek' ||
    provider === 'openrouter-responses' ||
    provider === 'vercel-gateway'
  );
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
  if (provider === 'deepseek') {
    return env['DEEPSEEK_API_KEY']?.trim() || '';
  }
  return env['OPENAI_API_KEY']?.trim() || env['AI_API_KEY']?.trim() || '';
}

export function getProviderEmbeddingModel(provider: RuntimeLlmProvider, fallback: string) {
  if (
    provider === 'deepseek' ||
    provider === 'openrouter-responses' ||
    provider === 'vercel-gateway'
  ) {
    return 'openai/text-embedding-3-small';
  }
  return fallback;
}
