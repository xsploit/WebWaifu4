import { resolveServerProviderProxyModel } from '../../server/src/runtimeSafety.js';
import {
  getProviderEmbeddingModel,
  getProviderEnvApiKey,
  getRuntimeProviderBaseUrl,
  normalizeRuntimeLlmProvider,
} from '../../server/src/runtimeProviderRouting.js';
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

type GatewayByokProvider = 'openai';

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

function normalizeGatewayByokProvider(value: unknown): GatewayByokProvider | null {
  if (typeof value !== 'string') {
    return null;
  }
  return value.trim().toLowerCase() === 'openai' ? 'openai' : null;
}

function buildGatewayByokProviderOptions(provider: GatewayByokProvider, apiKey: string) {
  return {
    gateway: {
      byok: {
        [provider]: [{ apiKey }],
      },
    },
  };
}

function normalizeInput(value: unknown) {
  return typeof value === 'string' ? value.trim().slice(0, 4000) : '';
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  response.setHeader(
    'Access-Control-Allow-Headers',
    'content-type,x-yourwifey-llm-provider,x-yourwifey-llm-provider-key,x-yourwifey-llm-provider-key-kind',
  );

  if (request.method === 'OPTIONS') {
    response.status(204).json({});
    return;
  }

  if (request.method !== 'POST') {
    response.status(200).json({ ok: false, error: 'POST required.' });
    return;
  }

  const body = (request.body ?? {}) as { input?: unknown; model?: unknown; llmProvider?: unknown };
  const providerName = normalizeRuntimeLlmProvider(
    getHeaderValue(request, 'x-yourwifey-llm-provider') || body.llmProvider,
  );
  const browserLlmApiKey = getHeaderSecret(request, 'x-yourwifey-llm-provider-key');
  const gatewayByokProvider = normalizeGatewayByokProvider(
    getHeaderValue(request, 'x-yourwifey-llm-provider-key-kind'),
  );
  const serverProxyAllowed =
    isServerAiProxyEnabled() && (await hasServerProviderProxyAuth(request));

  if (!browserLlmApiKey && !isServerAiProxyEnabled()) {
    response.status(200).json({ ok: false, error: 'Server AI proxy is disabled for BYOK mode.' });
    return;
  }
  if (!browserLlmApiKey && !serverProxyAllowed) {
    response
      .status(401)
      .json({ ok: false, error: 'Authentication required for server embeddings proxy.' });
    return;
  }

  const gatewayProviderOptions =
    providerName === 'vercel-gateway-responses' && gatewayByokProvider && browserLlmApiKey
      ? buildGatewayByokProviderOptions(gatewayByokProvider, browserLlmApiKey)
      : null;
  const gatewayApiKey =
    providerName === 'vercel-gateway-responses'
      ? getProviderEnvApiKey(providerName) || getHeaderSecret(request, 'x-vercel-oidc-token')
      : '';
  const apiKey =
    providerName === 'vercel-gateway-responses' && gatewayProviderOptions
      ? gatewayApiKey
      : browserLlmApiKey || (serverProxyAllowed ? getProviderEnvApiKey(providerName) : '');
  if (!apiKey) {
    response.status(200).json({
      ok: false,
      error:
        providerName === 'vercel-gateway-responses' && gatewayByokProvider
          ? 'Vercel AI Gateway requires AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN on the backend for request-scoped BYOK.'
          : 'AI provider key is not configured.',
    });
    return;
  }

  const input = normalizeInput(body.input);
  if (!input) {
    response.status(200).json({ ok: false, error: 'input is required.' });
    return;
  }

  const apiBaseUrl = getRuntimeProviderBaseUrl(
    providerName,
    process.env['OPENAI_API_BASE_URL'] || 'https://api.openai.com/v1',
  );
  const configuredModel = getProviderEmbeddingModel(
    providerName,
    process.env['OPENAI_EMBEDDING_MODEL'] || 'text-embedding-3-small',
  );
  const modelDecision = resolveServerProviderProxyModel({
    allowlistEnvNames: [
      'BYOK_SERVER_PROVIDER_PROXY_EMBEDDING_MODEL_ALLOWLIST',
      'SERVER_PROVIDER_PROXY_EMBEDDING_MODEL_ALLOWLIST',
    ],
    browserProviderKeyPresent: Boolean(browserLlmApiKey),
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
      ...(gatewayProviderOptions ? { providerOptions: gatewayProviderOptions } : {}),
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

function getHeaderValue(request: ApiRequest, name: string) {
  const value = request.headers?.[name] ?? request.headers?.[name.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function getHeaderSecret(request: ApiRequest, name: string) {
  return getHeaderValue(request, name)?.trim() ?? '';
}

function isServerAiProxyEnabled() {
  return (
    process.env['BYOK_SERVER_PROVIDER_PROXY_ENABLED'] === 'true' ||
    process.env['SERVER_PROVIDER_PROXY_ENABLED'] === 'true'
  );
}
