import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { scanCase, triagePendingSignals, ScanCaseResult, TriageResult } from "@/lib/agent-scanner";

// Vercel Cron sends GET
export async function GET(req: NextRequest) {
  return handleScan(req);
}

export async function POST(req: NextRequest) {
  return handleScan(req);
}

const MAX_RUNTIME_MS = 55_000;
const TRIAGE_BUDGET_MS = 25_000;

async function handleScan(req: NextRequest) {
  const startTime = Date.now();
  const triggeredBy = req.headers.get("x-triggered-by") || "vercel_cron";
  const scanAll = req.headers.get("x-scan-all") === "true";

  // Auth check
  if (triggeredBy !== "manual") {
    const secret = req.headers.get("x-cron-secret") || req.headers.get("authorization")?.replace("Bearer ", "");
    if (secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const db = createServiceClient();

  // Determine user_id — get from first pending signal or first open case
  const { data: anySignal } = await db.from("signals").select("user_id").eq("status", "pending").limit(1).single();
  const { data: anyCase } = await db.from("cases").select("user_id").not("status", "in", '("closed","merged")').limit(1).single();
  const userId = anySignal?.user_id || anyCase?.user_id;

  if (!userId) {
    return NextResponse.json({ message: "No pending signals or open cases", cases_scanned: 0 });
  }

  // ─── PASS 1: Signal Triage ────────────────────────────────────────────────
  let triageResult: TriageResult = {
    signals_triaged: 0, signals_assigned: 0, signals_ignored: 0,
    cases_created: 0, tokens: 0, duration_ms: 0, status: "skipped",
  };

  if (Date.now() - startTime < TRIAGE_BUDGET_MS) {
    triageResult = await triagePendingSignals(db, userId);
  }

  // ─── PASS 2: Case Review ─────────────────────────────────────────────────
  const allResults: ScanCaseResult[] = [];
  let casesMerged = 0;
  let cycles = 0;

  while (Date.now() - startTime < MAX_RUNTIME_MS) {
    cycles++;

    let casesToScan;
    if (scanAll && cycles === 1) {
      const { data } = await db.from("cases").select("id, user_id, status, importance")
        .not("status", "in", '("closed","merged")').order("importance", { ascending: false }).limit(20);
      casesToScan = data;
    } else {
      const { data } = await db.from("cases").select("id, user_id, status, importance")
        .not("status", "in", '("closed","merged")')
        .lte("next_scan_at", new Date().toISOString())
        .order("importance", { ascending: false }).limit(3);
      casesToScan = data;
    }

    if (!casesToScan || casesToScan.length === 0) break;

    for (const c of casesToScan) {
      if (Date.now() - startTime > MAX_RUNTIME_MS) break;
      const result = await scanCase(db, c.id, c.user_id, triggeredBy);
      allResults.push(result);
      if (result.decision === "merge") casesMerged++;
    }

    if (scanAll && cycles === 1) continue;

    if (Date.now() - startTime + 3000 < MAX_RUNTIME_MS) {
      await new Promise(r => setTimeout(r, 2000));
    } else {
      break;
    }
  }

  const durationMs = Date.now() - startTime;

  // Save scan log with triage stats
  await db.from("scan_logs").insert({
    user_id: userId,
    triggered_by: triggeredBy as "pg_cron" | "vercel_cron" | "manual",
    cases_scanned: allResults.length,
    cases_merged: casesMerged,
    signals_triaged: triageResult.signals_triaged,
    signals_assigned: triageResult.signals_assigned,
    signals_ignored: triageResult.signals_ignored,
    cases_created_from_triage: triageResult.cases_created,
    duration_ms: durationMs,
    status: allResults.some(r => r.status === "failed") || triageResult.status === "failed" ? "partial_failure" : "success",
    error_message: [
      ...allResults.filter(r => r.error).map(r => `${r.case_id.slice(0, 8)}: ${r.error}`),
      ...(triageResult.error ? [`triage: ${triageResult.error}`] : []),
    ].join("; ") || null,
    case_results: allResults,
  });

  return NextResponse.json({
    triage: {
      signals_triaged: triageResult.signals_triaged,
      signals_assigned: triageResult.signals_assigned,
      signals_ignored: triageResult.signals_ignored,
      cases_created: triageResult.cases_created,
      status: triageResult.status,
    },
    cases_scanned: allResults.length,
    cases_merged: casesMerged,
    duration_ms: durationMs,
    cycles,
    mode: scanAll ? "all_open" : "due_only",
    results: allResults,
  });
}
