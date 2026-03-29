import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { scanCase, ScanCaseResult } from "@/lib/agent-scanner";

// GET for Vercel Cron (cron sends GET)
export async function GET(req: NextRequest) {
  return handleScan(req);
}

export async function POST(req: NextRequest) {
  return handleScan(req);
}

async function handleScan(req: NextRequest) {
  const startTime = Date.now();
  const triggeredBy = req.headers.get("x-triggered-by") || "vercel_cron";
  const scanAll = req.headers.get("x-scan-all") === "true";

  if (triggeredBy !== "manual") {
    const secret = req.headers.get("x-cron-secret");
    if (secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const db = createServiceClient();

  let casesToScan;
  if (scanAll) {
    const { data } = await db.from("cases").select("id, user_id, status, importance")
      .not("status", "in", '("closed","merged")').order("importance", { ascending: false }).limit(20);
    casesToScan = data;
  } else {
    const { data } = await db.from("cases").select("id, user_id, status, importance")
      .not("status", "in", '("closed","merged")')
      .lte("next_scan_at", new Date().toISOString())
      .order("importance", { ascending: false }).limit(5);
    casesToScan = data;
  }

  const caseResults: ScanCaseResult[] = [];
  let casesMerged = 0;

  for (const c of casesToScan || []) {
    const result = await scanCase(db, c.id, c.user_id, triggeredBy);
    caseResults.push(result);
    if (result.decision === "merge") casesMerged++;
  }

  const durationMs = Date.now() - startTime;
  const userId = casesToScan?.[0]?.user_id;

  if (userId) {
    await db.from("scan_logs").insert({
      user_id: userId,
      triggered_by: triggeredBy as "pg_cron" | "vercel_cron" | "manual",
      cases_scanned: caseResults.length,
      cases_merged: casesMerged,
      duration_ms: durationMs,
      status: caseResults.some(r => r.status === "failed") ? "partial_failure" : "success",
      error_message: caseResults.filter(r => r.error).map(r => `${r.case_id.slice(0,8)}: ${r.error}`).join("; ") || null,
      case_results: caseResults,
    });
  }

  return NextResponse.json({
    cases_scanned: caseResults.length,
    cases_merged: casesMerged,
    duration_ms: durationMs,
    mode: scanAll ? "all_open" : "due_only",
    results: caseResults,
  });
}
