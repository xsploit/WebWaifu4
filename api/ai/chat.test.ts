import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from './chat.js';

type FetchCall = {
  url: string;
  body: Record<string, unknown>;
};

function createStreamResponse(events: unknown[]) {
  const body = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

function createApiResponse() {
  const headers = new Map<string, string>();
  const chunks: string[] = [];
  let statusCode = 0;
  let jsonBody: unknown;
  let ended = false;

  const response = {
    chunks,
    get ended() {
      return ended;
    },
    get jsonBody() {
      return jsonBody;
    },
    get statusCode() {
      return statusCode;
    },
    headers,
    setHeader(name: string, value: string) {
      headers.set(name, value);
    },
    status(code: number) {
      statusCode = code;
      return response;
    },
    json(body: unknown) {
      jsonBody = body;
      ended = true;
    },
    write(chunk: string) {
      chunks.push(chunk);
    },
    end() {
      ended = true;
    },
  };

  return response;
}

function parseSseEvents(chunks: string[]) {
  return chunks
    .join('')
    .split(/\r?\n\r?\n/)
    .map((block) => block.trim())
    .filter((block) => block.startsWith('data:'))
    .map((block) => JSON.parse(block.slice(5).trim()) as Record<string, unknown>);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('serverless AI chat route', () => {
  it('does not use server provider keys unless the BYOK server proxy is explicitly enabled', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-openai');
    const fetchMock = vi.fn() as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);

    const response = createApiResponse();
    await handler(
      {
        method: 'POST',
        body: {
          messages: [{ role: 'user', content: 'hello' }],
        },
      },
      response,
    );

    expect(response.statusCode).toBe(200);
    expect(response.jsonBody).toMatchObject({
      ok: false,
      error: 'Server AI proxy is disabled for BYOK mode.',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses browser-vault OpenAI and Tavily keys when the server proxy env is disabled', async () => {
    vi.stubEnv('OPENAI_MODEL', 'gpt-5.5');
    vi.stubEnv('OPENAI_STATE_MODE', 'stateless');

    const openAiCalls: FetchCall[] = [];
    const tavilyCalls: FetchCall[] = [];
    let openAiResponseIndex = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};

      if (url === 'https://api.tavily.com/search') {
        tavilyCalls.push({ url, body });
        return new Response(JSON.stringify({ answer: 'fresh result', results: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      openAiCalls.push({ url, body });
      if (openAiResponseIndex++ === 0) {
        return new Response(
          JSON.stringify({
            id: 'resp_tool',
            output: [
              {
                type: 'function_call',
                call_id: 'call_search',
                name: 'web_search',
                arguments: JSON.stringify({ query: 'vtuber news', max_results: 1 }),
              },
            ],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }

      return new Response(
        JSON.stringify({
          id: 'resp_final',
          output_text: 'Tool result used.',
          usage: { input_tokens_details: { cached_tokens: 3 } },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }) as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);

    const response = createApiResponse();
    await handler(
      {
        method: 'POST',
        headers: {
          'x-yourwifey-llm-provider-key': 'browser-openai-key',
          'x-yourwifey-tavily-provider-key': 'browser-tavily-key',
        },
        body: {
          messages: [
            { role: 'system', content: 'Use tools when useful.' },
            { role: 'user', content: 'search this' },
          ],
          stateKey: 'test:browser-tool-key',
        },
      },
      response,
    );

    expect(response.statusCode).toBe(200);
    expect(response.jsonBody).toMatchObject({
      ok: true,
      text: 'Tool result used.',
      meta: {
        toolsAvailable: true,
        toolsUsed: ['web_search'],
      },
    });
    expect(openAiCalls).toHaveLength(2);
    expect(tavilyCalls).toHaveLength(1);
    expect(tavilyCalls[0]?.body).toMatchObject({ query: 'vtuber news' });
  });

  it('does not use server Tavily tools for BYOK browser-key requests without proxy auth', async () => {
    vi.stubEnv('OPENAI_MODEL', 'gpt-5.5');
    vi.stubEnv('OPENAI_STATE_MODE', 'stateless');
    vi.stubEnv('TAVILY_API_KEY', 'server-tavily-key');

    const openAiCalls: FetchCall[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
      openAiCalls.push({ url: String(input), body });
      return new Response(
        JSON.stringify({
          id: 'resp_no_tools',
          output_text: 'No server tools.',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }) as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);

    const response = createApiResponse();
    await handler(
      {
        method: 'POST',
        headers: {
          'x-yourwifey-llm-provider-key': 'browser-openai-key',
        },
        body: {
          messages: [{ role: 'user', content: 'search this' }],
          stateKey: 'test:no-server-tools',
        },
      },
      response,
    );

    expect(response.statusCode).toBe(200);
    expect(response.jsonBody).toMatchObject({
      ok: true,
      meta: {
        toolsAvailable: false,
      },
    });
    expect(openAiCalls[0]?.body).not.toHaveProperty('tools');
  });

  it('isolates server-proxy conversation state by authenticated user', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-openai');
    vi.stubEnv('OPENAI_MODEL', 'gpt-5.5');
    vi.stubEnv('OPENAI_REASONING_EFFORT', 'none');
    vi.stubEnv('OPENAI_STATE_MODE', 'conversation');
    vi.stubEnv('BYOK_SERVER_PROVIDER_PROXY_ENABLED', 'true');
    vi.stubEnv('SUPABASE_URL', 'https://project-ref.supabase.co');
    vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'supabase-publishable');

    const conversationIds = ['conv_user_1', 'conv_user_2'];
    const responseBodies: Record<string, unknown>[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const authorization = (init?.headers as Record<string, string> | undefined)?.authorization;
      if (url === 'https://project-ref.supabase.co/auth/v1/user') {
        return new Response(
          JSON.stringify({
            id: authorization?.includes('user-two') ? 'user-2' : 'user-1',
            email: 'streamer@example.com',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url === 'https://api.openai.com/v1/conversations') {
        return new Response(
          JSON.stringify({
            id: conversationIds.shift(),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      responseBodies.push(
        init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {},
      );
      return new Response(
        JSON.stringify({
          id: 'resp_final',
          output_text: 'ok',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);

    for (const token of ['user-one-token', 'user-two-token']) {
      const response = createApiResponse();
      await handler(
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token}`,
          },
          body: {
            messages: [{ role: 'user', content: 'hello' }],
            stateKey: 'shared-state',
          },
        },
        response,
      );
      expect(response.statusCode).toBe(200);
      expect(response.jsonBody).toMatchObject({ ok: true });
    }

    expect(responseBodies.map((body) => body['conversation'])).toEqual([
      'conv_user_1',
      'conv_user_2',
    ]);
  });

  it('keeps streamed tool-call arguments when call_id arrives after argument events', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-openai');
    vi.stubEnv('OPENAI_MODEL', 'gpt-5.5');
    vi.stubEnv('OPENAI_REASONING_EFFORT', 'none');
    vi.stubEnv('OPENAI_STATE_MODE', 'stateless');
    vi.stubEnv('BYOK_SERVER_PROVIDER_PROXY_ENABLED', 'true');
    vi.stubEnv('SUPABASE_URL', 'https://project-ref.supabase.co');
    vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'supabase-publishable');
    vi.stubEnv('TAVILY_API_KEY', 'test-tavily');

    const openAiCalls: FetchCall[] = [];
    const tavilyCalls: FetchCall[] = [];
    let openAiResponseIndex = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};

      if (url === 'https://project-ref.supabase.co/auth/v1/user') {
        return new Response(JSON.stringify({ id: 'user-1', email: 'subsect@example.com' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url === 'https://api.tavily.com/search') {
        tavilyCalls.push({ url, body });
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
      }

      openAiCalls.push({ url, body });
      if (openAiResponseIndex++ === 0) {
        return createStreamResponse([
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
        ]);
      }

      return createStreamResponse([
        { type: 'response.output_text.delta', delta: 'done' },
        {
          type: 'response.completed',
          response: {
            id: 'resp_final',
            usage: { input_tokens_details: { cached_tokens: 1 } },
          },
        },
      ]);
    }) as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);

    const response = createApiResponse();
    await handler(
      {
        method: 'POST',
        headers: {
          authorization: 'Bearer valid-session',
        },
        body: {
          messages: [
            { role: 'system', content: 'Use tools when useful.' },
            { role: 'user', content: 'search twice' },
          ],
          stateKey: 'test:serverless-tool-stream',
          stream: true,
        },
      },
      response,
    );

    expect(response.statusCode).toBe(200);
    expect(response.ended).toBe(true);
    expect(openAiCalls).toHaveLength(2);
    expect(openAiCalls[1]?.body['input']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ call_id: 'call_search_a', type: 'function_call' }),
        expect.objectContaining({ call_id: 'call_search_b', type: 'function_call' }),
        expect.objectContaining({ call_id: 'call_search_a', type: 'function_call_output' }),
        expect.objectContaining({ call_id: 'call_search_b', type: 'function_call_output' }),
      ]),
    );
    expect(tavilyCalls.map((call) => call.body['query']).sort()).toEqual(['alpha', 'beta']);
    expect(parseSseEvents(response.chunks)).toContainEqual(
      expect.objectContaining({
        ok: true,
        text: 'done',
        type: 'done',
      }),
    );
  });

  it('does not forward OpenRouter reasoning deltas as visible text', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-openai');
    vi.stubEnv('OPENAI_MODEL', 'openai/gpt-oss-120b');
    vi.stubEnv('OPENAI_API_BASE_URL', 'https://openrouter.ai/api/v1');
    vi.stubEnv('OPENAI_STATE_MODE', 'stateless');
    vi.stubEnv('OPENAI_REASONING_EFFORT', 'none');
    vi.stubEnv('BYOK_SERVER_PROVIDER_PROXY_ENABLED', 'true');
    vi.stubEnv('SUPABASE_URL', 'https://project-ref.supabase.co');
    vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'supabase-publishable');

    const openAiCalls: FetchCall[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
      if (url === 'https://project-ref.supabase.co/auth/v1/user') {
        return new Response(JSON.stringify({ id: 'user-1', email: 'subsect@example.com' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      openAiCalls.push({ url, body });
      return createStreamResponse([
        { type: 'response.reasoning.delta', delta: 'hidden thinking ' },
        { type: 'response.output_item.added', item: { id: 'rs_1', type: 'reasoning' } },
        { type: 'response.output_text.delta', delta: 'visible answer' },
        {
          type: 'response.completed',
          response: {
            id: 'resp_openrouter_reasoning',
            output: [
              {
                id: 'rs_1',
                type: 'reasoning',
                content: [{ type: 'reasoning_text', text: 'hidden final reasoning' }],
              },
              {
                id: 'msg_1',
                type: 'message',
                content: [{ type: 'output_text', text: 'visible answer' }],
              },
            ],
          },
        },
      ]);
    }) as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);

    const response = createApiResponse();
    await handler(
      {
        method: 'POST',
        headers: {
          authorization: 'Bearer valid-session',
        },
        body: {
          messages: [{ role: 'user', content: 'hello' }],
          stream: true,
        },
      },
      response,
    );

    const events = parseSseEvents(response.chunks);
    expect(events).toContainEqual(
      expect.objectContaining({ delta: 'visible answer', type: 'delta' }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({ ok: true, text: 'visible answer', type: 'done' }),
    );
    expect(events).not.toContainEqual(
      expect.objectContaining({ delta: expect.stringContaining('hidden') }),
    );
    expect(openAiCalls[0]?.body).toMatchObject({
      include_reasoning: false,
      reasoning: { exclude: true },
    });
  });

  it('rejects anonymous server-key proxy use when proxy mode is enabled', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-openai');
    vi.stubEnv('BYOK_SERVER_PROVIDER_PROXY_ENABLED', 'true');
    vi.stubEnv('SUPABASE_URL', 'https://project-ref.supabase.co');
    vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'supabase-publishable');
    const fetchMock = vi.fn() as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);

    const response = createApiResponse();
    await handler(
      {
        method: 'POST',
        body: {
          messages: [{ role: 'user', content: 'hello' }],
        },
      },
      response,
    );

    expect(response.statusCode).toBe(401);
    expect(response.jsonBody).toMatchObject({
      ok: false,
      error: 'Authentication required for server AI proxy.',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects client-selected premium models when spending the server OpenAI key', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-openai');
    vi.stubEnv('OPENAI_MODEL', 'gpt-5.4-nano');
    vi.stubEnv('BYOK_SERVER_PROVIDER_PROXY_ENABLED', 'true');
    vi.stubEnv('SUPABASE_URL', 'https://project-ref.supabase.co');
    vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'supabase-publishable');
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      if (String(input) === 'https://project-ref.supabase.co/auth/v1/user') {
        return new Response(JSON.stringify({ id: 'user-1', email: 'subsect@example.com' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error('OpenAI should not be called');
    }) as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);

    const response = createApiResponse();
    await handler(
      {
        method: 'POST',
        headers: {
          authorization: 'Bearer valid-session',
        },
        body: {
          messages: [{ role: 'user', content: 'hello' }],
          model: 'gpt-5_4-pro',
        },
      },
      response,
    );

    expect(response.statusCode).toBe(403);
    expect(response.jsonBody).toMatchObject({
      ok: false,
      error: expect.stringContaining('unapproved model'),
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
