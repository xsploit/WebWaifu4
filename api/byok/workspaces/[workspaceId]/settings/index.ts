import { fetchSyncedSettings } from '../../../_lib/product-data.js';
import { createByokApiRoute } from '../../../_lib/route-stub.js';
import { readRouteParam, type ByokApiRequestLike } from '../../../_lib/supabase-context.js';

export default createByokApiRoute(
  {
    GET: 'synced-setting.list',
  },
  {
    async GET({ request, resolved }) {
      const workspaceId = readWorkspaceId(request);
      if (!workspaceId) {
        return missingWorkspace();
      }
      const settings = await fetchSyncedSettings({
        config: resolved.config,
        fetchFn: resolved.fetchFn,
        workspaceId,
      });
      return {
        body: {
          ok: true,
          settings,
        },
      };
    },
  },
);

function readWorkspaceId(request: ByokApiRequestLike) {
  return readRouteParam(request, 'workspaceId');
}

function missingWorkspace() {
  return {
    body: {
      ok: false,
      message: 'Workspace was not found or is not available to this account.',
      reason: 'workspace-access-denied',
      status: 404,
    },
    status: 404,
  };
}
