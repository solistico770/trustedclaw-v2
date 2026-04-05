## Why

The TrustedClaw dashboard forces users to jump between separate pages (cases, signals, tasks, entities) losing context every time. Information loads at the top of scroll, pushing content down. There's no visual connection between entities, and filtering is basic. For an operational intelligence tool where triage speed matters, this friction compounds into lost time and missed connections. It's 2026 — the UX needs to feel like a command center, not a WordPress admin.

## What Changes

- **Drawer-based navigation**: Replace page-level routing for detail views with layered slide-over drawers. Clicking a case opens a drawer; clicking an entity within it opens a nested drawer. Context is never lost.
- **Unified workspace layout**: Replace the current sidebar + single-content-area with a workspace shell that supports split panes, master-detail views, and tabbed panels — all without full page navigation.
- **Fixed viewport architecture**: Eliminate scroll-to-top patterns. All content regions are bounded containers with internal scroll. Headers, toolbars, and filter bars are sticky/fixed. The viewport never jumps.
- **Smart filtering and sorting system**: Every list gets instant filter pills, multi-column sort, type-ahead search, keyboard shortcuts, and saveable filter presets persisted to localStorage.
- **Entity relationship visualization**: When viewing any entity, display connections to other entities — shared cases, signal flow, co-occurrence. Rendered as connection badges and a mini relationship map.
- **2026 design language**: Dense, information-rich layouts. Dark-first design. Subtle glass-morphism on panels. Micro-animations on transitions. Compact data rows with inline expansion. Professional, not playful.
- **RTL-native drawer system**: All drawers, panels, and split-pane layouts must work correctly in RTL (Hebrew) mode, sliding from the correct direction.

## Capabilities

### New Capabilities
- `drawer-system`: Reusable layered drawer/panel component supporting nested drawers, keyboard dismiss, backdrop click, RTL-aware slide direction, and responsive sizing (full-width on mobile, partial on desktop).
- `workspace-shell`: Top-level layout component replacing current sidebar+content. Provides split-pane areas, tab management, and panel state persistence. Manages which drawers/panels are open.
- `smart-filters`: Reusable filtering/sorting system with filter pills, multi-sort controls, type-ahead search, keyboard shortcuts (/ to focus search, Esc to clear), and localStorage-persisted presets.
- `entity-relationships`: Entity detail view showing connections to other entities via shared cases, signal co-occurrence, and explicit links. Connection badges on entity mentions throughout the app.
- `fixed-viewport-layout`: Layout primitives ensuring all content areas use bounded scroll containers, sticky headers, and fixed toolbars. No full-page scroll behavior.
- `design-system-refresh`: Updated color tokens, typography scale, spacing system, glass-morphism mixins, micro-animation tokens, and dark-first defaults across all components.
- `cases-workspace`: Redesigned cases experience using master-detail pattern — case list on one side, case detail in a drawer or split pane. Inline signal preview, task management, entity badges.
- `signals-feed`: Redesigned signals view as a real-time conversational feed with conversation grouping, inline AI decision display, and drawer-based detail expansion.
- `tasks-panel`: Redesigned tasks as a grouped panel (overdue/today/upcoming/no-date) that can live as a standalone view or embedded panel within case drawers.
- `entities-explorer`: Redesigned entity browsing with grid/list toggle, relationship badges, and drawer-based detail with connection visualization.

### Modified Capabilities

## Impact

- **All page components** under `src/app/(dashboard)/` will be rewritten or heavily modified
- **Layout system** (`layout.tsx`, `app-sidebar.tsx`) completely replaced by workspace shell
- **Component library** — new shared components: Drawer, SplitPane, FilterBar, EntityBadge, ConnectionMap, StickyToolbar, BoundedScroll
- **CSS/Design tokens** in `globals.css` updated with new color system, animations, glass-morphism utilities
- **No API changes** — all backend routes remain the same; this is purely frontend
- **No data model changes** — entity relationships already exist in `case_entities` table
- **Dependencies**: may add `framer-motion` for drawer/panel animations, possibly a lightweight graph layout lib for entity connections
