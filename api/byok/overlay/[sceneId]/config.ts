import { fetchPublicOverlayConfig } from '../../_lib/product-data.js';
import { createByokApiRoute } from '../../_lib/route-stub.js';
import { readRouteParam, type ByokApiRequestLike } from '../../_lib/supabase-context.js';

export default createByokApiRoute(
  {
    GET: 'overlay.scene.read',
  },
  {
    async GET({ request, resolved }) {
      const sceneId = readSceneId(request);
      const workspaceId = resolved.context.overlayToken?.workspaceId;
      if (!sceneId || !workspaceId) {
        return missingOverlay();
      }

      const config = await fetchPublicOverlayConfig({
        config: resolved.config,
        fetchFn: resolved.fetchFn,
        sceneId,
        workspaceId,
      });
      if (!config.scene) {
        return missingOverlay();
      }

      return {
        body: {
          ok: true,
          ...config,
        },
      };
    },
  },
);

function readSceneId(request: ByokApiRequestLike) {
  return readRouteParam(request, 'sceneId');
}

function missingOverlay() {
  return {
    body: {
      ok: false,
      message: 'Overlay token is invalid or the scene is unavailable.',
      reason: 'overlay-token-invalid',
      status: 404,
    },
    status: 404,
  };
}
