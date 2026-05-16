import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from './embeddings.js';

function createApiResponse() {
  let statusCode = 0;
  let jsonBody: unknown;

  const response = {
    get jsonBody() {
      return jsonBody;
    },
    get statusCode() {
      return statusCode;
    },
    setHeader() {},
    status(code: number) {
      statusCode = code;
      return response;
    },
    json(body: unknown) {
      jsonBody = body;
    },
  };

  return response;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('serverless AI embeddings route', () => {
  it('does not use server provider keys unless the BYOK server proxy is explicitly enabled', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-openai');
    const fetchMock = vi.fn() as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);

    const response = createApiResponse();
    await handler(
      {
        method: 'POST',
        body: {
          input: 'remember this',
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
});
