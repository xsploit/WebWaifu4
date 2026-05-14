import { renderYourWifeyPomlResponse } from '../../../server/src/ai/PomlRenderer.js';

type ApiRequest = {
  method?: string;
  body?: unknown;
};

type ApiResponse = {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
};

export default async function handler(request: ApiRequest, response: ApiResponse) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'content-type');

  if (request.method === 'OPTIONS') {
    response.status(204).json({});
    return;
  }

  if (request.method !== 'POST') {
    response.status(405).json({ ok: false, error: 'POST required.' });
    return;
  }

  try {
    const body =
      typeof request.body === 'string'
        ? (JSON.parse(request.body || '{}') as { variables?: unknown })
        : ((request.body ?? {}) as { variables?: unknown });
    response.status(200).json(await renderYourWifeyPomlResponse(body.variables));
  } catch (error) {
    response.status(200).json({
      ok: false,
      error: error instanceof Error ? error.message : 'POML render failed.',
    });
  }
}
