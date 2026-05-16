import { fetchWorkspaceSummary, updateWorkspace } from '../_lib/product-data.js';
import { createByokApiRoute } from '../_lib/route-stub.js';
import { readRouteParam } from '../_lib/supabase-context.js';

export default createByokApiRoute(
  {
    GET: 'workspace.read',
    PATCH: 'workspace.write',
  },
  {
    async GET({ request, resolved }) {
      if (!resolved.authUser) {
        return unauthenticated();
      }
      const workspaceId = readRouteParam(request, 'workspaceId');
      if (!workspaceId) {
        return missingWorkspace();
      }
      const workspace = await fetchWorkspaceSummary({
        config: resolved.config,
        fetchFn: resolved.fetchFn,
        userId: resolved.authUser.id,
        workspaceId,
      });
      if (!workspace) {
        return missingWorkspace();
      }
      return {
        body: {
          ok: true,
          workspace,
        },
      };
    },
    async PATCH({ request, resolved }) {
      if (!resolved.authUser) {
        return unauthenticated();
      }
      const workspaceId = readRouteParam(request, 'workspaceId');
      if (!workspaceId) {
        return missingWorkspace();
      }
      const workspace = await updateWorkspace({
        body: request.body,
        config: resolved.config,
        fetchFn: resolved.fetchFn,
        userId: resolved.authUser.id,
        workspaceId,
      });
      return {
        body: {
          ok: true,
          workspace,
        },
      };
    },
  },
);

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

function unauthenticated() {
  return {
    body: {
      ok: false,
      message: 'Supabase cloud routes require a signed-in cloud-sync account.',
      reason: 'supabase-auth-required',
      status: 401,
    },
    status: 401,
  };
}
