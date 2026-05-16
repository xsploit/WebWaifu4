import type { ByokAccountMode } from './account-mode.js';
import {
  assertOverlayTokenClaims,
  type OverlayTokenClaims,
  type SettingStorageClass,
} from './byok.js';

export type ByokRouteActor = 'supabase-user' | 'overlay-token';

export type ByokRouteOwnership =
  | 'self'
  | 'workspace-owner'
  | 'workspace-reader'
  | 'overlay-scoped-scene';

export type ByokCloudRouteResource =
  | 'profile'
  | 'workspace'
  | 'scene'
  | 'character'
  | 'synced-setting'
  | 'provider-secret-descriptor'
  | 'overlay-token'
  | 'memory-entry'
  | 'asset'
  | 'public-overlay-config';

export type ByokCloudRouteContract = {
  id: string;
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  actor: ByokRouteActor;
  ownership: ByokRouteOwnership;
  resource: ByokCloudRouteResource;
  allowedSettingStorageClasses?: readonly Extract<
    SettingStorageClass,
    'public-overlay' | 'synced-private'
  >[];
  secretMaterialPolicy: 'forbidden';
};

export const BYOK_CLOUD_ROUTE_CONTRACTS = [
  {
    id: 'profile.self.read',
    method: 'GET',
    path: '/api/byok/profile',
    actor: 'supabase-user',
    ownership: 'self',
    resource: 'profile',
    secretMaterialPolicy: 'forbidden',
  },
  {
    id: 'workspace.read',
    method: 'GET',
    path: '/api/byok/workspaces/:workspaceId',
    actor: 'supabase-user',
    ownership: 'workspace-reader',
    resource: 'workspace',
    secretMaterialPolicy: 'forbidden',
  },
  {
    id: 'workspace.write',
    method: 'PATCH',
    path: '/api/byok/workspaces/:workspaceId',
    actor: 'supabase-user',
    ownership: 'workspace-owner',
    resource: 'workspace',
    secretMaterialPolicy: 'forbidden',
  },
  {
    id: 'scene.read',
    method: 'GET',
    path: '/api/byok/workspaces/:workspaceId/scenes/:sceneId',
    actor: 'supabase-user',
    ownership: 'workspace-reader',
    resource: 'scene',
    secretMaterialPolicy: 'forbidden',
  },
  {
    id: 'scene.write',
    method: 'PATCH',
    path: '/api/byok/workspaces/:workspaceId/scenes/:sceneId',
    actor: 'supabase-user',
    ownership: 'workspace-owner',
    resource: 'scene',
    secretMaterialPolicy: 'forbidden',
  },
  {
    id: 'character.write',
    method: 'PATCH',
    path: '/api/byok/workspaces/:workspaceId/scenes/:sceneId/characters/:characterId',
    actor: 'supabase-user',
    ownership: 'workspace-owner',
    resource: 'character',
    secretMaterialPolicy: 'forbidden',
  },
  {
    id: 'synced-setting.write',
    method: 'PATCH',
    path: '/api/byok/workspaces/:workspaceId/settings/:settingId',
    actor: 'supabase-user',
    ownership: 'workspace-owner',
    resource: 'synced-setting',
    allowedSettingStorageClasses: ['public-overlay', 'synced-private'],
    secretMaterialPolicy: 'forbidden',
  },
  {
    id: 'provider-secret-descriptor.write',
    method: 'PATCH',
    path: '/api/byok/workspaces/:workspaceId/provider-secret-descriptors/:descriptorId',
    actor: 'supabase-user',
    ownership: 'workspace-owner',
    resource: 'provider-secret-descriptor',
    secretMaterialPolicy: 'forbidden',
  },
  {
    id: 'overlay-token.issue',
    method: 'POST',
    path: '/api/byok/workspaces/:workspaceId/scenes/:sceneId/overlay-tokens',
    actor: 'supabase-user',
    ownership: 'workspace-owner',
    resource: 'overlay-token',
    secretMaterialPolicy: 'forbidden',
  },
  {
    id: 'memory-entry.write',
    method: 'PATCH',
    path: '/api/byok/workspaces/:workspaceId/memory/:memoryEntryId',
    actor: 'supabase-user',
    ownership: 'workspace-owner',
    resource: 'memory-entry',
    secretMaterialPolicy: 'forbidden',
  },
  {
    id: 'asset.write',
    method: 'POST',
    path: '/api/byok/workspaces/:workspaceId/assets',
    actor: 'supabase-user',
    ownership: 'workspace-owner',
    resource: 'asset',
    secretMaterialPolicy: 'forbidden',
  },
  {
    id: 'overlay.scene.read',
    method: 'GET',
    path: '/api/byok/overlay/:sceneId/config',
    actor: 'overlay-token',
    ownership: 'overlay-scoped-scene',
    resource: 'public-overlay-config',
    allowedSettingStorageClasses: ['public-overlay'],
    secretMaterialPolicy: 'forbidden',
  },
] as const satisfies readonly ByokCloudRouteContract[];

export type ByokCloudRouteId = (typeof BYOK_CLOUD_ROUTE_CONTRACTS)[number]['id'];

export type ByokWorkspaceAccessSnapshot = {
  workspaceId: string;
  ownerUserId: string;
  memberUserIds?: readonly string[];
};

