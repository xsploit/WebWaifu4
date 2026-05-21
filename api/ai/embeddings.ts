import { resolveServerProviderProxyModel } from '../../server/src/runtimeSafety.js';
import { hasServerProviderProxyAuth } from './provider-proxy-auth.js';

type ApiRequest = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
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

  if (!isServerAiProxyEnabled()) {
    response.status(200).json({ ok: false, error: 'Server AI proxy is disabled for BYOK mode.' });
    return;
  }
  if (!(await hasServerProviderProxyAuth(request))) {
    response
      .status(401)
      .json({ ok: false, error: 'Authentication required for server embeddings proxy.' });
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
  const configuredModel = process.env['OPENAI_EMBEDDING_MODEL'] || 'text-embedding-3-small';
  const modelDecision = resolveServerProviderProxyModel({
    allowlistEnvNames: [
      'BYOK_SERVER_PROVIDER_PROXY_EMBEDDING_MODEL_ALLOWLIST',
      'SERVER_PROVIDER_PROXY_EMBEDDING_MODEL_ALLOWLIST',
    ],
    browserProviderKeyPresent: false,
    configuredModel,
    defaultModel: 'text-embedding-3-small',
    requestedModel: body.model,
  });
  if (!modelDecision.allowed) {
    response.status(403).json({ ok: false, error: modelDecision.error });
    return;
  }
  const model = modelDecision.model;

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

function isServerAiProxyEnabled() {
  return (
    process.env['BYOK_SERVER_PROVIDER_PROXY_ENABLED'] === 'true' ||
    process.env['SERVER_PROVIDER_PROXY_ENABLED'] === 'true'
  );
}
