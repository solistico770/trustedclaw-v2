"use client";
import { useEffect, useState, useCallback } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";
import { DEMO_USER_ID } from "@/lib/constants";
import { URGENCY_LABELS, IMPORTANCE_LABELS, LEVEL_COLORS, getScanIntervalSeconds, getScanIntervalLabel } from "@/lib/scan-intervals";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";

type Case = {
  id: string; title: string | null; summary: string | null; status: string;
  urgency: number; importance: number; message_count: number;
  last_message_at: string | null; created_at: string; next_scan_at: string | null;
  case_entities: Array<{ role: string; entities: { canonical_name: string; type: string; status: string } | null }>;
};

const STATUS_STYLE: Record<string, { color: string; label: string }> = {
  pending: { color: "text-amber-600 dark:text-amber-400", label: "Pending" },
  open: { color: "text-blue-600 dark:text-blue-400", label: "Open" },
  action_needed: { color: "text-red-600 dark:text-red-400", label: "Action Needed" },
  in_progress: { color: "text-violet-600 dark:text-violet-400", label: "In Progress" },
  addressed: { color: "text-emerald-600 dark:text-emerald-400", label: "Addressed" },
  scheduled: { color: "text-cyan-600 dark:text-cyan-400", label: "Scheduled" },
  escalated: { color: "text-red-700 dark:text-red-300", label: "Escalated" },
  closed: { color: "text-zinc-500", label: "Closed" },
};

function LevelDot({ level }: { level: number }) {
  const c = LEVEL_COLORS[level] || LEVEL_COLORS[3];
  return <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-bold ${c.bg} ${c.text}`}>{level}</span>;
}

function timeUntil(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "now";
  const sec = Math.round(diff / 1000);
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  if (sec < 86400) return `${Math.round(sec / 3600)}h`;
  return `${Math.round(sec / 86400)}d`;
}

export default function CasesBoard() {
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const router = useRouter();

  const load = useCallback(async () => {
    const url = `/api/cases?user_id=${DEMO_USER_ID}${filter ? `&status=${filter}` : ""}&sort_by=importance`;
    const data = await (await fetch(url)).json();
    if (Array.isArray(data)) setCases(data);
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    load();
    const sb = createBrowserClient();
    const ch = sb.channel("board").on("postgres_changes", { event: "*", schema: "public", table: "cases" }, () => load()).subscribe();
    return () => { sb.removeChannel(ch); };
  }, [load]);

  async function act(caseId: string, action: string) {
    const endpoint = action === "close" ? `/api/cases/${caseId}/close` : `/api/cases/${caseId}/status`;
    const body = action === "close" ? { user_id: DEMO_USER_ID, reason: "Closed" } : { user_id: DEMO_USER_ID, status: action };
    await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    load();
  }

  const filtered = cases.filter(c => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (c.title || "").toLowerCase().includes(s) || (c.summary || "").toLowerCase().includes(s) ||
      c.case_entities?.some(ce => ce.entities?.canonical_name?.toLowerCase().includes(s));
  });

  if (loading) return <div className="space-y-3 animate-pulse">{[1,2,3].map(i => <div key={i} className="h-40 rounded-xl bg-card" />)}</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Cases</h1>

      <div className="flex items-center gap-3">
        <Input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-xs h-9 text-sm" />
        <select className="h-9 bg-input border border-border rounded-lg px-3 text-sm text-foreground" value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="">All Open</option>
          <option value="pending">Pending</option>
          <option value="action_needed,escalated">Action Needed</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="closed">Closed</option>
        </select>
        <span className="text-sm text-muted-foreground">{filtered.length} cases</span>
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16">
          <p className="text-lg font-medium text-foreground/80">All clear</p>
          <p className="text-sm text-muted-foreground mt-1">No open cases</p>
        </div>
      )}

      <div className="space-y-3">
        {filtered.map(c => {
          const st = STATUS_STYLE[c.status] || STATUS_STYLE.open;
          const entities = c.case_entities?.filter(ce => ce.entities) || [];
          const scanInterval = getScanIntervalSeconds(c.urgency, c.importance);

          return (
            <Card key={c.id} className="group cursor-pointer border-border/50 hover:border-primary/40 transition-all" onClick={() => router.push(`/cases/${c.id}`)}>
              <CardContent className="p-0">
                {/* Title */}
                <div className="px-5 pt-4 pb-2">
                  <h3 className="text-lg font-semibold text-foreground leading-snug">
                    {c.title || `Case ${c.id.slice(0, 8)}`}
                  </h3>
                  {c.summary && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{c.summary}</p>}
                </div>

                {/* 5-column info grid */}
                <div className="grid grid-cols-5 gap-px bg-border/50 mx-5 rounded-lg overflow-hidden mb-3">
                  <div className="bg-card p-3 text-center">
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium">Status</p>
                    <p className={`text-sm font-bold mt-1 ${st.color}`}>{st.label}</p>
                  </div>
                  <div className="bg-card p-3 text-center">
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium">Urgency</p>
                    <div className="flex items-center justify-center gap-1.5 mt-1">
                      <LevelDot level={c.urgency} />
                      <span className="text-xs text-muted-foreground">{URGENCY_LABELS[c.urgency]}</span>
                    </div>
                  </div>
                  <div className="bg-card p-3 text-center">
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium">Importance</p>
                    <div className="flex items-center justify-center gap-1.5 mt-1">
                      <LevelDot level={c.importance} />
                      <span className="text-xs text-muted-foreground">{IMPORTANCE_LABELS[c.importance]}</span>
                    </div>
                  </div>
                  <div className="bg-card p-3 text-center">
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium">Next Scan</p>
                    <p className="text-sm font-bold mt-1 text-foreground/80">
                      {c.next_scan_at ? timeUntil(c.next_scan_at) : "—"}
                    </p>
                    <p className="text-[9px] text-muted-foreground">every {getScanIntervalLabel(scanInterval)}</p>
                  </div>
                  <div className="bg-card p-3 text-center">
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium">Entities</p>
                    <p className="text-sm font-bold mt-1 text-foreground/80">{entities.length}</p>
                    <p className="text-[9px] text-muted-foreground">{c.message_count} msgs</p>
                  </div>
                </div>

                {/* Entities row + actions */}
                <div className="px-5 pb-4 flex items-center gap-2 flex-wrap">
                  {entities.slice(0, 4).map((ce, i) => (
                    <span key={i} className="text-xs px-2 py-0.5 rounded-md bg-secondary text-secondary-foreground">{ce.entities?.canonical_name}</span>
                  ))}
                  <div className="flex gap-1.5 mr-auto opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                    <Button size="sm" variant="secondary" className="h-6 text-[10px]" onClick={() => act(c.id, "addressed")}>Addressed</Button>
                    <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => act(c.id, "close")}>Close</Button>
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
