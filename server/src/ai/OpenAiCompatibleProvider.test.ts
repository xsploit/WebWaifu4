import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenAiCompatibleProvider } from './OpenAiCompatibleProvider.js';
import type { ChatProviderRequest } from './ChatProvider.js';

function createRequest(text = 'search current stream tools'): ChatProviderRequest {
  return {
    activeChatters: 1,
    messages: [
      { role: 'system', content: 'You are WebWaifu 4.' },
      { role: 'user', content: text },
    ],
    mode: 'direct',
    sourceMessages: [],
    stateScope: 'chat',
  };
}

describe('OpenAiCompatibleProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('streams compatible chat completion deltas instead of waiting for final text', async () => {
    const calls: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        calls.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
        return new Response(
          new ReadableStream({
            start(controller) {
              const encoder = new TextEncoder();
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ choices: [{ delta: { content: 'hello ' } }] })}\n\n`,
                ),
              );
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ choices: [{ delta: { content: 'stream' } }] })}\n\n`,
                ),
              );
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              controller.close();
            },
          }),
          { headers: { 'Content-Type': 'text/event-stream' } },
        );
      }),
    );

    const provider = new OpenAiCompatibleProvider({
      apiBaseUrl: 'https://compatible.example/v1',
      apiKey: 'test-key',
      maxTokens: 120,
      model: 'compatible-model',
      temperature: 0.7,
    });
    const deltas: string[] = [];

    const result = await provider.completeStream(createRequest('stream'), {
      onTextDelta: (delta) => deltas.push(delta),
    });

    expect(calls[0]?.['stream']).toBe(true);
    expect(deltas).toEqual(['hello ', 'stream']);
    expect(result.text).toBe('hello stream');
  });

  it('runs Tavily-compatible tool calls through chat completions', async () => {
    const calls: Array<{ body: Record<string, unknown>; url: string }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const target = String(url);
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        calls.push({ body, url: target });
        if (target.includes('api.tavily.com/search')) {
          return Response.json({
            answer: 'Tool result says WebWaifu 4 tools are active.',
            query: 'web waifu tools',
            results: [{ content: 'tool result', title: 'Tool result', url: 'https://example.com' }],
          });
        }
        if (calls.filter((call) => call.url.endsWith('/chat/completions')).length === 1) {
          return Response.json({
            choices: [
              {
                message: {
                  content: '',
                  tool_calls: [
                    {
                      id: 'call_search',
                      type: 'function',
                      function: {
                        name: 'web_search',
                        arguments: JSON.stringify({ query: 'web waifu tools' }),
                      },
                    },
                  ],
                },
              },
            ],
          });
        }
        return Response.json({
          choices: [{ message: { content: 'Search says tools are active.' } }],
        });
      }),
    );

    const provider = new OpenAiCompatibleProvider({
      apiBaseUrl: 'https://compatible.example/v1',
      apiKey: 'test-key',
      maxTokens: 120,
      model: 'compatible-model',
      tavilyTools: {
        apiKey: 'tavily-key',
        crawlLimit: 3,
        maxResults: 2,
        searchDepth: 'basic',
        timeoutMs: 1000,
      },
      temperature: 0.7,
    });

    const result = await provider.complete(createRequest());
    const firstChatBody = calls.find((call) => call.url.endsWith('/chat/completions'))?.body;
    const secondChatBody = calls.filter((call) => call.url.endsWith('/chat/completions'))[1]?.body;

    expect(result.text).toBe('Search says tools are active.');
    expect(result.meta).toMatchObject({
      toolsAvailable: true,
      toolsUsed: ['web_search'],
    });
    expect(firstChatBody?.['tools']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          function: expect.objectContaining({ name: 'web_search' }),
          type: 'function',
        }),
      ]),
    );
    expect(firstChatBody?.['tool_choice']).toBe('auto');
    expect(JSON.stringify(firstChatBody?.['messages'])).toContain('Available Runtime Tools');
    expect(secondChatBody?.['messages']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'assistant', tool_calls: expect.any(Array) }),
        expect.objectContaining({ role: 'tool', tool_call_id: 'call_search' }),
      ]),
    );
  });

  it('passes required tool choice through compatible chat completions', async () => {
    const calls: Array<{ body: Record<string, unknown>; url: string }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const target = String(url);
        calls.push({
          body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
          url: target,
        });
        if (target.includes('api.tavily.com/search')) {
          return Response.json({ answer: 'ok', results: [] });
        }
        if (calls.filter((call) => call.url.endsWith('/chat/completions')).length === 1) {
          return Response.json({
            choices: [
              {
                message: {
                  content: '',
                  tool_calls: [
                    {
                      id: 'call_search',
                      type: 'function',
                      function: { name: 'web_search', arguments: '{"query":"tools"}' },
                    },
                  ],
                },
              },
            ],
          });
        }
        return Response.json({ choices: [{ message: { content: 'done' } }] });
      }),
    );

    const provider = new OpenAiCompatibleProvider({
      apiBaseUrl: 'https://compatible.example/v1',
      apiKey: 'test-key',
      maxTokens: 120,
      model: 'compatible-model',
      tavilyTools: {
        apiKey: 'tavily-key',
        maxResults: 2,
        searchDepth: 'basic',
        timeoutMs: 1000,
      },
      temperature: 0.7,
    });

    await provider.complete({ ...createRequest(), toolChoiceMode: 'required' });

    expect(calls.find((call) => call.url.endsWith('/chat/completions'))?.body['tool_choice']).toBe(
      'required',
    );
  });

  it('keeps runtime tools out of memory-scoped requests', async () => {
    const calls: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        calls.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
        return Response.json({
          choices: [{ message: { content: '{"summary":"memory"}' } }],
        });
      }),
    );

    const provider = new OpenAiCompatibleProvider({
      apiBaseUrl: 'https://compatible.example/v1',
      apiKey: 'test-key',
      maxTokens: 120,
      model: 'compatible-model',
      tavilyTools: {
        apiKey: 'tavily-key',
        maxResults: 2,
        searchDepth: 'basic',
        timeoutMs: 1000,
      },
      temperature: 0.7,
    });

    const result = await provider.complete({ ...createRequest('memory pass'), stateScope: 'memory' });

    expect(result.meta).toMatchObject({ toolsAvailable: false, toolsUsed: [] });
    expect(calls[0]).not.toHaveProperty('tools');
    expect(calls[0]).not.toHaveProperty('tool_choice');
    expect(JSON.stringify(calls[0]?.['messages'])).not.toContain('Available Runtime Tools');
  });

  it('aborts upstream compatible chat requests when the request signal aborts', async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          if (init?.signal?.aborted) {
            reject(new Error('compatible fetch aborted'));
            return;
          }
          init?.signal?.addEventListener('abort', () => reject(new Error('compatible fetch aborted')), {
            once: true,
          });
        })),
    );

    const provider = new OpenAiCompatibleProvider({
      apiBaseUrl: 'https://compatible.example/v1',
      apiKey: 'test-key',
      maxTokens: 120,
      model: 'compatible-model',
      temperature: 0.7,
    });

    const pending = provider.complete({ ...createRequest('abort compatible'), signal: controller.signal });
    controller.abort();

    await expect(pending).rejects.toThrow('compatible fetch aborted');
  });
});
