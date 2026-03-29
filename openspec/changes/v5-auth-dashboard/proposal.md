## Why

No auth — anyone with the URL sees everything. The app uses a hardcoded DEMO_USER_ID with no login. For production this needs real user auth with admin control. Also, the dashboard layout is a hand-rolled sidebar + cards when shadcn has a proper Sidebar component with collapsible nav, mobile sheet, dark mode — all built-in.

Also: v4 left a bug — second agent call missing `existingEntityNames` param. Fix that too.

## What Changes

- **Add Supabase Auth** — email magic link signup/login first. Phone OTP optional (requires Twilio config in Supabase dashboard — skip for now, add later).
- **Create `profiles` table** — `id` (FK to auth.users), `role` (admin/pending/blocked), `created_at`. Auto-created via trigger on signup.
- **First-signup-is-admin rule** — first user gets `role: admin`. All others get `role: pending`.
- **Admin-only access** — all dashboard pages and API routes require `role: admin`. Pending users see "waiting for approval".
- **Admin user management** — admin can promote/block users from settings.
- **Add Next.js proxy.ts** — checks Supabase session, redirects unauthenticated to login, blocks non-admin.
- **Remove DEMO_USER_ID** — replace all hardcoded user ID with authenticated user's ID.
- **Replace dashboard layout with shadcn Sidebar** — use `npx shadcn@latest add sidebar` + build layout with SidebarProvider, SidebarTrigger, etc. Not a "template" — compose from the sidebar primitives. Add user menu in sidebar footer.
- **Fix v4 bug** — second `callAgent` call missing `existingEntityNames` parameter.

## Capabilities

### New Capabilities

- `supabase-auth`: Email magic link login/signup, session management via `@supabase/ssr` cookies
- `user-roles`: Profiles table, first-user-admin trigger, admin promotion/blocking
- `auth-middleware`: Next.js `proxy.ts` protecting all routes, session validation
- `shadcn-dashboard`: Replace layout with shadcn Sidebar component, responsive, RTL, user menu

### Modified Capabilities

- `agent-scanner`: Remove DEMO_USER_ID, fix missing `existingEntityNames` in second call
- `admin-ui`: All pages wrapped in auth, add user management page

## Impact

- `src/app/(dashboard)/layout.tsx` — rewrite with shadcn Sidebar
- `src/app/login/page.tsx` — new login page
- `src/app/waiting/page.tsx` — new pending user page
- `src/app/auth/callback/route.ts` — new auth callback
- `src/proxy.ts` — new auth middleware
- `src/app/api/**` — all routes get auth check
- `src/lib/supabase-browser.ts` / `supabase-server.ts` — update for cookie-based auth
- `src/lib/constants.ts` — delete DEMO_USER_ID
- `src/lib/agent-scanner.ts` — fix second callAgent missing param
- DB migration — profiles table + trigger + RLS
