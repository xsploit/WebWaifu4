import type { ByokAccountMode } from './account-mode.js';
import type { OverlayTokenClaims, SettingStorageClass } from './byok.js';
import {
  authorizeByokCloudRoute,
  getByokCloudRouteContract,
  type ByokCloudRouteId,
  type ByokRouteAccessDecision,
  type ByokWorkspaceAccessSnapshot,
} from './server-route-ownership.js';

export type ByokRouteStubContext = {
  accountMode?: ByokAccountMode | null;
  overlayToken?: OverlayTokenClaims | null;
  workspace?: ByokWorkspaceAccessSnapshot | null;
  targetUserId?: string | null;
  targetSceneId?: string | null;
  settingStorageClass?: SettingStorageClass | null;
};

export type ByokRouteStubRequest = {
  body?: unknown;
  context?: ByokRouteStubContext | null;
  method?: string;
  routeId: ByokCloudRouteId;
};

export type ByokRouteStubResponseBody = {
  ok: false;
  routeId: ByokCloudRouteId;
  status: number;
  reason:
    | 'method-not-allowed'
    | 'route-context-not-wired'
    | 'route-not-implemented'
    | Exclude<ByokRouteAccessDecision, { allowed: true }>['reason'];
  message: string;
  contract: {
    actor: string;
    method: string;
    ownership: string;
    path: string;
    resource: string;
    secretMaterialPolicy: 'forbidden';
  };
  authorized?: boolean;
  findings?: string[];
};

export type ByokRouteStubResponse = {
  status: 400 | 401 | 403 | 405 | 501;
  body: ByokRouteStubResponseBody;
};

export function createByokRouteStubResponse(request: ByokRouteStubRequest): ByokRouteStubResponse {
  const contract = getByokCloudRouteContract(request.routeId);
  const method = (request.method ?? '').toUpperCase();
  if (method !== contract.method) {
    return {
      status: 405,
      body: {
        ok: false,
        routeId: request.routeId,
        status: 405,
        reason: 'method-not-allowed',
        message: `${contract.method} required.`,
        contract: publicContract(contract),
      },
    };
  }

  const context = request.context;
  if (!context) {
    return {
      status: 501,
      body: {
        ok: false,
        routeId: request.routeId,
        status: 501,
        reason: 'route-context-not-wired',
        message:
          'BYOK cloud route is scaffolded, but Supabase auth and workspace resolution are not wired yet.',
        contract: publicContract(contract),
      },
    };
  }

  const decision = authorizeByokCloudRoute({
    routeId: request.routeId,
    accountMode: context.accountMode,
    overlayToken: context.overlayToken,
    workspace: context.workspace,
    targetUserId: context.targetUserId,
    targetSceneId: context.targetSceneId,
    settingStorageClass: context.settingStorageClass,
    body: request.body,
  });

  if (!decision.allowed) {
    return {
      status: decision.status,
      body: {
        ok: false,
        routeId: request.routeId,
        status: decision.status,
        reason: decision.reason,
        message: decision.message,
        contract: publicContract(contract),
        ...(decision.findings ? { findings: decision.findings } : {}),
      },
    };
  }

  return {
    status: 501,
    body: {
      ok: false,
      routeId: request.routeId,
      status: 501,
      reason: 'route-not-implemented',
      message:
        'BYOK cloud route authorization passed, but Supabase database access is not implemented yet.',
      contract: publicContract(contract),
      authorized: true,
    },
  };
}

function publicContract(contract: ReturnType<typeof getByokCloudRouteContract>) {
  return {
    actor: contract.actor,
    method: contract.method,
    ownership: contract.ownership,
    path: contract.path,
    resource: contract.resource,
    secretMaterialPolicy: contract.secretMaterialPolicy,
  };
}
