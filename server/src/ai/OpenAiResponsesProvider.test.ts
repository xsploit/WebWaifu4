import { describe, expect, it } from 'vitest';
import {
  OpenAiResponsesProvider,
  createWebSocketResponseCreateMessage,
} from './OpenAiResponsesProvider.js';
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

function createStreamingLifecycleFetcher(calls: FetchCall[]) {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(input),
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {},
    });

    const body = [
      {
        type: 'response.output_item.added',
        item: { id: 'msg_1', type: 'message', role: 'assistant', content: [] },
      },
      { type: 'response.content_part.added' },
      {
        type: 'response.output_text.delta',
        delta: 'OK',
      },
      { type: 'response.output_text.done' },
      { type: 'response.content_part.done' },
      {
        type: 'response.output_item.done',
        item: {
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: '{"reply":"OK","emotion":"neutral"}' }],
        },
      },
      {
        type: 'response.completed',
        response: {
          id: 'resp_stream_lifecycle',
          output: [
            {
              id: 'msg_1',
              type: 'message',
              role: 'assistant',
              content: [{ type: 'output_text', text: 'OK' }],
            },
          ],
          usage: { input_tokens_details: { cached_tokens: 12 } },
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

function createUnsupportedTemperatureFetcher(calls: FetchCall[]) {
  let responseIndex = 0;
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    calls.push({
      url: String(input),
      body,
    });

    if ('temperature' in body) {
      return new Response(
        "Unsupported parameter: 'temperature' is not supported with this model.",
        {
          status: 400,
          headers: { 'Content-Type': 'text/plain' },
        },
      );
    }

    responseIndex += 1;
    return new Response(
      JSON.stringify({
        id: `resp_no_temp_${responseIndex}`,
        output_text: 'reply',
        usage: { input_tokens_details: { cached_tokens: responseIndex } },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }) as typeof fetch;
}

function createToolCallingFetcher(calls: FetchCall[]) {
  let responseIndex = 0;
  const responses = [
    {
      id: 'resp_tool',
      output: [
        {
          type: 'reasoning',
          id: 'rs_internal_reasoning_item',
          summary: [],
        },
        {
          type: 'function_call',
          id: 'rs_persisted_item_id',
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

function createEndlessToolCallingFetcher(calls: FetchCall[]) {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(input),
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {},
    });

    return new Response(
      JSON.stringify({
        id: `resp_loop_${calls.length}`,
        output: [
          {
            type: 'function_call',
            call_id: `call_search_${calls.length}`,
            name: 'web_search',
            arguments: JSON.stringify({ query: `loop ${calls.length}`, max_results: 1 }),
          },
        ],
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }) as typeof fetch;
}

function createStreamingToolCallingFetcher(calls: FetchCall[]) {
  let responseIndex = 0;

  return (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(input),
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {},
    });

    if (String(input).endsWith('/conversations')) {
      return new Response(JSON.stringify({ id: 'conv_tool_stream' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (responseIndex++ === 0) {
      const body = [
        {
          type: 'response.output_item.added',
          output_index: 3,
          item: {
            type: 'function_call',
            call_id: 'call_search_a',
            name: 'web_search',
            arguments: '',
          },
        },
        {
          type: 'response.output_item.added',
          output_index: 1,
          item: {
            type: 'function_call',
            name: 'web_search',
            arguments: '',
          },
        },
        {
          type: 'response.function_call_arguments.delta',
          output_index: 3,
          delta: '{"query":"alpha',
        },
        {
          type: 'response.function_call_arguments.done',
          output_index: 1,
          arguments: JSON.stringify({ query: 'beta', max_results: 1 }),
        },
        {
          type: 'response.output_item.done',
          output_index: 1,
          item: {
            type: 'function_call',
            call_id: 'call_search_b',
            name: 'web_search',
          },
        },
        {
          type: 'response.function_call_arguments.done',
          output_index: 3,
          arguments: JSON.stringify({ query: 'alpha', max_results: 1 }),
        },
        {
          type: 'response.completed',
          response: { id: 'resp_stream_tool' },
        },
      ]
        .map((event) => `data: ${JSON.stringify(event)}\n\n`)
        .join('');

      return new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      });
    }

    return new Response(
      [
        `data: ${JSON.stringify({ type: 'response.output_text.delta', delta: 'done' })}\n\n`,
        `data: ${JSON.stringify({
          type: 'response.completed',
          response: {
            id: 'resp_final',
            usage: { input_tokens_details: { cached_tokens: 1 } },
          },
        })}\n\n`,
      ].join(''),
      {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      },
    );
  }) as typeof fetch;
}

describe('OpenAiResponsesProvider', () => {
  it('reports websocket transport as persistent when idle', () => {
    const provider = new OpenAiResponsesProvider({
      apiBaseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-4.1-mini',
      maxOutputTokens: 120,
      temperature: 0.7,
      stateMode: 'conversation',
      store: true,
      reasoningEffort: 'none',
      useWebSocket: true,
      webSocketUrl: 'wss://api.openai.com/v1/responses',
      fetcher: createFetcher([]),
    });

    expect(provider.getState()).toMatchObject({
      provider: 'openai-responses-ws',
      requestedTransport: 'server-default',
      transport: 'websocket',
      websocketConfigured: true,
      websocketConnected: false,
      websocketLifecycle: 'persistent',
      websocketStatus: 'idle',
    });
  });

  it('reports requested transport overrides in health state', () => {
    const provider = new OpenAiResponsesProvider({
      apiBaseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-4.1-mini',
      maxOutputTokens: 120,
      temperature: 0.7,
      stateMode: 'conversation',
      store: true,
      reasoningEffort: 'none',
      useWebSocket: false,
      fetcher: createFetcher([]),
    });

    expect(provider.getState('local:persona:hikari', { transportMode: 'websocket' })).toMatchObject(
      {
        activeStateKey: 'local:persona:hikari',
        provider: 'openai-responses-ws',
        transport: 'websocket',
        websocketConfigured: true,
        websocketLifecycle: 'persistent',
      },
    );
  });

  it('passes request generation settings into Responses API payloads', async () => {
    const calls: FetchCall[] = [];
    const provider = new OpenAiResponsesProvider({
      apiBaseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-4.1-mini',
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
      model: 'gpt-4.1-mini',
      temperature: 0.35,
    });
    expect(calls[0]?.body).not.toHaveProperty('reasoning');
    expect(response.meta).toMatchObject({
      maxOutputTokens: 340,
      reasoningEffort: null,
      temperature: 0.35,
    });
  });

  it('retries without temperature when a model rejects it and remembers the capability', async () => {
    const calls: FetchCall[] = [];
    const provider = new OpenAiResponsesProvider({
      apiBaseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-4.1-mini',
      maxOutputTokens: 120,
      temperature: 0.7,
      stateMode: 'stateless',
      store: false,
      reasoningEffort: 'none',
      useWebSocket: false,
      fetcher: createUnsupportedTemperatureFetcher(calls),
    });

    await provider.complete({
      ...createRequest('first'),
      temperature: 0.35,
    });
    await provider.complete({
      ...createRequest('second'),
      temperature: 0.35,
    });

    expect(calls).toHaveLength(3);
    expect(calls[0]?.body).toHaveProperty('temperature', 0.35);
    expect(calls[1]?.body).not.toHaveProperty('temperature');
    expect(calls[2]?.body).not.toHaveProperty('temperature');
  });

  it('floors max output tokens to the Responses API minimum', async () => {
    const calls: FetchCall[] = [];
    const provider = new OpenAiResponsesProvider({
      apiBaseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-4.1-mini',
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

  it('extracts nested Responses output text shapes', async () => {
    const calls: FetchCall[] = [];
    const provider = new OpenAiResponsesProvider({
      apiBaseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-4.1-mini',
      maxOutputTokens: 120,
      temperature: 0.7,
      stateMode: 'stateless',
      store: false,
      reasoningEffort: 'none',
      useWebSocket: false,
      fetcher: (async (input: string | URL | Request, init?: RequestInit) => {
        calls.push({
          url: String(input),
          body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {},
        });
        return new Response(
          JSON.stringify({
            id: 'resp_nested_text',
            output: [
              {
                type: 'message',
                content: [{ type: 'output_text', text: { value: 'nested reply' } }],
              },
            ],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }) as typeof fetch,
    });

    await expect(provider.complete(createRequest('nested text'))).resolves.toMatchObject({
      text: 'nested reply',
    });
  });

  it('ignores reasoning and thinking output when extracting final text', async () => {
    const calls: FetchCall[] = [];
    const provider = new OpenAiResponsesProvider({
      apiBaseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'test-key',
      model: 'openai/gpt-oss-120b',
      maxOutputTokens: 120,
      temperature: 0.7,
      stateMode: 'stateless',
      store: false,
      reasoningEffort: 'none',
      useWebSocket: false,
      fetcher: (async (input: string | URL | Request, init?: RequestInit) => {
        calls.push({
          url: String(input),
          body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {},
        });
        return new Response(
          JSON.stringify({
            id: 'resp_openrouter_reasoning',
            output: [
              {
                id: 'rs_1',
                type: 'reasoning',
                content: [{ type: 'reasoning_text', text: 'hidden chain of thought' }],
              },
              {
                id: 'msg_1',
                type: 'message',
                content: [{ type: 'output_text', text: { value: 'visible reply' } }],
              },
            ],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }) as typeof fetch,
    });

    await expect(provider.complete(createRequest('hello'))).resolves.toMatchObject({
      text: 'visible reply',
    });
    expect(calls[0]?.body).toMatchObject({
      reasoning: { effort: 'minimal' },
    });
    expect(calls[0]?.body).not.toHaveProperty('include_reasoning');
  });

  it('reports incomplete Responses payloads instead of a generic empty response', async () => {
    const provider = new OpenAiResponsesProvider({
      apiBaseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-4.1-mini',
      maxOutputTokens: 120,
      temperature: 0.7,
      stateMode: 'stateless',
      store: false,
      reasoningEffort: 'none',
      useWebSocket: false,
      fetcher: (async () =>
        new Response(
          JSON.stringify({
            id: 'resp_incomplete',
            status: 'incomplete',
            incomplete_details: { reason: 'max_output_tokens' },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        )) as typeof fetch,
    });

    await expect(provider.complete(createRequest('tiny budget'))).rejects.toThrow(
      'max_output_tokens',
    );
  });

  it('passes json_schema structured output into Responses text.format', async () => {
    const calls: FetchCall[] = [];
    const provider = new OpenAiResponsesProvider({
      apiBaseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-4.1-mini',
      maxOutputTokens: 120,
      temperature: 0.7,
      stateMode: 'stateless',
      store: false,
      reasoningEffort: 'none',
      useWebSocket: false,
      fetcher: createFetcher(calls),
    });

    await provider.complete({
      ...createRequest('structured worker'),
      responseFormat: {
        name: 'grillo_worker_loop',
        schema: {
          properties: {
            done: { type: 'boolean' },
          },
          type: 'object',
        },
        strict: false,
        type: 'json_schema',
      },
    });

    expect(calls[0]?.body).toMatchObject({
      text: {
        format: {
          name: 'grillo_worker_loop',
          schema: {
            properties: {
              done: { type: 'boolean' },
            },
            type: 'object',
          },
          strict: false,
          type: 'json_schema',
        },
      },
    });
  });

  it('keeps WebSocket response.create payload fields top-level for the Responses socket endpoint', () => {
    const payload = {
      model: 'gpt-5-nano',
      text: { format: { name: 'reply_metadata', type: 'json_schema' } },
      tool_choice: 'auto',
      tools: [{ name: 'web_search', type: 'function' }],
    };

    expect(createWebSocketResponseCreateMessage(payload)).toEqual({
      ...payload,
      type: 'response.create',
    });
  });

  it('keeps OpenRouter Responses structured output stateless even if configured otherwise', async () => {
    const calls: FetchCall[] = [];
    const provider = new OpenAiResponsesProvider({
      apiBaseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'test-key',
      model: 'anthropic/claude-3.5-haiku',
      maxOutputTokens: 120,
      temperature: 0.7,
      stateMode: 'conversation',
      promptCacheKey: 'yourwifey-stream',
      promptCacheRetention: '24h',
      store: true,
      useWebSocket: true,
      fetcher: createFetcher(calls),
      providerName: 'openrouter-responses',
    });

    const response = await provider.complete({
      ...createRequest('structured openrouter worker'),
      openAiStateMode: 'conversation',
      responseFormat: {
        name: 'reply_metadata',
        schema: {
          properties: {
            emotion: { type: 'string' },
            text: { type: 'string' },
          },
          required: ['text'],
          type: 'object',
        },
        strict: true,
        type: 'json_schema',
      },
      stateKey: 'twitch:subsect:persona:hikari',
      transportMode: 'websocket',
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://openrouter.ai/api/v1/responses');
    expect(calls[0]?.body).toMatchObject({
      cache_control: { ttl: '1h', type: 'ephemeral' },
      prompt_cache_key: 'yourwifey-stream',
      reasoning: { effort: 'minimal' },
      text: {
        format: {
          name: 'reply_metadata',
          strict: true,
          type: 'json_schema',
        },
      },
    });
    expect(calls[0]?.body).not.toHaveProperty('include_reasoning');
    expect(calls[0]?.body).not.toHaveProperty('conversation');
    expect(calls[0]?.body).not.toHaveProperty('prompt_cache_retention');
    expect(calls[0]?.body).not.toHaveProperty('previous_response_id');
    expect(response.meta).toMatchObject({
      provider: 'openrouter-responses',
      stateMode: 'stateless',
      transport: 'http-stream',
      websocketConfigured: false,
    });
  });

  it('keeps OpenRouter tools, POML instructions, structured output, and cache hints together', async () => {
    const calls: FetchCall[] = [];
    const tavilyCalls: FetchCall[] = [];
    const tavilyFetcher = (async (input: string | URL | Request, init?: RequestInit) => {
      tavilyCalls.push({
        url: String(input),
        body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {},
      });
      return new Response(
        JSON.stringify({
          answer: 'OpenRouter tool path is active.',
          results: [{ content: 'OpenRouter can use the same tool loop.', title: 'Tool result' }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as typeof fetch;
    const provider = new OpenAiResponsesProvider({
      apiBaseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'test-key',
      model: 'anthropic/claude-3.5-haiku',
      maxOutputTokens: 120,
      temperature: 0.7,
      stateMode: 'conversation',
      promptCacheKey: 'yourwifey-stream',
      promptCacheRetention: '24h',
      store: true,
      useWebSocket: true,
      fetcher: createToolCallingFetcher(calls),
      providerName: 'openrouter-responses',
      tavilyTools: {
        apiKey: 'test-tavily',
        searchDepth: 'basic',
        maxResults: 5,
        timeoutMs: 10000,
        fetcher: tavilyFetcher,
      },
    });

    const response = await provider.complete({
      ...createRequest('search current AI stream tools'),
      responseFormat: {
        name: 'reply_metadata',
        schema: {
          properties: {
            emotion: { type: 'string' },
            text: { type: 'string' },
          },
          required: ['text'],
          type: 'object',
        },
        strict: true,
        type: 'json_schema',
      },
      stateKey: 'twitch:subsect:persona:hikari',
      transportMode: 'websocket',
    });

    expect(response.meta).toMatchObject({
      provider: 'openrouter-responses',
      stateMode: 'stateless',
      toolsUsed: ['web_search'],
      transport: 'http-stream',
    });
    expect(calls).toHaveLength(2);
    expect(calls[0]?.url).toBe('https://openrouter.ai/api/v1/responses');
    expect(calls[0]?.body).toMatchObject({
      cache_control: { ttl: '1h', type: 'ephemeral' },
      instructions: expect.stringContaining('You may call these tools directly'),
      prompt_cache_key: 'yourwifey-stream',
      reasoning: { effort: 'minimal' },
      tool_choice: 'auto',
      tools: expect.arrayContaining([expect.objectContaining({ name: 'web_search' })]),
      text: { format: { name: 'reply_metadata', strict: true, type: 'json_schema' } },
    });
    expect(calls[0]?.body).not.toHaveProperty('include_reasoning');
    expect(calls[0]?.body).not.toHaveProperty('conversation');
    expect(calls[0]?.body).not.toHaveProperty('previous_response_id');
    expect(calls[0]?.body).not.toHaveProperty('prompt_cache_retention');
    expect(calls[1]?.body['input']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ call_id: 'call_search', type: 'function_call_output' }),
      ]),
    );
    expect(tavilyCalls).toHaveLength(1);
  });

  it('passes user image input into Responses messages', async () => {
    const calls: FetchCall[] = [];
    const provider = new OpenAiResponsesProvider({
      apiBaseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-5.4',
      maxOutputTokens: 120,
      temperature: 0.7,
      stateMode: 'stateless',
      store: false,
      reasoningEffort: 'none',
      useWebSocket: false,
      fetcher: createFetcher(calls),
    });

    await provider.complete({
      ...createRequest('what is on stream?'),
      messages: [
        { role: 'system', content: 'You are Hikari.' },
        {
          role: 'user',
          content: 'what is on stream?',
          images: [{ detail: 'low', imageUrl: 'data:image/jpeg;base64,abc123' }],
        },
      ],
    });

    expect(calls[0]?.body.input).toEqual([
      {
        content: [
          { text: 'what is on stream?', type: 'input_text' },
          {
            detail: 'low',
            image_url: 'data:image/jpeg;base64,abc123',
            type: 'input_image',
          },
        ],
        role: 'user',
        type: 'message',
      },
    ]);
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
      model: 'gpt-4.1-mini',
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
    expect(JSON.stringify(calls[1]?.body['input'])).not.toContain('rs_persisted_item_id');
    expect(JSON.stringify(calls[1]?.body['input'])).not.toContain('rs_internal_reasoning_item');
    expect(JSON.stringify(calls[1]?.body['input'])).not.toContain('"type":"reasoning"');
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
      model: 'gpt-4.1-mini',
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

  it('fails clearly when an agentic tool loop never reaches a final answer', async () => {
    const calls: FetchCall[] = [];
    const provider = new OpenAiResponsesProvider({
      apiBaseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-4.1-mini',
      maxOutputTokens: 300,
      temperature: 0.7,
      stateMode: 'stateless',
      store: false,
      reasoningEffort: 'none',
      useWebSocket: false,
      fetcher: createEndlessToolCallingFetcher(calls),
      tavilyTools: {
        apiKey: 'test-tavily',
        searchDepth: 'basic',
        maxResults: 5,
        timeoutMs: 10000,
        fetcher: (async () =>
          new Response(JSON.stringify({ answer: 'loop', results: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })) as typeof fetch,
      },
    });

    await expect(provider.complete(createRequest('keep searching forever'))).rejects.toThrow(
      'AI tool loop exceeded 5 rounds.',
    );
    expect(calls).toHaveLength(6);
  });

  it('maps streamed function-call argument events by stable call id', async () => {
    const calls: FetchCall[] = [];
    const tavilyCalls: FetchCall[] = [];
    const tavilyFetcher = (async (input: string | URL | Request, init?: RequestInit) => {
      tavilyCalls.push({
        url: String(input),
        body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {},
      });
      return new Response(
        JSON.stringify({
          answer: 'ok',
          results: [],
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
      model: 'gpt-4.1-mini',
      maxOutputTokens: 300,
      temperature: 0.7,
      stateMode: 'stateless',
      store: false,
      reasoningEffort: 'none',
      useWebSocket: false,
      fetcher: createStreamingToolCallingFetcher(calls),
      tavilyTools: {
        apiKey: 'test-tavily',
        searchDepth: 'basic',
        maxResults: 5,
        timeoutMs: 10000,
        fetcher: tavilyFetcher,
      },
    });

    const response = await provider.completeStream(createRequest('stream tools'));

    expect(response.text).toBe('done');
    expect(calls).toHaveLength(2);
    expect(calls[1]?.body['input']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ call_id: 'call_search_a', type: 'function_call' }),
        expect.objectContaining({ call_id: 'call_search_b', type: 'function_call' }),
        expect.objectContaining({ call_id: 'call_search_a', type: 'function_call_output' }),
        expect.objectContaining({ call_id: 'call_search_b', type: 'function_call_output' }),
      ]),
    );
    expect(tavilyCalls.map((call) => call.body['query']).sort()).toEqual(['alpha', 'beta']);
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

  it('keeps oversized Tavily tool output valid JSON after truncation', async () => {
    const output = await runTavilyToolCall(
      {
        apiKey: 'test-tavily',
        searchDepth: 'basic',
        maxResults: 5,
        timeoutMs: 10000,
        fetcher: (async () =>
          new Response(
            JSON.stringify({
              answer: 'a'.repeat(12000),
              results: [
                {
                  title: 'Huge',
                  url: 'https://example.com/huge',
                  content: 'b'.repeat(12000),
                },
              ],
              usage: { credits: 1 },
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          )) as typeof fetch,
      },
      {
        name: 'web_search',
        arguments: JSON.stringify({
          query: 'huge output',
        }),
      },
    );

    const parsed = JSON.parse(output) as { truncated?: boolean };
    expect(output.length).toBeLessThanOrEqual(8000);
    expect(parsed.truncated).toBe(true);
  });

  it('chains state with previous_response_id and prompt cache options', async () => {
    const calls: FetchCall[] = [];
    const provider = new OpenAiResponsesProvider({
      apiBaseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-4.1-mini',
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
      model: 'gpt-4.1-mini',
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
      model: 'gpt-4.1-mini',
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
      model: 'gpt-4.1-mini',
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

  it('seeds a conversation once and then sends only the newest input turn', async () => {
    const calls: FetchCall[] = [];
    const provider = new OpenAiResponsesProvider({
      apiBaseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-4.1-mini',
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
        { role: 'system', content: 'Persona.' },
        { role: 'user', content: 'first user' },
        { role: 'assistant', content: 'first assistant' },
        { role: 'user', content: 'second user' },
      ],
    });
    await provider.complete({
      ...createRequest('next'),
      messages: [
        { role: 'system', content: 'Persona updated.' },
        { role: 'user', content: 'first user' },
        { role: 'assistant', content: 'first assistant' },
        { role: 'user', content: 'newest user' },
      ],
    });

    expect(calls[1]?.body['input']).toEqual([
      {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: 'first user' }],
      },
      {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'first assistant' }],
      },
      {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: 'second user' }],
      },
    ]);
    expect(calls[2]?.body['input']).toEqual([
      {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: 'newest user' }],
      },
    ]);
    expect(calls[2]?.body['instructions']).toBe('Persona updated.');
  });

  it('keeps conversation ids when dynamic instructions change each turn', async () => {
    const calls: FetchCall[] = [];
    const provider = new OpenAiResponsesProvider({
      apiBaseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-4.1-mini',
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
      model: 'gpt-4.1-mini',
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
    expect(provider.getState('twitch:subsect:persona:riko')).toMatchObject({
      activeState: {
        conversationId: 'conv_subsect',
        stateKey: 'twitch:subsect:persona:riko',
      },
      activeStateKey: 'twitch:subsect:persona:riko',
      conversationId: 'conv_subsect',
    });
    expect(provider.getState('twitch:other:persona:riko')).toMatchObject({
      activeState: {
        conversationId: 'conv_other',
        stateKey: 'twitch:other:persona:riko',
      },
      activeStateKey: 'twitch:other:persona:riko',
      conversationId: 'conv_other',
    });
  });

  it('keeps conversation state when switching models', async () => {
    const calls: FetchCall[] = [];
    const provider = new OpenAiResponsesProvider({
      apiBaseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-4.1-mini',
      maxOutputTokens: 120,
      temperature: 0.7,
      stateMode: 'conversation',
      store: false,
      useWebSocket: false,
      fetcher: createFetcher(calls),
    });

    await provider.complete(createRequest('first'));
    provider.setModel('gpt-5.4');
    await provider.complete(createRequest('after model switch'));

    expect(calls.map((call) => call.url)).toEqual([
      'https://api.openai.com/v1/conversations',
      'https://api.openai.com/v1/responses',
      'https://api.openai.com/v1/responses',
    ]);
    expect(calls[2]?.body).toMatchObject({
      conversation: 'conv_test',
      model: 'gpt-5.4',
    });
  });

  it('does not reuse previous_response_id across model switches', async () => {
    const calls: FetchCall[] = [];
    const provider = new OpenAiResponsesProvider({
      apiBaseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-4.1-mini',
      maxOutputTokens: 120,
      temperature: 0.7,
      stateMode: 'previous-response',
      store: true,
      useWebSocket: false,
      fetcher: createFetcher(calls),
    });

    await provider.complete(createRequest('first'));
    provider.setModel('gpt-5.4');
    await provider.complete(createRequest('after model switch'));

    expect(calls[1]?.body).toMatchObject({
      model: 'gpt-5.4',
    });
    expect(calls[1]?.body).not.toHaveProperty('previous_response_id');
  });

  it('keeps memory refresh requests stateless even when conversation mode is enabled', async () => {
    const calls: FetchCall[] = [];
    const provider = new OpenAiResponsesProvider({
      apiBaseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-4.1-mini',
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
      responseFormat: {
        name: 'grillo_worker_loop',
        schema: {
          properties: {
            done: { type: 'boolean' },
            relationship: { type: 'object' },
          },
          type: 'object',
        },
        strict: false,
        type: 'json_schema',
      },
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
    expect(calls[0]?.body).toMatchObject({
      store: false,
      text: {
        format: {
          name: 'grillo_worker_loop',
          strict: false,
          type: 'json_schema',
        },
      },
    });
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

  it('keeps Tavily runtime tools out of memory worker requests', async () => {
    const calls: FetchCall[] = [];
    const provider = new OpenAiResponsesProvider({
      apiBaseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-4.1-mini',
      maxOutputTokens: 120,
      temperature: 0.7,
      stateMode: 'conversation',
      store: false,
      useWebSocket: false,
      fetcher: createFetcher(calls),
      tavilyTools: {
        apiKey: 'test-tavily',
        searchDepth: 'basic',
        maxResults: 5,
        timeoutMs: 10000,
        fetcher: (async () => new Response('{}')) as typeof fetch,
      },
    });

    const response = await provider.complete({
      ...createRequest('summarize memory only'),
      disableState: true,
      responseFormat: {
        name: 'grillo_worker_loop',
        schema: {
          properties: {
            done: { type: 'boolean' },
            relationship: { type: 'object' },
          },
          type: 'object',
        },
        strict: false,
        type: 'json_schema',
      },
      stateKey: 'memory:twitch:subsect:persona:riko',
      stateScope: 'memory',
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.body).not.toHaveProperty('tools');
    expect(calls[0]?.body).not.toHaveProperty('tool_choice');
    expect(String(calls[0]?.body['instructions'] ?? '')).not.toContain('Available Runtime Tools');
    expect(response.meta).toMatchObject({
      stateMode: 'stateless',
      stateScope: 'memory',
      toolNames: [],
      toolsAvailable: false,
    });
  });

  it('streams text deltas and records final response state', async () => {
    const calls: FetchCall[] = [];
    const deltas: string[] = [];
    const provider = new OpenAiResponsesProvider({
      apiBaseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-4.1-mini',
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

  it('drops reasoning stream deltas from OpenRouter-compatible streams', async () => {
    const calls: FetchCall[] = [];
    const deltas: string[] = [];
    const provider = new OpenAiResponsesProvider({
      apiBaseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'test-key',
      model: 'openai/gpt-oss-120b',
      maxOutputTokens: 120,
      temperature: 0.7,
      stateMode: 'stateless',
      store: false,
      useWebSocket: false,
      fetcher: (async (input: string | URL | Request, init?: RequestInit) => {
        calls.push({
          url: String(input),
          body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {},
        });
        return new Response(
          [
            { type: 'response.reasoning.delta', delta: 'hidden ' },
            { type: 'response.output_item.added', item: { id: 'rs_1', type: 'reasoning' } },
            { type: 'response.output_text.delta', delta: 'visible' },
            {
              type: 'response.completed',
              response: {
                id: 'resp_openrouter_stream',
                output: [
                  {
                    id: 'rs_1',
                    type: 'reasoning',
                    content: [{ type: 'reasoning_text', text: 'hidden final' }],
                  },
                  {
                    id: 'msg_1',
                    type: 'message',
                    content: [{ type: 'output_text', text: 'visible' }],
                  },
                ],
              },
            },
          ]
            .map((event) => `data: ${JSON.stringify(event)}\n\n`)
            .join(''),
          {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' },
          },
        );
      }) as typeof fetch,
    });

    const response = await provider.completeStream(createRequest('stream please'), {
      onTextDelta: (delta) => {
        deltas.push(delta);
      },
    });

    expect(deltas).toEqual(['visible']);
    expect(response.text).toBe('visible');
    expect(calls[0]?.body).toMatchObject({
      reasoning: { effort: 'minimal' },
    });
    expect(calls[0]?.body).not.toHaveProperty('include_reasoning');
  });

  it('does not treat output item lifecycle events as terminal stream events', async () => {
    const calls: FetchCall[] = [];
    const deltas: string[] = [];
    const provider = new OpenAiResponsesProvider({
      apiBaseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-4.1-mini',
      maxOutputTokens: 120,
      temperature: 0.7,
      stateMode: 'previous-response',
      promptCacheKey: 'yourwifey-stream-test',
      store: true,
      useWebSocket: false,
      fetcher: createStreamingLifecycleFetcher(calls),
    });

    const response = await provider.completeStream(createRequest('stream lifecycle'), {
      onTextDelta: (delta) => {
        deltas.push(delta);
      },
    });

    expect(deltas).toEqual(['OK']);
    expect(response.text).toBe('OK');
    expect(response.meta).toMatchObject({
      cachedTokens: 12,
      previousResponseId: 'resp_stream_lifecycle',
    });
  });

  it('aborts upstream HTTP requests when the request signal aborts', async () => {
    const controller = new AbortController();
    const provider = new OpenAiResponsesProvider({
      apiBaseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-4.1-mini',
      maxOutputTokens: 120,
      temperature: 0.7,
      stateMode: 'stateless',
      store: false,
      useWebSocket: false,
      fetcher: (async (_input: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          if (init?.signal?.aborted) {
            reject(new Error('fetch aborted by signal'));
            return;
          }
          init?.signal?.addEventListener(
            'abort',
            () => reject(new Error('fetch aborted by signal')),
            { once: true },
          );
        })) as typeof fetch,
    });

    const pending = provider.complete({ ...createRequest('abort me'), signal: controller.signal });
    controller.abort();

    await expect(pending).rejects.toThrow('fetch aborted by signal');
  });
});
