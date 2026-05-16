import { describe, expect, it } from 'vitest';
import { summarizeByokRuntimeHealth } from './byokHealth';

describe('BYOK runtime health', () => {
  it('reports admin readiness without exposing configured values', () => {
    const health = summarizeByokRuntimeHealth({
      OVERLAY_SIGNING_SECRET: 'overlay-secret',
      SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_public-key',
      SUPABASE_SECRET_KEY: 'sb_secret_server-key',
      SUPABASE_STORAGE_BUCKET: 'yourwifey-assets',
      SUPABASE_URL: 'https://project-ref.supabase.co',
    });

    expect(health).toEqual({
      adminReady: true,
      browserSecretLeakDetected: false,
      missing: [],
      overlaySigningConfigured: true,
      publicReady: true,
      serviceKeyConfigured: true,
      storageBucketConfigured: true,
      urlConfigured: true,
    });
    expect(JSON.stringify(health)).not.toContain('sb_secret_server-key');
    expect(JSON.stringify(health)).not.toContain('sb_publishable_public-key');
    expect(JSON.stringify(health)).not.toContain('project-ref');
  });

  it('lists missing server pieces and detects browser-exposed secret env names', () => {
    expect(
      summarizeByokRuntimeHealth({
        VITE_SUPABASE_SECRET_KEY: 'must-not-be-browser-env',
      }),
    ).toMatchObject({
      adminReady: false,
      browserSecretLeakDetected: true,
      missing: ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY'],
      overlaySigningConfigured: false,
      publicReady: false,
      serviceKeyConfigured: false,
      storageBucketConfigured: false,
      urlConfigured: false,
    });
  });
});
