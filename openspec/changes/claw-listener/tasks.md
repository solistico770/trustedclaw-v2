## 1. Dashboard: API Key Auth (TrustedClaw side)

- [ ] 1.1 Create Supabase migration for `api_keys` table (id, user_id, name, key_hash, key_prefix, permissions, last_used_at, created_at, revoked_at) with RLS policies
- [ ] 1.2 Create `src/lib/api-key-auth.ts` — `validateApiKey()` middleware that hashes bearer token, checks against `api_keys` table, returns user_id
- [ ] 1.3 Add API key auth middleware to `/api/messages/ingest`, `/api/gates`, `/api/gates/[id]` routes (fallback to Supabase session auth)
- [ ] 1.4 Create API key settings page at `/settings/api-keys` — list keys (name, prefix, last_used, status), generate new key dialog, revoke button
- [ ] 1.5 Create `POST /api/settings/api-keys` route — generate 32-byte key, store HMAC-SHA256 hash, return plaintext key once
- [ ] 1.6 Create `DELETE /api/settings/api-keys/[id]` route — set revoked_at, verify ownership

## 2. ClawListener: Project Scaffolding

- [ ] 2.1 Create new `claw-listener/` directory with `package.json` (Node.js 22, TypeScript, dependencies: whatsapp-web.js, grammy, pg, fastify, pino)
- [ ] 2.2 Create `tsconfig.json` and basic TypeScript project structure: `src/index.ts`, `src/bridges/`, `src/ingest/`, `src/query/`, `src/db/`
- [ ] 2.3 Create `docker-compose.yml` with `claw-listener` service (Node.js 22 + Puppeteer) and `postgres` service (PG 16), named volumes for data and wwebjs-auth
- [ ] 2.4 Create `Dockerfile` — Node.js 22 base, install Chromium dependencies, copy source, build TypeScript
- [ ] 2.5 Create `.env.example` with all required variables: TRUSTEDCLAW_URL, TRUSTEDCLAW_API_KEY, TRUSTEDCLAW_USER_ID, TELEGRAM_BOT_TOKEN, POSTGRES_PASSWORD, LLM_QUERY_PORT, LLM_QUERY_KEY
- [ ] 2.6 Create `src/config.ts` — validate all required env vars on startup, exit with clear error if missing

## 3. ClawListener: Local Data Store

- [ ] 3.1 Create `src/db/migrate.ts` — SQL migration that creates `messages`, `conversations`, `pending_ingest`, `config` tables with indexes
- [ ] 3.2 Create `messages` table: id (UUID), external_id (unique), gate_type, chat_id, chat_name, sender_id, sender_name, direction, body, media_type, media_metadata (JSONB), raw_payload (JSONB), occurred_at, stored_at, ingested_at, trustedclaw_case_id, body_tsv (tsvector)
- [ ] 3.3 Create `conversations` table: id (UUID), gate_type, chat_id (unique per gate_type), chat_name, participant_count, last_message_at, message_count, created_at
- [ ] 3.4 Create `pending_ingest` table: id, message_id (FK), payload (JSONB), attempts, last_attempt_at, status (pending/failed), created_at
- [ ] 3.5 Create full-text search trigger on `messages.body` → `body_tsv` using `to_tsvector('english', NEW.body)`
- [ ] 3.6 Create `src/db/pool.ts` — pg Pool connection with health check query
- [ ] 3.7 Create retention cleanup function: delete messages older than 90 days, run daily via setInterval

## 4. ClawListener: Gate Registration

- [ ] 4.1 Create `src/ingest/gate-registration.ts` — on boot, GET /api/gates to find existing WA/TG gates, POST /api/gates if not found, store gate IDs locally
- [ ] 4.2 Create `src/ingest/heartbeat.ts` — every 5 minutes, PATCH /api/gates/<id> with connection status and message counts
- [ ] 4.3 Create `src/ingest/api-client.ts` — HTTP client wrapper for TrustedClaw API calls with API key auth header, timeouts, error handling

## 5. ClawListener: Message Ingest Pipeline

