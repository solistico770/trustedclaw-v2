## Context

TrustedClaw is an operational intelligence dashboard (Next.js 16, React 19, Tailwind 4, shadcn/ui, Supabase) that processes WhatsApp/Telegram messages through AI to create cases, extract entities, and assign tasks. The current UI is a traditional sidebar + page navigation pattern where each domain (cases, signals, tasks, entities) lives on its own route. Users constantly lose context jumping between pages. The app uses RTL (Hebrew) layout throughout.

The current component inventory:
- `(dashboard)/layout.tsx` — SidebarProvider + content area (max-w-5xl)
- `(dashboard)/page.tsx` — Dashboard home with metric tiles, gates, AI activity
- `(dashboard)/cases/page.tsx` — Case list with inline expansion
- `(dashboard)/cases/[id]/page.tsx` — Case detail with tabs (signals/tasks/entities/agent/history)
- `(dashboard)/signals/page.tsx` — Signal list with conversation grouping
- `(dashboard)/tasks/page.tsx` — Task list grouped by due date
- `(dashboard)/entities/page.tsx` — Entity grid
- `(dashboard)/entities/[id]/page.tsx` — Entity detail
- `components/app-sidebar.tsx` — Navigation sidebar
- `components/ui/` — shadcn/ui primitives (card, badge, button, input, sheet, sidebar, tabs, etc.)

Backend API routes remain unchanged. All data comes from `/api/*` endpoints returning JSON.

## Goals / Non-Goals

**Goals:**
- Eliminate full-page navigation for domain browsing — cases, signals, tasks, entities accessible without route changes
- Implement drawer-based detail views that layer without losing parent context
- Achieve zero viewport-jump layouts — all scroll happens within bounded containers
- Provide rich filtering, sorting, and search on every list with keyboard-first interaction
- Visualize entity-to-entity relationships through shared cases and signal co-occurrence
- Establish a modern, dense, dark-first design language with micro-animations
- Maintain full RTL (Hebrew) support across all new components

**Non-Goals:**
- No backend/API changes — this is purely a frontend redesign
- No data model changes — entity relationships derived from existing `case_entities` join table
- No authentication or permissions changes
- Not building a full graph database or heavyweight graph visualization library
- Not converting to a desktop app or Electron — stays as web app
- Not adding new business logic (new case types, signal processing rules, etc.)
- Settings, Scan Monitor, and Simulate pages get visual polish only, not architectural rework

## Decisions

### 1. Drawer System: shadcn Sheet + custom stacking vs. Radix Dialog vs. framer-motion custom

**Decision**: Extend shadcn `Sheet` component with a custom `DrawerStack` context provider.

**Rationale**: Sheet already provides accessible slide-over panels with keyboard dismiss and backdrop handling. Building a stacking context on top avoids adding framer-motion (90KB+). The Sheet component uses Radix primitives underneath which handle focus trapping, aria attributes, and escape key correctly. We add a `DrawerStackProvider` that manages a stack of open drawers with z-index layering and nested backdrop dimming.

**Alternatives considered**:
- `framer-motion` AnimatePresence: More animation control but heavy dependency, overkill for slide-overs
- Custom portal-based drawers: More control but would re-implement accessibility that Radix already handles
- Radix Dialog directly: Doesn't have slide-over behavior built in

### 2. Workspace Layout: CSS Grid workspace shell vs. resizable split panes

**Decision**: CSS Grid-based workspace shell with fixed regions (sidebar, toolbar, main, panel). No user-resizable split panes in v1.

**Rationale**: Resizable split panes add complexity (drag handles, persistence, min/max constraints, RTL drag reversal) for marginal benefit. A CSS Grid layout with predefined breakpoints (full-width mobile, 60/40 split on desktop when a panel is open) is simpler, faster to build, and works cleanly with RTL. The drawer system handles detail views; the grid handles the main workspace zones.

**Alternatives considered**:
- `react-resizable-panels`: Good library but adds interaction complexity, RTL edge cases, and another dependency
- Flexbox-based layout: Less precise region control than CSS Grid for this use case

### 3. Routing Strategy: Keep Next.js routes but treat them as workspace state vs. single-page with client state

**Decision**: Hybrid — keep route-based navigation for top-level workspace views (dashboard, cases, signals, tasks, entities) but use client-side drawer state for all detail views. URL reflects the active workspace tab. Drawer state is ephemeral (not URL-persisted).

