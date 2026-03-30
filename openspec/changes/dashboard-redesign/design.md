## Context

TrustedClaw's home screen (`/`) currently combines dashboard stats and a full case list in one page. The `CasesBoard` component (237 lines) does both: renders 8 stat tiles, a system status bar, search/filter controls, and a sorted case card list. All data comes from `/api/cases` and `/api/cases/stats`.

The sidebar has no "Dashboard" entry — `Cases` is the home link. There's already a `/cases/[id]` detail page but no `/cases` list page.

## Goals / Non-Goals

**Goals:**
- Dashboard (`/`) shows the owner's command center: what needs attention, system health, AI activity summary
- Cases (`/cases`) provides a dedicated, focused case management screen
- Both screens have real-time updates (Supabase Realtime + polling)
- Dashboard loads fast — one API call for all metrics

**Non-Goals:**
- No new database tables or schema changes
- No changes to the case detail page (`/cases/[id]`)
- No changes to signals, tasks, entities, or settings pages
- No redesign of the card/list UI components — reuse existing patterns

## Decisions

### 1. Dashboard layout: Metric cards + activity feed (not charts)

The dashboard uses the existing stat tile pattern (already proven in current page) plus a new "recent activity" feed showing the latest AI decisions and signal processing. No charts or graphs — the data volumes don't warrant them and they add complexity.

**Why not charts**: The system processes dozens/hundreds of signals, not millions. A simple count + recent items list gives more actionable insight than a sparkline chart.

### 2. Dashboard API: Single `/api/dashboard` endpoint

A new endpoint returns everything the dashboard needs in one call:
- Counts: pending signals, 24h signals, open cases, attention cases, overdue tasks, entities
- Gate health: status, last heartbeat, phone/username for each gate
- Recent activity: last 10 AI decisions (from `case_events` with processing details)
- Scanner status: last scan time, next scan, scans today
- Empowerment line

**Why not reuse `/api/cases/stats`**: Stats endpoint is case-focused. Dashboard needs gate health and recent AI activity which don't belong in cases stats.

### 3. Cases page: Extract existing `CasesBoard` component

The cases page is almost exactly the current `page.tsx` minus the top stat tiles and system bar. The case list, search, filters, priority sorting, and action buttons move intact. Minor cleanup: remove dashboard stat click handlers.

### 4. Sidebar: Dashboard icon at top, Cases gets its own entry

Nav order: Dashboard (home icon, `/`) → Cases (clipboard, `/cases`) → Signals → Tasks → Entities → ...

This is the minimal change — add one nav item, change the home link's label/icon.

## Risks / Trade-offs

- **[Risk] Users expect cases at `/`** → The dashboard prominently links to cases, and `/cases` is one click away. The stat tiles on dashboard link to filtered case/signal views.
- **[Risk] Extra API call for dashboard** → One endpoint, one round-trip. Gate health data comes from the existing `gates` table. Recent activity from `case_events` (already indexed).
- **[Risk] Code duplication between dashboard and cases stats** → Dashboard endpoint is self-contained. If stats logic drifts, it's easy to refactor into shared helpers later.
