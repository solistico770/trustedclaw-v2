## 1. Dashboard: Supabase Migration

- [x] 1.1 Create migration `20260330000004_api_keys_and_listener.sql` with `api_keys` table (id, user_id, name, key_hash, key_prefix, scopes, last_used_at, revoked_at, created_at) + RLS
- [x] 1.2 Add `listener_commands` table (id, user_id, command, params, status, created_at) + RLS + Realtime publication
- [x] 1.3 Add `listener_responses` table (id, command_id FK, user_id, data, created_at) + RLS
- [x] 1.4 Add indexes on `api_keys(key_hash)` and `listener_commands(user_id, status)`

## 2. Dashboard: API Key Auth

- [x] 2.1 Create `src/lib/api-key-auth.ts` — `validateApiKey(req)`: read Bearer token, HMAC-SHA256 hash, lookup in api_keys, return {user_id, scopes}
- [x] 2.2 Create `src/lib/require-auth.ts` — `requireAuth(req, scope?)`: try cookie auth (requireAdmin), fallback to API key auth
- [x] 2.3 Add API key auth to `src/app/api/signals/ingest/route.ts` — validate Bearer, override user_id from key owner
- [x] 2.4 Add API key auth to `src/app/api/gates/route.ts` and `src/app/api/gates/[id]/route.ts`

## 3. Dashboard: API Keys Settings Tab

- [x] 3.1 Create `src/app/api/settings/api-keys/route.ts` — GET (list keys), POST (generate tc_live_<hex>, hash, store, return raw key once)
- [x] 3.2 Create `src/app/api/settings/api-keys/[id]/route.ts` — DELETE (set revoked_at)
- [x] 3.3 Add "API Keys" tab to settings page TABS array in `src/app/(dashboard)/settings/page.tsx`
- [x] 3.4 Create `ApiKeysTab` component — list keys (prefix, name, last_used, status), generate button with one-time display dialog, revoke button

## 4. Dashboard: Channels Tab UX

- [x] 4.1 Add "Channels" tab to settings page TABS array
- [x] 4.2 Create `ChannelsTab` component — lists available channel types with connection cards
- [x] 4.3 WhatsApp card: "not connected" state with "Connect WhatsApp" button
- [x] 4.4 WhatsApp QR flow: send `request_qr` command to `listener_commands`, subscribe to `listener_responses` for QR string, render QR via `qrcode.react`
- [x] 4.5 WhatsApp QR auto-refresh: timer countdown, automatic QR update when EC2 sends new QR string
- [x] 4.6 WhatsApp connected state: green badge, phone number, last message time, message count, listener status, Disconnect + Rescan buttons
- [x] 4.7 Telegram card: "not connected" state with bot token input field + "Connect Bot" button
- [x] 4.8 Telegram connect flow: send `connect_telegram` command with token, show "Connected as @BotName" on success, error on invalid token
- [x] 4.9 Telegram connected state: green badge, bot username, message stats, Disconnect + Test Connection buttons
- [x] 4.10 Disconnect buttons: send `disconnect_whatsapp`/`disconnect_telegram` commands, update UI to disconnected state
- [x] 4.11 Rescan History button: send `rescan_history` command, show progress (messages found/ingested)
- [x] 4.12 Real-time status updates: subscribe to Supabase Realtime on `gates` table, update connection badges + stats on heartbeat
- [x] 4.13 Offline detection: show yellow "Last seen: X min ago" after 10min without heartbeat, red "Offline" after 30min
- [x] 4.14 Install `qrcode.react` dependency in TrustedClaw project

## 5. ClawListener: Project Scaffolding

