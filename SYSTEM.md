# TrustedClaw v6.2 — System Architecture

## Overview

TrustedClaw is an AI-powered case management system that ingests signals from communication channels (WhatsApp, Telegram, email, etc.), triages them with an LLM, and organizes them into cases with entities and tasks.

## Core Concepts

```
Gate → Signal (pending) → Cron Triage → Case → Cron Case Review → AI Agent decisions
```

- **Gate**: A connection point to a communication platform (WhatsApp, Telegram, email, simulator, etc.)
- **Signal**: A raw message from a gate. Status: `pending` → `triaging` → `processed` | `ignored`
- **Case**: A meaningful item that needs attention. Has urgency (1-5), importance (1-5), status
- **Entity**: A real-world thing (person, company, project, invoice, etc.) linked to cases
- **Task**: An actionable item linked to a case, with optional schedule and due date
- **Skill**: An instruction set that guides the AI agent's behavior

## Data Flow

### 1. Signal Ingestion
```
External source → POST /api/signals/ingest (API key auth) → signals table (status: pending)
```
- WhatsApp/Telegram: captured by ClawListener on EC2, forwarded via API key
- Simulator: manual input from dashboard
- Dedup: SHA256 hash of (gate_id + sender + content + timestamp) prevents duplicates

### 2. Signal Triage (Cron Pass 1)
```
Cron every minute → fetch pending signals (batch of 50) → Gemini AI decides per signal:
  - assign → link to existing case
  - create_case → new case created
  - ignore → noise/spam discarded
```
- Loops until no more pending signals or time budget exhausted
- Claims signals as `triaging` to prevent race conditions
- Smart filtering: group chatter, greetings, media noise → IGNORED
- Only actionable content (requests, tasks, deadlines, money) → cases

### 3. Case Review (Cron Pass 2)
```
Fetch cases due for scan (next_scan_at <= now) → Gemini AI reviews each case:
  - set_status, set_urgency, set_importance
  - set_title, set_summary (Hebrew preferred)
  - create_entity / attach_entity
  - create_task / close_task / update_task
  - merge_into (combine duplicate cases)
  - set_empowerment_line (mandatory positive message)
  - pull_skill (request specific skill instructions)
```
- Two-pass: first pass identifies needed skills, second pass uses them
- Scan interval based on urgency × importance matrix (5min to 24h)
- Optional: pulls full 24h conversations from EC2 via Supabase Realtime

## EC2 ClawListener

Standalone Node.js service on AWS EC2 that bridges WhatsApp and Telegram.

**Instance**: `i-0eccad29fbcee5c27` at `63.33.44.64` (eu-west-1, t3.medium)
**Stack**: Node.js 22 + Chromium + PostgreSQL 16 + PM2 (bare metal, no Docker)
**SSH**: `ssh ubuntu@63.33.44.64`
**Project**: `/opt/claw-listener/`

### Architecture
```
WhatsApp (whatsapp-web.js + Puppeteer) ──┐
Telegram (grammy, long-polling) ─────────┤→ Local PostgreSQL (raw_messages)
                                          ├→ Forwarder → POST /api/signals/ingest (every 5s)
                                          ├→ Heartbeat → PATCH /api/gates (every 5min)
                                          └→ Supabase Realtime → listener_commands (subscribe)
```

### Communication: EC2 ↔ Vercel via Supabase Realtime
- **EC2 → Vercel**: pushes signals via API (Bearer token auth)
- **Vercel → EC2**: writes commands to `listener_commands` table, EC2 subscribes via Realtime
- **No open ports on EC2** — all communication through Supabase

### Commands (dashboard → EC2)
| Command | Purpose |
|---------|---------|
| `request_qr` | Start WA session, return QR string for scanning |
| `connect_telegram` | Validate bot token, start polling |
| `disconnect_whatsapp` | Stop WA bridge |
| `disconnect_telegram` | Stop TG bridge |
| `pull_conversations` | Return 24h of conversations from local PG |
| `rescan_history` | Re-scan WA message history |
| `get_stats` | Message counts, bridge status |

