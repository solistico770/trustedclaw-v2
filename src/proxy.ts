import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const publicPaths = ["/login", "/auth/callback", "/waiting"];
const apiPublicPaths = ["/api/messages/ingest", "/api/agent/scan"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public pages — pass through
  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Public API routes (ingest, cron scan) — pass through
  if (apiPublicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Static assets and Next.js internals — pass through
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon")) {
    return NextResponse.next();
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Middleware context — cookies may be read-only
          }
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  // No session — redirect to login
  if (!user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Check role
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || (profile.role !== "admin" && !pathname.startsWith("/waiting"))) {
    return NextResponse.redirect(new URL("/waiting", req.url));
  }

  // Admin trying to visit /waiting — send them to dashboard
  if (profile.role === "admin" && pathname === "/waiting") {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
}
