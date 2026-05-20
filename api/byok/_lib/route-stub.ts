import { createByokRouteStubResponse } from '../../../src/lib/product/byok-route-stub.js';
import type { ByokCloudRouteId } from '../../../src/lib/product/server-route-ownership.js';
import {
  resolveByokApiRouteRequest,
  type ResolvedByokApiRouteRequest,
} from './supabase-context.js';

type ApiRequest = {
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
  method?: string;
  query?: Record<string, string | string[] | undefined>;
};

type ApiResponse = {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
};

type ByokApiRouteMethod = 'DELETE' | 'GET' | 'PATCH' | 'POST';

type ByokApiRouteResult = {
  body: unknown;
  status?: number;
};

type ByokApiRouteImplementationInput = {
  method: ByokApiRouteMethod;
  request: ApiRequest;
  resolved: ResolvedByokApiRouteRequest;
  routeId: ByokCloudRouteId;
};

type ByokApiRouteImplementation = (
  input: ByokApiRouteImplementationInput,
) => ByokApiRouteResult | Promise<ByokApiRouteResult>;

export function createByokApiRouteStub(
  routeIdByMethod: Partial<Record<ByokApiRouteMethod, ByokCloudRouteId>>,
) {
  return createByokApiRoute(routeIdByMethod, {});
}

export function createByokApiRoute(
  routeIdByMethod: Partial<Record<ByokApiRouteMethod, ByokCloudRouteId>>,
  implementations: Partial<Record<ByokApiRouteMethod, ByokApiRouteImplementation>>,
) {
  return async function handler(request: ApiRequest, response: ApiResponse) {
    setCorsHeaders(request, response);

    if (request.method === 'OPTIONS') {
      response.status(204).json({});
      return;
    }

    const method = (request.method ?? '').toUpperCase() as 'DELETE' | 'GET' | 'PATCH' | 'POST';
    const routeId = routeIdByMethod[method] ?? Object.values(routeIdByMethod)[0];
    if (!routeId) {
      response.status(405).json({
        ok: false,
        status: 405,
        reason: 'method-not-allowed',
        message: 'Unsupported BYOK route method.',
      });
      return;
    }

    const resolved = await resolveByokApiRouteRequest({ request, routeId });
    const result = createByokRouteStubResponse({
      body: request.body,
      context: resolved?.context ?? null,
      method,
      routeId,
    });
    if (result.status !== 501 || result.body.reason !== 'route-not-implemented') {
      response.status(result.status).json(result.body);
      return;
    }

    const implementation = implementations[method];
    if (!implementation || !resolved) {
      response.status(result.status).json(result.body);
      return;
    }

    try {
      const implemented = await implementation({
        method,
        request,
        resolved,
        routeId,
      });
      response.status(implemented.status ?? 200).json(implemented.body);
    } catch (error) {
      response.status(500).json({
        ok: false,
        reason: 'byok-route-failed',
        message: error instanceof Error ? error.message : 'BYOK route failed.',
        status: 500,
      });
    }
  };
}

export function resolveByokCorsOrigin(input: {
  env?: Record<string, string | undefined>;
  origin?: string;
}) {
  const origin = input.origin?.trim();
  const env = input.env ?? process.env;
  const allowedOrigins = readAllowedOrigins(env);

  if (origin && isLocalDevelopmentOrigin(origin, env)) {
    return origin;
  }

  if (origin && allowedOrigins.includes(origin)) {
    return origin;
  }

  return allowedOrigins[0] ?? 'null';
}

function setCorsHeaders(request: ApiRequest, response: ApiResponse) {
  response.setHeader(
    'Access-Control-Allow-Origin',
    resolveByokCorsOrigin({ origin: readHeader(request, 'origin') }),
  );
  response.setHeader('Access-Control-Allow-Methods', 'GET,PATCH,POST,DELETE,OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'authorization,content-type');
  response.setHeader('Vary', 'Origin');
}

function readAllowedOrigins(env: Record<string, string | undefined>) {
  return [
    ...splitOriginList(env['BYOK_CORS_ALLOWED_ORIGINS']),
    normalizeOrigin(env['APP_ORIGIN']),
    normalizeOrigin(env['PUBLIC_APP_ORIGIN']),
    normalizeOrigin(env['VITE_PUBLIC_APP_ORIGIN']),
    normalizeOrigin(env['VERCEL_URL']),
    normalizeOrigin(env['VERCEL_PROJECT_PRODUCTION_URL']),
  ].filter((origin): origin is string => {
    if (!origin) {
      return false;
    }
    return !isForbiddenProductionLocalOrigin(origin, env);
  });
}

function splitOriginList(value: string | undefined) {
  return (value ?? '')
    .split(',')
    .map((item) => normalizeOrigin(item))
    .filter((origin): origin is string => Boolean(origin));
}

function normalizeOrigin(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`).origin;
  } catch {
    return null;
  }
}

function isLocalDevelopmentOrigin(origin: string, env: Record<string, string | undefined>) {
  if (isProductionEnv(env)) {
    return false;
  }
  return /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(origin);
}

function isForbiddenProductionLocalOrigin(origin: string, env: Record<string, string | undefined>) {
  return (
    isProductionEnv(env) && /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(origin)
  );
}

function isProductionEnv(env: Record<string, string | undefined>) {
  return env['NODE_ENV'] === 'production' || env['VERCEL_ENV'] === 'production';
}

function readHeader(request: ApiRequest, name: string) {
  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(request.headers ?? {})) {
    if (key.toLowerCase() !== lowerName) {
      continue;
    }
    return Array.isArray(value) ? value[0] : value;
  }
  return undefined;
}
