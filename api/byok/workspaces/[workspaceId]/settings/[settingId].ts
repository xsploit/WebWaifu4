import { fetchSyncedSetting, upsertSyncedSetting } from '../../../_lib/product-data.js';
import { createByokApiRoute } from '../../../_lib/route-stub.js';
import { readRouteParam, type ByokApiRequestLike } from '../../../_lib/supabase-context.js';

export default createByokApiRoute(
  {
    GET: 'synced-setting.read',
    PATCH: 'synced-setting.write',
  },
  {
    async GET({ request, resolved }) {
      const params = readSettingParams(request);
      if (!params) {
        return missingSetting();
      }
      const setting = await fetchSyncedSetting({
        config: resolved.config,
        fetchFn: resolved.fetchFn,
        settingId: params.settingId,
        workspaceId: params.workspaceId,
      });
      if (!setting) {
        return missingSetting();
      }
      return {
        body: {
          ok: true,
          setting,
        },
      };
    },
    async PATCH({ request, resolved }) {
      const params = readSettingParams(request);
      if (!params) {
        return missingSetting();
      }
      const setting = await upsertSyncedSetting({
        body: request.body,
        config: resolved.config,
        fetchFn: resolved.fetchFn,
        settingId: params.settingId,
        workspaceId: params.workspaceId,
      });
      return {
        body: {
          ok: true,
          setting,
        },
      };
    },
  },
);

function readSettingParams(request: ByokApiRequestLike) {
  const workspaceId = readRouteParam(request, 'workspaceId');
  const settingId = readRouteParam(request, 'settingId');
  return workspaceId && settingId ? { settingId, workspaceId } : null;
}

function missingSetting() {
  return {
    body: {
      ok: false,
      message: 'Synced setting was not found or could not be resolved.',
      reason: 'setting-not-found',
      status: 404,
    },
    status: 404,
  };
}
