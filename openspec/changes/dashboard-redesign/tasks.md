## 1. API

- [x] 1.1 Create `src/app/api/dashboard/route.ts` — single endpoint returning all dashboard data: metric counts, gate health list, recent 10 case events with case details, scanner status, latest empowerment line
- [x] 1.2 Update `/api/cases` to support `?filter=critical` query param (urgency ≤ 1)

## 2. Cases Page

- [x] 2.1 Create `src/app/(dashboard)/cases/page.tsx` — extract case list from current `page.tsx`: search, status filter, priority sorting, case cards with entities, hover actions (Done/Close)
- [x] 2.2 Support URL query params `?status=` and `?filter=critical` for pre-filtering from dashboard links
- [x] 2.3 Add auto-refresh (30s interval + Supabase Realtime on `cases` table)

## 3. Dashboard Home

- [x] 3.1 Rewrite `src/app/(dashboard)/page.tsx` as dashboard command center: empowerment banner, metric tiles (clickable, linking to `/cases`, `/signals`, `/tasks`, `/entities`), system status bar
- [x] 3.2 Add gate health section — show each gate with connection status, heartbeat indicator (online/offline), phone/username, message count
- [x] 3.3 Add recent AI activity feed — last 10 case events showing case #, title, AI action, time ago, entities involved, clickable to case detail
- [x] 3.4 Wire dashboard to `/api/dashboard` endpoint, add auto-refresh (30s + Realtime on `cases`, `signals`, `case_events`)

## 4. Navigation

- [x] 4.1 Update `src/components/app-sidebar.tsx` — change home link label to "Dashboard" with LayoutDashboard icon, add "Cases" entry at `/cases` with ClipboardList icon

## 5. Verification

- [x] 5.1 Verify dashboard loads with all sections populated, metric tiles link correctly
- [x] 5.2 Verify `/cases` shows full case list with filters working, quick actions work
- [x] 5.3 Verify sidebar highlights correct page for `/` and `/cases`
