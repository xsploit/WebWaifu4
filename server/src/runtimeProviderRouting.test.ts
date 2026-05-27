import { describe, expect, it } from 'vitest';
import {
  getProviderEmbeddingModel,
  getRuntimeProviderBaseUrl,
  DEEPSEEK_BASE_URL,
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
      'openai-responses',
    );
    expect(resolveRuntimeLlmProvider('vercel-gateway', 'openai-responses')).toBe(
      'vercel-gateway',
    );
    expect(resolveRuntimeLlmProvider('deepseek', 'openai-responses')).toBe('deepseek');
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

  it('routes Vercel AI Gateway through gateway model and embedding namespaces', () => {
    expect(getProviderEmbeddingModel('vercel-gateway', 'text-embedding-3-small')).toBe(
      'openai/text-embedding-3-small',
    );
    expect(getRuntimeProviderBaseUrl('vercel-gateway', OPENAI_BASE_URL)).toBe(
      VERCEL_AI_GATEWAY_BASE_URL,
    );
  });

  it('routes DeepSeek direct chat through its own base URL but keeps embeddings on OpenAI-compatible vectors', () => {
    expect(getRuntimeProviderBaseUrl('deepseek', OPENAI_BASE_URL)).toBe(DEEPSEEK_BASE_URL);
    expect(getProviderEmbeddingModel('deepseek', 'text-embedding-3-small')).toBe(
      'openai/text-embedding-3-small',
    );
  });

  it('does not let the old local-compatible fallback leak into OpenAI Responses requests', () => {
    expect(getRuntimeProviderBaseUrl('openai-responses', 'http://127.0.0.1:1234/v1')).toBe(
      OPENAI_BASE_URL,
    );
  });
});
