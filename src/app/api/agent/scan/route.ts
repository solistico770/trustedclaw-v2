import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { scanCase, triagePendingSignals, evaluateChed, ScanCaseResult, TriageResult, ChedEvalResult } from "@/lib/agent-scanner";

// Vercel Cron sends GET
export async function GET(req: NextRequest) { return handleScan(req); }
export async function POST(req: NextRequest) { return handleScan(req); }

const MAX_RUNTIME_MS = 55_000;

// Simple lock — prevents overlapping scans within the same instance
let scanRunning = false;

async function handleScan(req: NextRequest) {
  const startTime = Date.now();
  const triggeredBy = req.headers.get("x-triggered-by") || "vercel_cron";
  const scanAll = req.headers.get("x-scan-all") === "true";

  // Auth
  if (triggeredBy !== "manual") {
    const cronHeader = req.headers.get("x-cron-secret");
    const authHeader = req.headers.get("authorization")?.replace("Bearer ", "");
    const secret = cronHeader || authHeader;
    if (secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // Guard: skip if already running
  if (scanRunning) {
    return NextResponse.json({ message: "Scan already running, skipping", skipped: true });
  }
  scanRunning = true;

  try {
    const db = createServiceClient();

    const { data: anySignal } = await db.from("signals").select("user_id").eq("status", "pending").limit(1).single();
    const { data: anyCase } = await db.from("cases").select("user_id").not("status", "in", '("closed","merged")').limit(1).single();
    const userId = anySignal?.user_id || anyCase?.user_id;

    if (!userId) {
      return NextResponse.json({ message: "No work", signals_triaged: 0, cases_scanned: 0 });
    }

    // ─── TRIAGE LOOP: keep triaging until no more pending signals or time runs out ───
    let totalTriaged = 0, totalAssigned = 0, totalIgnored = 0, totalCasesCreated = 0, totalTriageTokens = 0;

    while (Date.now() - startTime < MAX_RUNTIME_MS - 10_000) {
      const { count } = await db.from("signals").select("*", { count: "exact", head: true })
        .eq("user_id", userId).eq("status", "pending");

      if (!count || count === 0) break;

      const triageResult = await triagePendingSignals(db, userId);
      totalTriaged += triageResult.signals_triaged;
      totalAssigned += triageResult.signals_assigned;
      totalIgnored += triageResult.signals_ignored;
      totalCasesCreated += triageResult.cases_created;
      totalTriageTokens += triageResult.tokens;

      if (triageResult.signals_triaged === 0) break; // nothing processed = stop
    }

    // ─── CASE REVIEW: scan due cases ─────────────────────────────────────────
    const allResults: ScanCaseResult[] = [];
    let casesMerged = 0;

    while (Date.now() - startTime < MAX_RUNTIME_MS) {
      let casesToScan;
      if (scanAll && allResults.length === 0) {
        const { data } = await db.from("cases").select("id, user_id, status, importance")
          .not("status", "in", '("closed","merged")').order("importance", { ascending: false }).limit(10);
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

      if (Date.now() - startTime + 5000 >= MAX_RUNTIME_MS) break;
    }

    // ─── CHED EVALUATION (Pass 3): run due cheds ─────────────────────────────
    const chedsResults: ChedEvalResult[] = [];
    const changesOccurred = totalTriaged > 0 || allResults.length > 0;

    if (Date.now() - startTime < MAX_RUNTIME_MS - 5000) {
      // Build changes summary for after_llm_change cheds
      const changesSummary = changesOccurred
        ? `Signals triaged: ${totalTriaged} (${totalAssigned} assigned, ${totalIgnored} ignored, ${totalCasesCreated} new cases). Cases scanned: ${allResults.length} (${casesMerged} merged).`
        : undefined;

      // Fetch interval cheds that are due
      const { data: dueCheds } = await db.from("cheds")
        .select("id, title, context, trigger_type, interval_seconds")
        .eq("user_id", userId).eq("is_active", true)
        .eq("trigger_type", "interval")
        .lte("next_run_at", new Date().toISOString());

      // Fetch after_llm_change cheds (only if changes occurred)
      const afterChangeCheds = changesOccurred
        ? (await db.from("cheds")
            .select("id, title, context, trigger_type, interval_seconds")
            .eq("user_id", userId).eq("is_active", true)
            .eq("trigger_type", "after_llm_change")).data || []
        : [];

      const allDueCheds = [...(dueCheds || []), ...afterChangeCheds];

      for (const ched of allDueCheds) {
        if (Date.now() - startTime > MAX_RUNTIME_MS - 3000) break;
        const triggerReason = ched.trigger_type === "after_llm_change" ? "llm_change" as const : "scheduled" as const;
        const result = await evaluateChed(db, ched, userId, triggerReason, changesSummary);
        chedsResults.push(result);
      }
    }

    const durationMs = Date.now() - startTime;

    // Save scan log
    await db.from("scan_logs").insert({
      user_id: userId,
      triggered_by: triggeredBy as "pg_cron" | "vercel_cron" | "manual",
      cases_scanned: allResults.length,
      cases_merged: casesMerged,
      signals_triaged: totalTriaged,
      signals_assigned: totalAssigned,
      signals_ignored: totalIgnored,
      cases_created_from_triage: totalCasesCreated,
      cheds_evaluated: chedsResults.length,
      duration_ms: durationMs,
      status: allResults.some(r => r.status === "failed") ? "partial_failure" : "success",
      error_message: allResults.filter(r => r.error).map(r => `${r.case_id.slice(0, 8)}: ${r.error}`).join("; ") || null,
      case_results: allResults,
    });

    return NextResponse.json({
      signals_triaged: totalTriaged,
      signals_assigned: totalAssigned,
      signals_ignored: totalIgnored,
      cases_created: totalCasesCreated,
      cases_scanned: allResults.length,
      cases_merged: casesMerged,
      cheds_evaluated: chedsResults.length,
      triage_tokens: totalTriageTokens,
      duration_ms: durationMs,
      mode: scanAll ? "all_open" : "due_only",
    });
  } finally {
    scanRunning = false;
  }
}
