import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isAuthError } from "@/lib/require-admin";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth.error;
  const { user, supabase } = auth;

  const sp = req.nextUrl.searchParams;
  const limit = parseInt(sp.get("limit") || "50");
  const offset = parseInt(sp.get("offset") || "0");

  let query = supabase.from("entities").select("*", { count: "exact" }).eq("user_id", user.id).order("created_at", { ascending: false });

  const status = sp.get("status");
  if (status) query = query.eq("status", status);

  const q = sp.get("q");
  if (q) query = query.ilike("canonical_name", `%${q}%`);

  const type = sp.get("type");
  if (type) query = query.eq("type", type);

  const { data, error, count } = await query.range(offset, offset + limit - 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, total: count, limit, offset });
}
