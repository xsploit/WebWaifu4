import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatProviderRequest } from './ChatProvider.js';

const streamTextMock = vi.hoisted(() => vi.fn());
const createGatewayMock = vi.hoisted(() => vi.fn());
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
    apiBaseUrl: 'https://openrouter.ai/api/v1',
    maxTokens: 180,
    model: 'openai/gpt-5-nano',
    provider: 'openrouter-responses',
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

function createProviderForLane(provider: 'openrouter-responses' | 'vercel-gateway') {
  return new AiSdkGatewayProvider({
    apiKey: provider === 'vercel-gateway' ? 'gateway-key' : 'openrouter-key',
    apiBaseUrl: 'https://openrouter.ai/api/v1',
    maxTokens: 180,
    model:
      provider === 'vercel-gateway'
        ? 'anthropic/claude-3-5-haiku'
        : 'google/gemini-2.5-flash',
    provider,
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

  it.each(['vercel-gateway', 'openrouter-responses'] as const)(
    'uses the same structured memory-lane shape for %s',
    async (providerName) => {
      streamTextMock.mockReturnValueOnce({
        output: Promise.resolve({
          candidate: null,
          diary: null,
          done: true,
          memory: null,
          notes: 'no durable write needed',
          relationship: null,
          toolCalls: [],
        }),
      });
      const provider = createProviderForLane(providerName);

      const response = await provider.completeStream(
        createRequest({
          maxToolRounds: 22,
          responseFormat: {
            name: 'grillo_worker_response',
            schema: {
              additionalProperties: false,
              properties: {
                done: { type: 'boolean' },
                toolCalls: { items: {}, type: 'array' },
              },
              required: ['done', 'toolCalls'],
              type: 'object',
            },
            type: 'json_schema',
          },
          stateScope: 'memory',
          toolChoiceMode: 'required',
        }),
      );

      const call = streamTextMock.mock.calls[0]?.[0];
      expect(call).toMatchObject({
        allowSystemInMessages: true,
        output: {
          kind: 'object-output',
          value: {
            name: 'grillo_worker_response',
            schema: {
              kind: 'json-schema',
              schema: expect.objectContaining({ type: 'object' }),
            },
          },
        },
        stopWhen: { kind: 'step-count', rounds: 22 },
        toolChoice: 'auto',
      });
      expect(call.tools).toBeUndefined();
      expect(call.messages[0].content).not.toContain('You may call these tools directly');
      expect(response.text).toContain('"done":true');
      expect(response.meta).toMatchObject({
        provider: providerName,
        toolsAvailable: false,
        toolNames: [],
        transport: 'http-stream',
      });
    },
  );
});
