import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isAuthError } from "@/lib/require-admin";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth.error;
  const { user, supabase } = auth;

  const sp = req.nextUrl.searchParams;
  let query = supabase.from("cases")
    .select("*, case_entities(entity_id, role, entities(id, canonical_name, type, status))")
    .eq("user_id", user.id);

  const status = sp.get("status");
  if (status) query = query.in("status", status.split(","));
  else query = query.not("status", "in", '("closed","merged")');

  const sortBy = sp.get("sort_by") || "importance";
  if (sortBy === "importance") query = query.order("importance", { ascending: false });
  else query = query.order("last_message_at", { ascending: false });

  const { data, error } = await query.limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
