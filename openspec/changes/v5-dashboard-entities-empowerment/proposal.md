## Why

The system works mechanically (ingest, scan, merge, dedup all fixed in v4) but the UX doesn't tell the owner a story. The dashboard is a flat number bar you can't interact with. Entities exist in the DB but are buried in Settings — you can't see who's who, what's connected, or drill into a person's full history. And the system never tells the owner "you're doing great" — it's cold. Three changes to fix this.

## What Changes

- **Interactive Dashboard** — every stat is clickable and filters the case list. Shows: cases needing attention, most urgent, agent activity, entity count, last scan, empowerment line. Click a stat → list filters. It's a cockpit, not a report.
- **Empowerment Line** — new skill + command. After every scan the agent writes a short empowering message about the owner's management. Displayed on dashboard and in case detail. Examples: "Clean inbox! Only 2 cases need attention today", "You caught the ABC Corp issue early — proactive."
- **Entities Standalone** — moved OUT of Settings into its own nav item. Full entity page: profile (name, type, phone, email, WA, TG), activity log (all messages mentioning this entity across all cases), connected cases, timeline. Entity = a scope into everything about a person/company. Edit, merge, search, filter.

## Capabilities

### New Capabilities

- `interactive-dashboard`: Clickable stats bar that filters case list, empowerment line display, richer metrics (agent scans today, autonomous resolutions, entity network size)
- `empowerment-skill`: New "Empowerment Line" auto-attached skill + `set_empowerment_line` command + DB column + display in dashboard and case detail
- `entity-standalone-page`: Full entity list page (searchable, filterable, case count per entity) + entity detail page (profile, cross-case message log, connected cases timeline, edit, merge)

### Modified Capabilities

- `admin-ui`: Sidebar nav updated (Entities as standalone item), dashboard rebuilt, case detail shows empowerment line
- `agent-scanner`: New `set_empowerment_line` command in executor

## Impact

- DB: add `empowerment_line` text column to case_events
- New API routes: GET /api/entities/[id]/full (messages + cases), PATCH /api/entities/[id], POST /api/entities/merge
- New skill in DB: "Empowerment Line" (auto-attached)
- New command type: set_empowerment_line
- Sidebar: 5 items (Cases, Entities, Simulate, Scanner, Settings)
- Dashboard page: complete rewrite
- New page: /entities (standalone)
- New page: /entities/[id] (detail with timeline)
- Settings: entities tab removed (moved to standalone)
