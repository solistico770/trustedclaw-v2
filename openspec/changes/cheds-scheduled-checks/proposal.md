## Why

The system's brain (agent scanner) is reactive — it triages incoming signals and reviews cases on schedule. But there's no way to define proactive, recurring checks that monitor system-wide conditions, generate periodic reports, or react to LLM-driven changes. Admins need "Cheds" (scheduled checks) — autonomous tasks that run on intervals or after the LLM changes something, producing reports or taking action without manual intervention.

## What Changes

- New `cheds` table for defining scheduled checks with title, context/instructions, trigger type (interval or after-LLM-change), scheduling fields, and activation toggle
- New `ched_runs` table for logging each execution (trigger reason, result, duration)
- Third pass in the agent scanner: after triage + case review, evaluate due cheds
- Smart triggering: interval-based cheds run on schedule; `after_llm_change` cheds only fire when the current scan cycle actually modified something
- Ched evaluation via Gemini: LLM receives ched instructions + system state summary, returns report text or commands (create_task, etc.)
- New `/cheds` admin screen: list, create, edit, toggle, run-now, view run history
- Sidebar navigation entry for Cheds

## Capabilities

### New Capabilities
- `ched-entity`: Data model for cheds and ched_runs tables, CRUD API routes, RLS policies
- `ched-scanner`: Scanner integration — third pass in agent scan, smart triggering logic, Gemini evaluation prompt, command execution
- `ched-ui`: Admin screen at /cheds — list, create/edit form, toggle active, run-now, run history display

### Modified Capabilities

## Impact

- **Database**: Two new tables (`cheds`, `ched_runs`) with RLS policies and indexes
- **Agent scanner** (`src/lib/agent-scanner.ts`): New `evaluateCheds()` function, scan cycle change tracking
- **Cron handler** (`src/app/api/agent/scan/route.ts`): Third pass after case review, passes change summary to ched evaluator
- **Gemini agent** (`src/lib/gemini-agent.ts`): New prompt builder for ched evaluation
- **API routes**: New `/api/cheds` CRUD + `/api/cheds/[id]/run` for manual trigger
- **UI**: New page, sidebar link, components for ched management
- **Scan logs**: Extended to track cheds_evaluated count
