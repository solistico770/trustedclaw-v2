"use client";
import { Suspense, useEffect, useState, useCallback, useMemo } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";
import { URGENCY_LABELS, IMPORTANCE_LABELS, LEVEL_COLORS, getScanIntervalSeconds, getScanIntervalLabel } from "@/lib/scan-intervals";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FilterBar, useFilterState, type FilterPill } from "@/components/filter-bar";
import { useDrawerStack } from "@/components/drawer-stack";
import { CaseDrawerContent } from "@/components/case-drawer";
import { CASE_STATUS, URGENCY_BG } from "@/lib/status-colors";
import { useSearchParams } from "next/navigation";

export default function CasesPageWrapper() {
  return <Suspense fallback={<div className="space-y-2 animate-pulse">{[1,2,3,4,5].map(i => <div key={i} className="h-12 rounded-xl bg-card" />)}</div>}><CasesPage /></Suspense>;
}

type Case = {
  id: string; case_number: number; title: string | null; summary: string | null; status: string;
  urgency: number; importance: number; message_count: number;
  last_message_at: string | null; created_at: string; next_scan_at: string | null;
  case_entities: Array<{ role: string; entities: { id: string; canonical_name: string; type: string } | null }>;
};

function timeAgo(iso: string) {
  const h = Math.round((Date.now() - new Date(iso).getTime()) / 3600000);
  if (h < 1) return `${Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000))}m`;
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}
function timeUntil(iso: string) {
  const sec = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  if (sec <= 0) return "now";
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  return `${Math.round(sec / 3600)}h`;
}
function priorityScore(c: Case): number {
  return (c.status === "action_needed" || c.status === "escalated" ? 100 : 0) + (6 - c.urgency) * 10 + (6 - c.importance) * 5;
}

