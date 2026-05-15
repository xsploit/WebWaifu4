begin;

create extension if not exists pgcrypto;

create or replace function public.byok_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Streamer'
    check (char_length(btrim(display_name)) between 1 and 80),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  storage_mode text not null default 'cloud-sync'
    check (storage_mode = 'cloud-sync'),
  provider_key_mode text not null default 'local-indexeddb'
    check (provider_key_mode = 'local-indexeddb'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('viewer', 'editor')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.scenes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  twitch_channel text not null default ''
    check (twitch_channel = '' or twitch_channel ~ '^[a-z0-9_]{1,25}$'),
  active_character_id uuid,
  overlay_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id)
);

create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  scene_id uuid not null,
  persona_id text not null check (char_length(btrim(persona_id)) between 1 and 120),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  vrm_model_id text not null check (char_length(btrim(vrm_model_id)) between 1 and 200),
  background_asset_id text,
  tts_provider text not null
    check (tts_provider in ('openai', 'fish_speech', 'inworld', 'tavily', 'custom')),
  tts_voice_id text not null check (char_length(btrim(tts_voice_id)) between 1 and 160),
  character_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  constraint characters_scene_workspace_fkey
    foreign key (workspace_id, scene_id)
    references public.scenes(workspace_id, id)
    on delete cascade
);

create table if not exists public.synced_settings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  scene_id uuid,
  character_id uuid,
  key text not null
    check (
      char_length(btrim(key)) between 1 and 160
      and key !~* '(api[_-]?key|apikey|secret|password|service[_-]?role|jwt|token)'
    ),
  storage_class text not null check (storage_class in ('public-overlay', 'synced-private')),
  value_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint synced_settings_scene_workspace_fkey
    foreign key (workspace_id, scene_id)
    references public.scenes(workspace_id, id)
    on delete cascade,
  constraint synced_settings_character_workspace_fkey
    foreign key (workspace_id, character_id)
    references public.characters(workspace_id, id)
    on delete cascade
);

create table if not exists public.provider_secret_descriptors (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null
    check (provider in ('openai', 'fish_speech', 'inworld', 'tavily', 'custom')),
  key_name text not null check (char_length(btrim(key_name)) between 1 and 160),
  mode text not null default 'local-indexeddb' check (mode = 'local-indexeddb'),
  redacted_label text not null
    check (
      char_length(btrim(redacted_label)) between 1 and 160
      and redacted_label !~* '(sk-[a-z0-9_-]{12,}|[a-z0-9_-]{32,})'
    ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider, key_name)
);

create table if not exists public.overlay_tokens (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  scene_id uuid not null,
  token_hash text not null check (char_length(btrim(token_hash)) >= 32),
  scopes text[] not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (token_hash),
  constraint overlay_tokens_scene_workspace_fkey
    foreign key (workspace_id, scene_id)
    references public.scenes(workspace_id, id)
    on delete cascade
);

create table if not exists public.memory_entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  scene_id uuid,
  character_id uuid,
  memory_kind text not null
    check (memory_kind in ('relationship', 'semantic', 'diary', 'moderation', 'system')),
  subject_key text not null check (char_length(btrim(subject_key)) between 1 and 160),
  summary text not null check (char_length(btrim(summary)) between 1 and 4000),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint memory_entries_scene_workspace_fkey
    foreign key (workspace_id, scene_id)
    references public.scenes(workspace_id, id)
    on delete cascade,
  constraint memory_entries_character_workspace_fkey
    foreign key (workspace_id, character_id)
    references public.characters(workspace_id, id)
    on delete cascade
);

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  asset_kind text not null
    check (asset_kind in ('vrm', 'background', 'animation-pack', 'voice', 'other')),
  storage_bucket text not null default 'yourwifey-assets'
    check (storage_bucket ~ '^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$'),
  storage_path text not null
    check (char_length(btrim(storage_path)) between 1 and 600 and storage_path !~ '(^|/)\.\.(/|$)'),
  content_type text,
  byte_size bigint check (byte_size is null or byte_size >= 0),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, storage_bucket, storage_path)
);

create unique index if not exists workspaces_owner_name_idx
  on public.workspaces(owner_user_id, lower(name));

create index if not exists workspace_members_user_idx
  on public.workspace_members(user_id);

create unique index if not exists scenes_workspace_name_idx
  on public.scenes(workspace_id, lower(name));

