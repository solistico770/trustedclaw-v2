## 1. Design System Foundation

- [x] 1.1 Update `globals.css`: add animation duration tokens (`--duration-fast`, `--duration-normal`, `--duration-slow`), easing tokens (`--ease-out-expo`, `--ease-in-out`), density spacing tokens (`--space-row`, `--space-cell`, `--space-section`), and glass-morphism utility class (`.glass-panel` with backdrop-blur + semi-transparent bg)
- [x] 1.2 Update `globals.css`: set dark mode as default (swap `:root` and `.dark` token blocks, or add media-preference dark default). Add `overflow: hidden` to `html, body` for fixed viewport
- [x] 1.3 Create shared status color map constant at `src/lib/status-colors.ts` — canonical color definitions for case statuses, signal statuses, task statuses, and entity types used consistently across all views
- [x] 1.4 Update typography density: adjust base text sizes in globals.css to 13px body, 11px secondary, 10px label uppercase tracking-wider

## 2. Drawer System

- [x] 2.1 Create `DrawerStackProvider` context at `src/components/drawer-stack.tsx` — manages stack of open drawers (array of `{id, content, title, width}`), provides `openDrawer`, `closeDrawer`, `closeAllDrawers`, `useDrawerStack` hook
- [x] 2.2 Create `DrawerPanel` component in same file — renders each drawer as a slide-over panel using shadcn Sheet primitives. Supports RTL-aware slide direction (detect `dir` attribute), backdrop with stacking dimming, z-index layering, 24px offset for nested drawers
- [x] 2.3 Add keyboard handling: Escape closes topmost drawer, focus trap within active drawer, focus return on close
- [x] 2.4 Add mobile responsive behavior: drawers render full-width on viewports < 768px
- [x] 2.5 Add max nesting enforcement: cap at 3 drawers, close oldest if exceeded. Add content unmounting on drawer close (remove DOM, trigger effect cleanup)

## 3. Fixed Viewport Layout & Workspace Shell

- [x] 3.1 Rewrite `src/app/(dashboard)/layout.tsx` as workspace shell: CSS Grid with regions (sidebar, toolbar, main). Full `100dvh` height, no body scroll. Main content area with `overflow-y: auto`. Wrap children in `DrawerStackProvider`
- [x] 3.2 Create workspace toolbar component at `src/components/workspace-toolbar.tsx` — sticky top bar with: workspace tabs (Dashboard/Cases/Signals/Tasks/Entities), global search input (command-palette trigger on `/`), live pulse indicator, scanner status, user menu
- [x] 3.3 Implement tab-based navigation: clicking workspace tabs updates URL via `router.push` but does not cause full page reload. Store last active tab in localStorage. Highlight active tab
- [x] 3.4 Replace `src/components/app-sidebar.tsx` with slimmed-down sidebar that only shows the TC logo, collapse toggle, and user/theme/logout footer. Remove navigation items (moved to workspace toolbar tabs)

## 4. Smart Filters System

- [x] 4.1 Create reusable `FilterBar` component at `src/components/filter-bar.tsx` — accepts filter config (pill definitions, sort columns, search fields), renders filter pills with counts, multi-sort controls, and search input
- [x] 4.2 Add filter pill interaction: click to toggle, active state styling, OR logic for same category, "Clear all" button. Pill counts update reactively
- [x] 4.3 Add multi-column sort: click column to set primary sort (asc/desc/remove cycle), Shift+click for secondary sort, visual sort indicators
- [x] 4.4 Add keyboard shortcuts: `/` to focus search, Escape to clear search and return focus to list
- [x] 4.5 Add saved filter presets: save/load/delete presets to localStorage keyed by view. Preset dropdown in filter bar
- [x] 4.6 Add URL sync: active filters and sort reflected in URL search params. On load, parse URL params and apply. On filter change, update URL

## 5. Cases Workspace

