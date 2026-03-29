## Why

No auth — anyone with the URL sees everything. Hardcoded DEMO_USER_ID, all APIs take user_id as query param, service role key used everywhere. For production: real login, admin-only access, proper session-based auth.

Dashboard sidebar is custom-built and lacks collapse, mobile support, and user menu. shadcn has a `sidebar` component with all of this built-in.

Also: v4 bug — second `callAgent` call missing `existingEntityNames` param on line 114.

## What Changes

- **Supabase Auth with email magic link** — no phone OTP (needs Twilio, skip for now). Simple: enter email → get link → click → logged in.
- **`profiles` table** — auto-created on signup via trigger. First user = admin, rest = pending.
- **proxy.ts** — intercepts all requests. No session → `/login`. Not admin → `/waiting`.
- **`requireAdmin()` helper** — all API routes switch from `user_id` query param to session-based auth. Returns 401/403 or `{ user, profile }`.
- **Remove DEMO_USER_ID** — delete constant, replace all references with `user.id` from session.
- **Supabase clients rewrite** — browser: `createBrowserClient` from `@supabase/ssr` (cookie-based, anon key). Server: `createServerClient` from `@supabase/ssr` (cookie-based for API routes) + keep `createServiceClient` for cron/scanner only.
- **shadcn Sidebar component** — `npx shadcn@latest add sidebar`. Replace custom sidebar with SidebarProvider + collapsible nav + user menu footer + mobile sheet. Keep RTL.
- **User management page** — admin can see all users, promote to admin or block.
- **Fix v4 bug** — add missing `existingEntityNames` to second `callAgent` call.

## Capabilities

### New Capabilities

- `supabase-auth`: Email magic link login, session cookies via `@supabase/ssr`, auth callback route
- `user-roles`: Profiles table + trigger (first=admin, rest=pending), admin promotion/blocking
- `auth-middleware`: `proxy.ts` protecting all routes, redirect logic
- `shadcn-sidebar`: Replace custom sidebar with shadcn Sidebar component, collapsible, mobile sheet, user menu

### Modified Capabilities

- `agent-scanner`: Fix missing `existingEntityNames` in second call, remove DEMO_USER_ID
- `admin-ui`: Auth-wrap all pages, add user management under settings

## Impact

- `src/lib/supabase-browser.ts` — rewrite: cookie-based `createBrowserClient`
- `src/lib/supabase-server.ts` — rewrite: cookie-based `createServerClient` + keep service client for cron
- `src/lib/constants.ts` — delete DEMO_USER_ID
- `src/lib/require-admin.ts` — new helper
- `src/lib/agent-scanner.ts` — fix line 114 bug
- `src/proxy.ts` — new auth middleware
- `src/app/login/page.tsx` — new
- `src/app/waiting/page.tsx` — new
- `src/app/auth/callback/route.ts` — new
- `src/app/(dashboard)/layout.tsx` — rewrite with shadcn Sidebar
- `src/components/sidebar.tsx` — rewrite with shadcn primitives
- `src/app/api/**` — all 28 routes: remove `user_id` param, add `requireAdmin()`
- `src/app/(dashboard)/settings/users/page.tsx` — new
- `src/app/api/users/route.ts` — new
- DB migration — profiles table + trigger + RLS
