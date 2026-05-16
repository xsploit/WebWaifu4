import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationSql = readFileSync(
  new URL('../../../supabase/migrations/20260515000100_byok_product_spine.sql', import.meta.url),
  'utf8',
);

const productTables = [
  'profiles',
  'workspaces',
  'workspace_members',
  'scenes',
  'characters',
  'synced_settings',
  'provider_secret_descriptors',
  'overlay_tokens',
  'memory_entries',
  'assets',
] as const;

const workspaceScopedTables = [
  'scenes',
  'characters',
  'synced_settings',
  'provider_secret_descriptors',
  'memory_entries',
  'assets',
] as const;

describe('Supabase BYOK schema contract', () => {
  it('creates the first product tables without payment or managed-credit tables', () => {
    for (const table of productTables) {
      expect(migrationSql).toContain(`create table if not exists public.${table}`);
    }

    expect(migrationSql).not.toMatch(/stripe|payment|credit_ledger|managed_provider_credit/i);
  });

  it('keeps the profile schema aligned with the bootstrap API payload', () => {
    expect(migrationSql).toMatch(/create table if not exists public\.profiles \([\s\S]*email text/);
    expect(migrationSql).toContain('alter table public.profiles');
    expect(migrationSql).toContain('add column if not exists email text');
  });

  it('enables RLS on every product table', () => {
    for (const table of productTables) {
      expect(migrationSql).toContain(`alter table public.${table} enable row level security`);
      expect(migrationSql).toContain(`alter table public.${table} force row level security`);
      expect(migrationSql).toContain(
        `grant select, insert, update, delete on table public.${table} to authenticated`,
      );
    }
  });

  it('uses workspace ownership helpers for scoped reads and writes', () => {
    expect(migrationSql).toContain('create or replace function public.byok_can_read_workspace');
    expect(migrationSql).toContain('create or replace function public.byok_can_write_workspace');
    expect(migrationSql).toContain('workspace.owner_user_id = auth.uid()');

    for (const table of workspaceScopedTables) {
      expect(migrationSql).toContain(`create policy ${table}_select_workspace`);
      expect(migrationSql).toContain(
        `on public.${table} for select\n  using (public.byok_can_read_workspace(workspace_id))`,
      );
      expect(migrationSql).toContain(`on public.${table} for insert`);
      expect(migrationSql).toContain('with check (public.byok_can_write_workspace(workspace_id))');
    }
  });

  it('keeps cloud rows BYOK-only and rejects synced secret-shaped settings', () => {
    expect(migrationSql).toContain("check (storage_mode = 'cloud-sync')");
    expect(migrationSql).toContain("check (provider_key_mode = 'local-indexeddb')");
    expect(migrationSql).toContain("check (mode = 'local-indexeddb')");
    expect(migrationSql).toContain(
      "storage_class text not null check (storage_class in ('public-overlay', 'synced-private'))",
    );
    expect(migrationSql).toContain(
      "key !~* '(api[_-]?key|apikey|secret|password|service[_-]?role|jwt|token)'",
    );
    expect(migrationSql).not.toMatch(/\b(secret_value|encrypted_secret|provider_api_key)\b/i);
  });

  it('stores only token hashes and redacted provider descriptors', () => {
    expect(migrationSql).toContain('token_hash text not null');
    expect(migrationSql).toContain('redacted_label text not null');
    expect(migrationSql).not.toContain('raw_token');
    expect(migrationSql).not.toContain('access_token text');
  });
});
