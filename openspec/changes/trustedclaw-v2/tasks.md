## 1. Infrastructure Setup

- [ ] 1.1 צור Supabase project חדש (trustedclaw-v2)
- [ ] 1.2 צור Vercel project חדש עם Next.js, Shadcn/ui, TypeScript
- [ ] 1.3 צור GitHub repo
- [ ] 1.4 הגדר env vars: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY, CRON_SECRET
- [ ] 1.5 הגדר Supabase Auth — magic link, owner user

## 2. Database Schema

- [ ] 2.1 Migration: `gates` (id, user_id, type, display_name, status, credentials_encrypted, metadata, created_at)
- [ ] 2.2 Migration: `messages` (id, user_id, gate_id, case_id, raw_payload JSONB immutable, sender_identifier, channel_identifier, occurred_at, received_at, created_at) + trigger לblocking UPDATE על raw_payload
- [ ] 2.3 Migration: `cases` (id, user_id, title, summary, status, urgency, importance, merged_into_case_id, next_scan_at, last_scanned_at, message_count, first_message_at, last_message_at, next_action_date, closed_at, created_at, updated_at) + auto-update trigger
- [ ] 2.4 Migration: `entities` (id, user_id, type, canonical_name, aliases[], metadata, status proposed/active/rejected/archived, proposed_by_case_event_id, approved_at, created_at)
- [ ] 2.5 Migration: `case_entities` (id, case_id, entity_id, role, unique case_id+entity_id)
- [ ] 2.6 Migration: `case_events` (id, case_id, user_id, event_type, in_context JSONB, out_raw JSONB, api_commands JSONB, tokens_used, model_used, duration_ms, created_at)
- [ ] 2.7 Migration: `user_settings` (id, user_id unique, context_prompt TEXT, created_at, updated_at)
- [ ] 2.8 Migration: `scan_logs` (id, user_id, triggered_by, run_at, cases_scanned, cases_merged, duration_ms, status, error_message, created_at)
- [ ] 2.9 Migration: `audit_logs` append-only עם trigger blocking UPDATE/DELETE
- [ ] 2.10 RLS על כל טבלה: user_id = auth.uid()
- [ ] 2.11 Indexes: cases(user_id, status, importance), cases(next_scan_at), messages(case_id), entities(user_id, status), case_events(case_id)
- [ ] 2.12 Realtime publications: cases, entities
- [ ] 2.13 Seed: owner user, simulator gate, default context prompt, default user_settings

## 3. Core Libraries

- [ ] 3.1 `src/lib/supabase-server.ts` — service client
- [ ] 3.2 `src/lib/supabase-browser.ts` — browser client
- [ ] 3.3 `src/lib/audit.ts` — logAudit helper
- [ ] 3.4 `src/lib/constants.ts` — DEMO_USER_ID

## 4. Message Ingestion

- [ ] 4.1 `POST /api/messages/ingest` — validate, save message, create case (status=pending), logAudit. Zero AI.
- [ ] 4.2 `POST /api/simulate` — wrapper על ingest עם gate_type=simulator
- [ ] 4.3 `GET /api/messages?case_id=` — messages של case

## 5. Agent Scanner

- [ ] 5.1 `src/lib/agent-scanner.ts` — core scan logic: findCasesToScan, buildContext, callLLM, parseCommands, executeCommands, saveCaseEvent
- [ ] 5.2 `src/lib/gemini-agent.ts` — Gemini call עם context prompt + messages + history → structured JSON response עם commands
- [ ] 5.3 `POST /api/agent/scan` — scheduler endpoint: CRON_SECRET validation, find cases, scan each, save scan_log
- [ ] 5.4 `POST /api/agent/scan/[caseId]` — manual scan for specific case
- [ ] 5.5 Command executor: פונקציה שמקבלת api_commands ומבצעת: set_status, set_urgency, set_importance, set_title, set_summary, set_next_scan, propose_entity, merge_into, close_case
- [ ] 5.6 Merge logic: העברת messages מ-source ל-target, update case statuses, case_history
- [ ] 5.7 Vercel Cron config: vercel.json crons כל 5 דקות
- [ ] 5.8 pg_cron setup SQL: כל דקה

## 6. Case Management API

