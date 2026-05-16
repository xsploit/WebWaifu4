type ApiRequest = {
  body?: unknown;
  method?: string;
};

type ApiResponse = {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
};

type ByokRouteId = 'profile.self.read' | 'workspace.read' | 'workspace.write';

export function createByokApiRouteStub(
  routeIdByMethod: Partial<Record<'DELETE' | 'GET' | 'PATCH' | 'POST', ByokRouteId>>,
) {
  return async function handler(request: ApiRequest, response: ApiResponse) {
    setCorsHeaders(response);

    if (request.method === 'OPTIONS') {
      response.status(204).json({});
      return;
    }

    const method = (request.method ?? '').toUpperCase() as 'DELETE' | 'GET' | 'PATCH' | 'POST';
    const routeId = routeIdByMethod[method];
    if (!routeId) {
      response.status(405).json({
        ok: false,
        status: 405,
        reason: 'method-not-allowed',
        message: 'Unsupported BYOK route method.',
      });
      return;
    }

    const secretFindings = findForbiddenCloudRouteSecretPaths(request.body);
    if (secretFindings.length > 0) {
      response.status(400).json({
        ok: false,
        routeId,
        status: 400,
        reason: 'secret-material-forbidden',
        message: 'Cloud routes must not accept secret material.',
        findings: secretFindings,
      });
      return;
    }

    response.status(501).json({
      ok: false,
      routeId,
      status: 501,
      reason: 'route-context-not-wired',
      message:
        'BYOK cloud route is scaffolded, but Supabase auth and workspace resolution are not wired yet.',
      contract: {
        method,
        path: getPublicRoutePath(routeId),
        secretMaterialPolicy: 'forbidden',
      },
    });
  };
}

function setCorsHeaders(response: ApiResponse) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET,PATCH,POST,DELETE,OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'authorization,content-type');
}

const FORBIDDEN_ROUTE_SECRET_KEY_PATTERN =
  /(?:api[_-]?key|apikey|secret|password|service[_-]?role|jwt|token|credential)/i;

function findForbiddenCloudRouteSecretPaths(value: unknown, path = 'body'): string[] {
  if (value === null || value === undefined) {
    return [];
  }
  if (typeof value === 'string') {
    return findForbiddenPathsInJsonString(value, path);
  }
  if (typeof value !== 'object') {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      findForbiddenCloudRouteSecretPaths(item, `${path}.${index}`),
    );
  }

  const findings: string[] = [];
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const childPath = `${path}.${key}`;
    if (FORBIDDEN_ROUTE_SECRET_KEY_PATTERN.test(key)) {
      findings.push(childPath);
      continue;
    }
    findings.push(...findForbiddenCloudRouteSecretPaths(child, childPath));
  }
  return findings;
}

function findForbiddenPathsInJsonString(value: string, path: string) {
  const trimmed = value.trim();
  if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) {
    return [];
  }
  try {
    return findForbiddenCloudRouteSecretPaths(JSON.parse(trimmed), path);
  } catch {
    return [];
  }
}

function getPublicRoutePath(routeId: ByokRouteId) {
  switch (routeId) {
    case 'profile.self.read':
      return '/api/byok/profile';
    case 'workspace.read':
    case 'workspace.write':
      return '/api/byok/workspaces/:workspaceId';
  }
}
