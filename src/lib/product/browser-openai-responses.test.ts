import { describe, expect, it, vi } from 'vitest';
import { requestBrowserOpenAiCompletion } from './browser-openai-responses';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

function streamResponse(events: unknown[]) {
  const body = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');
  return new Response(body, {
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

describe('requestBrowserOpenAiCompletion', () => {
  it('calls OpenAI Responses directly without putting the provider key in the body', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        id: 'resp_browser_1',
        output_text: 'hello from browser',
      }),
    );

    const result = await requestBrowserOpenAiCompletion({
      apiKey: 'test',
      fetchImpl,
      maxTokens: 123,
      messages: [
        { role: 'system', content: 'persona instructions' },
        { role: 'user', content: 'hi' },
      ],
      model: 'gpt-5-nano',
      stateKey: 'local:hikari',
    });

    expect(result.text).toBe('hello from browser');
    expect(result.meta).toMatchObject({
      previousResponseId: 'resp_browser_1',
      provider: 'browser-openai-responses',
      stateKey: 'local:hikari',
      stateMode: 'previous-response',
    });
    const firstCall = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const init = firstCall[1];
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer test',
      'Content-Type': 'application/json',
    });
    expect(String(init?.body)).not.toContain('test');
    expect(JSON.parse(String(init?.body))).toMatchObject({
      input: [{ role: 'user', content: 'hi' }],
      instructions: 'persona instructions',
      max_output_tokens: 123,
      model: 'gpt-5-nano',
      store: true,
    });
  });

  it('streams text deltas and then continues with the previous response id', async () => {
    const deltas: string[] = [];
    const bodies: Record<string, unknown>[] = [];
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      if (bodies.length === 1) {
        return streamResponse([
          { type: 'response.output_text.delta', delta: 'hel' },
          { type: 'response.output_text.delta', delta: 'lo' },
          { type: 'response.completed', response: { id: 'resp_browser_stream_1' } },
        ]);
      }
      return jsonResponse({
        id: 'resp_browser_stream_2',
        output_text: 'second',
      });
    });

    await requestBrowserOpenAiCompletion({
      apiKey: 'test',
      fetchImpl,
      maxTokens: 50,
      messages: [{ role: 'user', content: 'first' }],
      model: 'gpt-5-nano',
      onTextDelta: (delta) => deltas.push(delta),
      stateKey: 'stateful-stream-test',
    });
    const second = await requestBrowserOpenAiCompletion({
      apiKey: 'test',
      fetchImpl,
      maxTokens: 50,
      messages: [
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'hello' },
        { role: 'user', content: 'again' },
      ],
      model: 'gpt-5-nano',
      stateKey: 'stateful-stream-test',
    });

    expect(deltas).toEqual(['hel', 'lo']);
    expect(second.text).toBe('second');
    expect(bodies[0]).toMatchObject({ stream: true });
    expect(bodies[1]).toMatchObject({
      input: [{ role: 'user', content: 'again' }],
      previous_response_id: 'resp_browser_stream_1',
    });
  });

  it('does not use response state for memory-scoped requests', async () => {
    const bodies: Record<string, unknown>[] = [];
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return jsonResponse({
        id: `resp_memory_${bodies.length}`,
        output_text: 'memory',
      });
    });

    await requestBrowserOpenAiCompletion({
      apiKey: 'test',
      fetchImpl,
      maxTokens: 50,
      messages: [{ role: 'user', content: 'memory one' }],
      model: 'gpt-5-nano',
      stateKey: 'memory-test',
      stateScope: 'memory',
    });
    await requestBrowserOpenAiCompletion({
      apiKey: 'test',
      fetchImpl,
      maxTokens: 50,
      messages: [{ role: 'user', content: 'memory two' }],
      model: 'gpt-5-nano',
      stateKey: 'memory-test',
      stateScope: 'memory',
    });

    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toMatchObject({ store: false });
    expect(bodies[1]).not.toHaveProperty('previous_response_id');
  });
});