- [ ] 6.1 `GET /api/cases` — list cases, filters: status, sort_by (importance/last_activity)
- [ ] 6.2 `GET /api/cases/[id]` — case detail: case + messages + entities + case_events + history
- [ ] 6.3 `POST /api/cases/[id]/status` — update status, save audit
- [ ] 6.4 `POST /api/cases/[id]/importance` — manual importance override
- [ ] 6.5 `POST /api/cases/[id]/close` — close case, null next_scan_at

## 7. Entity Management API

- [ ] 7.1 `GET /api/entities` — list entities, filters: status, type, q (search)
- [ ] 7.2 `POST /api/entities/[id]/approve` — status → active
- [ ] 7.3 `POST /api/entities/[id]/reject` — status → rejected
- [ ] 7.4 `POST /api/entities/batch` — batch approve/reject
- [ ] 7.5 `GET /api/entities/[id]` — entity detail + linked cases

## 8. Settings API

- [ ] 8.1 `GET /api/settings/context-prompt` — get current prompt
- [ ] 8.2 `POST /api/settings/context-prompt` — update prompt
- [ ] 8.3 `GET /api/audit` — search audit logs with filters
- [ ] 8.4 `GET /api/scan-logs` — scan history

## 9. Frontend — Layout & Navigation

- [ ] 9.1 Layout component: RTL sidebar (Cases badge, Entities, Simulate, Scan Monitor, Settings), dark mode
- [ ] 9.2 Realtime hooks: useCasesCount (subscribes to cases table changes)
- [ ] 9.3 Auth wrapper + login page (magic link)

## 10. Frontend — Cases Board

- [ ] 10.1 דף `/` — Cases Board: fetch /api/cases, sorted by importance desc
- [ ] 10.2 CaseCard component: title, status badge, importance bar (1-10), urgency badge, entity badges, message count, last activity
- [ ] 10.3 Quick actions: Addressed, Schedule, Close
- [ ] 10.4 Status filter dropdown
- [ ] 10.5 Realtime updates via Supabase

## 11. Frontend — Case Detail

- [ ] 11.1 דף `/cases/[id]` — header: title, status, importance, urgency, entities
- [ ] 11.2 Messages timeline: chronological, sender, content, timestamp
- [ ] 11.3 Agent History tab: CaseEvents timeline — event_type, commands, reasoning, tokens
- [ ] 11.4 Case History section: status/importance changes over time
- [ ] 11.5 Action bar: Start Working, Mark Addressed, Close, Scan Now
- [ ] 11.6 Manual scan button: POST /api/agent/scan/[caseId], show result

## 12. Frontend — Entities

- [ ] 12.1 דף `/entities` — tabs: Pending, Active, All
- [ ] 12.2 Pending tab: entity cards עם Approve/Reject buttons
- [ ] 12.3 Batch select + batch approve/reject
- [ ] 12.4 Search by name

## 13. Frontend — Simulator & Settings

- [ ] 13.1 דף `/simulate` — form: gate_type, sender, channel, message. Send button. Result: message_id + case_id link.
- [ ] 13.2 דף `/settings` — Context Prompt editor: textarea + Save button
- [ ] 13.3 דף `/scan-monitor` — last scan, cases scanned, pending count, "Run Scan Now" button

## 14. Testing

- [ ] 14.1 Smoke test: send message → case created (pending) → manual scan → case updated with title/importance/urgency
- [ ] 14.2 Test: 3 messages same channel → 3 cases pending → scan → agent merges 2 into 1
- [ ] 14.3 Test: entity proposed by agent → visible in Pending tab → approve → active
- [ ] 14.4 Test: CaseEvent saved with full in_context/out_raw/api_commands
- [ ] 14.5 Test: next_scan_at respected by scheduler
- [ ] 14.6 Test: close case → next_scan_at=null, not picked up by scanner

## 15. Deploy & Go-Live

- [ ] 15.1 Deploy to Vercel, add domain tc.kadabrix.com
- [ ] 15.2 Set up pg_cron: `SELECT cron.schedule('agent-scan', '* * * * *', $$...$$)`
- [ ] 15.3 Set real Gemini API key
- [ ] 15.4 Send 5 test messages, verify full flow end-to-end
