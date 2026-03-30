## 1. Database Migration

- [x] 1.1 Create SQL migration: rename `messages` table to `signals`, add `status` column (text, default 'pending', check in pending/processed/ignored), add `processing_decision` column (JSONB), make `case_id` nullable
- [x] 1.2 Backfill existing rows: `UPDATE signals SET status = 'processed' WHERE case_id IS NOT NULL`
- [x] 1.3 Create `tasks` table with: id, user_id, case_id (FK not null), entity_id (FK nullable), title, description, status (open/closed), scheduled_at, due_at, closed_at, created_at, updated_at
- [x] 1.4 Add RLS policies for `signals` table (update from messages policies) and new `tasks` table
- [x] 1.5 Add indexes: `signals.status`, `signals.case_id`, `tasks.status`, `tasks.due_at`, `tasks.case_id`
- [x] 1.6 Add auto-update trigger on `tasks.updated_at`

## 2. Signal Ingest Rewrite

- [x] 2.1 Create `POST /api/signals/ingest` route: save signal with status=pending, case_id=NULL, return `{ signal_id }`. Preserve gate auto-creation and channel resolution logic
- [x] 2.2 Update or redirect old `POST /api/messages/ingest` route to new signals/ingest for backwards compatibility
- [x] 2.3 Remove case creation logic from ingest (no more `db.from("cases").insert(...)` on ingest)
- [x] 2.4 Remove admin entity auto-linking from ingest (moved to triage/case creation)

## 3. Signal API Endpoints

- [x] 3.1 Create `GET /api/signals` — list signals with filters: status, gate_id, assigned (boolean for case_id null check), search (ilike on raw_payload content + sender_identifier), pagination
- [x] 3.2 Create `GET /api/signals/[id]` — single signal detail with full raw_payload and processing_decision

## 4. Task API Endpoints

- [x] 4.1 Create `POST /api/tasks` — create task with case_id, title, description, scheduled_at, due_at. Auto-create entity (type=task) and case_entities link
- [x] 4.2 Create `GET /api/tasks` — list tasks with filters: status, due (overdue/today/this_week/no_date), scheduled (past/today/upcoming/unscheduled), case_id, search
- [x] 4.3 Create `GET /api/tasks/[id]` — single task detail
- [x] 4.4 Create `PUT /api/tasks/[id]` — update task fields (title, description, scheduled_at, due_at)
- [x] 4.5 Create `POST /api/tasks/[id]/close` — set status=closed, closed_at=now
- [x] 4.6 Create `POST /api/tasks/[id]/open` — set status=open, closed_at=null

## 5. AI Triage System (Pass 1)

- [x] 5.1 Create `triageSignals()` function in `gemini-agent.ts` — builds prompt with pending signals + open case summaries, returns per-signal decisions array
- [x] 5.2 Create `executeTriageDecisions()` function in `agent-scanner.ts` — processes AI decisions: assign signal to case, create new case from signal(s), ignore signal. Updates signal status/case_id/processing_decision
- [x] 5.3 Handle group_key for batching multiple signals into one new case
- [x] 5.4 Auto-link admin entity when creating cases from admin-gate signals (moved from ingest)
- [x] 5.5 Log case_event with event_type="signal_triage" and audit_log entries per signal decision

## 6. Case Review Updates (Pass 2)

- [x] 6.1 Update `scanCase()` — all `db.from("messages")` queries changed to `db.from("signals")`
- [x] 6.2 Update `callAgent()` prompt — reference "signals" instead of "messages" in the prompt text
- [x] 6.3 Add open tasks to case review context — fetch open tasks for the case and include in AI prompt
- [x] 6.4 Add `create_task`, `close_task`, `update_task` to `AgentCommand` type union
- [x] 6.5 Add task command execution in `executeCommands()` — create_task creates task + entity + case_entities, close_task updates status, update_task updates fields
- [x] 6.6 Update merge_into command — change `db.from("messages").update(...)` to `db.from("signals").update(...)`, also move tasks from source case to target case

## 7. Cron Route Two-Pass Architecture

- [x] 7.1 Update `handleScan()` in `/api/agent/scan/route.ts` — run triage pass first (if pending signals exist), then case review pass with remaining budget
- [x] 7.2 Add triage stats to scan_logs: signals_triaged, signals_assigned, signals_ignored, cases_created_from_triage
- [x] 7.3 Update scan response JSON to include triage results

## 8. Signals Page UI

- [x] 8.1 Create `/signals/page.tsx` — signals list with real-time subscription
- [x] 8.2 Add status filter (all/pending/processed/ignored)
- [x] 8.3 Add gate type filter
- [x] 8.4 Add assignment filter (all/assigned/unassigned)
- [x] 8.5 Add search (content + sender)
- [x] 8.6 Add expandable signal detail rows showing full content + processing decision
- [x] 8.7 Add case number links on processed signals (navigate to /cases/[id])

## 9. Tasks Page UI

- [x] 9.1 Create `/tasks/page.tsx` — tasks list with real-time subscription
- [x] 9.2 Add status filter (open/closed/all, default: open)
- [x] 9.3 Add due date filter (all/overdue/today/this_week/no_date)
- [x] 9.4 Add scheduled filter (all/past/today/upcoming/unscheduled)
- [x] 9.5 Add search (title + case number)
- [x] 9.6 Add open/close toggle per task row
- [x] 9.7 Add "Create Task" button with form (case selector, title, dates)
- [x] 9.8 Add overdue visual indicator (red badge on due date)
- [x] 9.9 Add case number links (navigate to /cases/[id])

## 10. Case Detail Page Updates

- [x] 10.1 Restructure tabs: Signals, Tasks, Entities, Agent, Log
- [x] 10.2 Replace Messages tab content with Signals tab — fetch from signals table, same display format
- [x] 10.3 Add Tasks tab — list tasks for this case with open/close toggle + inline "Add Task" form
- [x] 10.4 Promote entities to dedicated Entities tab (move from sidebar/section)
- [x] 10.5 Update case merge logic references from messages to signals in the UI

## 11. Dashboard Updates

- [x] 11.1 Add "Pending Signals" stat card — count of signals where status=pending
- [x] 11.2 Add "Overdue Tasks" stat card — count of tasks where status=open AND due_at < now
- [x] 11.3 Update case cards to show signal count instead of message count
- [x] 11.4 Subscribe to signals and tasks tables for real-time stat updates

## 12. Navigation & Layout

- [x] 12.1 Update sidebar: add Signals and Tasks nav items between Cases and Entities
- [x] 12.2 Add appropriate icons for Signals (inbox/radio) and Tasks (check-square/list-todo)

## 13. Code Cleanup

- [x] 13.1 Search and replace all remaining references to "messages" in codebase (types, variable names, comments) — update to "signals"
- [x] 13.2 Update TypeScript types/interfaces across the codebase
- [x] 13.3 Update simulate route if it calls ingest — adjust for new response format
