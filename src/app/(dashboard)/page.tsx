"use client";
import { useEffect, useState, useCallback } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";
import { URGENCY_LABELS, IMPORTANCE_LABELS, LEVEL_COLORS, getScanIntervalSeconds, getScanIntervalLabel } from "@/lib/scan-intervals";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";

type Case = {
  id: string; case_number: number; title: string | null; summary: string | null; status: string;
  urgency: number; importance: number; message_count: number;
  last_message_at: string | null; created_at: string; next_scan_at: string | null;
  case_entities: Array<{ role: string; entities: { canonical_name: string; type: string } | null }>;
};

type Stats = {
  attention: number; critical: number; open: number; handled: number; entities: number;
  pending_signals: number; signals_24h: number; signals_total: number; overdue_tasks: number;
  last_scan_ago_sec: number | null; next_scan_in_sec: number | null; cases_scanned_today: number;
  latest_empowerment: string | null;
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

function fmtSec(s: number) { return s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`; }

function priorityScore(c: Case): number {
  return (c.status === "action_needed" || c.status === "escalated" ? 100 : 0) + (6 - c.urgency) * 10 + (6 - c.importance) * 5 + Math.min(10, (Date.now() - new Date(c.created_at).getTime()) / 86400000);
}

export default function CasesBoard() {
  const [cases, setCases] = useState<Case[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [dashFilter, setDashFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const router = useRouter();

  const load = useCallback(async () => {
    // "critical" is not a status — it's urgency<=1. Fetch all open, filter client-side.
    const statusFilter = (dashFilter === "critical") ? "" : (dashFilter || filter);
    const [casesData, statsData] = await Promise.all([
      fetch(`/api/cases${statusFilter ? `?status=${statusFilter}` : ""}`).then(r => r.json()),
      fetch(`/api/cases/stats`).then(r => r.json()),
    ]);
    setCases(casesData?.data || (Array.isArray(casesData) ? casesData : []));
    if (statsData.attention !== undefined) setStats(statsData);
    setLoading(false);
  }, [filter, dashFilter]);

  useEffect(() => {
    load();
    // Auto-refresh every 30s
    const interval = setInterval(load, 30000);
    const sb = createBrowserClient();
    const ch = sb.channel("board")
      .on("postgres_changes", { event: "*", schema: "public", table: "cases" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "signals" }, () => load())
      .subscribe();
    return () => { sb.removeChannel(ch); clearInterval(interval); };
  }, [load]);

  function clickDashStat(filterValue: string | null) {
    if (filterValue === "entities") { router.push("/entities"); return; }
    if (filterValue === "pending_signals") { router.push("/signals?status=pending"); return; }
    if (filterValue === "overdue_tasks") { router.push("/tasks?due=overdue"); return; }
    setDashFilter(prev => prev === filterValue ? null : filterValue);
    setFilter("");
  }

  async function act(caseId: string, action: string) {
    const endpoint = action === "close" ? `/api/cases/${caseId}/close` : `/api/cases/${caseId}/status`;
    const body = action === "close" ? { reason: "Closed" } : { status: action };
    await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    load();
  }

  const filtered = cases.filter(c => {
    // Dashboard "critical" filter = urgency 1
    if (dashFilter === "critical" && c.urgency > 1) return false;
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

  const dashStats = [
    { key: "pending_signals", label: "Pending", value: stats?.pending_signals || 0, color: (stats?.pending_signals || 0) > 0 ? "text-amber-600 dark:text-amber-400" : "text-foreground/30", icon: "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" },
    { key: "signals_24h", label: "24h Signals", value: stats?.signals_24h || 0, color: (stats?.signals_24h || 0) > 0 ? "text-cyan-600 dark:text-cyan-400" : "text-foreground/30", icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" },
    { key: "action_needed,escalated", label: "Attention", value: stats?.attention || 0, color: (stats?.attention || 0) > 0 ? "text-red-600 dark:text-red-400" : "text-foreground/30", icon: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.962-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" },
    { key: "critical", label: "Critical", value: stats?.critical || 0, color: (stats?.critical || 0) > 0 ? "text-red-600 dark:text-red-400" : "text-foreground/30", icon: "M13 10V3L4 14h7v7l9-11h-7z" },
    { key: "open,in_progress,scheduled", label: "Open", value: stats?.open || 0, color: "text-blue-600 dark:text-blue-400", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" },
    { key: "overdue_tasks", label: "Overdue", value: stats?.overdue_tasks || 0, color: (stats?.overdue_tasks || 0) > 0 ? "text-red-600 dark:text-red-400" : "text-foreground/30", icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" },
    { key: "addressed,closed", label: "Handled", value: stats?.handled || 0, color: "text-emerald-600 dark:text-emerald-400", icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" },
    { key: "entities", label: "Entities", value: stats?.entities || 0, color: "text-violet-600 dark:text-violet-400", icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" },
  ];

  return (
    <div className="space-y-4">
      {/* Empowerment line */}
      {stats?.latest_empowerment && (
        <div className="bg-primary/5 dark:bg-primary/10 border border-primary/20 rounded-xl px-5 py-3 text-sm text-foreground/90 font-medium">
          {stats.latest_empowerment}
        </div>
      )}

      {/* Dashboard stats — clickable */}
      <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
        {dashStats.map(s => {
          const active = dashFilter === s.key;
          return (
            <button key={s.key} onClick={() => clickDashStat(s.key)}
              className={`rounded-xl p-3 text-center transition-all border ${
                active ? "border-primary bg-primary/10 dark:bg-primary/15 shadow-sm" : "border-border/50 bg-card hover:border-primary/30"
              }`}>
              <svg className={`w-4 h-4 mx-auto mb-1 ${s.color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d={s.icon} />
              </svg>
              <p className={`text-xl font-black ${s.color}`}>{s.value}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{s.label}</p>
            </button>
          );
        })}
      </div>

      {/* System status bar */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground px-1">
        <span className="text-emerald-500">● live</span>
        <span>Last scan: {stats?.last_scan_ago_sec != null ? fmtSec(stats.last_scan_ago_sec) + " ago" : "—"}</span>
        <span>{stats?.cases_scanned_today || 0} scans today</span>
        <span>Next: {stats?.next_scan_in_sec != null ? fmtSec(stats.next_scan_in_sec) : "—"}</span>
        <span>{stats?.signals_total || 0} signals total</span>
        {dashFilter && <button onClick={() => setDashFilter(null)} className="text-primary hover:underline mr-auto">Clear filter</button>}
      </div>

      {/* Search + filter */}
      <div className="flex items-center gap-3">
        <Input placeholder="Search cases, entities, #number..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-xs h-9 text-sm" />
        <select className="h-9 bg-input border border-border rounded-lg px-3 text-sm text-foreground" value={filter} onChange={e => { setFilter(e.target.value); setDashFilter(null); }}>
          <option value="">All Open</option>
          <option value="action_needed,escalated">Action Needed</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="addressed">Addressed</option>
          <option value="closed">Closed</option>
        </select>
        <span className="text-sm text-muted-foreground">{filtered.length} cases</span>
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
