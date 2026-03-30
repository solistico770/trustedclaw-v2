import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isAuthError } from "@/lib/require-admin";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth.error;
  const db = auth.supabase;
  const userId = auth.user.id;

  const url = req.nextUrl;
  const status = url.searchParams.get("status");
  const gateId = url.searchParams.get("gate_id");
  const assigned = url.searchParams.get("assigned");
  const search = url.searchParams.get("search");
  const limit = parseInt(url.searchParams.get("limit") || "50");
  const offset = parseInt(url.searchParams.get("offset") || "0");

  let query = db.from("signals")
    .select("id, gate_id, case_id, raw_payload, sender_identifier, channel_identifier, status, processing_decision, occurred_at, received_at, gates(type, display_name), cases(case_number, title)", { count: "exact" })
    .eq("user_id", userId)
    .order("received_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq("status", status);
  if (gateId) query = query.eq("gate_id", gateId);
  if (assigned === "true") query = query.not("case_id", "is", null);
  if (assigned === "false") query = query.is("case_id", null);
  if (search) query = query.or(`sender_identifier.ilike.%${search}%,raw_payload->>content.ilike.%${search}%`);

  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ signals: data || [], total: count || 0 });
}
