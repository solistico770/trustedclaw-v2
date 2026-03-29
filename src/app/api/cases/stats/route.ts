import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("user_id");
  if (!userId) return NextResponse.json({ error: "user_id required" }, { status: 400 });

  const db = createServiceClient();

  const [openRes, actionRes, criticalRes, oldestRes, nextScanRes, totalRes] = await Promise.all([
    db.from("cases").select("*", { count: "exact", head: true }).eq("user_id", userId).in("status", ["open", "in_progress", "addressed", "scheduled"]),
    db.from("cases").select("*", { count: "exact", head: true }).eq("user_id", userId).in("status", ["action_needed", "escalated"]),
    db.from("cases").select("*", { count: "exact", head: true }).eq("user_id", userId).not("status", "in", '("closed","merged")').lte("urgency", 1),
    db.from("cases").select("created_at").eq("user_id", userId).not("status", "in", '("closed","merged")').order("created_at", { ascending: true }).limit(1).single(),
    db.from("cases").select("next_scan_at").eq("user_id", userId).not("status", "in", '("closed","merged")').not("next_scan_at", "is", null).order("next_scan_at", { ascending: true }).limit(1).single(),
    db.from("cases").select("*", { count: "exact", head: true }).eq("user_id", userId).not("status", "in", '("closed","merged")'),
  ]);

  const oldestAge = oldestRes.data?.created_at
    ? Math.round((Date.now() - new Date(oldestRes.data.created_at).getTime()) / 3600000)
    : 0;

  const nextScanIn = nextScanRes.data?.next_scan_at
    ? Math.max(0, Math.round((new Date(nextScanRes.data.next_scan_at).getTime() - Date.now()) / 1000))
    : null;

  return NextResponse.json({
    total: totalRes.count || 0,
    open: openRes.count || 0,
    action_needed: actionRes.count || 0,
    critical: criticalRes.count || 0,
    oldest_age_hours: oldestAge,
    next_scan_in_seconds: nextScanIn,
  });
}
