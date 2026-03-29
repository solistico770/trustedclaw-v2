## 1. Fix v4 bug

- [x] 1.1 Verified: `existingEntityNames` param already present in second `callAgent` call — no bug

## 2. Database — profiles table

- [x] 2.1 Created migration: profiles table + handle_new_user trigger (first=admin, rest=pending)
- [x] 2.2 Added RLS on profiles: users read own, admins read/update all, service role full

## 3. Supabase clients rewrite

- [x] 3.1 Rewrote `supabase-browser.ts` — `createBrowserClient` from `@supabase/ssr` (anon key, cookies)
- [x] 3.2 Rewrote `supabase-server.ts` — added `createServerClient` (cookie-based for API routes), kept `createServiceClient` for cron
- [x] 3.3 Created `src/lib/require-admin.ts` — getUser + check profile.role → 401/403 or { user, profile, supabase }

## 4. Auth pages + proxy

- [x] 4.1 Created `src/app/login/page.tsx` — email input → magic link (shadcn card/input/button)
- [x] 4.2 Created `src/app/auth/callback/route.ts` — exchange code for session
- [x] 4.3 Created `src/app/waiting/page.tsx` — "Waiting for admin approval" + logout
- [x] 4.4 Created `src/proxy.ts` — session check, redirect to /login or /waiting, pass through public paths

## 5. API routes — add auth

- [x] 5.1 Updated cases routes (route.ts, [id], stats, status, importance, close) — requireAdmin + user.id
- [x] 5.2 Updated entities routes (route.ts, [id], approve, reject, labels, batch, merge) — requireAdmin + user.id
- [x] 5.3 Updated remaining routes (audit, labels, gates, channels, scan-logs, settings, skills, simulate) — requireAdmin + user.id
- [x] 5.4 Kept `/api/messages/ingest` and `/api/agent/scan` using service client (no session)
- [x] 5.5 Deleted DEMO_USER_ID from constants.ts, removed all references

## 6. shadcn Sidebar + layout

- [x] 6.1 Installed shadcn components: sidebar, sheet, dropdown-menu, avatar, tooltip
- [x] 6.2 Created `src/components/app-sidebar.tsx` — shadcn Sidebar with SidebarProvider, collapsible, mobile sheet
- [x] 6.3 Rewrote `src/app/(dashboard)/layout.tsx` — SidebarProvider wrapper, get user session for sidebar
- [x] 6.4 Added user menu in sidebar footer: email, theme toggle, logout button
- [x] 6.5 RTL support via side="right"

## 7. User management

- [x] 7.1 Created `src/app/api/users/route.ts` — GET list all, PATCH update role (admin only)
- [x] 7.2 Created `src/app/(dashboard)/settings/users/page.tsx` — table with promote/block buttons
- [x] 7.3 Added "Users" nav item in sidebar

## 8. Dashboard client updates

- [x] 8.1 Updated all dashboard pages — removed DEMO_USER_ID, removed user_id query params from all fetches
- [x] 8.2 Layout.tsx gets user email from session for sidebar
- [x] 8.3 Simulate page now calls /api/simulate instead of /api/messages/ingest directly

## 9. Test

- [x] 9.1 Build succeeds (tsc --noEmit passes)
- [ ] 9.2 Login flow works (email magic link) — needs Supabase Auth enabled
- [ ] 9.3 First user gets admin — needs profiles migration run
- [ ] 9.4 API routes reject unauthenticated (401) and non-admin (403)
- [ ] 9.5 Dashboard renders with sidebar, RTL, dark mode
