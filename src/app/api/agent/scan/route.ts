import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { scanCase } from "@/lib/agent-scanner";

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  const triggeredBy = req.headers.get("x-triggered-by") || "vercel_cron";

  // Validate cron secret (skip for manual)
  if (triggeredBy !== "manual") {
    const secret = req.headers.get("x-cron-secret");
    if (secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const db = createServiceClient();

  // Find cases to scan: pending OR next_scan_at <= now
  const { data: casesToScan } = await db.from("cases")
    .select("id, user_id, status, importance")
    .or("status.eq.pending,and(next_scan_at.lte.now(),status.not.in.(closed,merged))")
    .order("importance", { ascending: false })
    .limit(5);

  let casesScanned = 0;
  let casesMerged = 0;
  let errors: string[] = [];

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

  // Get any user_id for the scan log
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
  });
}
