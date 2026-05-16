import { createByokRouteStubResponse } from '../../../src/lib/product/byok-route-stub.js';
import type { ByokCloudRouteId } from '../../../src/lib/product/server-route-ownership.js';
import { resolveByokApiRouteContext } from './supabase-context.js';

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

export function createByokApiRouteStub(
  routeIdByMethod: Partial<Record<'DELETE' | 'GET' | 'PATCH' | 'POST', ByokCloudRouteId>>,
) {
  return async function handler(request: ApiRequest, response: ApiResponse) {
    setCorsHeaders(response);

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

    const context = await resolveByokApiRouteContext({ request, routeId });
    const result = createByokRouteStubResponse({
      body: request.body,
      context,
      method,
      routeId,
    });
    response.status(result.status).json(result.body);
  };
}

function setCorsHeaders(response: ApiResponse) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET,PATCH,POST,DELETE,OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'authorization,content-type');
}