- [ ] 5.1 Create `src/ingest/normalizer.ts` — transform WA/TG message objects into TrustedClaw ingest format (gate_id, gate_type, sender_name, channel_name, content, user_id)
- [ ] 5.2 Create `src/ingest/forwarder.ts` — POST normalized message to TrustedClaw /api/messages/ingest, on failure insert into pending_ingest
- [ ] 5.3 Create `src/ingest/dedup.ts` — generate deterministic external_id from {gate_type}:{chat_id}:{message_id}:{timestamp}, check local DB before forwarding
- [ ] 5.4 Create `src/ingest/retry-worker.ts` — background loop every 30s, process pending_ingest with exponential backoff (max 5 attempts), mark failed after exhaustion
- [ ] 5.5 Create `src/ingest/store.ts` — insert message into local messages table, upsert conversation record, return message with generated ID

## 6. ClawListener: WhatsApp Bridge

- [ ] 6.1 Create `src/bridges/whatsapp.ts` — initialize whatsapp-web.js Client with Puppeteer, session path `/data/wwebjs-auth/`, handle QR event (log to terminal)
- [ ] 6.2 Implement `message` and `message_create` event handlers — capture incoming + outgoing messages with full metadata (body, sender, chat, timestamp, media info)
- [ ] 6.3 Implement media message handling — extract mime type, size, caption; format content as `[Image: image/jpeg, 245KB] caption`
- [ ] 6.4 Implement 24h backfill — on `ready` event, if no messages in local DB, iterate chats, fetch last 50 messages per chat from last 24h, store + forward
- [ ] 6.5 Implement disconnect/reconnect — listen for `disconnected` event, exponential backoff reconnection (5 attempts), notify via Telegram if session revoked
- [ ] 6.6 Wire WhatsApp bridge to ingest pipeline: message → store locally → dedup check → normalize → forward to TrustedClaw

## 7. ClawListener: Telegram Bridge

- [ ] 7.1 Create `src/bridges/telegram.ts` — initialize grammy Bot with long polling, validate token on startup
- [ ] 7.2 Implement message handler via `bot.on("message")` — capture text, media, sender info, chat info for all message types
- [ ] 7.3 Implement media message handling — extract file_id, file_size, mime_type, caption; format content like WhatsApp bridge
- [ ] 7.4 Implement health check — `getMe()` every 60s, log warning on failure, restart polling after 3 consecutive failures
- [ ] 7.5 Wire Telegram bridge to ingest pipeline: message → store locally → dedup check → normalize → forward to TrustedClaw
- [ ] 7.6 Log note on first connection: "Telegram does not support historical backfill"

## 8. ClawListener: LLM Query API

- [ ] 8.1 Create `src/query/server.ts` — Fastify server on LLM_QUERY_PORT, bearer token auth via LLM_QUERY_KEY, health endpoint
- [ ] 8.2 Create `GET /query/messages` — search with params: sender, chat, gate_type, q (full-text), from, to, limit, offset
- [ ] 8.3 Create `GET /query/conversations` — list conversations with gate_type filter and sort_by options
- [ ] 8.4 Create `GET /query/conversations/:chatId/messages` — paginated thread view
- [ ] 8.5 Create `GET /query/stats` — total messages, messages today/week, active conversations, by gate type, top senders
- [ ] 8.6 Create `POST /query/natural` (optional) — natural language to SQL via Gemini API, return results + generated SQL

## 9. ClawListener: Main Entry Point & Orchestration

- [ ] 9.1 Create `src/index.ts` — validate config, run DB migrations, register gates, start WA bridge, start TG bridge, start query API, start retry worker, start heartbeat
- [ ] 9.2 Implement structured logging with pino — JSON format, component field (whatsapp|telegram|ingest|query|system), configurable log level
- [ ] 9.3 Implement graceful shutdown — SIGTERM handler closes WA session, stops TG polling, drains DB pool, stops Fastify

## 10. EC2 Provisioning

- [ ] 10.1 Create `deploy/setup-ec2.sh` — install Docker + Docker Compose on Ubuntu 24.04, enable Docker service on boot
- [ ] 10.2 Create `deploy/README.md` — step-by-step: launch t3.medium in eu-west-1, security group (SSH + outbound HTTPS), run setup script, configure .env, docker compose up
- [ ] 10.3 Document security group rules: inbound SSH (22) from user IP only, outbound 443 (HTTPS) to anywhere, optionally inbound LLM_QUERY_PORT from user IP
- [ ] 10.4 Test full flow: EC2 boot → docker compose up → QR scan → send test WhatsApp message → verify case appears in TrustedClaw dashboard
