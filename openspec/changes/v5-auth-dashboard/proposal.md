## Why

No auth — anyone with the URL sees everything. The app uses a hardcoded DEMO_USER_ID with no login. For production this needs real user auth with admin control. Also, the dashboard is hand-rolled cards/layout when shadcn has a polished free dashboard template with sidebar, charts, tables, and dark mode built-in — no reason to maintain custom UI when a better one exists.

## What Changes

- **Replace dashboard UI with shadcn dashboard template** — sidebar navigation, header, cards, tables, charts. Keep RTL/Hebrew support. Rip out the custom sidebar and layout, use shadcn's dashboard-01 (or similar) as the base. Add missing shadcn components (chart, table, sheet, dropdown-menu, avatar, etc.).
- **Add Supabase Auth** — phone OTP and email magic link signup/login. Supabase handles auth natively (may need to enable Phone provider in Supabase dashboard settings).
- **First-signup-is-admin rule** — first user to sign up gets `role: admin` automatically. All subsequent users get `role: pending`.
- **Admin-only access** — all dashboard pages and API routes require `role: admin`. Pending users see a "waiting for approval" screen.
- **Admin user management** — admin can promote users to admin or revoke access from a settings page.
- **Create `profiles` table** — `id` (FK to auth.users), `role` (admin/pending/blocked), `created_at`. Populated via Supabase trigger on auth.users insert.
- **Add Next.js proxy/middleware** — checks Supabase session on every request, redirects unauthenticated users to login, blocks non-admin from dashboard/API.
- **Remove DEMO_USER_ID** — replace all hardcoded user ID references with the authenticated user's ID from the session.

## Capabilities

### New Capabilities

- `supabase-auth`: Login/signup flows (phone OTP + email magic link), session management, Supabase Auth provider config
- `user-roles`: Profiles table, first-user-admin logic, admin promotion/blocking, role-based access control
- `auth-middleware`: Next.js proxy.ts protecting all routes, session validation, redirect logic
- `shadcn-dashboard`: Replace current layout with shadcn dashboard template, sidebar nav, responsive design, keep RTL

### Modified Capabilities

- `agent-scanner`: Replace hardcoded DEMO_USER_ID with authenticated user ID from session
- `admin-ui`: All pages wrapped in auth check, add user management page under settings

## Impact

- `src/app/(dashboard)/layout.tsx` — complete rewrite with shadcn dashboard layout
- `src/app/(dashboard)/page.tsx` — adapt to new layout components
- `src/app/login/` — new login/signup page
- `src/app/api/**` — all routes get auth check (read user from session, reject if not admin)
- `proxy.ts` — new file, auth middleware
- `src/lib/supabase-browser.ts` / `supabase-server.ts` — add auth helpers
- `src/lib/constants.ts` — remove DEMO_USER_ID
- `supabase/migrations/` — new migration for profiles table + trigger
- `package.json` — add shadcn dashboard components (chart, table, sheet, dropdown-menu, avatar, separator)
- **Supabase dashboard** — user must enable Phone provider and/or Email provider manually
