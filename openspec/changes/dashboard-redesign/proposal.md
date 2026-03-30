## Why

The home screen (`/`) currently serves double duty as both dashboard and cases list. This means there's no dedicated command center showing system health, recent AI activity, and cross-cutting metrics at a glance. The owner has to mentally piece together what's happening from multiple pages. Splitting dashboard from cases gives each screen a clear purpose — the dashboard is "what needs my attention right now", the cases page is "let me find and manage a specific case".

## What Changes

- **New dashboard home screen** (`/`): A command center with system health, key metrics, recent AI decisions, gate status, and quick links to items needing attention. No case list — just the big picture.
- **New cases page** (`/cases`): Move the full case list (with search, filters, priority sorting) to its own dedicated route. This is where you go to browse, search, and manage cases.
- **Sidebar navigation update**: Add "Dashboard" as the home link (`/`), add "Cases" as a separate nav item (`/cases`).
- **API: dashboard stats endpoint**: Enhance `/api/cases/stats` or create `/api/dashboard` to return all metrics the dashboard needs in one call (gate health, recent decisions, signal velocity, task summary).

## Capabilities

### New Capabilities
- `dashboard-home`: The new dashboard home screen — system health, metrics overview, recent AI activity feed, gate status indicators, pending items summary, empowerment line
- `cases-screen`: Dedicated cases list page at `/cases` — full case list with search, filters, priority sorting, status actions (extracted from current `/` page)

### Modified Capabilities
_(none — no existing spec-level requirements are changing)_

## Impact

- `src/app/(dashboard)/page.tsx` — Complete rewrite to dashboard, remove case list
- `src/app/(dashboard)/cases/page.tsx` — New file (cases list, mostly extracted from current page.tsx)
- `src/components/app-sidebar.tsx` — Add Dashboard + Cases nav items
- `src/app/api/dashboard/route.ts` — New API endpoint for dashboard data (or extend stats)
- `src/app/api/cases/stats/route.ts` — May need to split dashboard stats out
- No database changes needed — all data already exists
- No breaking API changes
