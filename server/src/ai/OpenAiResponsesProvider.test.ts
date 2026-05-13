import { describe, expect, it } from 'vitest';
import { OpenAiResponsesProvider } from './OpenAiResponsesProvider.js';
import { runTavilyToolCall } from './TavilyTools.js';
import type { ChatProviderRequest } from './ChatProvider.js';

type FetchCall = {
  url: string;
  body: Record<string, unknown>;
};

function createRequest(content = 'hello @Riko'): ChatProviderRequest {
  return {
    mode: 'direct',
    activeChatters: 1,
    messages: [
      { role: 'system', content: 'You are Riko. Keep replies short.' },
      { role: 'user', content },
    ],
    sourceMessages: [],
  };
}

function createFetcher(calls: FetchCall[]) {
  let responseIndex = 0;
  const responses = [
    {
      id: 'resp_1',
      output_text: 'first reply',
      usage: { input_tokens_details: { cached_tokens: 0 } },
    },
    {
      id: 'resp_2',
      output_text: 'second reply',
      usage: { input_tokens_details: { cached_tokens: 128 } },
    },
  ];

  return (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(input),
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {},
    });
    const body = String(input).endsWith('/conversations')
      ? { id: 'conv_test' }
      : responses[Math.min(responseIndex++, responses.length - 1)];

    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
}

function createScopedConversationFetcher(calls: FetchCall[]) {
  let conversationIndex = 0;
  let responseIndex = 0;
  const conversationIds = ['conv_subsect', 'conv_other', 'conv_extra'];

  return (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(input),
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {},
    });

    const body = String(input).endsWith('/conversations')
      ? { id: conversationIds[Math.min(conversationIndex++, conversationIds.length - 1)] }
      : {
          id: `resp_${++responseIndex}`,
          output_text: `reply ${responseIndex}`,
          usage: { input_tokens_details: { cached_tokens: responseIndex } },
        };

    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
}

function createStreamingFetcher(calls: FetchCall[]) {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(input),
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {},
    });

    const body = [
      {
        type: 'response.output_text.delta',
        delta: 'hello ',
      },
      {
        type: 'response.output_text.delta',
        delta: 'stream',
      },
      {
        type: 'response.completed',
        response: {
          id: 'resp_stream',
          usage: { input_tokens_details: { cached_tokens: 64 } },
        },
      },
    ]
      .map((event) => `data: ${JSON.stringify(event)}\n\n`)
      .join('');

    return new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }) as typeof fetch;
}