function CasesPage() {
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterState, setFilterState] = useFilterState();
  const { openDrawer } = useDrawerStack();
  const searchParams = useSearchParams();

  const load = useCallback(async () => {
    const res = await fetch("/api/cases");
    const data = await res.json();
    setCases(data?.data || (Array.isArray(data) ? data : []));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    const sb = createBrowserClient();
    const ch = sb.channel("cases-page").on("postgres_changes", { event: "*", schema: "public", table: "cases" }, () => load()).subscribe();
    return () => { sb.removeChannel(ch); clearInterval(interval); };
  }, [load]);

  // Init filters from URL legacy params
  useEffect(() => {
    const urlStatus = searchParams.get("status");
    const urlFilter = searchParams.get("filter");
    if (urlStatus) setFilterState(s => ({ ...s, activePills: urlStatus.split(",") }));
    if (urlFilter === "critical") setFilterState(s => ({ ...s, activePills: ["critical"] }));
  }, [searchParams, setFilterState]);

  // Status counts for pills
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    cases.forEach(c => { counts[c.status] = (counts[c.status] || 0) + 1; });
    counts.critical = cases.filter(c => c.urgency === 1).length;
    return counts;
  }, [cases]);

  const pills: FilterPill[] = useMemo(() => [
    { key: "action_needed", label: "Action Needed", count: statusCounts.action_needed || 0, color: "bg-red-500/10 text-red-700 dark:text-red-400" },
    { key: "escalated", label: "Escalated", count: statusCounts.escalated || 0, color: "bg-red-500/15 text-red-700 dark:text-red-400" },
    { key: "critical", label: "Critical U1", count: statusCounts.critical || 0, color: "bg-red-500/10 text-red-700 dark:text-red-400" },
    { key: "open", label: "Open", count: statusCounts.open || 0, color: "bg-blue-500/10 text-blue-700 dark:text-blue-400" },
    { key: "in_progress", label: "In Progress", count: statusCounts.in_progress || 0, color: "bg-violet-500/10 text-violet-700 dark:text-violet-400" },
    { key: "addressed", label: "Addressed", count: statusCounts.addressed || 0, color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
    { key: "closed", label: "Closed", count: statusCounts.closed || 0, color: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400" },
  ], [statusCounts]);

  // Apply filters
  const filtered = useMemo(() => {
    let result = cases;
    const pills = filterState.activePills;
    if (pills.length > 0) {
      result = result.filter(c => {
        if (pills.includes("critical") && c.urgency === 1) return true;
        if (pills.includes(c.status)) return true;
        return false;
      });
    }
    if (filterState.search) {
      const s = filterState.search.toLowerCase();
      result = result.filter(c =>
        (c.title || "").toLowerCase().includes(s) || (c.summary || "").toLowerCase().includes(s) ||
        String(c.case_number).includes(s) || c.case_entities?.some(ce => ce.entities?.canonical_name?.toLowerCase().includes(s))
      );
    }
    return result.sort((a, b) => priorityScore(b) - priorityScore(a));
  }, [cases, filterState]);

  function openCase(c: Case) {
    openDrawer({
      id: `case-${c.id}`,
      title: `#${c.case_number} ${c.title || ""}`,
      width: 680,
      content: <CaseDrawerContent caseId={c.id} onRefresh={load} />,
    });
  }

  async function quickAction(caseId: string, action: string) {
    const endpoint = action === "close" ? `/api/cases/${caseId}/close` : `/api/cases/${caseId}/status`;
    const body = action === "close" ? { reason: "Closed" } : { status: action };
    await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    load();
  }

  function dedupEntities(ents: Case["case_entities"]) {
    const seen = new Set<string>();
    return (ents || []).filter(ce => { const n = ce.entities?.canonical_name?.toLowerCase(); if (!n || seen.has(n)) return false; seen.add(n); return true; });
  }

  if (loading) return <div className="space-y-2 animate-pulse">{[1,2,3,4,5].map(i => <div key={i} className="h-12 rounded-xl bg-card" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-bold tracking-tight">Cases</h1>
        <span className="text-xs text-muted-foreground tabular-nums">{filtered.length} of {cases.length}</span>
      </div>

      <FilterBar
        config={{ viewKey: "cases", pills, searchPlaceholder: "Search cases, entities, #number... (/)", sortColumns: [
          { key: "urgency", label: "Urgency" }, { key: "importance", label: "Importance" }, { key: "created", label: "Created" },
        ]}}
        state={filterState}
        onChange={setFilterState}
      />

      {filtered.length === 0 && (
        <div className="text-center py-16">
          <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
            <svg className="w-6 h-6 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
          <p className="text-lg font-semibold text-foreground/80">All clear</p>
          <p className="text-sm text-muted-foreground mt-1">No cases match</p>
        </div>
      )}

      {/* Case rows */}
      <div className="rounded-xl border border-border/40 overflow-hidden divide-y divide-border/20">
        {filtered.map(c => {
          const entities = dedupEntities(c.case_entities);
          const cfg = CASE_STATUS[c.status as keyof typeof CASE_STATUS] || CASE_STATUS.open;
          const isHot = c.status === "action_needed" || c.status === "escalated";

          return (
            <div key={c.id}
              className={`flex items-center gap-3 px-4 py-[var(--space-row)] cursor-pointer transition-colors group ${isHot ? "bg-red-500/[0.03]" : "hover:bg-muted/20"}`}
              onClick={() => openCase(c)}>
              <span className="text-[11px] font-mono text-muted-foreground w-7 shrink-0">#{c.case_number}</span>
              <div className="flex gap-0.5 shrink-0">
                <span className={`w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center ${LEVEL_COLORS[c.urgency]?.bg || ""} ${LEVEL_COLORS[c.urgency]?.text || ""}`}>{c.urgency}</span>
                <span className={`w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center ${LEVEL_COLORS[c.importance]?.bg || ""} ${LEVEL_COLORS[c.importance]?.text || ""}`}>{c.importance}</span>
              </div>
              <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
              <span className="text-[13px] font-semibold text-foreground truncate flex-1">{c.title || `Case #${c.case_number}`}</span>
              <div className="hidden sm:flex gap-1 shrink-0">
                {entities.slice(0, 2).map((ce, i) => ce.entities && (
                  <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground truncate max-w-20">{ce.entities.canonical_name}</span>
                ))}
                {entities.length > 2 && <span className="text-[10px] text-muted-foreground">+{entities.length - 2}</span>}
              </div>
              <div className="text-left shrink-0 w-24">
                <p className="text-[10px] text-muted-foreground tabular-nums">{c.message_count} sig · {timeAgo(c.created_at)}</p>
                <p className="text-[10px] text-muted-foreground tabular-nums">scan {c.next_scan_at ? timeUntil(c.next_scan_at) : "—"}</p>
              </div>
              {/* Quick actions on hover */}
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onClick={e => e.stopPropagation()}>
                <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => quickAction(c.id, "addressed")}>Done</Button>
                <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-destructive" onClick={() => quickAction(c.id, "close")}>Close</Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
