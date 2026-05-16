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

  it('keeps streamed tool-call arguments when call_id arrives after argument events', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-openai');
    vi.stubEnv('OPENAI_MODEL', 'gpt-5.5');
    vi.stubEnv('OPENAI_REASONING_EFFORT', 'none');
    vi.stubEnv('OPENAI_STATE_MODE', 'stateless');
    vi.stubEnv('BYOK_SERVER_PROVIDER_PROXY_ENABLED', 'true');
    vi.stubEnv('TAVILY_API_KEY', 'test-tavily');

    const openAiCalls: FetchCall[] = [];
    const tavilyCalls: FetchCall[] = [];
    let openAiResponseIndex = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};

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
});
