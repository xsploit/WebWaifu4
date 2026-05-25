import { describe, expect, it } from 'vitest';
import {
  getProviderEmbeddingModel,
  getRuntimeProviderBaseUrl,
  OPENAI_BASE_URL,
  OPENROUTER_BASE_URL,
  resolveRuntimeLlmProvider,
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
      'openai-responses',
    );
    expect(resolveRuntimeLlmProvider('bad-provider')).toBe('openai-responses');
  });

  it('keeps OpenRouter embeddings on the OpenRouter-compatible model namespace', () => {
    expect(getProviderEmbeddingModel('openrouter-responses', 'text-embedding-3-small')).toBe(
      'openai/text-embedding-3-small',
    );
    expect(getRuntimeProviderBaseUrl('openrouter-responses', OPENAI_BASE_URL)).toBe(
      OPENROUTER_BASE_URL,
    );
  });
});
