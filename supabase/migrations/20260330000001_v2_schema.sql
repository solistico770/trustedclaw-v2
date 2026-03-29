-- TrustedClaw v2 — Case-Centric Schema
-- =======================================

create extension if not exists "pg_trgm";

-- 1. GATES
create table public.gates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('simulator','whatsapp','telegram','email','slack','phone','webhook','generic')),
  display_name text not null,
  status text not null default 'active' check (status in ('active','inactive','error')),
  credentials_encrypted text,
  metadata jsonb default '{}',
  created_at timestamptz not null default now()
);

-- 2. CASES
create table public.cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  summary text,
  status text not null default 'pending' check (status in (
    'pending','open','action_needed','in_progress','addressed','scheduled','merged','closed','escalated'
  )),
  urgency text not null default 'normal' check (urgency in ('immediate','soon','normal','low')),
  importance int not null default 5 check (importance between 1 and 10),
  merged_into_case_id uuid references public.cases(id) on delete set null,
  next_scan_at timestamptz default now(),
  last_scanned_at timestamptz,
  message_count int not null default 0,
  first_message_at timestamptz,
  last_message_at timestamptz,
  next_action_date timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. MESSAGES
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  gate_id uuid not null references public.gates(id) on delete cascade,
  case_id uuid references public.cases(id) on delete set null,
  raw_payload jsonb not null,
  sender_identifier text,
  channel_identifier text,
  occurred_at timestamptz not null default now(),
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- 4. ENTITIES
create table public.entities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('person','company','project','invoice','bank_account','contract','product','bot','other')),
  canonical_name text not null,
  aliases text[] default '{}',
  metadata jsonb default '{}',
  status text not null default 'proposed' check (status in ('proposed','active','rejected','archived')),
  proposed_by_case_event_id uuid,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

-- 5. CASE_ENTITIES
create table public.case_entities (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  entity_id uuid not null references public.entities(id) on delete cascade,
  role text not null default 'mentioned' check (role in ('primary','related','mentioned')),
  unique (case_id, entity_id)
);

-- 6. CASE_EVENTS (LLM interaction records)
create table public.case_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('initial_scan','scheduled_scan','manual_scan','merge_decision','status_change')),
  in_context jsonb not null default '{}',
  out_raw jsonb not null default '{}',
  api_commands jsonb not null default '[]',
  tokens_used int default 0,
  model_used text default 'gemini-2.5-flash',
  duration_ms int default 0,
  created_at timestamptz not null default now()
);

-- 7. USER_SETTINGS
create table public.user_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade unique,
  context_prompt text not null default 'You are an operational agent. Classify cases by urgency and importance. Extract entities (people, companies, projects). Decide if cases should be merged.',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 8. SCAN_LOGS
create table public.scan_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  triggered_by text not null check (triggered_by in ('pg_cron','vercel_cron','manual')),
  run_at timestamptz not null default now(),
  cases_scanned int not null default 0,
  cases_merged int not null default 0,
  duration_ms int default 0,
  status text not null default 'success' check (status in ('success','partial_failure','failed')),
  error_message text,
  created_at timestamptz not null default now()
);

-- 9. AUDIT_LOGS (append-only)
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  actor text not null check (actor in ('system','agent','user','scheduler')),
  action_type text not null,
  target_type text not null,
  target_id uuid,
  reasoning text,
  metadata jsonb default '{}',
  created_at timestamptz not null default now()
);

-- TRIGGERS

-- Auto-update cases.updated_at
create or replace function public.update_updated_at()
returns trigger as $$ begin new.updated_at = now(); return new; end; $$ language plpgsql;

create trigger cases_updated_at before update on public.cases
  for each row execute function public.update_updated_at();
create trigger user_settings_updated_at before update on public.user_settings
  for each row execute function public.update_updated_at();

-- Protect messages.raw_payload from modification
create or replace function public.protect_raw_payload()
returns trigger as $$
begin
  if old.raw_payload is distinct from new.raw_payload then
    raise exception 'raw_payload is immutable';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger protect_message_raw before update on public.messages
  for each row execute function public.protect_raw_payload();

-- Protect audit_logs from modification/deletion
create or replace function public.prevent_audit_modification()
returns trigger as $$
begin raise exception 'audit_logs is append-only'; end;
$$ language plpgsql;

create trigger prevent_audit_update before update on public.audit_logs
  for each row execute function public.prevent_audit_modification();
create trigger prevent_audit_delete before delete on public.audit_logs
  for each row execute function public.prevent_audit_modification();

-- INDEXES
create index idx_cases_scan on public.cases(next_scan_at) where status not in ('closed','merged');
create index idx_cases_user_status on public.cases(user_id, status) where status not in ('closed','merged');
create index idx_cases_user_importance on public.cases(user_id, importance desc);
create index idx_messages_case on public.messages(case_id);
create index idx_messages_user_date on public.messages(user_id, occurred_at desc);
create index idx_entities_user_status on public.entities(user_id, status);
create index idx_entities_search on public.entities using gin(canonical_name gin_trgm_ops);
create index idx_case_events_case on public.case_events(case_id, created_at desc);
create index idx_case_entities_case on public.case_entities(case_id);
create index idx_case_entities_entity on public.case_entities(entity_id);
create index idx_audit_user_date on public.audit_logs(user_id, created_at desc);
create index idx_scan_logs_user on public.scan_logs(user_id, run_at desc);

-- RLS
alter table public.gates enable row level security;
alter table public.cases enable row level security;
alter table public.messages enable row level security;
alter table public.entities enable row level security;
alter table public.case_entities enable row level security;
alter table public.case_events enable row level security;
alter table public.user_settings enable row level security;
alter table public.scan_logs enable row level security;
alter table public.audit_logs enable row level security;

-- Standard RLS: user sees own data
do $$
declare t text;
begin
  for t in select unnest(array['gates','cases','messages','entities','case_events','user_settings','scan_logs']) loop
    execute format('create policy "Users view own %1$s" on public.%1$s for select using (auth.uid() = user_id)', t);
    execute format('create policy "Users insert own %1$s" on public.%1$s for insert with check (auth.uid() = user_id)', t);
    execute format('create policy "Users update own %1$s" on public.%1$s for update using (auth.uid() = user_id)', t);
  end loop;
end $$;

-- Junction tables: accessible if user owns the case
create policy "View own case_entities" on public.case_entities for select
  using (exists (select 1 from public.cases c where c.id = case_id and c.user_id = auth.uid()));
create policy "Insert own case_entities" on public.case_entities for insert
  with check (exists (select 1 from public.cases c where c.id = case_id and c.user_id = auth.uid()));

-- Audit: read + insert only
create policy "View own audit_logs" on public.audit_logs for select using (auth.uid() = user_id);
create policy "Insert own audit_logs" on public.audit_logs for insert with check (auth.uid() = user_id);

-- Service role full access
do $$
declare t text;
begin
  for t in select unnest(array['gates','cases','messages','entities','case_entities','case_events','user_settings','scan_logs','audit_logs']) loop
    execute format('create policy "Service role on %1$s" on public.%1$s for all using (auth.jwt() ->> ''role'' = ''service_role'')', t);
  end loop;
end $$;

-- REALTIME
alter publication supabase_realtime add table public.cases;
alter publication supabase_realtime add table public.entities;
