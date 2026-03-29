## Why

v2 has critical UX and data problems that make it unusable:
1. **Entity duplication** — same entity proposed 6-12 times per case. Agent re-proposes on every scan.
2. **No dashboard** — cases board is a flat list with no overview of what's happening.
3. **"Pending" limbo** — cases sit as "pending" forever. Should auto-scan on create or not exist.
4. **Redundant data everywhere** — same info shown multiple times, no dedup.
5. **Can't see case age, can't sort properly** — no sense of time, priority, or size.
6. **No status flow** — closed cases can't reopen, no clear lifecycle.

## What Changes

- **FIX: Entity dedup at DB level** — unique constraint on (case_id, entity canonical_name). Agent checks existing before proposing. Dedup migration for existing data.
- **KILL: "Pending" status** — new cases start as "open" with next_scan_at=now. No pending limbo. Scanner picks up immediately.
- **NEW: Dashboard header** — top stats bar: total open, action needed, critical count, oldest case age, next scan countdown.
- **NEW: Case age** — every case shows "opened X ago" prominently.
- **NEW: Smart sort** — default sort: action_needed first, then by urgency×importance combo, then by age.
- **NEW: Case size indicators** — message count, entity count, scan count shown clearly.
- **FIX: Closed → can reopen** — add "Reopen" button. Closed cases never scanned unless reopened.
- **FIX: Case card redesign** — compact, scannable, no redundancy. Title + one-line summary + 4 key metrics.
- **FIX: Entity display** — deduplicated, max 3 shown with "+N more".
- **NEW: Case list compact mode** — smaller cards, more cases visible.

## Capabilities

### New Capabilities
- `dashboard-header`: Stats bar with counts, critical alerts, oldest case, next scan time
- `entity-dedup`: DB-level dedup + migration + agent-side check before propose

### Modified Capabilities
- `case-management`: Kill pending, open→closed→reopen lifecycle, age tracking
- `admin-ui`: Redesigned cases board with compact cards, smart sort, dashboard header
- `agent-scanner`: Entity dedup check before propose, no duplicate proposals

## Impact

- Migration: dedup existing entities, remove pending status, update cases
- All case UI pages rebuilt
- Agent scanner entity logic changed
- No new tables, just fixes and UI overhaul
