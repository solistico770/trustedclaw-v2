## Context

TrustedClaw is a case management system where data arrives through gates (WhatsApp, Telegram, email, etc.), is stored as messages, and an AI agent (Gemini 2.5 Flash) periodically scans cases to classify, extract entities, and merge duplicates.

Currently, every ingest call creates a new case with one message. The AI then cleans up by merging related cases after the fact. This creates noise and forces reactive cleanup instead of proactive triage.

The system also lacks actionable tasks — cases describe situations but users can't track specific to-dos with deadlines.

Key files:
- `src/app/api/messages/ingest/route.ts` — ingest endpoint, creates case per message
- `src/lib/agent-scanner.ts` — `scanCase()` orchestrates AI scan per case
- `src/lib/gemini-agent.ts` — `callAgent()` builds prompt, calls Gemini, returns commands
- `src/app/api/agent/scan/route.ts` — cron entry point, loops over due cases

## Goals / Non-Goals

**Goals:**
- Data arrives as signals (pending) — no case created at ingest time
- AI triage pass processes all pending signals holistically, deciding per signal: assign to existing case, create new case, or ignore
- Existing case review scan continues working (with signals instead of messages)
- New task entity tied to exactly one case, with scheduled_at and due_at dates
- AI can create/close/update tasks during case review
- Dedicated /signals and /tasks pages with full filtering
- Case detail page shows signals and tasks in dedicated tabs
- Clean migration of existing messages → signals (backfill as processed)

**Non-Goals:**
- Real-time signal processing (stays cron-based, not event-driven)
- User-facing signal creation UI (signals come from gates only)
- Task dependencies or subtasks (simple flat list per case)
- Changing the AI model or provider (stays Gemini 2.5 Flash)
- Changing the skills system

## Decisions

### 1. Rename `messages` → `signals` (in-place migration)

**Decision**: Rename the table via SQL migration. Add `status` (pending/processed/ignored), `processing_decision` (JSONB), make `case_id` nullable. Backfill existing rows as `status=processed`.

**Why not a separate table**: The data is the same — raw payload from a gate. Having both `messages` and `signals` would mean duplicated storage and confusion about which is the source of truth. Signals ARE what messages were, with triage state added.

**Why not keep `messages` name**: The word "signal" captures the new semantics — it's raw incoming data that hasn't been decided on yet. A "message" implies it belongs somewhere.

### 2. Two-pass cron architecture

**Decision**: The cron loop runs two distinct passes per cycle:

```
Pass 1: Signal Triage
  Input:  all pending signals (limit 20) + summaries of all open cases
  Output: per-signal decisions (assign/create/ignore)
  New function: triageSignals()

Pass 2: Case Review (existing scanCase, modified)
  Input:  cases where next_scan_at <= now (unchanged)
  Output: commands (set_status, propose_entity, create_task, etc.)
  Modified function: scanCase() — reads signals instead of messages
```

**Why two passes not one**: They're fundamentally different operations. Triage is about sorting incoming data. Case review is about evaluating existing situations. Mixing them into one prompt would make the AI context enormous and the prompt confusing.

**Why triage runs first**: New signals should be assigned before case review runs. Otherwise the case review would miss newly-arrived data.

**Runtime budget split**: Pass 1 gets up to 25s, Pass 2 gets the remaining ~30s of the 55s budget.

### 3. Signal triage prompt design

**Decision**: New `triageSignals()` function in `gemini-agent.ts`. Single call with:
- All pending signals (content, gate, sender, timestamp)
- All open case summaries (id, title, summary, importance, first signal content)
- User's context prompt + admin identity

Returns per-signal:
```json
{
  "decisions": [
    { "signal_id": "...", "action": "assign", "case_id": "...", "reasoning": "..." },
    { "signal_id": "...", "action": "create_case", "reasoning": "..." },
    { "signal_id": "...", "action": "ignore", "reasoning": "..." }
  ]
}
```

**Why batch all signals in one call**: The AI needs to see ALL pending signals together to detect patterns (e.g., 5 signals from same sender = one case, not 5). Per-signal calls would lose this holistic view.

**Signal limit**: 20 per triage pass. If more arrive between cycles, they'll be picked up next cycle. This keeps prompt size manageable.

### 4. Tasks table (not reusing entities)

**Decision**: Dedicated `tasks` table with its own columns (scheduled_at, due_at, status, case_id). Each task ALSO creates an entity row (type: "task") for cross-linking visibility.

