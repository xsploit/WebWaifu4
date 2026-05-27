import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatProviderRequest } from './ChatProvider.js';

const streamTextMock = vi.hoisted(() => vi.fn());

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
  createGateway: vi.fn(() => vi.fn((model: string) => ({ provider: 'gateway', model }))),
}));

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => ({
    responses: vi.fn((model: string) => ({ provider: 'openai-responses', model })),
  })),
}));

vi.mock('@openrouter/ai-sdk-provider', () => ({
  createOpenRouter: vi.fn(() => vi.fn((model: string) => ({ provider: 'openrouter', model }))),
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
  });

  it('keeps runtime search tools out of memory worker scoped requests', async () => {
    const provider = createProvider();

    await provider.completeStream(createRequest({ stateScope: 'memory' }));

    const call = streamTextMock.mock.calls[0]?.[0];
    expect(call.tools).toBeUndefined();
    expect(call.toolChoice).toBe('required');
    expect(call.messages[0].content).not.toContain('You may call these tools directly');
  });
});