- [x] 5.1 Create `/Users/shay/proj/claw-listener/` with `package.json` (Node.js 22, TypeScript, deps: whatsapp-web.js, grammy, pg, @supabase/supabase-js, pino)
- [x] 5.2 Create `tsconfig.json` and project structure: `src/index.ts`, `src/bridges/`, `src/ingest/`, `src/realtime/`, `src/db/`
- [x] 5.3 Create `docker-compose.yml` with `claw-listener` (Node 22 + Puppeteer) and `postgres` (PG 16), named volumes, restart: unless-stopped
- [x] 5.4 Create `Dockerfile` — Node.js 22 base, install Chromium dependencies, copy source, build TypeScript
- [x] 5.5 Create `.env.example` with: TRUSTEDCLAW_URL, TRUSTEDCLAW_API_KEY, TRUSTEDCLAW_USER_ID, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY, TELEGRAM_BOT_TOKEN, LOCAL_DB_URL
- [x] 5.6 Create `src/config.ts` — validate required env vars, exit with clear error on missing

## 6. ClawListener: Local Data Store

- [x] 6.1 Create `sql/init.sql` — `raw_messages` table (id, bridge, chat_id, chat_name, sender_id, sender_name, content, media_type, is_outgoing, message_timestamp, raw_json, forwarded_at, forward_attempts, dedup_hash UNIQUE, created_at)
- [x] 6.2 Add indexes: (bridge, chat_id), (forwarded_at) WHERE NULL, (message_timestamp DESC), GIN on to_tsvector('english', content)
- [x] 6.3 Create `src/db/pool.ts` — pg Pool with health check
- [x] 6.4 Create `src/db/migrate.ts` — run sql/init.sql on startup
- [x] 6.5 Create retention cleanup: delete raw_messages older than 90 days, run daily via setInterval

## 7. ClawListener: Ingest Pipeline

- [x] 7.1 Create `src/ingest/api-client.ts` — HTTP client for TrustedClaw API with Bearer auth header, timeouts, error handling
- [x] 7.2 Create `src/ingest/normalizer.ts` — transform WA/TG messages into unified format {bridge, chat_id, chat_name, sender_id, sender_name, content, is_outgoing, timestamp, raw}
- [x] 7.3 Create `src/ingest/store.ts` — insert into local PG with dedup hash (SHA256 of bridge+chat_id+sender_id+timestamp+content), ON CONFLICT DO NOTHING
- [x] 7.4 Create `src/ingest/forwarder.ts` — background worker every 5s: query pending messages, POST to /api/signals/ingest, mark forwarded_at on success
- [x] 7.5 Create `src/ingest/gate-registration.ts` — on boot: GET/POST gates, store listener_active in metadata
- [x] 7.6 Create `src/ingest/heartbeat.ts` — every 5min: PATCH gate metadata with {status, last_heartbeat, message_count}

## 8. ClawListener: Supabase Realtime Command Listener

- [x] 8.1 Create `src/realtime/command-listener.ts` — subscribe to `listener_commands` via Supabase Realtime (filter by user_id)
- [x] 8.2 Handle `request_qr` command — trigger whatsapp-web.js QR generation, write QR string to `listener_responses`
- [x] 8.3 Handle `connect_telegram` command — validate token via getMe(), start bot, write status to response
- [x] 8.4 Handle `disconnect_whatsapp` / `disconnect_telegram` — stop bridges, write status
- [x] 8.5 Handle `pull_conversations` command — query local PG for messages since param, group by chat, write to response
- [x] 8.6 Handle `rescan_history` command — trigger WhatsApp 24h backfill, write progress to response
- [x] 8.7 Handle `test_connection` command — check bridge status, write latency to response
- [x] 8.8 Handle `get_stats` command — aggregate local PG stats, write to response
- [x] 8.9 Mark processed commands as status: 'completed'

## 9. ClawListener: Telegram Bridge

- [x] 9.1 Create `src/bridges/telegram.ts` — initialize grammy Bot, long-polling mode
- [x] 9.2 Implement `bot.on("message")` — capture text + media from all chats where bot is member
- [x] 9.3 Media handling — extract file_id, file_size, mime_type, caption; format as `[Type: mime, size] caption`
- [x] 9.4 Health check — getMe() every 60s, restart polling after 3 consecutive failures
- [x] 9.5 Wire to ingest pipeline: message → normalize → store locally → forwarder picks up
- [x] 9.6 Support start/stop from command listener (for dashboard connect/disconnect)

## 10. ClawListener: WhatsApp Bridge

