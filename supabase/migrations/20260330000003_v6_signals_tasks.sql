-- v6: Signals & Tasks Migration
-- ================================
-- Renames messages → signals, adds triage state columns, creates tasks table.

-- 1. RENAME messages → signals
alter table public.messages rename to signals;

-- 2. ADD signal triage columns
alter table public.signals add column status text not null default 'pending'
  check (status in ('pending', 'processed', 'ignored'));
alter table public.signals add column processing_decision jsonb;

-- 3. BACKFILL existing rows as processed (they already have case_ids)
update public.signals set status = 'processed' where case_id is not null;

-- 4. Make case_id nullable (it already is from original schema, but ensure)
-- case_id was already nullable in v2 schema — no change needed

-- 5. ADD channel_id column if missing (referenced in code but not in original schema)
-- Already handled by existing code

-- 6. CREATE tasks table
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  entity_id uuid references public.entities(id) on delete set null,
  title text not null,
  description text,
  status text not null default 'open' check (status in ('open', 'closed')),
  scheduled_at timestamptz,
  due_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 7. ADD 'task' to entities type check
alter table public.entities drop constraint entities_type_check;
alter table public.entities add constraint entities_type_check
  check (type in ('person','company','project','invoice','bank_account','contract','product','bot','task','other'));

-- 8. ADD 'signal_triage' to case_events event_type check
alter table public.case_events drop constraint case_events_event_type_check;
alter table public.case_events add constraint case_events_event_type_check
  check (event_type in ('initial_scan','scheduled_scan','manual_scan','merge_decision','status_change','signal_triage'));

-- 9. ADD extra columns to case_events that code references but may be missing
-- These were added in application code but may not be in the schema
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name='case_events' and column_name='commands_executed') then
    alter table public.case_events add column commands_executed jsonb default '[]';
  end if;
  if not exists (select 1 from information_schema.columns where table_name='case_events' and column_name='skills_pulled') then
    alter table public.case_events add column skills_pulled text[] default '{}';
  end if;
  if not exists (select 1 from information_schema.columns where table_name='case_events' and column_name='empowerment_line') then
    alter table public.case_events add column empowerment_line text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name='case_events' and column_name='status') then
    alter table public.case_events add column status text default 'success';
  end if;
  if not exists (select 1 from information_schema.columns where table_name='case_events' and column_name='error_message') then
    alter table public.case_events add column error_message text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name='scan_logs' and column_name='case_results') then
    alter table public.scan_logs add column case_results jsonb default '[]';
  end if;
  if not exists (select 1 from information_schema.columns where table_name='user_settings' and column_name='admin_entity_id') then
    alter table public.user_settings add column admin_entity_id uuid references public.entities(id) on delete set null;
  end if;
  if not exists (select 1 from information_schema.columns where table_name='cases' and column_name='case_number') then
    alter table public.cases add column case_number serial;
  end if;
end $$;

-- 10. ADD triage stats columns to scan_logs
alter table public.scan_logs add column signals_triaged int not null default 0;
alter table public.scan_logs add column signals_assigned int not null default 0;
alter table public.scan_logs add column signals_ignored int not null default 0;
alter table public.scan_logs add column cases_created_from_triage int not null default 0;

-- 11. RENAME trigger for signals (was on messages)
drop trigger if exists protect_message_raw on public.signals;
create trigger protect_signal_raw before update on public.signals
  for each row execute function public.protect_raw_payload();

-- 12. AUTO-UPDATE trigger on tasks.updated_at
create trigger tasks_updated_at before update on public.tasks
  for each row execute function public.update_updated_at();

-- 13. INDEXES for signals
create index if not exists idx_signals_status on public.signals(status) where status = 'pending';
create index if not exists idx_signals_case on public.signals(case_id);
create index if not exists idx_signals_user_date on public.signals(user_id, occurred_at desc);

-- Drop old message indexes (they were renamed automatically with the table)
-- PostgreSQL automatically renames indexes when table is renamed, so these should exist as-is.

-- 14. INDEXES for tasks
create index idx_tasks_case on public.tasks(case_id);
create index idx_tasks_user_status on public.tasks(user_id, status);
create index idx_tasks_due on public.tasks(due_at) where status = 'open';
create index idx_tasks_scheduled on public.tasks(scheduled_at) where status = 'open';

-- 15. RLS for tasks
alter table public.tasks enable row level security;

create policy "Users view own tasks" on public.tasks for select
  using (auth.uid() = user_id);
create policy "Users insert own tasks" on public.tasks for insert
  with check (auth.uid() = user_id);
create policy "Users update own tasks" on public.tasks for update
  using (auth.uid() = user_id);
create policy "Service role on tasks" on public.tasks for all
  using (auth.jwt() ->> 'role' = 'service_role');

-- 16. Update RLS policies that reference old 'messages' table name
-- PostgreSQL renames policies automatically when the table is renamed,
-- so existing policies on 'signals' table should work as-is.

-- 17. REALTIME for signals and tasks
alter publication supabase_realtime add table public.signals;
alter publication supabase_realtime add table public.tasks;

-- 18. Update cases urgency column to int (code uses int 1-5, but schema has text)
-- Check current type and convert if needed
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'cases' and column_name = 'urgency' and data_type = 'text'
  ) then
    alter table public.cases alter column urgency drop default;
    alter table public.cases drop constraint if exists cases_urgency_check;
    alter table public.cases alter column urgency type int using (
      case urgency
        when 'immediate' then 1
        when 'soon' then 2
        when 'normal' then 3
        when 'low' then 4
        else 3
      end
    );
    alter table public.cases alter column urgency set default 3;
    alter table public.cases add constraint cases_urgency_check check (urgency between 1 and 5);
  end if;
end $$;
