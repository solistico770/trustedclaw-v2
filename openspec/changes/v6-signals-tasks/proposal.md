## Why

Every incoming message currently creates its own case immediately. The AI agent then has to merge related cases after the fact. This is backwards — the system generates noise (dozens of thin cases) and forces the AI to clean up instead of making smart decisions upfront. We need a triage layer where raw data lands first, and the AI decides what deserves a case, what belongs to an existing case, and what should be ignored entirely.

Additionally, the system has no concept of actionable tasks. Cases track situations but not specific actions to take. Users need to track deadlines, scheduled actions, and to-dos that emerge from cases.

## What Changes

- **BREAKING**: Messages table renamed to `signals`. Every gate produces signals, not cases.
- **BREAKING**: Ingest API no longer creates a case. It saves a signal with `status: pending` and `case_id: NULL`.
- New AI triage pass (cron pass 1): scans all pending signals + open case summaries, decides per signal: assign to existing case, create new case, or ignore.
- Existing case review (cron pass 2): unchanged logic but now receives signals instead of messages, and can also create/close/update tasks.
- New `tasks` table: actionable items tied to exactly one case, with `scheduled_at` (when to act) and `due_at` (deadline), status open/closed.
- Tasks are also represented as entities (`entity_type: "task"`) for cross-linking visibility.
- New `/signals` page with filters: status, gate, assigned/unassigned, search.
- New `/tasks` page with filters: status, due date, scheduled date, search.
- Case detail page restructured: tabs become Signals, Tasks, Entities, Agent, Log.
- Dashboard stats updated: pending signals count, overdue tasks count.
- New AI commands: `assign_signal`, `ignore_signal`, `create_case_from_signals`, `create_task`, `close_task`, `update_task`.

## Capabilities

### New Capabilities
- `signal-entity`: Signal as the new raw-data entity — replaces messages, has pending/processed/ignored status, nullable case_id, gate linkage, and the full ingest flow change.
- `signal-triage`: AI triage pass that processes pending signals — decides assign/create/ignore per signal, new case_event type, new AI commands.
- `task-entity`: Task as an actionable item tied to a case — open/closed status, scheduled_at, due_at, also an entity type, AI commands to create/close/update.
- `signals-page`: New /signals dashboard page with filters (status, gate, assignment, search) and signal detail view.
- `tasks-page`: New /tasks dashboard page with filters (status, due, scheduled, search), create button, open/close toggle.
- `case-detail-signals-tasks`: Case detail page restructured with Signals and Tasks tabs, updated dashboard stats.

### Modified Capabilities
<!-- No existing specs to modify -->

## Impact

- **Database**: `messages` table renamed to `signals` with new columns (status, processing_decision). New `tasks` table. Migration needed for existing data (backfill status=processed on existing rows).
- **API routes**: `/api/messages/ingest` rewritten (no case creation). New routes: `/api/signals`, `/api/tasks`, `/api/tasks/[id]`. Scan routes updated for two-pass architecture.
- **Agent system**: `gemini-agent.ts` and `agent-scanner.ts` heavily modified — new triage prompt, new commands, two-pass cron logic.
- **UI**: 2 new pages, case detail restructured, dashboard stats updated, sidebar navigation updated.
- **Existing data**: Migration backfills existing messages as processed signals with their current case_id intact.
