## Context

Next.js 16 + Supabase app. Zero auth — hardcoded DEMO_USER_ID. All 28 API routes take `user_id` as query param and use service role key. Browser client is raw `createClient` (not cookie-based). Custom sidebar works but no collapse/mobile/user menu. RLS exists on all tables checking `auth.uid() = user_id` but is bypassed by service role usage.

## Goals / Non-Goals

**Goals:**
- Email magic link auth via Supabase Auth
- First signup = admin, rest = pending
- All routes protected (proxy.ts + API helper)
- Session-based auth replaces user_id query param everywhere
- shadcn Sidebar component with collapse, mobile, user menu
- Fix v4 bug (missing param in second callAgent)

**Non-Goals:**
- Phone OTP (needs Twilio — add later)
- Social login
- Redesigning page content — only the shell/layout
- Multi-tenant/multi-org

## Decisions

### 1. Email magic link only (no phone)

Phone OTP requires Twilio setup in Supabase dashboard + costs money. Email magic link works out of the box with Supabase Auth. Add phone later if needed.

### 2. Cookie-based Supabase clients via @supabase/ssr

**Browser client** — `createBrowserClient(url, anonKey)` from `@supabase/ssr`. Stores session in cookies, works with RLS.

**Server client (API routes)** — `createServerClient(url, anonKey, { cookies })` from `@supabase/ssr`. Reads cookies from request. Used in all API route handlers. RLS enforces user isolation automatically.

**Service client (cron/scanner)** — keep existing `createClient(url, serviceRoleKey)` for background jobs (cron scan, message ingest) that don't have a user session.

### 3. Profiles table

```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'pending' CHECK (role IN ('admin', 'pending', 'blocked')),
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE user_count INT;
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

### 4. API route pattern — requireAdmin helper

```typescript
// src/lib/require-admin.ts
export async function requireAdmin(req: NextRequest) {
  const supabase = createServerClient(cookies);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { user, profile, supabase };
}
```

Every API route changes from:
```typescript
const userId = sp.get("user_id");
const db = createServiceClient();
```
To:
```typescript
const auth = await requireAdmin(req);
if ("error" in auth) return auth.error;
const { user, supabase } = auth;
// user.id replaces userId, supabase replaces db
```

### 5. proxy.ts

```typescript
// src/proxy.ts — at same level as app/
const publicPaths = ["/login", "/auth/callback", "/waiting", "/api/messages/ingest", "/api/agent/scan"];

// If public path → pass through
// If no session → redirect /login
// If session but role != admin → redirect /waiting
// If admin → pass through
```

### 6. shadcn Sidebar

Install: `npx shadcn@latest add sidebar sheet dropdown-menu avatar`

Use `SidebarProvider` + `Sidebar` + `SidebarContent` + `SidebarGroup` + `SidebarMenuItem` from shadcn. Keep current nav items (Cases, Entities, Simulate, Scanner, Settings). Add user menu in `SidebarFooter` with avatar, email, logout. Mobile: `SidebarTrigger` opens sheet.

RTL: sidebar renders on right via `dir="rtl"` on html. shadcn sidebar respects this.

### 7. Fix v4 bug

`agent-scanner.ts` line 114-117: second `callAgent` call passes `previousSummary` as 7th arg but is missing `existingEntityNames` (6th arg). Fix: add `existingEntityNames` parameter.

## Risks / Trade-offs

- **All 28 API routes need auth added** — big changeset but mechanical. Each route is ~3 lines changed.
- **Browser client switch to anon key** — RLS now enforces access. Must verify all queries work with RLS (they should — policies already exist).
- **Service role still needed for cron** — scanner and ingest run without user session. Keep service client for those.
- **Email delivery** — Supabase has built-in email for dev. Production needs custom SMTP (Resend, etc.).
