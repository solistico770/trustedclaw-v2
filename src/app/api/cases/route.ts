import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const userId = sp.get("user_id");
  if (!userId) return NextResponse.json({ error: "user_id required" }, { status: 400 });

  const db = createServiceClient();
  let query = db.from("cases")
    .select("*, case_entities(entity_id, role, entities(id, canonical_name, type, status))")
    .eq("user_id", userId);

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
