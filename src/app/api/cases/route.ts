import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isAuthError } from "@/lib/require-admin";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth.error;
  const { user, supabase } = auth;

  const sp = req.nextUrl.searchParams;
  const limit = parseInt(sp.get("limit") || "50");
  const offset = parseInt(sp.get("offset") || "0");

  let query = supabase.from("cases")
    .select("*, case_entities(entity_id, role, entities(id, canonical_name, type, status))", { count: "exact" })
    .eq("user_id", user.id);

  const status = sp.get("status");
  if (status) query = query.in("status", status.split(","));
  else query = query.not("status", "in", '("closed","merged")');

  const sortBy = sp.get("sort_by") || "importance";
  if (sortBy === "importance") query = query.order("importance", { ascending: false });
  else query = query.order("last_message_at", { ascending: false });

  const { data, error, count } = await query.range(offset, offset + limit - 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, total: count, limit, offset });
}
