type ApiRequest = {
  method?: string;
  body?: unknown;
};

type ApiResponse = {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
};

type OpenAiEmbeddingPayload = {
  data?: Array<{
    embedding?: number[];
  }>;
};

function getOpenAiHeaders(apiKey: string) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
  const safetyIdentifier = process.env['OPENAI_SAFETY_IDENTIFIER']?.trim();
  if (safetyIdentifier) {
    headers['OpenAI-Safety-Identifier'] = safetyIdentifier;
  }
  return headers;
}

function normalizeInput(value: unknown) {
  return typeof value === 'string' ? value.trim().slice(0, 4000) : '';
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'content-type');

  if (request.method === 'OPTIONS') {
    response.status(204).json({});
    return;
  }

  if (request.method !== 'POST') {
    response.status(200).json({ ok: false, error: 'POST required.' });
    return;
  }

  const apiKey = process.env['OPENAI_API_KEY'] || process.env['AI_API_KEY'];
  if (!apiKey) {
    response.status(200).json({ ok: false, error: 'OPENAI_API_KEY is not configured.' });
    return;
  }

  const body = (request.body ?? {}) as { input?: unknown; model?: unknown };
  const input = normalizeInput(body.input);
  if (!input) {
    response.status(200).json({ ok: false, error: 'input is required.' });
    return;
  }

  const apiBaseUrl = (process.env['OPENAI_API_BASE_URL'] || 'https://api.openai.com/v1').replace(
    /\/+$/,
    '',
  );
  const model =
    typeof body.model === 'string' && body.model.trim()
      ? body.model.trim()
      : process.env['OPENAI_EMBEDDING_MODEL'] || 'text-embedding-3-small';

  const openAiResponse = await fetch(`${apiBaseUrl}/embeddings`, {
    method: 'POST',
    headers: getOpenAiHeaders(apiKey),
    body: JSON.stringify({
      input,
      model,
    }),
  });

  if (!openAiResponse.ok) {
    const errorText = await openAiResponse.text().catch(() => '');
    response.status(200).json({
      ok: false,
      error: errorText || `OpenAI Embeddings API failed with HTTP ${openAiResponse.status}.`,
    });
    return;
  }

  const data = (await openAiResponse.json()) as OpenAiEmbeddingPayload;
  const embedding = data.data?.[0]?.embedding;
  if (!Array.isArray(embedding)) {
    response.status(200).json({ ok: false, error: 'OpenAI returned no embedding.' });
    return;
  }

  response.status(200).json({
    embedding,
    model,
    ok: true,
  });
}
