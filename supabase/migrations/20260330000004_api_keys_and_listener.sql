-- v6.1: API Keys, Listener Commands, Entity Types
-- ================================================
-- Adds API key auth for external services, Supabase Realtime command channel
-- for EC2 ClawListener, and custom entity types.

-- 1. API KEYS TABLE
create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  key_hash text not null,
  key_prefix text not null,
  scopes text[] not null default '{ingest,gates}',
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_api_keys_hash on public.api_keys(key_hash);
create index idx_api_keys_user on public.api_keys(user_id);

alter table public.api_keys enable row level security;
create policy "Users see own keys" on public.api_keys
  for select using (auth.uid() = user_id);
create policy "Users manage own keys" on public.api_keys
  for all using (auth.uid() = user_id);

-- 2. LISTENER COMMANDS TABLE (Vercel writes, EC2 listens via Realtime)
create table public.listener_commands (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  command text not null,
  params jsonb default '{}',
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed')),
  created_at timestamptz not null default now()
);

create index idx_listener_commands_user_status on public.listener_commands(user_id, status);
create index idx_listener_commands_created on public.listener_commands(created_at);

alter table public.listener_commands enable row level security;
create policy "Users see own commands" on public.listener_commands
  for select using (auth.uid() = user_id);
create policy "Users manage own commands" on public.listener_commands
  for all using (auth.uid() = user_id);

-- Enable Realtime on listener_commands so EC2 gets instant notifications
alter publication supabase_realtime add table public.listener_commands;

-- 3. LISTENER RESPONSES TABLE (EC2 writes, Vercel reads)
create table public.listener_responses (
  id uuid primary key default gen_random_uuid(),
  command_id uuid not null references public.listener_commands(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index idx_listener_responses_command on public.listener_responses(command_id);
create index idx_listener_responses_user on public.listener_responses(user_id);

alter table public.listener_responses enable row level security;
create policy "Users see own responses" on public.listener_responses
  for select using (auth.uid() = user_id);
create policy "Users manage own responses" on public.listener_responses
  for all using (auth.uid() = user_id);

-- 4. ENTITY TYPES TABLE
create table public.entity_types (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  slug text not null,
  display_name text not null,
  icon text,
  color text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  unique(user_id, slug)
);

alter table public.entity_types enable row level security;
create policy "Users see own entity types" on public.entity_types
  for select using (auth.uid() = user_id);
create policy "Users manage own entity types" on public.entity_types
  for all using (auth.uid() = user_id);

-- 5. DROP hardcoded entity type CHECK constraint
alter table public.entities drop constraint if exists entities_type_check;

-- 6. SEED default entity types function (called per-user on first use)
-- This is handled in application code, not as a migration seed,
-- because entity_types are per-user.