- [x] 10.1 Create `src/bridges/whatsapp.ts` — initialize whatsapp-web.js Client with LocalAuth, Puppeteer args (--no-sandbox)
- [x] 10.2 QR event handler — on 'qr', write QR string to latest `request_qr` response AND store for dashboard polling
- [x] 10.3 Ready event — log connected status, update gate metadata, trigger 24h backfill if first connection
- [x] 10.4 Message handlers — on 'message' + 'message_create': capture incoming + outgoing with full metadata
- [x] 10.5 Media handling — extract mime, size, caption; format content as `[Image: mime, size] caption`
- [x] 10.6 24h backfill — iterate all chats, fetch last 50 messages per chat from last 24h, store + forward
- [x] 10.7 Disconnect/reconnect — on 'disconnected': exponential backoff (5 attempts), notify via Telegram if session revoked
- [x] 10.8 Wire to ingest pipeline: message → normalize → store → forwarder
- [x] 10.9 Support start/stop from command listener (for dashboard connect/disconnect)

## 11. ClawListener: Main Entry Point

- [x] 11.1 Create `src/index.ts` — validate config → run DB migration → register gates → start Supabase Realtime listener → start bridges (if previously connected) → start forwarder + heartbeat
- [x] 11.2 Implement structured logging with pino — JSON format, component field (whatsapp|telegram|ingest|realtime|system)
- [x] 11.3 Graceful shutdown — SIGTERM: stop bridges, unsubscribe Realtime, drain DB pool

## 12. Vercel Pull Integration

- [x] 12.1 Modify `src/lib/agent-scanner.ts` in `scanCase()` — before AI call, check if case gates have `listener_active` in metadata
- [x] 12.2 If active listener found: insert `pull_conversations` command, poll `listener_responses` for up to 10s
- [x] 12.3 Append conversation data to AI agent context (extra signals/messages)
- [x] 12.4 Graceful degradation — if timeout, log warning and continue scan without extra context

## 13. Entity Commands Split + Custom Types

- [x] 13.1 Add `entity_types` table to Supabase migration (id, user_id, slug, display_name, icon, color, is_default, created_at) + RLS
- [x] 13.2 Seed default entity types (person, company, project, invoice, bank_account, contract, product, bot, task, other) in migration
- [x] 13.3 Drop `entities_type_check` constraint from `entities` table in migration
- [x] 13.4 Add `create_entity` command type to `AgentCommand` union in `src/lib/gemini-agent.ts` — accepts name, entity_type, role, optional phone/email/whatsapp_number/telegram_handle
- [x] 13.5 Add `attach_entity` command type to `AgentCommand` union — accepts entity_id or name, and role
- [x] 13.6 Implement `create_entity` handler in `src/lib/agent-scanner.ts` — validate entity_type against `entity_types` table, create entity + link to case, fallback to "other" for unknown types
- [x] 13.7 Implement `attach_entity` handler — lookup by entity_id or canonical_name (case-insensitive), link to case, return "not_found" if missing
- [x] 13.8 Rename `propose_entity` to `create_entity` everywhere (no proposal workflow — entities are active immediately)
- [x] 13.9 Update AI agent prompt in `gemini-agent.ts` to use `create_entity` and `attach_entity`, include available entity types list
- [x] 13.10 Add entity types management to settings page — list types, add new type (slug, display_name, icon, color), delete unused types
- [x] 13.11 Create `GET/POST /api/settings/entity-types` route for CRUD
- [x] 13.12 Fetch entity types in agent-scanner and include in AI prompt context

## 14. EC2 Provisioning

- [x] 13.1 Create `deploy/setup-ec2.sh` — install Docker + Docker Compose on Ubuntu 24.04, enable on boot
- [x] 13.2 Create `deploy/README.md` — step-by-step: launch t3.medium eu-west-1, SSH-only security group, setup script, .env config, docker compose up
- [x] 13.3 Document security group: inbound SSH (22) from user IP, outbound 443 (HTTPS) to anywhere, NO inbound data ports
- [ ] 13.4 Test full flow: EC2 boot → docker compose up → connect WhatsApp via dashboard QR → send test message → verify signal in TrustedClaw
