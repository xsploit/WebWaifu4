import {
  getProviderEnvApiKey,
  getRuntimeProviderBaseUrl,
  normalizeRuntimeLlmProvider,
  providerModelsCanBeListedWithoutKey,
} from '../../server/src/runtimeProviderRouting.js';
import { getServerProviderProxyAuthContext } from './provider-proxy-auth.js';

type ApiRequest = {
  method?: string;
  query?: Record<string, string | string[] | undefined>;
  headers?: Record<string, string | string[] | undefined>;
  url?: string;
};

type ApiResponse = {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
};

type ProviderModelsPayload = {
  data?: Array<{
    id?: unknown;
  }>;
};

export default async function handler(request: ApiRequest, response: ApiResponse) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  response.setHeader(
    'Access-Control-Allow-Headers',
    'content-type,x-yourwifey-llm-provider,x-yourwifey-llm-provider-key,x-yourwifey-llm-provider-key-kind',
  );

  if (request.method === 'OPTIONS') {
    response.status(204).json({});
    return;
  }

  if (request.method !== 'GET') {
    response.status(200).json({ ok: false, error: 'GET required.', models: [] });
    return;
  }

  const providerName = normalizeRuntimeLlmProvider(
    getHeaderValue(request, 'x-yourwifey-llm-provider') || getQueryValue(request, 'provider'),
  );
  const browserLlmApiKey = getHeaderSecret(request, 'x-yourwifey-llm-provider-key');
  const gatewayByokProvider = getHeaderValue(request, 'x-yourwifey-llm-provider-key-kind')
    ?.trim()
    .toLowerCase();
  const proxyAuthContext = isServerAiProxyEnabled()
    ? await getServerProviderProxyAuthContext(request)
    : ({ ok: false, principal: null } as const);
  const gatewayApiKey =
    providerName === 'vercel-gateway-responses'
      ? getProviderEnvApiKey(providerName) || getHeaderSecret(request, 'x-vercel-oidc-token')
      : '';
  const apiKey =
    providerName === 'vercel-gateway-responses' && gatewayByokProvider
      ? gatewayApiKey
      : browserLlmApiKey || (proxyAuthContext.ok ? getProviderEnvApiKey(providerName) : '');

  if (!apiKey && !providerModelsCanBeListedWithoutKey(providerName)) {
    response
      .status(200)
      .json({ ok: false, error: 'AI provider key is not configured.', models: [] });
    return;
  }

  const apiBaseUrl = getRuntimeProviderBaseUrl(
    providerName,
    process.env['OPENAI_API_BASE_URL'] || 'https://api.openai.com/v1',
  );
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const modelsResponse = await fetch(`${apiBaseUrl}/models`, {
    headers,
    method: 'GET',
  });
  const payload = (await modelsResponse.json().catch(() => ({}))) as ProviderModelsPayload & {
    error?: { message?: string };
  };
  if (!modelsResponse.ok) {
    response.status(200).json({
      ok: false,
      error:
        payload.error?.message || `Provider model list failed with HTTP ${modelsResponse.status}.`,
      models: [],
    });
    return;
  }

  response.status(200).json({
    ok: true,
    models: (payload.data ?? [])
      .map((model) => (typeof model.id === 'string' ? model.id.trim() : ''))
      .filter(Boolean),
    provider: providerName,
  });
}

function getQueryValue(request: ApiRequest, name: string) {
  const value = request.query?.[name] ?? getUrlSearchParam(request, name);
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function getUrlSearchParam(request: ApiRequest, name: string) {
  if (!request.url) {
    return undefined;
  }
  try {
    return new URL(request.url, 'http://localhost').searchParams.get(name) ?? undefined;
  } catch {
    return undefined;
  }
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
