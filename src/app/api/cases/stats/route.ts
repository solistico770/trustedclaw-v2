import { NextResponse } from "next/server";
import { requireAdmin, isAuthError } from "@/lib/require-admin";
import { createServiceClient } from "@/lib/supabase-server";

export async function GET() {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth.error;
  const userId = auth.user.id;

  const db = createServiceClient();

  const cutoff24h = new Date(Date.now() - 86400000).toISOString();
  const [attentionRes, criticalRes, openRes, handledRes, entityRes, nextScanRes, scansToday, empowermentRes, pendingSignalsRes, overdueTasksRes, signals24hRes, signalsTotalRes] = await Promise.all([
    db.from("cases").select("*", { count: "exact", head: true }).eq("user_id", userId).in("status", ["action_needed", "escalated"]),
    db.from("cases").select("*", { count: "exact", head: true }).eq("user_id", userId).not("status", "in", '("closed","merged")').lte("urgency", 1),
    db.from("cases").select("*", { count: "exact", head: true }).eq("user_id", userId).in("status", ["open", "in_progress", "scheduled"]),
    db.from("cases").select("*", { count: "exact", head: true }).eq("user_id", userId).in("status", ["addressed", "closed"]),
    db.from("entities").select("*", { count: "exact", head: true }).eq("user_id", userId).eq("status", "active"),
    db.from("cases").select("next_scan_at").eq("user_id", userId).not("status", "in", '("closed","merged")').not("next_scan_at", "is", null).order("next_scan_at", { ascending: true }).limit(1).single(),
    db.from("scan_logs").select("*", { count: "exact", head: true }).eq("user_id", userId).gte("run_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
    db.from("case_events").select("empowerment_line").eq("user_id", userId).not("empowerment_line", "is", null).order("created_at", { ascending: false }).limit(1).single(),
    db.from("signals").select("*", { count: "exact", head: true }).eq("user_id", userId).eq("status", "pending"),
    db.from("tasks").select("*", { count: "exact", head: true }).eq("user_id", userId).eq("status", "open").lt("due_at", new Date().toISOString()),
    db.from("signals").select("*", { count: "exact", head: true }).eq("user_id", userId).gte("occurred_at", cutoff24h),
    db.from("signals").select("*", { count: "exact", head: true }).eq("user_id", userId),
  ]);

  const lastScan = await db.from("scan_logs").select("run_at").eq("user_id", userId).order("run_at", { ascending: false }).limit(1).single();

  return NextResponse.json({
    attention: attentionRes.count || 0,
    critical: criticalRes.count || 0,
    open: openRes.count || 0,
    handled: handledRes.count || 0,
    entities: entityRes.count || 0,
    pending_signals: pendingSignalsRes.count || 0,
    signals_24h: signals24hRes.count || 0,
    signals_total: signalsTotalRes.count || 0,
    overdue_tasks: overdueTasksRes.count || 0,
    last_scan_ago_sec: lastScan.data?.run_at ? Math.round((Date.now() - new Date(lastScan.data.run_at).getTime()) / 1000) : null,
    next_scan_in_sec: nextScanRes.data?.next_scan_at ? Math.max(0, Math.round((new Date(nextScanRes.data.next_scan_at).getTime() - Date.now()) / 1000)) : null,
    cases_scanned_today: scansToday.count || 0,
    latest_empowerment: empowermentRes.data?.empowerment_line || null,
  });
}
