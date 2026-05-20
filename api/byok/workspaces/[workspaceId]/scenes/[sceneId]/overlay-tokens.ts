import { fetchSceneSummary } from '../../../../_lib/product-data.js';
import { issueOverlayToken, verifyOverlayToken } from '../../../../_lib/overlay-token.js';
import {
  revokeOverlayTokensForScene,
  storeOverlayTokenRecord,
} from '../../../../_lib/overlay-token-store.js';
import { createByokApiRoute } from '../../../../_lib/route-stub.js';
import { readRouteParam, type ByokApiRequestLike } from '../../../../_lib/supabase-context.js';

export default createByokApiRoute(
  {
    DELETE: 'overlay-token.revoke',
    POST: 'overlay-token.issue',
  },
  {
    async DELETE({ request, resolved }) {
      const params = readOverlayTokenParams(request);
      if (!params) {
        return missingScene();
      }
      const revokedCount = await revokeOverlayTokensForScene({
        config: resolved.config,
        fetchFn: resolved.fetchFn,
        sceneId: params.sceneId,
        workspaceId: params.workspaceId,
      });
      return {
        body: {
          ok: true,
          revokedCount,
        },
      };
    },

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
      const claims = verifyOverlayToken(resolved.config, token);
      if (!claims) {
        throw new Error('Issued overlay token could not be verified.');
      }
      await storeOverlayTokenRecord({
        claims,
        config: resolved.config,
        fetchFn: resolved.fetchFn,
        token,
      });

      return {
        body: {
          ok: true,
          expiresAt: claims.expiresAt,
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
