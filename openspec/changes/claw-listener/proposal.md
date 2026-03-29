## Why

TrustedClaw's AI agent currently only processes messages that arrive through the dashboard simulator or manual API calls. There's no way to automatically capture real-world WhatsApp and Telegram conversations, which means the case management system is blind to the user's actual communication channels. A standalone listener service running on EC2 solves this — it bridges WhatsApp (via whatsapp-web.js/Puppeteer) and Telegram (via Bot API) into the existing gate/message/case pipeline, enabling the AI agent to monitor, triage, and act on real messages in real time.

## What Changes

- **New standalone Docker service ("ClawListener")** that runs on an AWS EC2 instance in eu-west-1, completely independent of Vercel
- **WhatsApp bridge** using `whatsapp-web.js` (Puppeteer-based) to capture all incoming/outgoing WhatsApp messages, including media metadata
- **Telegram bridge** using the Telegram Bot API (`grammy`) to capture all messages in chats where the bot is a member
- **Local PostgreSQL** inside Docker Compose for storing all raw message data, gate state, session auth, and query-ready structured data
- **Gate auto-registration** — on boot the service calls `POST /api/gates` on the TrustedClaw dashboard to register itself as a WhatsApp and Telegram gate
- **Real-time ingest** — every incoming message immediately calls `POST /api/messages/ingest` on TrustedClaw, setting `next_scan_at = now()` so the AI agent picks it up in the next cron cycle
- **24-hour backfill on first boot** — WhatsApp chat history (last 24h) and Telegram message history are pulled and ingested in bulk
- **API key authentication** — new dashboard settings page where the user generates API keys; the Docker container uses these keys to authenticate all calls to TrustedClaw APIs
- **LLM query endpoint** — local REST API that exposes stored message data for on-demand LLM queries (structured search, context retrieval, conversation threads)
- **Dashboard API key management** — new settings UI in TrustedClaw for generating, revoking, and listing API keys that external services (like ClawListener) use

## Capabilities

### New Capabilities
- `ec2-listener-core`: Docker Compose service architecture, health checks, auto-restart, logging, and EC2 instance provisioning (Ubuntu 24.04 on t3.medium)
- `whatsapp-bridge`: WhatsApp Web connection via whatsapp-web.js, session persistence, QR auth flow, message capture, 24h backfill, media handling
- `telegram-bridge`: Telegram Bot API integration via grammy, message capture across groups/DMs, history backfill, webhook vs polling modes
- `gate-registration`: Auto-registration of gates with TrustedClaw on boot, heartbeat/status reporting, credential rotation
- `realtime-ingest`: Message normalization pipeline that transforms WhatsApp/Telegram messages into TrustedClaw's ingest format and pushes them immediately
- `local-data-store`: PostgreSQL schema for local message storage, conversation threading, full-text search, and retention policies
- `api-key-auth`: Dashboard page for API key generation/revocation + middleware on TrustedClaw API routes to validate bearer tokens from external services
- `llm-query-api`: Local REST endpoint for LLM to query stored messages — search by sender, date range, keywords, conversation context

### Modified Capabilities
_(none — all TrustedClaw API endpoints already support the ingest/gate patterns needed; only new auth middleware is added)_

## Impact

- **New repository**: `claw-listener` — standalone Node.js/TypeScript Docker project, NOT part of the TrustedClaw Next.js app
- **TrustedClaw dashboard changes**: New API key settings page, new auth middleware on API routes (`/api/messages/ingest`, `/api/gates`, `/api/agent/scan/*`)
- **AWS resources**: 1x EC2 t3.medium (eu-west-1), 1x EBS gp3 volume (50GB), security group for SSH + HTTPS outbound
- **Dependencies**: `whatsapp-web.js` (Puppeteer), `grammy` (Telegram), `pg` (PostgreSQL), `express` or `fastify` (local API)
- **Security**: API keys stored hashed in Supabase `api_keys` table; WhatsApp session data encrypted at rest on EC2; Telegram bot token in Docker secrets
- **Existing RDS**: Not used — ClawListener gets its own local PostgreSQL in Docker Compose to keep it fully self-contained (the existing RDS at `podn.csvzbdjhl4g1.eu-west-1.rds.amazonaws.com` remains for the rep/podzb platform)