```sql
CREATE TABLE tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  case_id uuid REFERENCES cases NOT NULL,
  entity_id uuid REFERENCES entities,
  title text NOT NULL,
  description text,
  status text DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  scheduled_at timestamptz,
  due_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

**Why not just entities with metadata JSONB**: Tasks have structured fields (dates, status) that need indexing and querying. Shoving everything into `entities.metadata` would make filtering by due date or status require JSON queries — slow and fragile.

**Why also an entity**: So tasks appear in the entity graph and case-entity linkages. The `entity_id` FK on tasks points to the auto-created entity row.

### 5. New AI commands for triage and tasks

**Triage commands** (used in Pass 1 — triageSignals):
- Not traditional commands — triage returns a decisions array (see Decision 3)

**Task commands** (used in Pass 2 — case review):
- `create_task`: `{ type: "create_task", title: string, description?: string, scheduled_at?: string, due_at?: string }`
- `close_task`: `{ type: "close_task", task_id: string }`
- `update_task`: `{ type: "update_task", task_id: string, title?: string, scheduled_at?: string, due_at?: string }`

These are added to the existing `AgentCommand` union type and `executeCommands` function.

### 6. Ingest route change

**Decision**: `POST /api/messages/ingest` → `POST /api/signals/ingest`. Creates a signal with `status: pending`, `case_id: NULL`. No case creation. Keep old route as redirect/alias for backwards compatibility with existing gate integrations.

### 7. Case detail tab restructure

**Decision**: Case detail tabs change from `[Messages, Agent, Log]` to `[Signals, Tasks, Entities, Agent, Log]`.

- Signals tab: shows all signals linked to this case (replaces Messages tab)
- Tasks tab: shows tasks for this case + inline create button
- Entities tab: existing entity list (promoted from sidebar to tab)
- Agent tab: unchanged
- Log tab: unchanged

### 8. Dashboard stats update

**Decision**: Add two new stats to dashboard header:
- Pending signals count (signals where status=pending)
- Overdue tasks count (tasks where status=open AND due_at < now)

### 9. API routes

New routes:
- `GET /api/signals` — list signals with filters (status, gate_id, case assignment)
- `GET /api/signals/[id]` — single signal detail
- `POST /api/signals/ingest` — new ingest endpoint
- `GET /api/tasks` — list tasks with filters (status, due, scheduled, case)
- `POST /api/tasks` — create task manually
- `GET /api/tasks/[id]` — single task detail
- `POST /api/tasks/[id]/close` — close task
- `POST /api/tasks/[id]/open` — reopen task
- `PUT /api/tasks/[id]` — update task

Modified routes:
- `GET/POST /api/agent/scan` — two-pass architecture
- `POST /api/agent/scan/[caseId]` — reads signals instead of messages

## Risks / Trade-offs

**[Triage prompt size with many open cases]** → Limit open case summaries to top 15 by importance. AI can still miss connections to low-importance cases, but keeps prompt under control.

**[Signals pile up if cron fails]** → Dashboard shows pending signal count prominently. Add alert state when pending > 20 signals. Existing cron monitoring (scan_logs) extended to track triage results.

**[Migration breaks existing message references]** → Table rename via `ALTER TABLE messages RENAME TO signals`. All foreign keys and indexes carry over. Add new columns with defaults. Code references updated in one pass.

**[Two AI calls per cron cycle doubles cost]** → Triage call is lightweight (signal snippets + case summaries). Case review is unchanged. Net increase ~30-40% per cycle, not 100%.

**[Task entity duplication]** → Tasks exist in both `tasks` table and `entities` table. Risk of drift. Mitigation: entity row is auto-created on task creation and has minimal data (just canonical_name = task title, type = "task"). The tasks table is the source of truth for task state.

## Migration Plan

1. **SQL Migration** (single migration file):
   - `ALTER TABLE messages RENAME TO signals`
   - Add columns: `status TEXT DEFAULT 'pending'`, `processing_decision JSONB`
   - `ALTER TABLE signals ALTER COLUMN case_id DROP NOT NULL`
   - `UPDATE signals SET status = 'processed' WHERE case_id IS NOT NULL`
   - Create `tasks` table
   - Update RLS policies for new table names
   - Add indexes on `signals.status`, `tasks.status`, `tasks.due_at`

2. **Code changes** (can be deployed with migration):
   - All references to `messages` → `signals` in queries
   - Ingest route rewritten
   - Agent scanner updated for two-pass
   - New pages and API routes added

3. **Rollback**: Reverse migration renames `signals` back to `messages`, drops added columns and tasks table. Code rollback via git revert.

## Open Questions

- Should manually-created tasks also auto-create entities, or only AI-created ones?
- Should there be a manual "assign signal to case" action from the signals page, or is it AI-only?
- When AI creates a new case from signals, should it batch multiple related pending signals into that case in one decision, or one signal per decision?