create index if not exists characters_scene_idx
  on public.characters(scene_id);

create unique index if not exists synced_settings_scope_key_idx
  on public.synced_settings(
    workspace_id,
    coalesce(scene_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(character_id, '00000000-0000-0000-0000-000000000000'::uuid),
    key
  );

create index if not exists overlay_tokens_scene_idx
  on public.overlay_tokens(scene_id);

create index if not exists memory_entries_scope_idx
  on public.memory_entries(workspace_id, scene_id, character_id, memory_kind);

create index if not exists assets_workspace_kind_idx
  on public.assets(workspace_id, asset_kind);

create or replace function public.byok_is_workspace_owner(check_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspaces workspace
    where workspace.id = check_workspace_id
      and workspace.owner_user_id = auth.uid()
  );
$$;

create or replace function public.byok_is_workspace_member(check_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members member
    where member.workspace_id = check_workspace_id
      and member.user_id = auth.uid()
  );
$$;

create or replace function public.byok_can_read_workspace(check_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.byok_is_workspace_owner(check_workspace_id)
    or public.byok_is_workspace_member(check_workspace_id);
$$;

create or replace function public.byok_can_write_workspace(check_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.byok_is_workspace_owner(check_workspace_id);
$$;

revoke all on function public.byok_is_workspace_owner(uuid) from public;
revoke all on function public.byok_is_workspace_member(uuid) from public;
revoke all on function public.byok_can_read_workspace(uuid) from public;
revoke all on function public.byok_can_write_workspace(uuid) from public;
grant execute on function public.byok_is_workspace_owner(uuid) to authenticated;
grant execute on function public.byok_is_workspace_member(uuid) to authenticated;
grant execute on function public.byok_can_read_workspace(uuid) to authenticated;
grant execute on function public.byok_can_write_workspace(uuid) to authenticated;

grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update, delete on table public.workspaces to authenticated;
grant select, insert, update, delete on table public.workspace_members to authenticated;
grant select, insert, update, delete on table public.scenes to authenticated;
grant select, insert, update, delete on table public.characters to authenticated;
grant select, insert, update, delete on table public.synced_settings to authenticated;
grant select, insert, update, delete on table public.provider_secret_descriptors to authenticated;
grant select, insert, update, delete on table public.overlay_tokens to authenticated;
grant select, insert, update, delete on table public.memory_entries to authenticated;
grant select, insert, update, delete on table public.assets to authenticated;

alter table public.profiles enable row level security;
alter table public.profiles force row level security;
alter table public.workspaces enable row level security;
alter table public.workspaces force row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_members force row level security;
alter table public.scenes enable row level security;
alter table public.scenes force row level security;
alter table public.characters enable row level security;
alter table public.characters force row level security;
alter table public.synced_settings enable row level security;
alter table public.synced_settings force row level security;
alter table public.provider_secret_descriptors enable row level security;
alter table public.provider_secret_descriptors force row level security;
alter table public.overlay_tokens enable row level security;
alter table public.overlay_tokens force row level security;
alter table public.memory_entries enable row level security;
alter table public.memory_entries force row level security;
alter table public.assets enable row level security;
alter table public.assets force row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
  on public.profiles for select
  using (id = auth.uid());

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
  on public.profiles for insert
  with check (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists workspaces_select_member on public.workspaces;
create policy workspaces_select_member
  on public.workspaces for select
  using (public.byok_can_read_workspace(id));

drop policy if exists workspaces_insert_owner on public.workspaces;
create policy workspaces_insert_owner
  on public.workspaces for insert
  with check (
    owner_user_id = auth.uid()
    and storage_mode = 'cloud-sync'
    and provider_key_mode = 'local-indexeddb'
  );

drop policy if exists workspaces_update_owner on public.workspaces;
create policy workspaces_update_owner
  on public.workspaces for update
  using (public.byok_can_write_workspace(id))
  with check (
    owner_user_id = auth.uid()
    and storage_mode = 'cloud-sync'
    and provider_key_mode = 'local-indexeddb'
  );

drop policy if exists workspaces_delete_owner on public.workspaces;
create policy workspaces_delete_owner
  on public.workspaces for delete
  using (public.byok_can_write_workspace(id));

drop policy if exists workspace_members_select_self_or_owner on public.workspace_members;
create policy workspace_members_select_self_or_owner
  on public.workspace_members for select
  using (user_id = auth.uid() or public.byok_is_workspace_owner(workspace_id));

drop policy if exists workspace_members_insert_owner on public.workspace_members;
create policy workspace_members_insert_owner
  on public.workspace_members for insert
  with check (public.byok_is_workspace_owner(workspace_id));

drop policy if exists workspace_members_update_owner on public.workspace_members;
create policy workspace_members_update_owner
  on public.workspace_members for update
  using (public.byok_is_workspace_owner(workspace_id))
  with check (public.byok_is_workspace_owner(workspace_id));

drop policy if exists workspace_members_delete_owner on public.workspace_members;
create policy workspace_members_delete_owner
  on public.workspace_members for delete
  using (public.byok_is_workspace_owner(workspace_id));

drop policy if exists scenes_select_workspace on public.scenes;
create policy scenes_select_workspace
  on public.scenes for select
  using (public.byok_can_read_workspace(workspace_id));

drop policy if exists scenes_insert_owner on public.scenes;
create policy scenes_insert_owner
  on public.scenes for insert
  with check (public.byok_can_write_workspace(workspace_id));

drop policy if exists scenes_update_owner on public.scenes;
create policy scenes_update_owner
  on public.scenes for update
  using (public.byok_can_write_workspace(workspace_id))
  with check (public.byok_can_write_workspace(workspace_id));

drop policy if exists scenes_delete_owner on public.scenes;
create policy scenes_delete_owner
  on public.scenes for delete
  using (public.byok_can_write_workspace(workspace_id));

drop policy if exists characters_select_workspace on public.characters;
create policy characters_select_workspace
  on public.characters for select
  using (public.byok_can_read_workspace(workspace_id));

drop policy if exists characters_insert_owner on public.characters;
create policy characters_insert_owner
  on public.characters for insert
  with check (public.byok_can_write_workspace(workspace_id));

drop policy if exists characters_update_owner on public.characters;
create policy characters_update_owner
  on public.characters for update
  using (public.byok_can_write_workspace(workspace_id))
  with check (public.byok_can_write_workspace(workspace_id));

drop policy if exists characters_delete_owner on public.characters;
create policy characters_delete_owner
  on public.characters for delete
  using (public.byok_can_write_workspace(workspace_id));

drop policy if exists synced_settings_select_workspace on public.synced_settings;
create policy synced_settings_select_workspace
  on public.synced_settings for select
  using (public.byok_can_read_workspace(workspace_id));

drop policy if exists synced_settings_insert_owner on public.synced_settings;
create policy synced_settings_insert_owner
  on public.synced_settings for insert
  with check (public.byok_can_write_workspace(workspace_id));

drop policy if exists synced_settings_update_owner on public.synced_settings;
create policy synced_settings_update_owner
  on public.synced_settings for update
  using (public.byok_can_write_workspace(workspace_id))
  with check (public.byok_can_write_workspace(workspace_id));

drop policy if exists synced_settings_delete_owner on public.synced_settings;
create policy synced_settings_delete_owner
  on public.synced_settings for delete
  using (public.byok_can_write_workspace(workspace_id));

drop policy if exists provider_secret_descriptors_select_workspace on public.provider_secret_descriptors;
create policy provider_secret_descriptors_select_workspace
  on public.provider_secret_descriptors for select
  using (public.byok_can_read_workspace(workspace_id));

drop policy if exists provider_secret_descriptors_insert_owner on public.provider_secret_descriptors;
create policy provider_secret_descriptors_insert_owner
  on public.provider_secret_descriptors for insert
  with check (public.byok_can_write_workspace(workspace_id));

drop policy if exists provider_secret_descriptors_update_owner on public.provider_secret_descriptors;
create policy provider_secret_descriptors_update_owner
  on public.provider_secret_descriptors for update
  using (public.byok_can_write_workspace(workspace_id))
  with check (public.byok_can_write_workspace(workspace_id));

drop policy if exists provider_secret_descriptors_delete_owner on public.provider_secret_descriptors;
create policy provider_secret_descriptors_delete_owner
  on public.provider_secret_descriptors for delete
  using (public.byok_can_write_workspace(workspace_id));

drop policy if exists overlay_tokens_select_owner on public.overlay_tokens;
create policy overlay_tokens_select_owner
  on public.overlay_tokens for select
  using (public.byok_can_write_workspace(workspace_id));

drop policy if exists overlay_tokens_insert_owner on public.overlay_tokens;
create policy overlay_tokens_insert_owner
  on public.overlay_tokens for insert
  with check (public.byok_can_write_workspace(workspace_id));

drop policy if exists overlay_tokens_update_owner on public.overlay_tokens;
create policy overlay_tokens_update_owner
  on public.overlay_tokens for update
  using (public.byok_can_write_workspace(workspace_id))
  with check (public.byok_can_write_workspace(workspace_id));

drop policy if exists overlay_tokens_delete_owner on public.overlay_tokens;
create policy overlay_tokens_delete_owner
  on public.overlay_tokens for delete
  using (public.byok_can_write_workspace(workspace_id));

drop policy if exists memory_entries_select_workspace on public.memory_entries;
create policy memory_entries_select_workspace
  on public.memory_entries for select
  using (public.byok_can_read_workspace(workspace_id));

drop policy if exists memory_entries_insert_owner on public.memory_entries;
create policy memory_entries_insert_owner
  on public.memory_entries for insert
  with check (public.byok_can_write_workspace(workspace_id));

drop policy if exists memory_entries_update_owner on public.memory_entries;
create policy memory_entries_update_owner
  on public.memory_entries for update
  using (public.byok_can_write_workspace(workspace_id))
  with check (public.byok_can_write_workspace(workspace_id));

drop policy if exists memory_entries_delete_owner on public.memory_entries;
create policy memory_entries_delete_owner
  on public.memory_entries for delete
  using (public.byok_can_write_workspace(workspace_id));

drop policy if exists assets_select_workspace on public.assets;
create policy assets_select_workspace
  on public.assets for select
  using (public.byok_can_read_workspace(workspace_id));

drop policy if exists assets_insert_owner on public.assets;
create policy assets_insert_owner
  on public.assets for insert
  with check (
    public.byok_can_write_workspace(workspace_id)
    and owner_user_id = auth.uid()
  );

drop policy if exists assets_update_owner on public.assets;
create policy assets_update_owner
  on public.assets for update
  using (public.byok_can_write_workspace(workspace_id))
  with check (
    public.byok_can_write_workspace(workspace_id)
    and owner_user_id = auth.uid()
  );

drop policy if exists assets_delete_owner on public.assets;
create policy assets_delete_owner
  on public.assets for delete
  using (public.byok_can_write_workspace(workspace_id));

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.byok_set_updated_at();

drop trigger if exists workspaces_set_updated_at on public.workspaces;
create trigger workspaces_set_updated_at
  before update on public.workspaces
  for each row execute function public.byok_set_updated_at();

drop trigger if exists workspace_members_set_updated_at on public.workspace_members;
create trigger workspace_members_set_updated_at
  before update on public.workspace_members
  for each row execute function public.byok_set_updated_at();

drop trigger if exists scenes_set_updated_at on public.scenes;
create trigger scenes_set_updated_at
  before update on public.scenes
  for each row execute function public.byok_set_updated_at();

drop trigger if exists characters_set_updated_at on public.characters;
create trigger characters_set_updated_at
  before update on public.characters
  for each row execute function public.byok_set_updated_at();

drop trigger if exists synced_settings_set_updated_at on public.synced_settings;
create trigger synced_settings_set_updated_at
  before update on public.synced_settings
  for each row execute function public.byok_set_updated_at();

drop trigger if exists provider_secret_descriptors_set_updated_at on public.provider_secret_descriptors;
create trigger provider_secret_descriptors_set_updated_at
  before update on public.provider_secret_descriptors
  for each row execute function public.byok_set_updated_at();

drop trigger if exists overlay_tokens_set_updated_at on public.overlay_tokens;
create trigger overlay_tokens_set_updated_at
  before update on public.overlay_tokens
  for each row execute function public.byok_set_updated_at();

drop trigger if exists memory_entries_set_updated_at on public.memory_entries;
create trigger memory_entries_set_updated_at
  before update on public.memory_entries
  for each row execute function public.byok_set_updated_at();

drop trigger if exists assets_set_updated_at on public.assets;
create trigger assets_set_updated_at
  before update on public.assets
  for each row execute function public.byok_set_updated_at();

commit;
