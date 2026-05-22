export type RuntimeLlmProvider =
  | 'openai-responses'
  | 'openrouter-responses'
  | 'vercel-gateway-responses';

export const OPENAI_BASE_URL = 'https://api.openai.com/v1';
export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
export const VERCEL_AI_GATEWAY_BASE_URL = 'https://ai-gateway.vercel.sh/v1';

export function normalizeRuntimeLlmProvider(value: unknown): RuntimeLlmProvider {
  if (value === 'openrouter-responses') {
    return 'openrouter-responses';
  }
  if (value === 'vercel-gateway-responses') {
    return 'vercel-gateway-responses';
  }
  return 'openai-responses';
}

export function getRuntimeProviderBaseUrl(provider: RuntimeLlmProvider, openAiBaseUrl: string) {
  if (provider === 'openrouter-responses') {
    return OPENROUTER_BASE_URL;
  }
  if (provider === 'vercel-gateway-responses') {
    return VERCEL_AI_GATEWAY_BASE_URL;
  }
  return (openAiBaseUrl || OPENAI_BASE_URL).replace(/\/+$/, '');
}

export function providerUsesAppOwnedState(provider: RuntimeLlmProvider) {
  return provider === 'openrouter-responses' || provider === 'vercel-gateway-responses';
}

export function providerModelsCanBeListedWithoutKey(provider: RuntimeLlmProvider) {
  return provider === 'openrouter-responses' || provider === 'vercel-gateway-responses';
}

export function getProviderEnvApiKey(
  provider: RuntimeLlmProvider,
  env: Record<string, string | undefined> = process.env,
) {
  if (provider === 'vercel-gateway-responses') {
    return env['AI_GATEWAY_API_KEY']?.trim() || '';
  }
  if (provider === 'openrouter-responses') {
    return env['OPENROUTER_API_KEY']?.trim() || '';
  }
  return env['OPENAI_API_KEY']?.trim() || env['AI_API_KEY']?.trim() || '';
}

export function getProviderEmbeddingModel(provider: RuntimeLlmProvider, fallback: string) {
  if (provider === 'openrouter-responses' || provider === 'vercel-gateway-responses') {
    return 'openai/text-embedding-3-small';
  }
  return fallback;
}