### Multi-Gate Support
- Multiple WhatsApp and Telegram gates can run simultaneously
- Each gate has its own Puppeteer/bot instance, keyed by gate_id
- WA session data persisted in `/opt/claw-listener/wwebjs-auth/session-{gate_id}/`

### Deploy Flow
```bash
# Edit locally at /Users/shay/proj/claw-listener/
rsync -avz --exclude node_modules --exclude dist src/ ubuntu@63.33.44.64:/opt/claw-listener/src/
ssh ubuntu@63.33.44.64 "cd /opt/claw-listener && npm run build && pm2 restart claw-listener"
```

## Database (Supabase PostgreSQL)

### Core Tables
| Table | Purpose |
|-------|---------|
| `signals` | Raw messages from gates (was `messages` in v2) |
| `cases` | Managed items with urgency/importance/status |
| `entities` | People, companies, projects linked to cases |
| `case_entities` | Junction: entity ↔ case with role |
| `tasks` | Actionable items linked to cases |
| `case_events` | AI scan history (in_context, out_raw, commands) |
| `gates` | Connection points with metadata (status, heartbeat) |
| `skills` | AI instruction sets (auto-attach or on-demand) |
| `user_settings` | Context prompt, identity, admin_entity_id |
| `entity_types` | Custom entity types with context |
| `api_keys` | HMAC-SHA256 hashed keys for external auth |
| `listener_commands` | Command queue (Vercel → EC2 via Realtime) |
| `listener_responses` | Response queue (EC2 → Vercel) |
| `scan_logs` | Cron run audit trail |
| `audit_logs` | Append-only action log |

### RLS
- All tables: users see only their own data
- Service role: full access (used by cron, ingest)

## Authentication

### Dashboard Users
- Supabase Auth (phone OTP, email magic link)
- Cookie-based sessions via `proxy.ts`
- Admin role check via `profiles` table

### External Services (EC2)
- API key: `Authorization: Bearer tc_live_...`
- HMAC-SHA256 hashed in `api_keys` table
- `validateApiKey()` in `src/lib/api-key-auth.ts`
- Key owner's user_id overrides caller-supplied user_id

### Cron
- `CRON_SECRET` header validation

## AI Agent

### Model
- Google Gemini 2.5 Flash
- JSON response mode
- Two-pass for skill loading

### Context Injection (every AI call)
1. **WHO I AM** — structured identity (name, role, business, phone, email)
2. **Admin entity** — if set
3. **Context prompt** — custom instructions
4. **Entity type contexts** — per-type handling instructions
5. **Auto-attached skills** — always included
6. **Signal history** — last 50 signals for the case
7. **Open cases** — for merge detection
8. **Existing entities** — to avoid re-creating
9. **Open tasks** — for task management
10. **Optional**: full conversations from EC2 listener

### Agent Commands
| Command | Purpose |
|---------|---------|
| `set_status` | Case status (open, action_needed, in_progress, addressed, scheduled, escalated, closed) |
| `set_urgency` | 1=NOW, 2=Today, 3=This week, 4=Can wait, 5=Whenever |
| `set_importance` | 1=Critical, 2=High, 3=Medium, 4=Low, 5=Minimal |
| `set_title` | Case title (Hebrew preferred) |
| `set_summary` | 1-2 sentence summary |
| `set_next_scan` | Override scan schedule (ISO8601) |
| `set_empowerment_line` | Mandatory positive message (max 100 chars) |
| `create_entity` | Create new entity + link to case (validates type against entity_types) |
| `attach_entity` | Link existing entity to case (by name or ID) |
| `merge_into` | Merge case into another |
| `pull_skill` | Request full skill instructions for second pass |
| `create_task` | Create task with optional schedule/due date |
| `close_task` | Mark task as closed |
| `update_task` | Update task fields |

