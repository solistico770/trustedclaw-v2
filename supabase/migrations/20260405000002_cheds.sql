-- Cheds: Scheduled checks system
-- Task 1.1: cheds table
create table if not exists cheds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  title text not null,
  context text not null,
  trigger_type text not null check (trigger_type in ('interval', 'after_llm_change')),
  interval_seconds integer,
  is_active boolean not null default true,
  next_run_at timestamptz,
  last_run_at timestamptz,
  last_result text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table cheds enable row level security;
create policy "Users see own cheds" on cheds for select using (auth.uid() = user_id);
create policy "Users manage own cheds" on cheds for all using (auth.uid() = user_id);
create policy "Service role full access cheds" on cheds for all using (true) with check (true);

create index idx_cheds_user_active on cheds (user_id, is_active);
create index idx_cheds_next_run on cheds (next_run_at) where is_active = true;

-- Task 1.2: ched_runs table
create table if not exists ched_runs (
  id uuid primary key default gen_random_uuid(),
  ched_id uuid not null references cheds(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  trigger_reason text not null check (trigger_reason in ('scheduled', 'llm_change', 'manual')),
  result_text text,
  commands_executed jsonb not null default '[]',
  duration_ms integer,
  ran_at timestamptz not null default now()
);

alter table ched_runs enable row level security;
create policy "Users see own ched_runs" on ched_runs for select using (auth.uid() = user_id);
create policy "Service role full access ched_runs" on ched_runs for all using (true) with check (true);

create index idx_ched_runs_ched on ched_runs (ched_id, ran_at desc);

-- Task 1.3: Add cheds_evaluated to scan_logs
alter table scan_logs add column if not exists cheds_evaluated integer not null default 0;
