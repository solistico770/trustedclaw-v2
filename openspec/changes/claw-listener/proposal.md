## Why

TrustedClaw's AI agent currently only processes messages that arrive through the dashboard simulator or manual API calls. There's no way to automatically capture real-world WhatsApp and Telegram conversations, which means the case management system is blind to the user's actual communication channels. A standalone listener service running on EC2 solves this — it bridges WhatsApp (via whatsapp-web.js/Puppeteer) and Telegram (via Bot API) into the existing gate/signal/case pipeline, enabling the AI agent to monitor, triage, and act on real messages in real time.

## What Changes

- **New standalone Docker service ("ClawListener")** that runs on an AWS EC2 instance in eu-west-1, completely independent of Vercel
- **WhatsApp bridge** using `whatsapp-web.js` (Puppeteer-based) to capture all incoming/outgoing WhatsApp messages, including media metadata
- **Telegram bridge** using the Telegram Bot API (`grammy`) to capture all messages in chats where the bot is a member
- **Local PostgreSQL** inside Docker Compose for storing all raw message data, gate state, session auth, and query-ready structured data
- **Gate auto-registration** — on boot the service registers itself as WhatsApp and Telegram gates
- **Real-time ingest** — every incoming message immediately calls `POST /api/signals/ingest` on TrustedClaw so the cron picks it up
- **24-hour backfill on first boot** — WhatsApp chat history (last 24h) pulled and ingested
- **Supabase Realtime bidirectional channel** — EC2 subscribes to `listener_commands` table. Vercel can ask EC2 for full 24h conversations on demand (during case scans). EC2 responds via `listener_responses` table. No open ports on EC2.
- **Dashboard Channels tab** — full UX for connecting WhatsApp (QR code rendered in dashboard), Telegram (bot token input), live connection status, disconnect/reconnect, and history rescan — all managed through the TrustedClaw UI
- **API key authentication** — new dashboard settings page for generating API keys; the Docker container uses these for all API calls
- **Dashboard API key management** — settings UI for generating, revoking, and listing API keys

## Capabilities

### New Capabilities
- `ec2-listener-core`: Docker Compose service architecture, health checks, auto-restart, logging, and EC2 instance provisioning (Ubuntu 24.04 on t3.medium)
- `whatsapp-bridge`: WhatsApp Web connection via whatsapp-web.js, session persistence, QR auth flow, message capture, 24h backfill, media handling
- `telegram-bridge`: Telegram Bot API integration via grammy, message capture across groups/DMs, long polling mode
- `gate-registration`: Auto-registration of gates with TrustedClaw on boot, heartbeat/status reporting
- `realtime-ingest`: Message normalization pipeline that transforms WhatsApp/Telegram messages into TrustedClaw's signal ingest format and pushes them immediately
- `local-data-store`: PostgreSQL schema for local message storage, full-text search, and retention policies
- `api-key-auth`: Dashboard page for API key generation/revocation + middleware on TrustedClaw API routes to validate bearer tokens from external services
- `supabase-realtime-channel`: Bidirectional command/response channel between Vercel and EC2 via Supabase Realtime — enables Vercel to pull conversations and dashboard to manage WA/TG connections
- `channels-dashboard-ux`: Full Channels tab in settings — WhatsApp QR code display, Telegram bot setup, live connection status, disconnect/reconnect, history rescan — all managed in TrustedClaw dashboard UI

- `entity-commands-split`: Split `propose_entity` agent command into separate `create_entity` (new entity) and `attach_entity` (link existing entity to case) commands — clearer intent for the AI agent
- `custom-entity-types`: Allow users to define custom entity types beyond the hardcoded list, managed via settings UI + stored in a `entity_types` table

### Modified Capabilities
_(none — all TrustedClaw API endpoints already support the ingest/gate patterns needed; only new auth middleware is added)_

## Impact

- **New project**: `claw-listener/` — standalone Node.js/TypeScript Docker project at `/Users/shay/proj/claw-listener/`
- **TrustedClaw dashboard changes**: New Channels tab (WA QR + TG setup UX), new API Keys tab, new auth middleware on API routes, Supabase Realtime subscriptions for live status, new migration with `api_keys`, `listener_commands`, `listener_responses` tables
- **AWS resources**: 1x EC2 t3.medium (eu-west-1), 1x EBS gp3 volume (50GB), security group for SSH only + outbound HTTPS (no inbound data ports — all via Supabase)
- **Dependencies**: `whatsapp-web.js` (Puppeteer), `grammy` (Telegram), `pg` (PostgreSQL), `@supabase/supabase-js` (Realtime), `qrcode.react` (QR rendering in dashboard), `pino` (logging)
- **Security**: API keys stored HMAC-SHA256 hashed in Supabase; WhatsApp session data persisted in Docker volume; Telegram bot token encrypted in gate metadata; no open ports on EC2
