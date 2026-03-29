## Why

Testing revealed 5 critical bugs. Cases get scanned but don't update (no title, no summary). Merge detection fails because context is empty. De-escalation never happens. Entities duplicate in Hebrew. Generic words become entities. The system ingests correctly but the agent brain is broken — it thinks, returns commands, but the results don't stick and it lacks context to make good decisions.

## What Changes

- **FIX: DB update after scan** — `executeCommands` silently loses updates. Add error checking, log failures, verify writes.
- **FIX: Merge context** — include first message content of each open case (not just null titles). Agent can't merge what it can't see.
- **FIX: Entity context** — send existing entity names to agent so it doesn't re-propose. Normalize names before dedup check.
- **FIX: De-escalation** — make "Escalation & De-escalation" auto-attached. Add positive-signal rules to "Urgency & Importance" skill.
- **FIX: Generic entities** — add blocklist to "Entity Attachment" skill.
- **FIX: Skills rebalance** — 6 auto-attached (was 4), 3 pull-on-demand (was 5). Merge + Escalation moved to auto.
- **FIX: First Contact skill** — MUST set title+summary, case is useless without them.

## Capabilities

### New Capabilities

- `scan-reliability`: Verify DB writes after executeCommands, log errors, retry failed updates

### Modified Capabilities

- `agent-scanner`: Richer context (first messages, existing entities, case summaries), error handling on DB writes
- `entity-dedup`: Normalize names (trim, lowercase, strip diacritics), send existing list to agent
- `admin-ui`: No UI changes in this release — backend/skills only

## Impact

- `src/lib/agent-scanner.ts` — executeCommands error handling, richer context assembly
- `src/lib/gemini-agent.ts` — prompt changes: include first messages, existing entities, connected case info
- Skills table — delete all, recreate 9 skills with corrected instructions and auto_attach flags
- No schema changes, no new tables, no UI changes