## Signal Content Rules
- **Text only** — only text/caption forwarded to LLM
- **Media metadata** stored locally on EC2 but NOT sent to AI (saves tokens)
- **Direction** — every WA signal clearly shows `ME→party` or `party→ME`
- **Phone numbers** — included in sender identifier
- **Group flag** — signals from groups marked with `[Group: name]`

## Dashboard (Next.js 16 on Vercel)

### Pages
| Route | Purpose |
|-------|---------|
| `/` | Case dashboard with stats, filters, search |
| `/cases/[id]` | Case detail: signals, tasks, entities, agent log |
| `/signals` | All signals with status/gate filters |
| `/tasks` | All tasks with due/schedule filters |
| `/entities/[id]` | Entity detail with cross-case history |
| `/settings` | Gates (WA/TG control), Context Prompt (identity), Skills, API Keys |
| `/simulate` | Test signal injection |
| `/scan-monitor` | Cron performance dashboard |

### Settings Tabs
- **Gates**: Create/connect WA and TG gates, inline QR, connect/disconnect, live status
- **Context Prompt**: Who Am I (structured identity) + custom AI instructions
- **Skills**: Create/edit AI instruction sets (auto-attach or on-demand)
- **API Keys**: Generate/revoke keys for external services

### API Pagination
- Cases, entities, tasks: `?limit=50&offset=0` → `{ data, total, limit, offset }`
- Signals: `?limit=50&offset=0` → `{ signals, total }`

## Cron Configuration
```json
{ "crons": [{ "path": "/api/agent/scan", "schedule": "* * * * *" }] }
```
- Runs every minute
- Guard: skips if previous scan still running
- Budget: 55 seconds max
- Self-continuing: loops until all pending signals triaged
- Reports: signals_triaged, cases_scanned, duration_ms

## Key Files

### TrustedClaw (Vercel)
| File | Purpose |
|------|---------|
| `src/lib/agent-scanner.ts` | Triage + case scan orchestration |
| `src/lib/gemini-agent.ts` | AI prompt building, response parsing |
| `src/lib/api-key-auth.ts` | API key validation (HMAC-SHA256) |
| `src/lib/require-auth.ts` | Unified auth (cookie + API key) |
| `src/lib/require-admin.ts` | Cookie-based admin auth |
| `src/app/api/agent/scan/route.ts` | Cron entry point |
| `src/app/api/signals/ingest/route.ts` | Signal intake + dedup |
| `src/app/api/gates/route.ts` | Gate CRUD (API key auth) |
| `src/app/api/listener/command/route.ts` | Send command to EC2 |
| `src/app/api/listener/response/route.ts` | Read EC2 response |
| `src/proxy.ts` | Auth middleware (Next.js 16 proxy) |
| `vercel.json` | Cron schedule |

### ClawListener (EC2)
| File | Purpose |
|------|---------|
| `src/index.ts` | Main orchestrator |
| `src/bridges/whatsapp.ts` | WA bridge (multi-instance, keyed by gate_id) |
| `src/bridges/telegram.ts` | TG bridge (multi-instance) |
| `src/ingest/forwarder.ts` | Push signals to TrustedClaw |
| `src/ingest/store.ts` | Local PG storage with dedup |
| `src/realtime/command-listener.ts` | Supabase Realtime subscription |
| `src/ingest/heartbeat.ts` | Gate status updates |

## Environment Variables

### TrustedClaw (.env.local)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`
- `CRON_SECRET`
- `API_KEY_HMAC_SECRET`

### ClawListener (.env)
- `TRUSTEDCLAW_URL` (https://tc.app.kadabrix.com)
- `TRUSTEDCLAW_API_KEY` (tc_live_...)
- `TRUSTEDCLAW_USER_ID`
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`
- `TELEGRAM_BOT_TOKEN` (optional)
- `LOCAL_DB_URL` (postgresql://claw:claw@localhost:5432/claw)
