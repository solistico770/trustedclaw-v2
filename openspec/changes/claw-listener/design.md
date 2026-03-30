## Context

TrustedClaw is a Next.js 16 dashboard deployed on Vercel with Supabase PostgreSQL. It manages cases, entities, and signals through AI-driven scanning (Gemini 2.5 Flash). Signals arrive through "gates" — typed entry points (WhatsApp, Telegram, email, etc.) — but currently only the dashboard simulator and direct API calls create signals. There is no live connection to actual messaging platforms.

The user has AWS configured in eu-west-1. The ClawListener will be a new, independent Docker service on its own EC2 instance.

**Current flow:**
```
Dashboard Simulator → POST /api/signals/ingest → Supabase (signal, pending) → Cron triage → Case
```

**Target flow:**
```
WhatsApp/Telegram → ClawListener (EC2) → POST /api/signals/ingest → Supabase → Cron → AI agent
                         ↕ (Supabase Realtime)
Dashboard Channels tab ←→ ClawListener: QR codes, connect/disconnect, status, conversation pulls
```

## Goals / Non-Goals

**Goals:**
- Capture ALL WhatsApp messages (incoming + outgoing) via whatsapp-web.js session
- Capture ALL Telegram messages (groups + DMs where bot is member) via grammy
- Store complete raw message data locally on EC2 for querying
- Forward normalized signals to TrustedClaw's ingest API in real time
- **Full channel management UX in the dashboard** — WhatsApp QR scan, Telegram bot setup, live status, disconnect/reconnect, history rescan
- **Bidirectional communication via Supabase Realtime** — no open ports on EC2
- Vercel agent-scanner can pull full 24h conversation context from EC2 during case scans
- API key auth for machine-to-machine communication
- 24h backfill on first WhatsApp connection

**Non-Goals:**
- Sending messages back through WhatsApp/Telegram (read-only bridge, for now)
- Replacing Supabase or the Vercel-hosted dashboard
- Running the AI agent locally — scanning remains on Vercel's cron
- Multi-user support — single-user listener for the dashboard owner
- Using the existing RDS instance — ClawListener is fully self-contained

## Decisions

### 1. EC2 Instance: t3.medium (eu-west-1)
**Choice**: Ubuntu 24.04 LTS on t3.medium (2 vCPU, 4GB RAM, burstable)
**Why**: Puppeteer/Chromium needs ~1.5GB RAM. PostgreSQL ~500MB. Headroom for Node.js + Telegram.
**Alternative**: t3.small (2GB) — rejected, Chromium OOMs under load.
**Storage**: 50GB gp3 EBS (3000 IOPS baseline).

### 2. Supabase Realtime as the bidirectional channel (not public HTTP endpoint)
**Choice**: EC2 subscribes to `listener_commands` table via Supabase Realtime. Vercel (dashboard or agent-scanner) writes commands, EC2 responds via `listener_responses` table.
**Why**: No open ports on EC2. No TLS/domain setup. No extra infrastructure. Uses existing Supabase. The dashboard can send commands (request QR, connect TG, pull conversations) and get responses in real time.
**Alternative considered**: EC2 exposes Fastify on public port — rejected because it requires security group management, TLS, and domain setup. Cloudflare Tunnel — rejected as extra dependency.
**Trade-off**: Adds ~500ms latency vs direct HTTP, but acceptable for all use cases (QR refresh, conversation pull).

### 3. Dashboard Channels tab for all WA/TG management
**Choice**: All WhatsApp and Telegram connection management happens in the TrustedClaw dashboard UI — not terminal logs or config files.
**Why**: The user wants achla UX. QR scanning in a terminal is not production-quality. The dashboard already has a settings page with tabs.
**How**: Dashboard sends commands via `listener_commands` table. EC2 responds via `listener_responses`. Dashboard subscribes to Supabase Realtime for live gate metadata updates (heartbeat, status).
**QR flow**: `request_qr` command → EC2 generates QR string → dashboard renders via `qrcode.react`. Auto-refreshes when WA regenerates QR (~60s).

### 4. whatsapp-web.js (not Baileys)
**Choice**: `whatsapp-web.js` with Puppeteer
**Why**: Most mature, handles multi-device, session restoration. QR string available via `qr` event — can relay to dashboard.
**Trade-off**: Requires headless Chromium (~300MB RAM). Acceptable on t3.medium.

### 5. grammy (not node-telegram-bot-api)
**Choice**: `grammy` framework with long polling
**Why**: Modern, TypeScript-native, better middleware. Long polling is simpler than webhooks (no public endpoint).

### 6. Local PostgreSQL in Docker Compose
**Choice**: PostgreSQL 16 in Docker Compose with named volume
**Why**: Full-text search, JSONB, user familiarity from Supabase. SQLite can't handle concurrent writes. RDS would add latency/cost.

### 7. API keys (HMAC-SHA256 hashed)
**Choice**: Dashboard generates random 32-byte keys, stores HMAC-SHA256 hash in Supabase `api_keys` table. ClawListener uses Bearer token auth.
**Why**: Simple, stateless. Key shown once on generation, never stored in plaintext. Better than JWT for 24/7 machine-to-machine.

### 8. Local-first storage with async forwarding
**Choice**: Store in local PG FIRST, then forward to TrustedClaw asynchronously. If TrustedClaw is down, messages queue locally and retry.
**Why**: Local store is source of truth. No data loss if Vercel is temporarily unreachable.
**Retry**: Background worker every 5s, max 10 attempts with exponential backoff.

## Risks / Trade-offs

**[WhatsApp session instability]** → whatsapp-web.js depends on WA Web's internal API. **Mitigation**: Pin version, auto-reconnect, dashboard shows status in real time, notify via Telegram on session drop.

**[WhatsApp ban risk]** → Automating WA Web violates ToS. **Mitigation**: Read-only, no bulk ops, human-initiated QR scan. Low risk for personal use.

**[EC2 single point of failure]** → EC2 down = no capture. **Mitigation**: Docker restart policy, systemd on boot, CloudWatch alerts, dashboard shows offline status immediately via heartbeat gap.

**[Supabase Realtime latency]** → Command/response adds ~500ms vs direct HTTP. **Mitigation**: Acceptable for all use cases. For conversation pull during scan, 10s timeout with graceful degradation.

**[Disk space]** → Media-heavy chats. **Mitigation**: Store metadata only (not file content). 90-day retention policy. 50GB gp3 is generous.

## Migration Plan

1. **Phase 1 — Dashboard**: Supabase migration (api_keys + listener tables), API key auth, Channels tab UX, API Keys tab
2. **Phase 2 — ClawListener**: Docker project, local PG, ingest pipeline, Supabase Realtime command listener
3. **Phase 3 — Telegram**: Connect bot via dashboard, verify signals flow
4. **Phase 4 — WhatsApp**: QR scan via dashboard, verify signals flow, 24h backfill
5. **Phase 5 — Pull integration**: Agent-scanner pulls conversations from EC2 during case scans

**Rollback**: Each phase is independent. Remove middleware to revert dashboard. Terminate EC2 to stop listener.

## Open Questions

1. Should outgoing messages (sent by the user) also be ingested as signals, or only incoming? Current design captures both for full context.
2. Media files — metadata-only for now, but should we add S3/Blob storage later?
3. Should the Channels tab be its own page or a tab within Settings? Current design: tab within Settings.
