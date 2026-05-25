export type RuntimeLlmProvider = 'openai-responses' | 'openrouter-responses';

export const OPENAI_BASE_URL = 'https://api.openai.com/v1';
export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

export function normalizeRuntimeLlmProvider(value: unknown): RuntimeLlmProvider {
  if (value === 'openrouter-responses') {
    return 'openrouter-responses';
  }
  return 'openai-responses';
}

export function resolveRuntimeLlmProvider(...values: unknown[]): RuntimeLlmProvider {
  for (const value of values) {
    if (value === 'openrouter-responses' || value === 'openai-responses') {
      return value;
    }
  }
  return 'openai-responses';
}

export function getRuntimeProviderBaseUrl(provider: RuntimeLlmProvider, openAiBaseUrl: string) {
  if (provider === 'openrouter-responses') {
    return OPENROUTER_BASE_URL;
  }
  return (openAiBaseUrl || OPENAI_BASE_URL).replace(/\/+$/, '');
}

export function providerUsesAppOwnedState(provider: RuntimeLlmProvider) {
  return provider === 'openrouter-responses';
}

export function providerModelsCanBeListedWithoutKey(provider: RuntimeLlmProvider) {
  return provider === 'openrouter-responses';
}

export function getProviderEnvApiKey(
  provider: RuntimeLlmProvider,
  env: Record<string, string | undefined> = process.env,
) {
  if (provider === 'openrouter-responses') {
    return env['OPENROUTER_API_KEY']?.trim() || '';
  }
  return env['OPENAI_API_KEY']?.trim() || env['AI_API_KEY']?.trim() || '';
}

export function getProviderEmbeddingModel(provider: RuntimeLlmProvider, fallback: string) {
  if (provider === 'openrouter-responses') {
    return 'openai/text-embedding-3-small';
  }
  return fallback;
}
