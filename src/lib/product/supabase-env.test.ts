import { describe, expect, it } from 'vitest';
import {
  assertSupabaseAdminReady,
  assertSupabaseCloudSyncReady,
  DEFAULT_SUPABASE_STORAGE_BUCKET,
  readSupabaseBrowserEnv,
  readSupabaseServerEnv,
  toSupabasePublicConfig,
} from './supabase-env';

describe('Supabase BYOK environment contracts', () => {
  it('keeps the browser in local-only mode when Supabase env is absent', () => {
    const config = readSupabaseBrowserEnv({});

    expect(config.status).toBe('disabled');
    expect(config.url).toBeNull();
    expect(config.anonKey).toBeNull();
    expect(() => assertSupabaseCloudSyncReady(config)).toThrow(/not configured/i);
  });

  it('accepts complete browser cloud-sync config without server-only fields', () => {
    const config = readSupabaseBrowserEnv({
      VITE_SUPABASE_URL: ' https://project-ref.supabase.co/ ',
      VITE_SUPABASE_ANON_KEY: ' anon-public-key ',
    });

    expect(config).toMatchObject({
      status: 'configured',
      authProvider: 'supabase',
      databaseProvider: 'supabase-postgres',
      storageProvider: 'supabase-storage',
      url: 'https://project-ref.supabase.co',
      anonKey: 'anon-public-key',
      missing: [],
      problems: [],
    });
    expect(() => assertSupabaseCloudSyncReady(config)).not.toThrow();
  });

  it('treats partial browser Supabase env as misconfigured instead of blocking local-only mode', () => {
    const config = readSupabaseBrowserEnv({
      VITE_SUPABASE_URL: 'https://project-ref.supabase.co',
    });

    expect(config.status).toBe('misconfigured');
    expect(config.missing).toEqual(['VITE_SUPABASE_ANON_KEY']);
    expect(() => assertSupabaseCloudSyncReady(config)).toThrow('VITE_SUPABASE_ANON_KEY');
  });

  it('rejects browser-exposed Supabase admin secrets', () => {
    const config = readSupabaseBrowserEnv({
      VITE_SUPABASE_URL: 'https://project-ref.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'anon-public-key',
      VITE_SUPABASE_SERVICE_ROLE_KEY: 'service-role-secret',
    });

    expect(config.status).toBe('misconfigured');
    expect(config.problems).toEqual([
      'VITE_SUPABASE_SERVICE_ROLE_KEY must not be exposed to browser code.',
    ]);
  });

  it('builds server config with service-role access and safe public projection', () => {
    const config = readSupabaseServerEnv({
      SUPABASE_URL: 'https://project-ref.supabase.co/',
      SUPABASE_ANON_KEY: 'anon-public-key',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-secret',
      SUPABASE_JWT_SECRET: 'jwt-secret',
    });

    expect(config.status).toBe('configured');
    expect(config.adminReady).toBe(true);
    expect(config.storageBucket).toBe(DEFAULT_SUPABASE_STORAGE_BUCKET);
    expect(() => assertSupabaseAdminReady(config)).not.toThrow();

    const publicConfig = toSupabasePublicConfig(config);
    expect(publicConfig).toEqual({
      status: 'configured',
      authProvider: 'supabase',
      databaseProvider: 'supabase-postgres',
      storageProvider: 'supabase-storage',
      url: 'https://project-ref.supabase.co',
      anonKey: 'anon-public-key',
      missing: [],
      problems: [],
    });
    expect(JSON.stringify(publicConfig)).not.toContain('service-role-secret');
    expect(JSON.stringify(publicConfig)).not.toContain('jwt-secret');
  });

  it('requires the server service-role key only for future admin routes', () => {
    const config = readSupabaseServerEnv({
      SUPABASE_URL: 'https://project-ref.supabase.co',
      SUPABASE_ANON_KEY: 'anon-public-key',
    });

    expect(config.status).toBe('configured');
    expect(config.adminReady).toBe(false);
    expect(() => assertSupabaseCloudSyncReady(config)).not.toThrow();
    expect(() => assertSupabaseAdminReady(config)).toThrow('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('does not mark admin routes ready when base Supabase config is missing', () => {
    const config = readSupabaseServerEnv({
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-secret',
    });

    expect(config.status).toBe('disabled');
    expect(config.adminReady).toBe(false);
    expect(() => assertSupabaseAdminReady(config)).toThrow(/not configured/i);
  });

  it('allows local Supabase URLs but rejects non-local insecure URLs', () => {
    expect(
      readSupabaseBrowserEnv({
        VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
        VITE_SUPABASE_ANON_KEY: 'anon-public-key',
      }).status,
    ).toBe('configured');

    const config = readSupabaseBrowserEnv({
      VITE_SUPABASE_URL: 'http://project-ref.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'anon-public-key',
    });

    expect(config.status).toBe('misconfigured');
    expect(config.problems[0]).toContain('HTTPS');
  });
});
