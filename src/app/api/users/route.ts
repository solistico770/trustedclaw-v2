import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isAuthError } from "@/lib/require-admin";
import { createServiceClient } from "@/lib/supabase-server";

export async function GET() {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth.error;

  const db = createServiceClient();
  const { data, error } = await db.from("profiles").select("id, role, display_name, created_at").order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Get emails from auth.users via admin API
  const { data: { users } } = await db.auth.admin.listUsers();
  const emailMap = new Map(users?.map(u => [u.id, u.email || u.phone || "unknown"]));

  const enriched = (data || []).map(p => ({
    ...p,
    email: emailMap.get(p.id) || "unknown",
  }));

  return NextResponse.json(enriched);
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth.error;

  const { user_id, role } = await req.json();
  if (!user_id || !role) return NextResponse.json({ error: "user_id and role required" }, { status: 400 });
  if (!["admin", "pending", "blocked"].includes(role)) return NextResponse.json({ error: "invalid role" }, { status: 400 });

  // Don't let admin demote themselves
  if (user_id === auth.user.id && role !== "admin") {
    return NextResponse.json({ error: "Cannot change your own role" }, { status: 400 });
  }

  const db = createServiceClient();
  const { error } = await db.from("profiles").update({ role }).eq("id", user_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
