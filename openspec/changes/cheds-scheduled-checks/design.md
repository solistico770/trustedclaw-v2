## Context

TrustedClaw's agent scanner runs every minute via Vercel Cron. It does two passes: (1) triage pending signals, (2) review due cases. Both are reactive — they respond to incoming data. There's no mechanism for proactive, recurring checks that monitor conditions, generate reports, or act on system-wide state. Cheds fill this gap as a third scanner pass.

## Goals / Non-Goals

**Goals:**
- Add a `cheds` table for defining scheduled checks with flexible triggering
- Add a `ched_runs` table for execution history/audit
- Integrate ched evaluation as Pass 3 in the existing scanner cron (within the 55s budget)
- Build a Gemini prompt for ched evaluation that provides system state context
- Provide a full CRUD admin screen at `/cheds` with run-now capability
- Support two trigger modes: interval-based and after-LLM-change

**Non-Goals:**
- Cheds do NOT replace or modify case scanning logic
- No webhook/external event triggers (future work)
- No complex dependency chains between cheds
- No per-ched notification channels (reports go to ched_runs log, admin reads them)

## Decisions

### 1. Ched trigger modes: `interval` vs `after_llm_change`

**Interval cheds** have `interval_seconds` and `next_run_at`. After each run, `next_run_at = now + interval_seconds`. The scanner picks them up when due.

**After-LLM-change cheds** have no interval. They run only when the current scan cycle modified something (triaged signals → cases, updated case status/summary, created tasks, etc.). The scan route tracks a `changesOccurred` boolean and passes it to the ched evaluator. These cheds have `next_run_at = NULL` — they're eligible whenever changes happen.

**Why this over event-specific triggers:** Simpler. The scanner already knows if it did work. No need for granular event subscriptions yet.

### 2. Ched evaluation is a lightweight LLM call

Each ched gets its own Gemini call with:
- The ched's title + context (user-written instructions)
- A system state summary (counts of open cases by status, recent scan activity, recent signals)
- For `after_llm_change`: a summary of what just changed this cycle
- Available commands: `generate_report` (free-text output stored in ched_runs), `create_task`, `send_notification` (future)

**Why separate calls per ched (not batched):** Each ched has different instructions and scope. Batching would create confused context. Individual calls are cleaner and errors are isolated.

### 3. Scanner budget sharing

The existing 55s budget is shared. Triage and case review run first (they're more critical). Cheds get whatever time remains. If <5s left, skip cheds this cycle. Ched evaluation is typically fast (small context, simple instructions).

### 4. UI as a standalone page, not a settings tab

Cheds are operational entities (like cases/tasks), not configuration. They get their own `/cheds` route in the workspace toolbar, not buried in settings. This matches the pattern of cases/signals/tasks/entities.

**Why toolbar not sidebar:** Cheds are a primary workspace concept the admin interacts with regularly.

## Risks / Trade-offs

- **[Budget starvation]** → If triage + case review consume full 55s, cheds never run. Mitigation: cheds are lightweight and interval-based, so missing one cycle is fine — they'll catch up next minute.
- **[LLM cost per ched]** → Each active ched = 1 Gemini call per trigger. Mitigation: interval cheds typically run hourly+, not every minute. After-LLM-change cheds only fire when work was done.
- **[State summary staleness]** → System state summary is computed at ched evaluation time, which is after triage+review. This is actually ideal — it reflects the latest state including changes just made.
