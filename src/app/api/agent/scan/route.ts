import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { scanCase, ScanCaseResult } from "@/lib/agent-scanner";

// Vercel Cron sends GET
export async function GET(req: NextRequest) {
  return handleScan(req);
}

export async function POST(req: NextRequest) {
  return handleScan(req);
}

const MAX_RUNTIME_MS = 55_000; // stay under Vercel 60s timeout

async function handleScan(req: NextRequest) {
  const startTime = Date.now();
  const triggeredBy = req.headers.get("x-triggered-by") || "vercel_cron";
  const scanAll = req.headers.get("x-scan-all") === "true";

  // Auth check (Vercel Cron sets Authorization: Bearer <CRON_SECRET>)
  if (triggeredBy !== "manual") {
    const secret = req.headers.get("x-cron-secret") || req.headers.get("authorization")?.replace("Bearer ", "");
    if (secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const db = createServiceClient();
  const allResults: ScanCaseResult[] = [];
  let casesMerged = 0;
  let cycles = 0;

  // Loop: keep scanning due cases until we run out of time or cases
  while (Date.now() - startTime < MAX_RUNTIME_MS) {
    cycles++;

    let casesToScan;
    if (scanAll && cycles === 1) {
      // Scan-all only on first cycle
      const { data } = await db.from("cases").select("id, user_id, status, importance")
        .not("status", "in", '("closed","merged")').order("importance", { ascending: false }).limit(20);
      casesToScan = data;
    } else {
      // Normal: only due cases
      const { data } = await db.from("cases").select("id, user_id, status, importance")
        .not("status", "in", '("closed","merged")')
        .lte("next_scan_at", new Date().toISOString())
        .order("importance", { ascending: false }).limit(3);
      casesToScan = data;
    }

    if (!casesToScan || casesToScan.length === 0) {
      // No due cases — wait 5 seconds then check again (for importance-10 cases that become due)
      if (Date.now() - startTime + 6000 < MAX_RUNTIME_MS) {
        await new Promise(r => setTimeout(r, 5000));
        continue;
      }
      break;
    }

    for (const c of casesToScan) {
      if (Date.now() - startTime > MAX_RUNTIME_MS) break;
      const result = await scanCase(db, c.id, c.user_id, triggeredBy);
      allResults.push(result);
      if (result.decision === "merge") casesMerged++;
    }

    // After first cycle in scanAll mode, switch to normal due-only
    if (scanAll && cycles === 1) continue;

    // Brief pause before next cycle
    if (Date.now() - startTime + 3000 < MAX_RUNTIME_MS) {
      await new Promise(r => setTimeout(r, 2000));
    } else {
      break;
    }
  }

  const durationMs = Date.now() - startTime;
  const userId = allResults[0]?.case_id ? (await db.from("cases").select("user_id").eq("id", allResults[0].case_id).single()).data?.user_id : null;

  if (userId) {
    await db.from("scan_logs").insert({
      user_id: userId,
      triggered_by: triggeredBy as "pg_cron" | "vercel_cron" | "manual",
      cases_scanned: allResults.length,
      cases_merged: casesMerged,
      duration_ms: durationMs,
      status: allResults.some(r => r.status === "failed") ? "partial_failure" : "success",
      error_message: allResults.filter(r => r.error).map(r => `${r.case_id.slice(0, 8)}: ${r.error}`).join("; ") || null,
      case_results: allResults,
    });
  }

  return NextResponse.json({
    cases_scanned: allResults.length,
    cases_merged: casesMerged,
    duration_ms: durationMs,
    cycles,
    mode: scanAll ? "all_open" : "due_only",
    results: allResults,
  });
}