- [x] 5.1 Rewrite `src/app/(dashboard)/cases/page.tsx` as master list using FilterBar component. Compact single-line rows with columns: #, urgency/importance badges, status dot, title, entity badges, signal count, time, scan timer
- [x] 5.2 Wire case row click to open case detail drawer (instead of `router.push`). Keep inline expand for quick preview as secondary action (e.g., arrow key or chevron)
- [x] 5.3 Rewrite case detail view as drawer content component at `src/components/case-drawer.tsx` — header with case number/title/status/actions, tabbed body (Signals/Tasks/Entities/Agent/History)
- [x] 5.4 Implement Signals tab in case drawer as chat-thread layout with sender avatars, message bubbles, AI decision system messages
- [x] 5.5 Implement Tasks tab using embeddable tasks panel (from task 7.3), filtered to current case, with inline creation
- [x] 5.6 Implement Entities tab with entity connection visualization — type-colored badges with connection lines between entities sharing other cases
- [x] 5.7 Implement Agent tab — scan history cards with empowerment lines, commands executed, skills pulled, collapsible LLM context
- [x] 5.8 Implement History tab — audit log timeline

## 6. Signals Feed

- [x] 6.1 Rewrite `src/app/(dashboard)/signals/page.tsx` using FilterBar. Conversation-grouped feed with avatar, sender, gate icon, last message preview, timestamp, pending count, case link
- [x] 6.2 Add inline conversation expansion: click to show all messages in chat thread within the list (no drawer needed for basic view)
- [x] 6.3 Add signal detail drawer for deep inspection: full content, AI decision reasoning, metadata grid, linked case link
- [x] 6.4 Add real-time "N new signals" floating badge when new signals arrive while scrolled down. Click to scroll to top smoothly. No scroll jump on data arrival
- [x] 6.5 Add bulk status actions: checkbox selection, "Ignore selected" / "Mark processed" buttons

## 7. Tasks Panel

- [x] 7.1 Rewrite `src/app/(dashboard)/tasks/page.tsx` using FilterBar. Grouped display: Overdue (red), Due Today (amber), Upcoming (blue), No Due Date (gray), Completed (green, collapsed by default)
- [x] 7.2 Add collapsible group headers with counts. Empty groups hidden. Smooth animation on task completion (move between groups)
- [x] 7.3 Extract tasks panel as reusable component at `src/components/tasks-panel.tsx` — accepts optional `caseId` prop to filter. When embedded in case drawer, hide case selector in creation form
- [x] 7.4 Add inline task creation at top: title input + case selector + optional due date. Enter to create

## 8. Entities Explorer

- [x] 8.1 Rewrite `src/app/(dashboard)/entities/page.tsx` with FilterBar, type filter pills, and grid/list view toggle (persisted to localStorage)
- [x] 8.2 Implement grid view: responsive card grid with type icon, name, badges, phone/email, connection count badge
- [x] 8.3 Implement list view: compact single-line rows with all entity data visible
- [x] 8.4 Wire entity click to open entity detail drawer (instead of `router.push`)
- [x] 8.5 Create entity detail drawer at `src/components/entity-drawer.tsx` — profile section (editable inline), related cases list, connections panel, recent signals

## 9. Entity Relationships

- [x] 9.1 Create API endpoint `src/app/api/entities/[id]/connections/route.ts` — query `case_entities` to find co-occurring entities, return sorted by shared case count with shared case IDs
- [x] 9.2 Create `EntityBadge` component at `src/components/entity-badge.tsx` — interactive badge with type icon, name, hover tooltip (type, connection count, case count), click opens entity drawer
- [x] 9.3 Add connections panel to entity detail drawer: grouped by strength (Strong: 3+ shared cases, Related: 1-2), each showing entity name, type, shared case count, most recent shared case title. Click to open nested entity drawer
- [x] 9.4 Replace all plain entity name text throughout the app with `EntityBadge` component (case drawer entities tab, case list entity chips, signal sender references)

## 10. Polish & Integration

- [x] 10.1 Add `prefers-reduced-motion` media query support — disable all micro-animations when user prefers reduced motion
- [x] 10.2 Test full RTL flow: drawer slide direction, toolbar layout, filter bar direction, entity badges, grid/list layouts
- [x] 10.3 Test mobile responsive: drawers full-width, workspace single-column, sidebar hidden, filter bar wrapping
- [x] 10.4 Verify Supabase real-time subscriptions work correctly with drawer-based architecture (subscriptions mount/unmount cleanly)
- [x] 10.5 Verify no viewport scroll anywhere — all scroll contained within bounded regions. Test with long lists, drawer overflow content
- [x] 10.6 Performance check: drawer open/close should be <200ms, filter updates <100ms, no jank on real-time signal arrival
