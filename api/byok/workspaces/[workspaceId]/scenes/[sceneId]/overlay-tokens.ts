import { fetchSceneSummary } from '../../../../_lib/product-data.js';
import { issueOverlayToken } from '../../../../_lib/overlay-token.js';
import { createByokApiRoute } from '../../../../_lib/route-stub.js';
import { readRouteParam, type ByokApiRequestLike } from '../../../../_lib/supabase-context.js';

export default createByokApiRoute(
  {
    POST: 'overlay-token.issue',
  },
  {
    async POST({ request, resolved }) {
      const params = readOverlayTokenParams(request);
      if (!params) {
        return missingScene();
      }
      const scene = await fetchSceneSummary({
        config: resolved.config,
        fetchFn: resolved.fetchFn,
        sceneId: params.sceneId,
        workspaceId: params.workspaceId,
      });
      if (!scene) {
        return missingScene();
      }

      const body = request.body && typeof request.body === 'object' ? request.body : {};
      const expiresInHours = Number((body as Record<string, unknown>)['expiresInHours']);
      const token = issueOverlayToken({
        characterId: scene.activeCharacterId || null,
        config: resolved.config,
        expiresInHours,
        sceneId: scene.id,
        workspaceId: scene.workspaceId,
      });

      return {
        body: {
          ok: true,
          expiresAt: tokenExpiry(token),
          scene,
          token,
        },
      };
    },
  },
);

function readOverlayTokenParams(request: ByokApiRequestLike) {
  const workspaceId = readRouteParam(request, 'workspaceId');
  const sceneId = readRouteParam(request, 'sceneId');
  return workspaceId && sceneId ? { sceneId, workspaceId } : null;
}

function missingScene() {
  return {
    body: {
      ok: false,
      message: 'Scene was not found or is not available to this account.',
      reason: 'workspace-access-denied',
      status: 404,
    },
    status: 404,
  };
}

function tokenExpiry(token: string) {
  try {
    const [, payload] = token.split('.');
    if (!payload) {
      return null;
    }
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')).expiresAt ?? null;
  } catch {
    return null;
  }
}
