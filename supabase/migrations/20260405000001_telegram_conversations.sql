-- Telegram bot conversation history for real-time agent context
create table if not exists telegram_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  chat_id bigint not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

-- Index for fetching recent context per chat
create index idx_tg_messages_chat on telegram_messages(user_id, chat_id, created_at desc);

-- RLS
alter table telegram_messages enable row level security;
create policy "Users see own telegram messages"
  on telegram_messages for select using (auth.uid() = user_id);

-- Auto-cleanup: keep last 100 messages per chat (run periodically or let it grow)
