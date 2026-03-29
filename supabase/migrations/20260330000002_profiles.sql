-- Profiles table for user roles (admin/pending/blocked)
-- First signup gets admin, rest get pending

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'pending' check (role in ('admin', 'pending', 'blocked')),
  display_name text,
  created_at timestamptz not null default now()
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
declare
  user_count int;
begin
  select count(*) into user_count from public.profiles;
  insert into public.profiles (id, role)
  values (new.id, case when user_count = 0 then 'admin' else 'pending' end);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS
alter table public.profiles enable row level security;

-- Users can read their own profile
create policy "Users view own profile" on public.profiles
  for select using (auth.uid() = id);

-- Admins can read all profiles
create policy "Admins view all profiles" on public.profiles
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- Admins can update any profile
create policy "Admins update profiles" on public.profiles
  for update using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- Service role full access
create policy "Service role on profiles" on public.profiles
  for all using (auth.jwt() ->> 'role' = 'service_role');
