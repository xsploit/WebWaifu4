import { describe, expect, it } from 'vitest';
import {
  getProviderEmbeddingModel,
  getRuntimeProviderBaseUrl,
  providerModelsCanBeListedWithoutKey,
  OPENAI_BASE_URL,
  OPENROUTER_BASE_URL,
  resolveRuntimeLlmProvider,
  VERCEL_AI_GATEWAY_BASE_URL,
} from './runtimeProviderRouting.js';

describe('runtimeProviderRouting', () => {
  it('resolves the first explicit provider so headers can drive embedding routing', () => {
    expect(resolveRuntimeLlmProvider(undefined, 'openrouter-responses')).toBe(
      'openrouter-responses',
    );
    expect(resolveRuntimeLlmProvider('openrouter-responses', 'openai-responses')).toBe(
      'openrouter-responses',
    );
    expect(resolveRuntimeLlmProvider('openai-responses', 'openrouter-responses')).toBe(
      'openrouter-responses',
    );
    expect(resolveRuntimeLlmProvider('vercel-gateway', 'openai-responses')).toBe(
      'vercel-gateway',
    );
    expect(resolveRuntimeLlmProvider('deepseek', 'openai-responses')).toBe('vercel-gateway');
    expect(resolveRuntimeLlmProvider('bad-provider')).toBe('vercel-gateway');
  });

  it('keeps OpenRouter embeddings on the OpenRouter-compatible model namespace', () => {
    expect(getProviderEmbeddingModel('openrouter-responses', 'text-embedding-3-small')).toBe(
      'openai/text-embedding-3-small',
    );
    expect(getRuntimeProviderBaseUrl('openrouter-responses', OPENAI_BASE_URL)).toBe(
      OPENROUTER_BASE_URL,
    );
  });

  it('routes Vercel AI Gateway through gateway model and embedding namespaces', () => {
    expect(getProviderEmbeddingModel('vercel-gateway', 'text-embedding-3-small')).toBe(
      'openai/text-embedding-3-small',
    );
    expect(getRuntimeProviderBaseUrl('vercel-gateway', OPENAI_BASE_URL)).toBe(
      VERCEL_AI_GATEWAY_BASE_URL,
    );
    expect(providerModelsCanBeListedWithoutKey('vercel-gateway')).toBe(true);
  });

  it('does not let old direct provider names leak into runtime chat routing', () => {
    expect(resolveRuntimeLlmProvider('openai-responses')).toBe('vercel-gateway');
    expect(resolveRuntimeLlmProvider('openai-compatible')).toBe('vercel-gateway');
    expect(resolveRuntimeLlmProvider('deepseek')).toBe('vercel-gateway');
  });
});