export type ByokRouteAccessInput = {
  routeId: ByokCloudRouteId;
  accountMode?: ByokAccountMode | null;
  overlayToken?: OverlayTokenClaims | null;
  workspace?: ByokWorkspaceAccessSnapshot | null;
  targetUserId?: string | null;
  targetSceneId?: string | null;
  settingStorageClass?: SettingStorageClass | null;
  body?: unknown;
};

export type ByokRouteAccessDecision =
  | {
      allowed: true;
      status: 200;
      reason: 'allowed';
      contract: ByokCloudRouteContract;
    }
  | {
      allowed: false;
      status: 400 | 401 | 403;
      reason:
        | 'overlay-token-invalid'
        | 'overlay-token-required'
        | 'secret-material-forbidden'
        | 'setting-storage-class-forbidden'
        | 'supabase-auth-required'
        | 'workspace-access-denied'
        | 'workspace-snapshot-required';
      message: string;
      contract: ByokCloudRouteContract;
      findings?: string[];
    };

const FORBIDDEN_ROUTE_SECRET_KEY_PATTERN =
  /(?:api[_-]?key|apikey|secret|password|service[_-]?role|jwt|token|credential)/i;

export function getByokCloudRouteContract(routeId: ByokCloudRouteId): ByokCloudRouteContract {
  const contract = BYOK_CLOUD_ROUTE_CONTRACTS.find((item) => item.id === routeId);
  if (!contract) {
    throw new Error(`Unknown BYOK cloud route contract: ${routeId}`);
  }
  return contract;
}

export function authorizeByokCloudRoute(input: ByokRouteAccessInput): ByokRouteAccessDecision {
  const contract = getByokCloudRouteContract(input.routeId);
  const findings = findForbiddenCloudRouteSecretPaths(input.body);
  if (findings.length > 0) {
    return deny(
      contract,
      400,
      'secret-material-forbidden',
      'Cloud routes must not accept secret material.',
      findings,
    );
  }

  if (
    input.settingStorageClass &&
    contract.allowedSettingStorageClasses &&
    !contract.allowedSettingStorageClasses.includes(
      input.settingStorageClass as Extract<
        SettingStorageClass,
        'public-overlay' | 'synced-private'
      >,
    )
  ) {
    return deny(
      contract,
      400,
      'setting-storage-class-forbidden',
      'Cloud route only accepts non-secret synced settings for this resource.',
    );
  }

  if (contract.actor === 'overlay-token') {
    return authorizeOverlayRoute(contract, input);
  }

  const accountMode = input.accountMode;
  if (!accountMode || accountMode.kind !== 'supabase-cloud-sync') {
    return deny(
      contract,
      401,
      'supabase-auth-required',
      'Supabase cloud routes require a signed-in cloud-sync account.',
    );
  }

  if (contract.ownership === 'self') {
    if (input.targetUserId && input.targetUserId !== accountMode.user.id) {
      return deny(
        contract,
        403,
        'workspace-access-denied',
        'Route target does not match the signed-in user.',
      );
    }
    return allow(contract);
  }

  const workspace = input.workspace;
  if (!workspace) {
    return deny(
      contract,
      403,
      'workspace-access-denied',
      'Workspace is unavailable or access is denied for this route.',
    );
  }

  const isOwner = workspace.ownerUserId === accountMode.user.id;
  const isMember = workspace.memberUserIds?.includes(accountMode.user.id) ?? false;
  if (contract.ownership === 'workspace-reader' && (isOwner || isMember)) {
    return allow(contract);
  }
  if (contract.ownership === 'workspace-owner' && isOwner) {
    return allow(contract);
  }

  return deny(
    contract,
    403,
    'workspace-access-denied',
    'Workspace is unavailable or access is denied for this route.',
  );
}

export function findForbiddenCloudRouteSecretPaths(value: unknown, path = 'body'): string[] {
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

function authorizeOverlayRoute(
  contract: ByokCloudRouteContract,
  input: ByokRouteAccessInput,
): ByokRouteAccessDecision {
  if (!input.overlayToken) {
    return deny(
      contract,
      401,
      'overlay-token-required',
      'Public overlay routes require a signed scene overlay token.',
    );
  }

  try {
    assertOverlayTokenClaims(input.overlayToken);
  } catch (error) {
    return deny(
      contract,
      401,
      'overlay-token-invalid',
      error instanceof Error ? error.message : 'Overlay token is invalid.',
    );
  }

  const workspaceId = input.workspace?.workspaceId;
  const sceneId = input.targetSceneId;
  const hasReadScope =
    input.overlayToken.scopes.includes('overlay:read') ||
    input.overlayToken.scopes.includes('scene:read');
  if (
    !workspaceId ||
    !sceneId ||
    input.overlayToken.workspaceId !== workspaceId ||
    input.overlayToken.sceneId !== sceneId ||
    !hasReadScope
  ) {
    return deny(
      contract,
      403,
      'workspace-access-denied',
      'Overlay token is not scoped to this workspace scene.',
    );
  }

  return allow(contract);
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

function allow(contract: ByokCloudRouteContract): ByokRouteAccessDecision {
  return {
    allowed: true,
    status: 200,
    reason: 'allowed',
    contract,
  };
}

function deny(
  contract: ByokCloudRouteContract,
  status: 400 | 401 | 403,
  reason: Exclude<ByokRouteAccessDecision, { allowed: true }>['reason'],
  message: string,
  findings?: string[],
): ByokRouteAccessDecision {
  return {
    allowed: false,
    status,
    reason,
    message,
    contract,
    ...(findings ? { findings } : {}),
  };
}
