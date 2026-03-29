import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { scanCase } from "@/lib/agent-scanner";

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  const triggeredBy = req.headers.get("x-triggered-by") || "vercel_cron";
  const scanAll = req.headers.get("x-scan-all") === "true";

  // Validate cron secret (skip for manual)
  if (triggeredBy !== "manual") {
    const secret = req.headers.get("x-cron-secret");
    if (secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const db = createServiceClient();

  let casesToScan;

  if (scanAll) {
    // Scan ALL open cases — only via manual "Scan All" button
    const { data } = await db.from("cases")
      .select("id, user_id, status, importance")
      .not("status", "in", '("closed","merged")')
      .order("importance", { ascending: false })
      .limit(20);
    casesToScan = data;
  } else {
    // Normal scheduled scan: ONLY cases where next_scan_at has arrived
    const { data } = await db.from("cases")
      .select("id, user_id, status, importance")
      .not("status", "in", '("closed","merged")')
      .lte("next_scan_at", new Date().toISOString())
      .order("importance", { ascending: false })
      .limit(5);
    casesToScan = data;
  }

  let casesScanned = 0;
  let casesMerged = 0;
  const errors: string[] = [];

  for (const c of casesToScan || []) {
    try {
      const result = await scanCase(db, c.id, c.user_id, triggeredBy);
      casesScanned++;
      if (result.decision === "merge") casesMerged++;
    } catch (e) {
      errors.push(`${c.id}: ${String(e)}`);
      console.error(`[scan] Case ${c.id}:`, e);
    }
  }

  const durationMs = Date.now() - startTime;

  const userId = casesToScan?.[0]?.user_id;
  if (userId) {
    await db.from("scan_logs").insert({
      user_id: userId,
      triggered_by: triggeredBy as "pg_cron" | "vercel_cron" | "manual",
      cases_scanned: casesScanned,
      cases_merged: casesMerged,
      duration_ms: durationMs,
      status: errors.length > 0 ? "partial_failure" : "success",
      error_message: errors.length > 0 ? errors.join("; ") : null,
    });
  }

  return NextResponse.json({
    cases_scanned: casesScanned,
    cases_merged: casesMerged,
    duration_ms: durationMs,
    errors: errors.length,
    mode: scanAll ? "all_open" : "due_only",
  });
}
