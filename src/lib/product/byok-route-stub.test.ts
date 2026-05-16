import { describe, expect, it } from 'vitest';
import { resolveByokAccountMode } from './account-mode';
import { createByokRouteStubResponse } from './byok-route-stub';
import type { ByokWorkspaceAccessSnapshot } from './server-route-ownership';
import { readSupabaseBrowserEnv } from './supabase-env';

const configuredSupabase = readSupabaseBrowserEnv({
  VITE_SUPABASE_URL: 'https://project-ref.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'anon-public-key',
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

const workspace: ByokWorkspaceAccessSnapshot = {
  workspaceId: 'workspace-1',
  ownerUserId: 'owner-user',
  memberUserIds: ['member-user'],
};

describe('BYOK route stubs', () => {
  it('fails closed until Supabase route context is wired', () => {
    expect(
      createByokRouteStubResponse({
        method: 'GET',
        routeId: 'profile.self.read',
      }),
    ).toMatchObject({
      status: 501,
      body: {
        ok: false,
        reason: 'route-context-not-wired',
        routeId: 'profile.self.read',
      },
    });
  });

  it('rejects incorrect HTTP methods before route implementation', () => {
    expect(
      createByokRouteStubResponse({
        method: 'POST',
        routeId: 'profile.self.read',
      }),
    ).toMatchObject({
      status: 405,
      body: {
        reason: 'method-not-allowed',
        message: 'GET required.',
      },
    });
  });

  it('runs ownership contracts before returning implementation placeholder', () => {
    expect(
      createByokRouteStubResponse({
        method: 'PATCH',
        routeId: 'workspace.write',
        context: {
          accountMode: ownerMode,
          workspace,
        },
        body: {
          displayName: 'Main overlay workspace',
        },
      }),
    ).toMatchObject({
      status: 501,
      body: {
        authorized: true,
        reason: 'route-not-implemented',
        routeId: 'workspace.write',
      },
    });

    expect(
      createByokRouteStubResponse({
        method: 'PATCH',
        routeId: 'workspace.write',
        context: {
          accountMode: memberMode,
          workspace,
        },
      }),
    ).toMatchObject({
      status: 403,
      body: {
        reason: 'workspace-access-denied',
      },
    });
  });

  it('rejects provider secrets even while routes are stubs', () => {
    expect(
      createByokRouteStubResponse({
        method: 'PATCH',
        routeId: 'workspace.write',
        context: {
          accountMode: ownerMode,
          workspace,
        },
        body: {
          nested: {
            openaiApiKey: 'sk-test-should-not-sync',
          },
        },
      }),
    ).toMatchObject({
      status: 400,
      body: {
        reason: 'secret-material-forbidden',
        findings: ['body.nested.openaiApiKey'],
      },
    });
  });
});