function createToolCallingFetcher(calls: FetchCall[]) {
  let responseIndex = 0;
  const responses = [
    {
      id: 'resp_tool',
      output: [
        {
          type: 'function_call',
          call_id: 'call_search',
          name: 'web_search',
          arguments: JSON.stringify({ query: 'latest vtuber AI news', max_results: 2 }),
        },
      ],
    },
    {
      id: 'resp_final',
      output_text: 'Search says AI VTuber tooling is moving fast.',
      usage: { input_tokens_details: { cached_tokens: 12 } },
    },
  ];

  return (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(input),
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {},
    });

    if (String(input).endsWith('/conversations')) {
      return new Response(JSON.stringify({ id: 'conv_tool' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify(responses[Math.min(responseIndex++, responses.length - 1)]),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }) as typeof fetch;
}

describe('OpenAiResponsesProvider', () => {
  it('passes request generation settings into Responses API payloads', async () => {
    const calls: FetchCall[] = [];
    const provider = new OpenAiResponsesProvider({
      apiBaseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-5.5',
      maxOutputTokens: 120,
      temperature: 0.7,
      stateMode: 'stateless',
      store: false,
      reasoningEffort: 'none',
      useWebSocket: false,
      fetcher: createFetcher(calls),
    });

    const response = await provider.complete({
      ...createRequest('settings check'),
      maxTokens: 340,
      temperature: 0.35,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.body).toMatchObject({
      max_output_tokens: 340,
      model: 'gpt-5.5',
      reasoning: { effort: 'none' },
      temperature: 0.35,
    });
    expect(response.meta).toMatchObject({
      maxOutputTokens: 340,
      reasoningEffort: 'none',
      temperature: 0.35,
    });
  });

  it('floors max output tokens to the Responses API minimum', async () => {
    const calls: FetchCall[] = [];
    const provider = new OpenAiResponsesProvider({
      apiBaseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-5.5',
      maxOutputTokens: 8,
      temperature: 0.7,
      stateMode: 'stateless',
      store: false,
      reasoningEffort: 'none',
      useWebSocket: false,
      fetcher: createFetcher(calls),
    });

    const response = await provider.complete({
      ...createRequest('tiny'),
      maxTokens: 4,
    });

    expect(calls[0]?.body).toMatchObject({
      max_output_tokens: 16,
    });
    expect(response.meta).toMatchObject({
      maxOutputTokens: 16,
    });
  });

  it('executes Tavily tool calls and sends function outputs back to Responses', async () => {
    const calls: FetchCall[] = [];
    const tavilyCalls: FetchCall[] = [];
    const tavilyFetcher = (async (input: string | URL | Request, init?: RequestInit) => {
      tavilyCalls.push({
        url: String(input),
        body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {},
      });
      return new Response(
        JSON.stringify({
          answer: 'AI VTuber tools are active.',
          results: [
            {
              title: 'Example',
              url: 'https://example.com/vtuber-ai',
              content: 'AI VTuber tooling update.',
              score: 0.9,
            },
          ],
          usage: { credits: 1 },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }) as typeof fetch;
    const provider = new OpenAiResponsesProvider({
      apiBaseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-5.5',
      maxOutputTokens: 300,
      temperature: 0.7,
      stateMode: 'stateless',
      store: false,
      reasoningEffort: 'none',
      useWebSocket: false,
      fetcher: createToolCallingFetcher(calls),
      tavilyTools: {
        apiKey: 'test-tavily',
        searchDepth: 'basic',
        maxResults: 5,
        timeoutMs: 10000,
        fetcher: tavilyFetcher,
      },
    });

    const response = await provider.complete(createRequest('look this up'));

    expect(response.text).toBe('Search says AI VTuber tooling is moving fast.');
    expect(response.meta).toMatchObject({
      toolsAvailable: true,
      toolsUsed: ['web_search'],
    });
    expect(calls).toHaveLength(2);
    expect(calls[0]?.body).toMatchObject({
      instructions: expect.stringContaining('Available Runtime Tools:'),
      tool_choice: 'auto',
      tools: expect.arrayContaining([expect.objectContaining({ name: 'web_search' })]),
    });
    expect(calls[0]?.body['instructions']).toEqual(
      expect.stringContaining('You may call these tools directly'),
    );
    expect(calls[1]?.body['input']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'function_call_output',
          call_id: 'call_search',
        }),
      ]),
    );
    expect(tavilyCalls).toHaveLength(1);
    expect(tavilyCalls[0]?.url).toBe('https://api.tavily.com/search');
    expect(tavilyCalls[0]?.body).toMatchObject({
      include_answer: 'basic',
      include_raw_content: false,
      max_results: 2,
      query: 'latest vtuber AI news',
      search_depth: 'basic',
    });
    expect(provider.getState()).toMatchObject({
      toolNames: ['web_search', 'crawl_site', 'open_url'],
      toolsAvailable: true,
    });
  });

  it('keeps function calls with tool outputs in conversation mode', async () => {
    const calls: FetchCall[] = [];
    const tavilyFetcher = (async () =>
      new Response(
        JSON.stringify({
          answer: 'AI VTuber tools are active.',
          results: [],
          usage: { credits: 1 },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      )) as typeof fetch;
    const provider = new OpenAiResponsesProvider({
      apiBaseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-5.5',
      maxOutputTokens: 300,
      temperature: 0.7,
      stateMode: 'conversation',
      store: false,
      reasoningEffort: 'none',
      useWebSocket: false,
      fetcher: createToolCallingFetcher(calls),
      tavilyTools: {
        apiKey: 'test-tavily',
        searchDepth: 'basic',
        maxResults: 5,
        timeoutMs: 10000,
        fetcher: tavilyFetcher,
      },
    });

    await provider.complete(createRequest('look this up'));

    expect(calls.map((call) => call.url)).toEqual([
      'https://api.openai.com/v1/conversations',
      'https://api.openai.com/v1/responses',
      'https://api.openai.com/v1/responses',
    ]);
    expect(calls[2]?.body['conversation']).toBe('conv_tool');
    expect(calls[2]?.body['input']).toEqual([
      expect.objectContaining({
        type: 'function_call',
        call_id: 'call_search',
      }),
      expect.objectContaining({
        type: 'function_call_output',
        call_id: 'call_search',
      }),
    ]);
  });

  it('builds capped Tavily crawl requests', async () => {
    const tavilyCalls: FetchCall[] = [];
    const tavilyFetcher = (async (input: string | URL | Request, init?: RequestInit) => {
      tavilyCalls.push({
        url: String(input),
        body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {},
      });
      return new Response(
        JSON.stringify({
          base_url: 'docs.example.com',
          results: [
            {
              title: 'Docs',
              url: 'https://docs.example.com/start',
              raw_content: 'Useful crawl content.',
            },
          ],
          usage: { credits: 1 },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }) as typeof fetch;

    const output = await runTavilyToolCall(
      {
        apiKey: 'test-tavily',
        searchDepth: 'basic',
        maxResults: 5,
        crawlLimit: 4,
        timeoutMs: 10000,
        fetcher: tavilyFetcher,
      },
      {
        name: 'crawl_site',
        arguments: JSON.stringify({
          url: 'https://docs.example.com',
          instructions: 'Find API reference pages.',
          max_depth: 5,
          limit: 99,
          select_paths: ['/docs/.*'],
        }),
      },
    );

    expect(tavilyCalls).toHaveLength(1);
    expect(tavilyCalls[0]?.url).toBe('https://api.tavily.com/crawl');
    expect(tavilyCalls[0]?.body).toMatchObject({
      allow_external: false,
      chunks_per_source: 3,
      extract_depth: 'basic',
      format: 'markdown',
      instructions: 'Find API reference pages.',
      limit: 4,
      max_breadth: 20,
      max_depth: 2,
      select_paths: ['/docs/.*'],
      url: 'https://docs.example.com/',
    });
    expect(JSON.parse(output)).toMatchObject({
      ok: true,
      base_url: 'docs.example.com',
    });
  });

  it('chains state with previous_response_id and prompt cache options', async () => {
    const calls: FetchCall[] = [];
    const provider = new OpenAiResponsesProvider({
      apiBaseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-5.5',
      maxOutputTokens: 120,
      temperature: 0.7,
      stateMode: 'previous-response',
      promptCacheKey: 'yourwifey-stream-test',
      promptCacheRetention: '24h',
      store: true,
      useWebSocket: false,
      fetcher: createFetcher(calls),
    });

    await provider.complete(createRequest('first'));
    await provider.complete(createRequest('second'));

    expect(calls).toHaveLength(2);
    expect(calls[0]?.body).toMatchObject({
      model: 'gpt-5.5',
      instructions: 'You are Riko. Keep replies short.',
      prompt_cache_key: 'yourwifey-stream-test',
      prompt_cache_retention: '24h',
      store: true,
    });
    expect(calls[1]?.body).toMatchObject({
      instructions: 'You are Riko. Keep replies short.',
      previous_response_id: 'resp_1',
      prompt_cache_key: 'yourwifey-stream-test',
    });
    expect(provider.getState()['previousResponseId']).toBe('resp_2');
    expect(provider.getState()['cachedTokens']).toBe(128);
  });

  it('does not chain previous_response_id when responses are not stored', async () => {
    const calls: FetchCall[] = [];
    const provider = new OpenAiResponsesProvider({
      apiBaseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-5.5',
      maxOutputTokens: 120,
      temperature: 0.7,
      stateMode: 'previous-response',
      promptCacheKey: 'yourwifey-stream-test',
      store: false,
      useWebSocket: false,
      fetcher: createFetcher(calls),
    });

    await provider.complete(createRequest('first'));
    await provider.complete(createRequest('second'));

    expect(calls).toHaveLength(2);
    expect(calls[1]?.body).toMatchObject({
      instructions: 'You are Riko. Keep replies short.',
      prompt_cache_key: 'yourwifey-stream-test',
      store: false,
    });
    expect(calls[1]?.body).not.toHaveProperty('previous_response_id');
    expect(provider.getState()['previousResponseId']).toBeNull();
  });

  it('creates and reuses a Conversations API id', async () => {
    const calls: FetchCall[] = [];
    const provider = new OpenAiResponsesProvider({
      apiBaseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-5.5',
      maxOutputTokens: 120,
      temperature: 0.7,
      stateMode: 'conversation',
      store: false,
      useWebSocket: false,
      fetcher: createFetcher(calls),
    });

    await provider.complete(createRequest());
    await provider.complete(createRequest('again'));

    expect(calls.map((call) => call.url)).toEqual([
      'https://api.openai.com/v1/conversations',
      'https://api.openai.com/v1/responses',
      'https://api.openai.com/v1/responses',
    ]);
    expect(calls[1]?.body['conversation']).toBe('conv_test');
    expect(calls[2]?.body['conversation']).toBe('conv_test');
    expect(calls[1]?.body['instructions']).toBe('You are Riko. Keep replies short.');
    expect(calls[2]?.body['instructions']).toBe('You are Riko. Keep replies short.');
    expect(provider.getState()['conversationId']).toBe('conv_test');
  });

  it('keeps conversation ids when dynamic instructions change each turn', async () => {
    const calls: FetchCall[] = [];
    const provider = new OpenAiResponsesProvider({
      apiBaseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-5.5',
      maxOutputTokens: 120,
      temperature: 0.7,
      stateMode: 'conversation',
      store: false,
      useWebSocket: false,
      fetcher: createFetcher(calls),
    });

    await provider.complete({
      ...createRequest('first'),
      messages: [
        { role: 'system', content: 'Static persona.\nTurn Metadata: one' },
        { role: 'user', content: 'first' },
      ],
    });
    await provider.complete({
      ...createRequest('second'),
      messages: [
        { role: 'system', content: 'Static persona.\nTurn Metadata: two' },
        { role: 'user', content: 'second' },
      ],
    });

    expect(calls.map((call) => call.url)).toEqual([
      'https://api.openai.com/v1/conversations',
      'https://api.openai.com/v1/responses',
      'https://api.openai.com/v1/responses',
    ]);
    expect(calls[1]?.body['conversation']).toBe('conv_test');
    expect(calls[2]?.body['conversation']).toBe('conv_test');
    expect(calls[1]?.body['instructions']).toContain('Turn Metadata: one');
    expect(calls[2]?.body['instructions']).toContain('Turn Metadata: two');
  });

  it('keeps Conversations API ids isolated per state key', async () => {
    const calls: FetchCall[] = [];
    const provider = new OpenAiResponsesProvider({
      apiBaseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-5.5',
      maxOutputTokens: 120,
      temperature: 0.7,
      stateMode: 'conversation',
      store: false,
      useWebSocket: false,
      fetcher: createScopedConversationFetcher(calls),
    });

    await provider.complete({
      ...createRequest('subsect first'),
      stateKey: 'twitch:subsect:persona:riko',
    });
    await provider.complete({
      ...createRequest('subsect second'),
      stateKey: 'twitch:subsect:persona:riko',
    });
    await provider.complete({
      ...createRequest('other room'),
      stateKey: 'twitch:other:persona:riko',
    });

    const conversationCalls = calls.filter((call) => call.url.endsWith('/conversations'));
    const responseCalls = calls.filter((call) => call.url.endsWith('/responses'));

    expect(conversationCalls).toHaveLength(2);
    expect(responseCalls.map((call) => call.body['conversation'])).toEqual([
      'conv_subsect',
      'conv_subsect',
      'conv_other',
    ]);
    expect(provider.getState()['stateKeys']).toEqual([
      'default',
      'twitch:other:persona:riko',
      'twitch:subsect:persona:riko',
    ]);
  });

  it('keeps memory refresh requests stateless even when conversation mode is enabled', async () => {
    const calls: FetchCall[] = [];
    const provider = new OpenAiResponsesProvider({
      apiBaseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-5.5',
      maxOutputTokens: 120,
      temperature: 0.7,
      stateMode: 'conversation',
      store: false,
      useWebSocket: false,
      fetcher: createScopedConversationFetcher(calls),
    });

    const memoryResponse = await provider.complete({
      ...createRequest('summarize diary'),
      disableState: true,
      stateKey: 'memory:twitch:subsect:persona:riko',
      stateScope: 'memory',
    });
    await provider.complete({
      ...createRequest('normal chat'),
      stateKey: 'twitch:subsect:persona:riko',
    });

    expect(calls.map((call) => call.url)).toEqual([
      'https://api.openai.com/v1/responses',
      'https://api.openai.com/v1/conversations',
      'https://api.openai.com/v1/responses',
    ]);
    expect(calls[0]?.body).not.toHaveProperty('conversation');
    expect(calls[0]?.body).not.toHaveProperty('previous_response_id');
    expect(calls[0]?.body).toHaveProperty('instructions');
    expect(calls[2]?.body['conversation']).toBe('conv_subsect');
    expect(memoryResponse.meta).toMatchObject({
      cachedTokens: 0,
      conversationId: null,
      previousResponseId: null,
      stateMode: 'stateless',
      stateScope: 'memory',
    });
  });

  it('streams text deltas and records final response state', async () => {
    const calls: FetchCall[] = [];
    const deltas: string[] = [];
    const provider = new OpenAiResponsesProvider({
      apiBaseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-5.5',
      maxOutputTokens: 120,
      temperature: 0.7,
      stateMode: 'previous-response',
      promptCacheKey: 'yourwifey-stream-test',
      store: true,
      useWebSocket: false,
      fetcher: createStreamingFetcher(calls),
    });

    const response = await provider.completeStream(createRequest('stream please'), {
      onTextDelta: (delta) => {
        deltas.push(delta);
      },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.body).toMatchObject({
      stream: true,
      prompt_cache_key: 'yourwifey-stream-test',
    });
    expect(deltas).toEqual(['hello ', 'stream']);
    expect(response.text).toBe('hello stream');
    expect(response.meta).toMatchObject({
      cachedTokens: 64,
      previousResponseId: 'resp_stream',
    });
  });
});
