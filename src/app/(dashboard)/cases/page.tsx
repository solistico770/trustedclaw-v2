"use client";
import { Suspense, useEffect, useState, useCallback } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";
import { URGENCY_LABELS, IMPORTANCE_LABELS, LEVEL_COLORS, getScanIntervalSeconds, getScanIntervalLabel } from "@/lib/scan-intervals";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useRouter, useSearchParams } from "next/navigation";

export default function CasesPageWrapper() {
  return <Suspense fallback={<div className="space-y-3 animate-pulse">{[1,2,3].map(i => <div key={i} className="h-20 rounded-xl bg-card" />)}</div>}><CasesPage /></Suspense>;
}

type Case = {
  id: string; case_number: number; title: string | null; summary: string | null; status: string;
  urgency: number; importance: number; message_count: number;
  last_message_at: string | null; created_at: string; next_scan_at: string | null;
  case_entities: Array<{ role: string; entities: { canonical_name: string; type: string } | null }>;
};

const STATUS_COLOR: Record<string, string> = {
  open: "text-blue-600 dark:text-blue-400", action_needed: "text-red-600 dark:text-red-400",
  in_progress: "text-violet-600 dark:text-violet-400", addressed: "text-emerald-600 dark:text-emerald-400",
  scheduled: "text-cyan-600 dark:text-cyan-400", escalated: "text-red-700 dark:text-red-300", closed: "text-zinc-500",
};
const STATUS_LABEL: Record<string, string> = {
  open: "Open", action_needed: "Action Needed", in_progress: "In Progress",
  addressed: "Addressed", scheduled: "Scheduled", escalated: "Escalated", closed: "Closed",
};

function LevelBadge({ level, label }: { level: number; label: string }) {
  const c = LEVEL_COLORS[level] || LEVEL_COLORS[3];
  return <span className={`inline-flex items-center gap-1 text-xs font-semibold ${c.text}`} title={label}><span className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold ${c.bg}`}>{level}</span></span>;
}

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
  return (c.status === "action_needed" || c.status === "escalated" ? 100 : 0) + (6 - c.urgency) * 10 + (6 - c.importance) * 5 + Math.min(10, (Date.now() - new Date(c.created_at).getTime()) / 86400000);
}

function CasesPage() {
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();

  // Read URL params for pre-filtering
  useEffect(() => {
    const urlStatus = searchParams.get("status");
    const urlFilter = searchParams.get("filter");
    if (urlStatus) setFilter(urlStatus);
    if (urlFilter === "critical") setFilter("critical");
  }, [searchParams]);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (filter && filter !== "critical") params.set("status", filter);
    if (filter === "critical") params.set("filter", "critical");
    const res = await fetch(`/api/cases?${params}`);
    const data = await res.json();
    setCases(data?.data || (Array.isArray(data) ? data : []));
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    const sb = createBrowserClient();
    const ch = sb.channel("cases-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "cases" }, () => load())
      .subscribe();
    return () => { sb.removeChannel(ch); clearInterval(interval); };
  }, [load]);

  async function act(caseId: string, action: string) {
    const endpoint = action === "close" ? `/api/cases/${caseId}/close` : `/api/cases/${caseId}/status`;
    const body = action === "close" ? { reason: "Closed" } : { status: action };
    await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    load();
  }

  const filtered = cases.filter(c => {
    if (filter === "critical" && c.urgency > 1) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return (c.title || "").toLowerCase().includes(s) || (c.summary || "").toLowerCase().includes(s) ||
      String(c.case_number).includes(s) || c.case_entities?.some(ce => ce.entities?.canonical_name?.toLowerCase().includes(s));
  }).sort((a, b) => priorityScore(b) - priorityScore(a));

  function dedupEntities(ents: Case["case_entities"]) {
    const seen = new Set<string>();
    return (ents || []).filter(ce => { const n = ce.entities?.canonical_name?.toLowerCase(); if (!n || seen.has(n)) return false; seen.add(n); return true; });
  }

  if (loading) return <div className="space-y-3 animate-pulse">{[1,2,3].map(i => <div key={i} className="h-20 rounded-xl bg-card" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">Cases</h1>
      </div>

      {/* Search + filter */}
      <div className="flex items-center gap-3">
        <Input placeholder="Search cases, entities, #number..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-xs h-9 text-sm" />
        <select className="h-9 bg-input border border-border rounded-lg px-3 text-sm text-foreground" value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="">All Open</option>
          <option value="action_needed,escalated">Action Needed</option>
          <option value="critical">Critical (U1)</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="addressed">Addressed</option>
          <option value="closed">Closed</option>
        </select>
        <span className="text-sm text-muted-foreground">{filtered.length} cases</span>
        {filter && <button onClick={() => setFilter("")} className="text-xs text-primary hover:underline">Clear filter</button>}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12">
          <p className="text-lg font-medium text-foreground/80">All clear</p>
          <p className="text-sm text-muted-foreground mt-1">No cases match</p>
        </div>
      )}

      {/* Case list */}
      <div className="space-y-2">
        {filtered.map(c => {
          const entities = dedupEntities(c.case_entities);
          const scanInterval = getScanIntervalSeconds(c.urgency, c.importance);
          return (
            <Card key={c.id} className="group cursor-pointer border-border/50 hover:border-primary/40 transition-all" onClick={() => router.push(`/cases/${c.id}`)}>
              <CardContent className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-muted-foreground w-8 shrink-0">#{c.case_number}</span>
                  <div className="flex gap-1 shrink-0">
                    <LevelBadge level={c.urgency} label={`U: ${URGENCY_LABELS[c.urgency]}`} />
                    <LevelBadge level={c.importance} label={`I: ${IMPORTANCE_LABELS[c.importance]}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-foreground truncate">{c.title || `Case #${c.case_number}`}</span>
                      <span className={`text-[10px] font-medium ${STATUS_COLOR[c.status]}`}>{STATUS_LABEL[c.status]}</span>
                    </div>
                    {c.summary && <p className="text-xs text-muted-foreground truncate mt-0.5">{c.summary}</p>}
                  </div>
                  <div className="hidden sm:flex gap-1 shrink-0">
                    {entities.slice(0, 2).map((ce, i) => (
                      <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground truncate max-w-24">{ce.entities?.canonical_name}</span>
                    ))}
                    {entities.length > 2 && <span className="text-[10px] text-muted-foreground">+{entities.length - 2}</span>}
                  </div>
                  <div className="text-left shrink-0 w-20">
                    <p className="text-[10px] text-muted-foreground">{c.message_count} signals · {timeAgo(c.created_at)}</p>
                    <p className="text-[10px] text-muted-foreground">scan {c.next_scan_at ? timeUntil(c.next_scan_at) : "—"} <span className="opacity-50">({getScanIntervalLabel(scanInterval)})</span></p>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onClick={e => e.stopPropagation()}>
                    <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => act(c.id, "addressed")}>Done</Button>
                    <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-destructive" onClick={() => act(c.id, "close")}>Close</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
