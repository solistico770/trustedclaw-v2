## Context

TrustedClaw is a Next.js dashboard deployed on Vercel with Supabase PostgreSQL. It manages cases, entities, and messages through AI-driven scanning (Gemini 2.5 Flash). Messages arrive through "gates" — typed entry points (WhatsApp, Telegram, email, etc.) — but currently only the dashboard simulator and direct API calls create messages. There is no live connection to actual messaging platforms.

The user has AWS configured in eu-west-1 with an existing RDS instance for the separate rep/podzb platform. The ClawListener will be a new, independent Docker service on its own EC2 instance.

**Current ingest flow:**
```
Dashboard Simulator → POST /api/messages/ingest → Supabase (case + message) → Cron scan → AI agent
```

**Target flow:**
```
WhatsApp/Telegram → ClawListener (EC2) → POST /api/messages/ingest → Supabase → Cron scan → AI agent
                         ↓
                  Local PostgreSQL (full message archive + LLM query API)
```

## Goals / Non-Goals

**Goals:**
- Capture ALL WhatsApp messages (incoming + outgoing) via whatsapp-web.js session
- Capture ALL Telegram messages (groups + DMs where bot is member) via grammy
- Store complete raw message data locally on EC2 for LLM querying
- Forward normalized messages to TrustedClaw's ingest API in real time
- Auto-register as WhatsApp/Telegram gates on TrustedClaw dashboard
- Backfill last 24 hours of message history on first connection
- Authenticate with TrustedClaw using API keys generated from the dashboard
- Run reliably as a Docker Compose stack with auto-restart

**Non-Goals:**
- Sending messages back through WhatsApp/Telegram (read-only bridge, for now)
- Replacing Supabase or the Vercel-hosted dashboard
- Running the AI agent locally — scanning remains on Vercel's cron
- End-to-end encryption key management for WhatsApp (whatsapp-web.js handles this via the web session)
- Multi-user support — this is a single-user listener for the dashboard owner's accounts
- Using the existing RDS instance — ClawListener is fully self-contained

## Decisions

### 1. EC2 Instance: t3.medium (eu-west-1)
**Choice**: Ubuntu 24.04 LTS on t3.medium (2 vCPU, 4GB RAM, burstable)
**Why**: Puppeteer/Chromium for whatsapp-web.js needs ~1.5GB RAM at steady state. PostgreSQL takes ~500MB. That leaves headroom for the Node.js process and Telegram polling. t3.medium is the sweet spot — t3.small (2GB) is too tight for Chromium + PG.
**Alternative considered**: t3.small — rejected because Chromium OOMs under load. t3.large — overkill for a single-user listener.
**Storage**: 50GB gp3 EBS (messages + media metadata + PG data). gp3 gives 3000 IOPS baseline, sufficient for this workload.

### 2. WhatsApp: whatsapp-web.js (not Baileys)
**Choice**: `whatsapp-web.js` with Puppeteer
**Why**: Most mature library, handles multi-device, session restoration, and provides typed message events. Baileys is lighter but has more frequent breakage from WA protocol changes.
**Trade-off**: Requires headless Chromium (~300MB RAM). Acceptable on t3.medium.
**Session persistence**: Auth state saved to a Docker volume (`/data/wwebjs-auth/`). On restart, session resumes without re-scanning QR.

### 3. Telegram: grammy (not node-telegram-bot-api)
**Choice**: `grammy` framework
**Why**: Modern, TypeScript-native, better middleware pattern, handles rate limits automatically. The older `node-telegram-bot-api` lacks TypeScript and has stale maintenance.
**Mode**: Long polling (not webhooks) — simpler for EC2, no need for TLS certs or public DNS. For a single-user bot, polling latency (~1s) is fine.

### 4. Local PostgreSQL in Docker Compose (not SQLite, not RDS)
**Choice**: PostgreSQL 16 in a Docker Compose service with a named volume
**Why**: Full-text search (`tsvector`), JSONB for raw payloads, and the user's familiarity with PG from Supabase. SQLite can't handle concurrent writes from WA + Telegram + query API. RDS would add latency and cost for what's essentially a local cache.
**Schema**: Mirrors TrustedClaw's `messages` table structure but adds full-text indexes and conversation threading fields.

### 5. Auth: API keys (HMAC-SHA256 hashed, stored in Supabase)
**Choice**: Dashboard generates random 32-byte API keys, stores HMAC-SHA256 hash in a new `api_keys` Supabase table. ClawListener sends the key as `Authorization: Bearer <key>` on every request.
**Why**: Simple, stateless, no OAuth complexity. The key is shown once on generation, never stored in plaintext.
**Alternative considered**: JWT tokens — rejected because they expire and need refresh logic. For a machine-to-machine connection that runs 24/7, a long-lived API key with manual revocation is simpler.
**Middleware**: New `validateApiKey()` middleware on TrustedClaw API routes that checks the bearer token against hashed keys in the `api_keys` table. Falls back to existing Supabase auth for dashboard users.

