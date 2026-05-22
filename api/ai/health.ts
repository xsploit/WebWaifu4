import {
  normalizeRuntimeLlmProvider,
  providerUsesAppOwnedState,
} from '../../server/src/runtimeProviderRouting.js';

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

export default function handler(request: ApiRequest, response: ApiResponse) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  response.setHeader(
    'Access-Control-Allow-Headers',
    'content-type,x-yourwifey-llm-provider,x-yourwifey-llm-provider-key,x-yourwifey-tavily-provider-key',
  );

  if (request.method === 'OPTIONS') {
    response.status(204).json({});
    return;
  }

  if (request.method !== 'GET') {
    response.status(200).json({ ok: false, error: 'GET required.' });
    return;
  }

  const providerName = normalizeRuntimeLlmProvider(
    getHeaderValue(request, 'x-yourwifey-llm-provider') || getQueryValue(request, 'provider'),
  );
  const appOwnedState = providerUsesAppOwnedState(providerName);
  const stateKey = getQueryValue(request, 'stateKey') || 'default';
  const model =
    getQueryValue(request, 'model') ||
    (providerName === 'vercel-gateway-responses' ? 'openai/gpt-5-nano' : 'gpt-5-nano');
  const stateMode = appOwnedState
    ? 'stateless'
    : getQueryValue(request, 'openAiStateMode') || 'conversation';
  const transport = appOwnedState
    ? 'http-stream'
    : getQueryValue(request, 'transportMode') || 'server-default';
  const hasLlmKey = Boolean(getHeaderSecret(request, 'x-yourwifey-llm-provider-key'));
  const hasTavilyKey = Boolean(getHeaderSecret(request, 'x-yourwifey-tavily-provider-key'));

  response.status(200).json({
    ok: true,
    aiProvider: providerName,
    model,
    serverProviderProxyEnabled:
      process.env['BYOK_SERVER_PROVIDER_PROXY_ENABLED'] === 'true' ||
      process.env['SERVER_PROVIDER_PROXY_ENABLED'] === 'true',
    providerState: {
      activeState: {
        cachedTokens: 0,
        conversationId: null,
        previousResponseId: null,
        stateKey,
      },
      activeStateKey: stateKey,
      cachedTokens: 0,
      conversationId: null,
      previousResponseId: null,
      promptCacheKey: '',
      requestedTransport: transport,
      stateKey,
      stateMode,
      store: false,
      toolNames: hasTavilyKey ? ['web_search', 'crawl_site', 'open_url'] : [],
      toolsAvailable: hasTavilyKey,
      toolsSource: hasTavilyKey ? 'browser-vault' : 'not-configured',
      transport,
      websocketConfigured: false,
      websocketConnected: false,
      websocketLifecycle: 'disabled',
      websocketStatus: 'disabled',
    },
    browserProviderKeyPresent: hasLlmKey,
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
