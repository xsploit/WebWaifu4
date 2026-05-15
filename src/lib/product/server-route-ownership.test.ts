import { describe, expect, it, vi } from 'vitest';
import { resolveByokAccountMode } from './account-mode';
import type { OverlayTokenClaims } from './byok';
import {
  authorizeByokCloudRoute,
  BYOK_CLOUD_ROUTE_CONTRACTS,
  type ByokWorkspaceAccessSnapshot,
} from './server-route-ownership';
import { readSupabaseBrowserEnv } from './supabase-env';

const configuredSupabase = readSupabaseBrowserEnv({
  VITE_SUPABASE_URL: 'https://project-ref.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'anon-public-key',
});

const guestMode = resolveByokAccountMode({
  supabaseConfig: readSupabaseBrowserEnv({}),
});

const ownerMode = resolveByokAccountMode({
  now: '2026-05-15T12:00:00.000Z',
  supabaseConfig: configuredSupabase,
  authUser: {
    id: 'owner-user',
    email: 'owner@example.com',
  },
});

const memberMode = resolveByokAccountMode({
  now: '2026-05-15T12:00:00.000Z',
  supabaseConfig: configuredSupabase,
  authUser: {
    id: 'member-user',
    email: 'member@example.com',
  },
});

const outsiderMode = resolveByokAccountMode({
  now: '2026-05-15T12:00:00.000Z',
  supabaseConfig: configuredSupabase,
  authUser: {
    id: 'outsider-user',
    email: 'outsider@example.com',
  },
});

const workspace: ByokWorkspaceAccessSnapshot = {
  workspaceId: 'workspace-1',
  ownerUserId: 'owner-user',
  memberUserIds: ['member-user'],
};

describe('BYOK cloud route ownership contracts', () => {
  it('defines cloud routes without payments, credits, or secret acceptance', () => {
    expect(BYOK_CLOUD_ROUTE_CONTRACTS.map((route) => route.id)).toEqual([
      'profile.self.read',
      'workspace.read',
      'workspace.write',
      'scene.read',
      'scene.write',
      'character.write',
      'synced-setting.write',
      'provider-secret-descriptor.write',
      'overlay-token.issue',
      'memory-entry.write',
      'asset.write',
      'overlay.scene.read',
    ]);

    for (const route of BYOK_CLOUD_ROUTE_CONTRACTS) {
      expect(route.path).toMatch(/^\/api\/byok\//);
      expect(route.secretMaterialPolicy).toBe('forbidden');
    }
    expect(JSON.stringify(BYOK_CLOUD_ROUTE_CONTRACTS)).not.toMatch(
      /stripe|payment|credit|managed/i,
    );
  });

  it('requires Supabase auth and resolved workspace ownership for cloud routes', () => {
    expect(
      authorizeByokCloudRoute({
        routeId: 'scene.read',
        accountMode: guestMode,
        workspace,
      }),
    ).toMatchObject({
      allowed: false,
      status: 401,
      reason: 'supabase-auth-required',
    });

    expect(
      authorizeByokCloudRoute({
        routeId: 'scene.write',
        accountMode: ownerMode,
        workspace,
      }),
    ).toMatchObject({ allowed: true });

    expect(
      authorizeByokCloudRoute({
        routeId: 'scene.read',
        accountMode: memberMode,
        workspace,
      }),
    ).toMatchObject({ allowed: true });

    expect(
      authorizeByokCloudRoute({
        routeId: 'scene.write',
        accountMode: memberMode,
        workspace,
      }),
    ).toMatchObject({
      allowed: false,
      status: 403,
      reason: 'workspace-access-denied',
    });

    expect(
      authorizeByokCloudRoute({
        routeId: 'workspace.read',
        accountMode: outsiderMode,
        workspace,
      }),
    ).toMatchObject({
      allowed: false,
      status: 403,
      reason: 'workspace-access-denied',
    });
  });

  it('keeps provider key material out of cloud route bodies', () => {
    expect(
      authorizeByokCloudRoute({
        routeId: 'synced-setting.write',
        accountMode: ownerMode,
        workspace,
        settingStorageClass: 'synced-private',
        body: {
          key: 'aiSettings',
          storageClass: 'synced-private',
          valueJson: JSON.stringify({
            provider: {
              apiKey: 'sk-test-1234567890',
            },
          }),
        },
      }),
    ).toMatchObject({
      allowed: false,
      status: 400,
      reason: 'secret-material-forbidden',
      findings: ['body.valueJson.provider.apiKey'],
    });

    expect(
      authorizeByokCloudRoute({
        routeId: 'provider-secret-descriptor.write',
        accountMode: ownerMode,
        workspace,
        body: {
          provider: 'openai',
          keyName: 'openai.apiKey',
          redactedLabel: 'sk-tes...7890',
          secret: 'sk-test-1234567890',
        },
      }),
    ).toMatchObject({
      allowed: false,
      status: 400,
      reason: 'secret-material-forbidden',
      findings: ['body.secret'],
    });

    expect(
      authorizeByokCloudRoute({
        routeId: 'provider-secret-descriptor.write',
        accountMode: ownerMode,
        workspace,
        body: {
          provider: 'openai',
          keyName: 'openai.apiKey',
          mode: 'local-indexeddb',
          redactedLabel: 'sk-tes...7890',
        },
      }),
    ).toMatchObject({ allowed: true });
  });

  it('limits synced setting routes to non-secret cloud storage classes', () => {
    expect(
      authorizeByokCloudRoute({
        routeId: 'synced-setting.write',
        accountMode: ownerMode,
        workspace,
        settingStorageClass: 'public-overlay',
      }),
    ).toMatchObject({ allowed: true });

    expect(
      authorizeByokCloudRoute({
        routeId: 'synced-setting.write',
        accountMode: ownerMode,
        workspace,
        settingStorageClass: 'local-secret',
      }),
    ).toMatchObject({
      allowed: false,
      status: 400,
      reason: 'setting-storage-class-forbidden',
    });
  });

  it('allows public overlay config only with a matching scoped overlay token', () => {
    vi.setSystemTime(new Date('2026-05-15T12:00:00.000Z'));

    const overlayToken: OverlayTokenClaims = {
      workspaceId: 'workspace-1',
      sceneId: 'scene-1',
      scopes: ['overlay:read'],
      expiresAt: '2026-05-15T13:00:00.000Z',
    };

    expect(
      authorizeByokCloudRoute({
        routeId: 'overlay.scene.read',
        overlayToken,
        workspace,
        targetSceneId: 'scene-1',
        settingStorageClass: 'public-overlay',
      }),
    ).toMatchObject({ allowed: true });

    expect(
      authorizeByokCloudRoute({
        routeId: 'overlay.scene.read',
        overlayToken,
        workspace,
        targetSceneId: 'other-scene',
        settingStorageClass: 'public-overlay',
      }),
    ).toMatchObject({
      allowed: false,
      status: 403,
      reason: 'workspace-access-denied',
    });

    expect(
      authorizeByokCloudRoute({
        routeId: 'overlay.scene.read',
        overlayToken,
        workspace,
        targetSceneId: 'scene-1',
        settingStorageClass: 'synced-private',
      }),
    ).toMatchObject({
      allowed: false,
      status: 400,
      reason: 'setting-storage-class-forbidden',
    });

    expect(
      authorizeByokCloudRoute({
        routeId: 'overlay.scene.read',
        workspace,
        targetSceneId: 'scene-1',
        settingStorageClass: 'public-overlay',
      }),
    ).toMatchObject({
      allowed: false,
      status: 401,
      reason: 'overlay-token-required',
    });
  });
});
