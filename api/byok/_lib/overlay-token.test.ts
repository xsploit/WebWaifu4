import { describe, expect, it } from 'vitest';
import { issueOverlayToken, verifyOverlayToken } from './overlay-token.js';
import type { SupabaseServerConfig } from '../../../src/lib/product/supabase-env.js';

const config: SupabaseServerConfig = {
  adminReady: true,
  anonKey: 'anon',
  authProvider: 'supabase',
  databaseProvider: 'supabase-postgres',
  jwtSecret: null,
  missing: [],
  overlaySigningSecret: 'overlay-secret',
  problems: [],
  serverMissing: [],
  serviceRoleKey: 'service-role',
  status: 'configured',
  storageBucket: 'yourwifey-assets',
  storageProvider: 'supabase-storage',
  url: 'https://project-ref.supabase.co',
};

describe('BYOK overlay tokens', () => {
  it('issues and verifies scoped signed overlay tokens', () => {
    const token = issueOverlayToken({
      config,
      expiresInHours: 24,
      sceneId: 'scene-1',
      workspaceId: 'workspace-1',
    });

    expect(verifyOverlayToken(config, token)).toMatchObject({
      sceneId: 'scene-1',
      scopes: ['overlay:read', 'scene:read'],
      workspaceId: 'workspace-1',
    });
    expect(verifyOverlayToken({ ...config, overlaySigningSecret: 'wrong' }, token)).toBeNull();
  });
});