### 6. LLM Query API: Local Fastify server
**Choice**: Fastify REST API running on port 3100 inside the Docker network, exposed via EC2 security group only to the user's IP
**Why**: Lightweight, fast JSON serialization, schema validation. Express works too but Fastify's built-in validation is useful for LLM tool-calling schemas.
**Endpoints**:
- `GET /query/messages` — search by sender, date range, keywords (full-text), gate type
- `GET /query/conversations` — threaded conversation view by contact
- `GET /query/stats` — message counts, active contacts, gate status
- `POST /query/natural` — accepts a natural language query, translates to SQL via an LLM call (optional, for agent integration)

### 7. Message flow: Fire-and-forget ingest, local-first storage
**Choice**: Store locally FIRST, then forward to TrustedClaw asynchronously. If TrustedClaw is down, messages queue locally and retry with exponential backoff.
**Why**: The local store is the source of truth for the listener. TrustedClaw ingest is a "best effort push" — no data loss if Vercel is temporarily unreachable.
**Retry**: Failed ingests go to a `pending_ingest` table. A background worker retries every 30 seconds with max 5 attempts, then marks as `failed` for manual review.

### 8. Docker Compose architecture
```
docker-compose.yml
├── claw-listener    (Node.js 22, Puppeteer, main process)
│   ├── WhatsApp bridge (whatsapp-web.js)
│   ├── Telegram bridge (grammy)
│   ├── Ingest forwarder (→ TrustedClaw API)
│   ├── LLM Query API (Fastify :3100)
│   └── Gate registration + heartbeat
├── postgres         (PostgreSQL 16, named volume)
└── chromium         (shared via Puppeteer, inside claw-listener container)
```

Single Node.js process with multiple subsystems (not separate containers per bridge) — simpler deployment, shared DB connection pool, easier debugging.

## Risks / Trade-offs

**[WhatsApp session instability]** → whatsapp-web.js depends on WhatsApp Web's internal API which can change without notice. **Mitigation**: Pin `whatsapp-web.js` version, monitor for `disconnected` events, auto-reconnect with session restore. Alert via Telegram bot if WA session drops.

**[WhatsApp ban risk]** → Automating WhatsApp Web technically violates ToS. **Mitigation**: Read-only usage (no sending), no bulk operations, human-initiated QR scan. Low risk for personal use, but not zero.

**[Single point of failure]** → EC2 goes down = no message capture. **Mitigation**: Docker restart policy `unless-stopped`, systemd service to start Docker on boot, CloudWatch basic monitoring (free tier) for CPU/disk alerts. Messages missed during downtime are NOT recoverable from WhatsApp (Telegram has `getUpdates` offset).

**[API key leakage]** → If the EC2 is compromised, the API key can be used to ingest fake messages. **Mitigation**: Keys are scoped to `ingest` permission only (can't read cases or modify data). Dashboard shows last-used timestamp so suspicious activity is visible. One-click revoke.

**[Disk space]** → Media-heavy WhatsApp chats could fill 50GB. **Mitigation**: Store media metadata only (not file content) in the local PG. If media storage is needed later, add Vercel Blob or S3. Retention policy auto-deletes messages older than 90 days from local PG.

**[LLM query API security]** → Exposed on EC2. **Mitigation**: Security group limits access to user's IP only. API key required on all endpoints. No public DNS or TLS (accessed via IP or SSH tunnel).

## Migration Plan

1. **Phase 1 — Dashboard changes**: Add `api_keys` table to Supabase, API key settings page, auth middleware on ingest/gates routes
2. **Phase 2 — EC2 provisioning**: Launch t3.medium, install Docker, deploy docker-compose stack
3. **Phase 3 — Telegram**: Connect Telegram bot, verify messages flow through to TrustedClaw cases
4. **Phase 4 — WhatsApp**: Scan QR, verify messages flow, run 24h backfill
5. **Phase 5 — LLM query**: Enable local query API, test with natural language queries

**Rollback**: Each phase is independent. Remove API key middleware to revert dashboard. Terminate EC2 to stop listener. No data migration needed — TrustedClaw's Supabase data is unaffected.

## Open Questions

1. Should the LLM query API be accessible from the TrustedClaw agent (Vercel → EC2), or only for local/direct use? If yes, needs a public endpoint with proper TLS.
2. Media files (images, voice notes, documents) — store locally on disk, push to S3/Blob, or metadata-only? Current design is metadata-only.
3. Should outgoing messages (sent by the user from WhatsApp/Telegram) also be ingested as cases, or only incoming? Current design captures both for full context.
