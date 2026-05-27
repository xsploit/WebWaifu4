import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatProviderRequest } from './ChatProvider.js';

const streamTextMock = vi.hoisted(() => vi.fn());
const createGatewayMock = vi.hoisted(() => vi.fn());
const createOpenAICompatibleMock = vi.hoisted(() => vi.fn());
const createOpenRouterMock = vi.hoisted(() => vi.fn());

vi.mock('ai', () => ({
  Output: {
    json: vi.fn(() => ({ kind: 'json-output' })),
    object: vi.fn((value) => ({ kind: 'object-output', value })),
  },
  jsonSchema: vi.fn((schema) => ({ kind: 'json-schema', schema })),
  stepCountIs: vi.fn((rounds) => ({ kind: 'step-count', rounds })),
  streamText: streamTextMock,
  tool: vi.fn((definition) => ({ kind: 'tool', ...definition })),
}));

vi.mock('@ai-sdk/gateway', () => ({
  createGateway: createGatewayMock,
}));

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => ({
    responses: vi.fn((model: string) => ({ provider: 'openai-responses', model })),
  })),
}));

vi.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: createOpenAICompatibleMock,
}));

vi.mock('@openrouter/ai-sdk-provider', () => ({
  createOpenRouter: createOpenRouterMock,
}));

const { AiSdkGatewayProvider } = await import('./AiSdkGatewayProvider.js');

function createRequest(overrides: Partial<ChatProviderRequest> = {}): ChatProviderRequest {
  return {
    activeChatters: 1,
    maxToolRounds: 15,
    mode: 'direct',
    messages: [
      { role: 'system', content: 'You are Hikari.' },
      { role: 'user', content: 'search current NHL scores today' },
    ],
    sourceMessages: [],
    stateScope: 'chat',
    toolChoiceMode: 'required',
    ...overrides,
  };
}

function createProvider() {
  return new AiSdkGatewayProvider({
    apiKey: 'test-key',
    maxTokens: 180,
    model: 'gpt-5-nano',
    provider: 'openai-responses',
    tavilyTools: {
      apiKey: 'tavily-key',
      crawlLimit: 8,
      maxResults: 5,
      searchDepth: 'basic',
      timeoutMs: 10000,
    },
    temperature: 0.7,
  });
}

describe('AiSdkGatewayProvider', () => {
  beforeEach(() => {
    createGatewayMock.mockReset();
    createGatewayMock.mockReturnValue(vi.fn((model: string) => ({ provider: 'gateway', model })));
    createOpenAICompatibleMock.mockReset();
    createOpenAICompatibleMock.mockReturnValue({
      chatModel: vi.fn((model: string) => ({ provider: 'openai-compatible', model })),
    });
    createOpenRouterMock.mockReset();
    createOpenRouterMock.mockReturnValue(
      vi.fn((model: string) => ({ provider: 'openrouter', model })),
    );
    streamTextMock.mockReset();
    streamTextMock.mockReturnValue({
      text: Promise.resolve('tool-backed answer'),
    });
  });

  it('sends tools and the agentic loop controls on the first chat request', async () => {
    const provider = createProvider();

    await provider.completeStream(createRequest());

    const call = streamTextMock.mock.calls[0]?.[0];
    expect(call).toMatchObject({
      allowSystemInMessages: true,
      toolChoice: 'required',
      stopWhen: { kind: 'step-count', rounds: 15 },
    });
    expect(Object.keys(call.tools)).toEqual(['web_search', 'crawl_site', 'open_url']);
    expect(call.messages[0]).toMatchObject({
      role: 'system',
      content: expect.stringContaining('You may call these tools directly'),
    });
    expect(call.providerOptions).toMatchObject({
      openai: {
        reasoningEffort: 'minimal',
        reasoningSummary: 'auto',
      },
    });
  });

  it('keeps runtime search tools out of memory worker scoped requests', async () => {
    const provider = createProvider();

    await provider.completeStream(createRequest({ stateScope: 'memory' }));

    const call = streamTextMock.mock.calls[0]?.[0];
    expect(call.tools).toBeUndefined();
    expect(call.toolChoice).toBe('auto');
    expect(call.messages[0].content).not.toContain('You may call these tools directly');
  });

  it('runs DeepSeek direct through the AI SDK OpenAI-compatible HTTP provider path', async () => {
    const provider = new AiSdkGatewayProvider({
      apiBaseUrl: 'https://api.deepseek.com/v1',
      apiKey: 'deepseek-key',
      maxTokens: 180,
      model: 'deepseek-chat',
      provider: 'deepseek',
      temperature: 0.7,
    });

    await provider.completeStream(createRequest({ toolChoiceMode: 'auto' }));

    const call = streamTextMock.mock.calls[0]?.[0];
    expect(call).toMatchObject({
      model: { provider: 'openai-compatible', model: 'deepseek-chat' },
      stopWhen: { kind: 'step-count', rounds: 15 },
      toolChoice: 'auto',
    });
    expect(createOpenAICompatibleMock).toHaveBeenCalledWith({
      apiKey: 'deepseek-key',
      baseURL: 'https://api.deepseek.com/v1',
      name: 'deepseek',
      supportsStructuredOutputs: true,
    });
  });

  it('passes request-scoped OpenAI BYOK through Vercel AI Gateway provider options', async () => {
    const provider = new AiSdkGatewayProvider({
      apiKey: 'gateway-key',
      byokOpenAiApiKey: 'sk-openai-byok',
      maxTokens: 180,
      model: 'openai/gpt-5-nano',
      provider: 'vercel-gateway',
      temperature: 0.7,
    });

    await provider.completeStream(createRequest({ toolChoiceMode: 'auto' }));

    const call = streamTextMock.mock.calls[0]?.[0];
    expect(createGatewayMock).toHaveBeenCalledWith({ apiKey: 'gateway-key' });
    expect(call).toMatchObject({
      model: { provider: 'gateway', model: 'openai/gpt-5-nano' },
      providerOptions: {
        gateway: {
          byok: {
            openai: [{ apiKey: 'sk-openai-byok' }],
          },
        },
        openai: {
          reasoningEffort: 'minimal',
          reasoningSummary: 'auto',
        },
      },
      stopWhen: { kind: 'step-count', rounds: 15 },
      toolChoice: 'auto',
    });
  });

  it('passes request-scoped OpenAI BYOK through OpenRouter provider API keys', async () => {
    const provider = new AiSdkGatewayProvider({
      apiKey: 'openrouter-key',
      apiBaseUrl: 'https://openrouter.ai/api/v1',
      byokOpenAiApiKey: 'sk-openai-byok',
      maxTokens: 180,
      model: 'openai/gpt-5-nano',
      provider: 'openrouter-responses',
      temperature: 0.7,
    });

    await provider.completeStream(createRequest({ toolChoiceMode: 'auto' }));

    const call = streamTextMock.mock.calls[0]?.[0];
    expect(call.providerOptions).toMatchObject({
      openai: {
        reasoningEffort: 'minimal',
        reasoningSummary: 'auto',
      },
    });
    expect(createOpenRouterMock).toHaveBeenCalledWith({
      apiKey: 'openrouter-key',
      api_keys: { openai: 'sk-openai-byok' },
      baseURL: 'https://openrouter.ai/api/v1',
    });
  });
});
