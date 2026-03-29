## Context

TrustedClaw is a Next.js 16 app with Supabase backend. Currently zero auth — hardcoded DEMO_USER_ID in `src/lib/constants.ts`. All 30+ API routes pass `user_id` as a query param. Dashboard is hand-rolled with basic shadcn components (button, card, input, badge, tabs) and a custom sidebar. RLS is enabled on all tables checking `auth.uid() = user_id`, but since no user is authenticated, the app uses the service role key everywhere.

## Goals / Non-Goals

**Goals:**
- Real auth via Supabase Auth (phone OTP + email magic link)
- First signup = admin, subsequent signups = pending (need admin approval)
- All dashboard pages and API routes protected — admin only
- Replace dashboard layout with shadcn dashboard template (sidebar, header, responsive)
- Keep RTL/Hebrew support
- Remove DEMO_USER_ID entirely

**Non-Goals:**
- Social login (Google, GitHub, etc.) — not needed now
- Password-based auth — phone OTP and magic link only
- Multi-tenant / multi-org — single admin pool
- Redesigning individual page content (cases board, entity list, etc.) — just the shell/layout
- Mobile app auth

## Decisions

### 1. Auth provider — Supabase Auth native

Use Supabase's built-in auth, not Clerk/Auth0/NextAuth. Already have Supabase set up, RLS policies reference `auth.uid()`, and phone OTP + email magic link are supported natively.

**Requires manual step**: user must enable Phone provider in Supabase Dashboard → Authentication → Providers.

### 2. Session management — `@supabase/ssr`

Already in `package.json`. Use cookie-based sessions via `createServerClient` in `proxy.ts` and API routes. Browser client uses `createBrowserClient` from `@supabase/ssr`.

Flow:
1. `proxy.ts` reads session cookie → if no session, redirect to `/login`
2. If session exists, check `profiles.role` → if not admin, show waiting screen
3. API routes: create Supabase client from cookies, get `auth.getUser()`, check role

### 3. Profiles table with trigger

```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'pending' CHECK (role IN ('admin', 'pending', 'blocked')),
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_count INT;
BEGIN
  SELECT COUNT(*) INTO user_count FROM profiles;
  INSERT INTO profiles (id, role)
  VALUES (NEW.id, CASE WHEN user_count = 0 THEN 'admin' ELSE 'pending' END);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

First user gets `admin`, everyone else gets `pending`. Race condition is negligible — first signup in a fresh system.

### 4. API protection pattern

Every API route handler:
```typescript
const supabase = await createClient(); // from cookies
const { data: { user } } = await supabase.auth.getUser();
if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

// Use user.id instead of DEMO_USER_ID
```

Extract this into a helper `requireAdmin(supabase)` that returns `{ user, profile }` or throws.

### 5. shadcn dashboard layout

Use `npx shadcn@latest add sidebar-07` (or appropriate dashboard block) as the base. It includes:
- Collapsible sidebar with icons
- Header with user avatar/dropdown
- Responsive (mobile = sheet drawer)
- Dark mode ready

Adapt nav items: Cases, Entities, Scanner, Simulate, Settings. Add user menu with logout. Keep `dir="rtl"` on html.

### 6. Login page

Simple page at `/login` with two options:
- Phone number input → OTP verification
- Email input → magic link sent

Use shadcn card + input + button. No password fields.

### 7. Remove DEMO_USER_ID

Delete from `src/lib/constants.ts`. Search all files for the UUID `d1f03088-b350-49f0-92de-24dc3bf1f64d` and replace with `user.id` from session. The Supabase client created from cookies will automatically scope RLS queries to the authenticated user — so for browser-side queries we can switch from service role to anon key + RLS.

## Risks / Trade-offs

- **Phone OTP costs money** — Supabase uses Twilio under the hood. Free tier has limits. → Mitigation: also offer email magic link as free alternative.
- **First-user race condition** — if two people sign up simultaneously, both could get admin. → Mitigation: use `SELECT COUNT(*) ... FOR UPDATE` or accept it (extremely unlikely on fresh deploy).
- **Service role key exposure** — currently used in browser client. After auth, browser should use anon key + RLS. → Mitigation: audit all Supabase client usages, switch browser to anon key.
- **Supabase dashboard manual step** — Phone provider must be enabled manually. → Mitigation: document in README, fail gracefully if phone auth not configured.
- **shadcn dashboard template may need RTL adjustments** — sidebar direction, icon positions. → Mitigation: test and adjust with `dir="rtl"` and Tailwind RTL utilities.