**Rationale**: Preserves deep-linking to workspace views (bookmarks, sharing links), lets Next.js handle code splitting per view, but avoids the complexity of URL-encoding nested drawer state. When a user opens Case #42 from the cases workspace, the URL stays `/cases` and the drawer opens client-side. This is the Linear/Notion pattern.

**Alternatives considered**:
- Full client-side SPA routing: Loses code splitting, back button behavior, deep links
- URL-persisted drawer state (e.g., `/cases?drawer=case-42`): Complex to manage nested state in URL, brittle with multiple drawers
- Parallel routes (Next.js `@slot`): Overkill, adds routing complexity for what is fundamentally UI state

### 4. Filter System: Client-side filter state with localStorage vs. URL params vs. server-side

**Decision**: Client-side filter state with localStorage persistence for presets. Active filters reflected in URL search params for shareability. Filter/sort logic runs client-side on already-fetched data (lists are typically <500 items).

**Rationale**: The current data volumes (hundreds of cases, thousands of signals) are small enough for client-side filtering with no performance concern. URL params provide shareability. localStorage presets provide personal convenience. No need to add server-side filter endpoints.

### 5. Entity Relationships: Derived from case_entities join vs. dedicated relationship table

**Decision**: Derive relationships at query time from the existing `case_entities` table. Two entities are "connected" if they appear in the same case. Strength = number of shared cases.

**Rationale**: The data already exists. No migration needed. For the current scale (<1000 entities), computing connections on-the-fly from a single API call is fast enough. A dedicated relationship table would require back-fill migration and ongoing sync logic.

**Implementation**: New API endpoint `/api/entities/[id]/connections` that queries case_entities to find co-occurring entities. Returns flat list with connection strength, not a graph structure. Frontend renders as connection badges and a simple radial layout (no heavyweight graph lib).

### 6. Design Token System: Extend existing OKLch tokens vs. replace with new system

**Decision**: Extend the existing OKLch color system in `globals.css`. Add new tokens for glass-morphism, animation durations, and density spacing. Keep the current light/dark theme toggle.

**Rationale**: The existing token system is well-structured. Adding tokens is cheaper and less risky than replacing it. Dark-first means dark mode is the *default* but light mode is still supported.

### 7. Animation Approach: CSS animations/transitions vs. framer-motion

**Decision**: CSS transitions and `@keyframes` animations via Tailwind utilities. No framer-motion.

**Rationale**: The animations needed (drawer slide, fade, scale micro-interactions) are well within CSS capability. Tailwind 4's animation utilities plus `tw-animate-css` (already installed) cover the use cases. Avoiding a 90KB JS animation library for what CSS handles natively.

## Risks / Trade-offs

- **Drawer nesting depth**: More than 2-3 nested drawers becomes confusing. → Mitigation: Cap at 3 levels. Deepest drawer gets a "Open Full View" escape hatch that navigates to the detail route.
- **Mobile experience with drawers**: Drawers on mobile are effectively full-screen overlays. → Mitigation: On mobile (<768px), drawers render as full-screen sheets. The workspace view collapses to single-column.
- **RTL drawer direction**: Drawers must slide from the left in RTL (Hebrew) mode, not right. → Mitigation: Use `dir` attribute detection in DrawerStack to flip animation direction. Test explicitly.
- **Performance with real-time updates**: Dashboard subscribes to multiple Supabase channels. With all panels in memory, more data stays live. → Mitigation: Unmount drawer content when closed (don't persist DOM). Use React.lazy for drawer content components.
- **Filter preset storage**: localStorage presets are device-local and can't sync. → Mitigation: Acceptable for v1. If users request sync, can move to Supabase user_preferences table later.
- **Scope creep**: 10 capability specs is large. → Mitigation: Prioritize in task ordering. Drawer system + workspace shell + design tokens are foundational and must ship together. Individual workspace views (cases, signals, tasks, entities) can ship incrementally.

## Open Questions

- Should the workspace remember which tab was last active across sessions? (Leaning yes, via localStorage)
- What is the maximum number of signals to render in the conversation feed before paginating? (Currently 200, may need virtual scrolling)
- Should entity connection visualization use a radial layout or a simple connection list? (Starting with connection list + badges, can add radial layout as enhancement)
