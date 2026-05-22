import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MEMORY_AGENT_MODEL,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_OPENROUTER_MODEL,
  DEFAULT_VERCEL_GATEWAY_MODEL,
  createDefaultAiSettings,
} from './defaults';
import {
  applyLlmProviderSwitchDefaults,
  getProviderFallbackModels,
  normalizeLlmProviderCompatibility,
} from './provider-defaults';

describe('LLM provider defaults', () => {
  it('switches OpenAI settings to the OpenRouter-compatible defaults', () => {
    const current = {
      ...createDefaultAiSettings(),
      maxTokens: 740,
      temperature: 1.05,
    };

    const next = applyLlmProviderSwitchDefaults(current, 'openrouter-responses');

    expect(next).toMatchObject({
      aiTransportMode: 'http-stream',
      llmProvider: 'openrouter-responses',
      maxTokens: 740,
      memoryAgentModel: DEFAULT_OPENROUTER_MODEL,
      model: DEFAULT_OPENROUTER_MODEL,
      openAiStateMode: 'stateless',
      temperature: 1.05,
    });
  });

  it('switches OpenRouter settings back to OpenAI websocket conversation defaults', () => {
    const current = {
      ...createDefaultAiSettings(),
      aiTransportMode: 'http-stream' as const,
      llmProvider: 'openrouter-responses' as const,
      memoryAgentModel: 'anthropic/claude-3.5-haiku',
      model: 'anthropic/claude-3.5-haiku',
      openAiStateMode: 'stateless' as const,
    };

    const next = applyLlmProviderSwitchDefaults(current, 'openai-responses');

    expect(next).toMatchObject({
      aiTransportMode: 'websocket',
      llmProvider: 'openai-responses',
      memoryAgentModel: DEFAULT_MEMORY_AGENT_MODEL,
      model: DEFAULT_OPENAI_MODEL,
      openAiStateMode: 'conversation',
    });
  });

  it('repairs legacy OpenAI model ids saved under OpenRouter', () => {
    const next = normalizeLlmProviderCompatibility({
      ...createDefaultAiSettings(),
      aiTransportMode: 'websocket',
      llmProvider: 'openrouter-responses',
      memoryAgentModel: 'gpt-5.4-mini',
      model: 'gpt-5.4-nano',
      openAiStateMode: 'conversation',
    });

    expect(next).toMatchObject({
      aiTransportMode: 'http-stream',
      memoryAgentModel: DEFAULT_OPENROUTER_MODEL,
      model: DEFAULT_OPENROUTER_MODEL,
      openAiStateMode: 'stateless',
    });
  });

  it('preserves explicit OpenRouter model ids', () => {
    const next = normalizeLlmProviderCompatibility({
      ...createDefaultAiSettings(),
      aiTransportMode: 'websocket',
      llmProvider: 'openrouter-responses',
      memoryAgentModel: 'anthropic/claude-3.5-haiku',
      model: 'anthropic/claude-3.5-haiku',
      openAiStateMode: 'conversation',
    });

    expect(next).toMatchObject({
      aiTransportMode: 'http-stream',
      memoryAgentModel: 'anthropic/claude-3.5-haiku',
      model: 'anthropic/claude-3.5-haiku',
      openAiStateMode: 'stateless',
    });
  });

  it('switches to Vercel AI Gateway stateless gateway defaults', () => {
    const next = applyLlmProviderSwitchDefaults(
      createDefaultAiSettings(),
      'vercel-gateway-responses',
    );

    expect(next).toMatchObject({
      aiTransportMode: 'http-stream',
      llmProvider: 'vercel-gateway-responses',
      memoryAgentModel: DEFAULT_VERCEL_GATEWAY_MODEL,
      model: DEFAULT_VERCEL_GATEWAY_MODEL,
      openAiStateMode: 'stateless',
    });
  });

  it('exposes fallback model ids for provider model pickers', () => {
    expect(getProviderFallbackModels('openrouter-responses')).toEqual([DEFAULT_OPENROUTER_MODEL]);
    expect(getProviderFallbackModels('vercel-gateway-responses')).toEqual([
      DEFAULT_VERCEL_GATEWAY_MODEL,
    ]);
    expect(getProviderFallbackModels('openai-responses')).toEqual([
      DEFAULT_OPENAI_MODEL,
      DEFAULT_MEMORY_AGENT_MODEL,
    ]);
  });
});
