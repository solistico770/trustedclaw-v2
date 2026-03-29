## 1. Database — Profiles table & trigger

- [ ] 1.1 Create migration: `profiles` table (id, role, display_name, created_at) with FK to auth.users
- [ ] 1.2 Create migration: `handle_new_user()` trigger — first user gets admin, rest get pending
- [ ] 1.3 Add RLS policy on profiles: users can read own profile, admins can read/update all
- [ ] 1.4 Run migration against Supabase

## 2. Auth — Supabase login/signup flows

- [ ] 2.1 Update `src/lib/supabase-browser.ts` — use `createBrowserClient` from `@supabase/ssr` with anon key
- [ ] 2.2 Update `src/lib/supabase-server.ts` — use `createServerClient` from `@supabase/ssr` with cookie handling
- [ ] 2.3 Create `/login/page.tsx` — phone OTP + email magic link forms (shadcn card/input/button)
- [ ] 2.4 Create `/auth/callback/route.ts` — handle magic link redirect, exchange code for session
- [ ] 2.5 Create `/auth/confirm/route.ts` — handle OTP verification if needed

## 3. Auth middleware — proxy.ts

- [ ] 3.1 Create `src/proxy.ts` — read session, redirect unauthenticated to /login, allow /login + /auth/* through
- [ ] 3.2 In proxy: check `profiles.role` — if pending, redirect to `/waiting` page
- [ ] 3.3 Create `/waiting/page.tsx` — "Waiting for admin approval" screen with logout button

## 4. API protection

- [ ] 4.1 Create `src/lib/require-admin.ts` helper — getUser + check profile.role, return 401/403 or { user, profile }
- [ ] 4.2 Add auth check to all API routes (cases, entities, labels, settings, scan-logs, audit, skills, gates)
- [ ] 4.3 Replace all `DEMO_USER_ID` / hardcoded UUID references with `user.id` from session
- [ ] 4.4 Keep `/api/messages/ingest` and `/api/agent/scan` using their own auth (cron secret / API key)
- [ ] 4.5 Delete `DEMO_USER_ID` from `src/lib/constants.ts`

## 5. shadcn dashboard layout

- [ ] 5.1 Add shadcn components: sidebar, sheet, dropdown-menu, avatar, separator, chart (via `npx shadcn@latest add`)
- [ ] 5.2 Rewrite `src/app/(dashboard)/layout.tsx` — shadcn sidebar + header + user menu + RTL
- [ ] 5.3 Create sidebar nav config: Cases, Entities, Scanner, Simulate, Settings (with icons)
- [ ] 5.4 Add user dropdown in header: display name/email, role badge, logout button
- [ ] 5.5 Verify RTL: sidebar on right, text direction, icon positions
- [ ] 5.6 Verify dark mode works with new layout

## 6. User management (admin)

- [ ] 6.1 Create `/settings/users/page.tsx` — list all users, show role, email/phone, created_at
- [ ] 6.2 Add role change buttons: "Make Admin", "Block" per user row
- [ ] 6.3 Create `/api/users/route.ts` — GET (list), PATCH (update role) — admin only
- [ ] 6.4 Add "Users" link to Settings section in sidebar nav

## 7. Cleanup & test

- [ ] 7.1 Audit all Supabase client usages — browser uses anon key, server uses service role only when needed
- [ ] 7.2 Remove any remaining DEMO_USER_ID references (grep entire codebase)
- [ ] 7.3 Test: sign up first user → gets admin
- [ ] 7.4 Test: sign up second user → gets pending → sees waiting screen
- [ ] 7.5 Test: admin promotes second user → they can access dashboard
- [ ] 7.6 Test: all API routes reject unauthenticated calls (401)
- [ ] 7.7 Test: dashboard renders with shadcn layout, sidebar, RTL, dark mode
- [ ] 7.8 Document: README note about enabling Phone provider in Supabase dashboard
