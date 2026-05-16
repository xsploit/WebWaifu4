import {
  attachDefaultScene,
  ensureByokProfile,
  ensureDefaultScene,
  ensureDefaultWorkspace,
  updateByokProfile,
} from './_lib/product-data.js';
import { createByokApiRoute } from './_lib/route-stub.js';
import type { ResolvedByokApiRouteRequest } from './_lib/supabase-context.js';

export default createByokApiRoute(
  {
    GET: 'profile.self.read',
    PATCH: 'profile.self.write',
  },
  {
    async GET({ resolved }) {
      return buildProfilePayload(resolved);
    },
    async PATCH({ request, resolved }) {
      if (!resolved.authUser) {
        return unauthenticated();
      }

      const profile = await updateByokProfile({
        authUser: resolved.authUser,
        body: request.body,
        config: resolved.config,
        fetchFn: resolved.fetchFn,
      });
      return buildProfilePayload(resolved, profile);
    },
  },
);

async function buildProfilePayload(
  resolved: ResolvedByokApiRouteRequest,
  profileOverride?: Awaited<ReturnType<typeof ensureByokProfile>>,
) {
  if (!resolved.authUser) {
    return unauthenticated();
  }

  const profile =
    profileOverride ??
    (await ensureByokProfile({
      authUser: resolved.authUser,
      config: resolved.config,
      fetchFn: resolved.fetchFn,
    }));
  const workspaceBase = await ensureDefaultWorkspace({
    config: resolved.config,
    fetchFn: resolved.fetchFn,
    userId: resolved.authUser.id,
  });
  const scene = await ensureDefaultScene({
    config: resolved.config,
    fetchFn: resolved.fetchFn,
    workspaceId: workspaceBase.id,
  });
  const workspace = await attachDefaultScene({
    config: resolved.config,
    fetchFn: resolved.fetchFn,
    workspace: workspaceBase,
  });

  return {
    body: {
      ok: true,
      profile,
      bootstrap: {
        scene,
        workspace,
      },
    },
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
