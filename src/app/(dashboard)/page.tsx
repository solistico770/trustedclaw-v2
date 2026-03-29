"use client";
import { useEffect, useState, useCallback } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";
import { DEMO_USER_ID } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";

type Case = {
  id: string; title: string | null; summary: string | null; status: string;
  urgency: string; importance: number; message_count: number;
  last_message_at: string | null; created_at: string; next_scan_at: string | null;
  case_entities: Array<{ role: string; entities: { canonical_name: string; type: string; status: string } | null }>;
};

const STATUS_COLOR: Record<string, string> = {
  pending: "text-amber-600 dark:text-amber-400",
  open: "text-blue-600 dark:text-blue-400",
  action_needed: "text-red-600 dark:text-red-400",
  in_progress: "text-violet-600 dark:text-violet-400",
  addressed: "text-emerald-600 dark:text-emerald-400",
  scheduled: "text-cyan-600 dark:text-cyan-400",
  escalated: "text-red-700 dark:text-red-300",
  closed: "text-zinc-500",
};

const URG_COLOR: Record<string, string> = {
  immediate: "text-red-600 dark:text-red-400",
  soon: "text-orange-600 dark:text-orange-400",
  normal: "text-blue-600 dark:text-blue-400",
  low: "text-zinc-500",
};

const IMP_COLOR = (n: number) => n >= 8 ? "text-red-600 dark:text-red-400" : n >= 5 ? "text-amber-600 dark:text-amber-400" : "text-blue-600 dark:text-blue-400";
const IMP_BG = (n: number) => n >= 8 ? "bg-red-100 dark:bg-red-500/15" : n >= 5 ? "bg-amber-100 dark:bg-amber-500/15" : "bg-blue-100 dark:bg-blue-500/15";

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) {
    const mins = Math.round(-diff / 60000);
    if (mins < 60) return `in ${mins}m`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `in ${hrs}h`;
    return `in ${Math.round(hrs / 24)}d`;
  }
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
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
    const body = action === "close"
      ? { user_id: DEMO_USER_ID, reason: "Closed from board" }
      : { user_id: DEMO_USER_ID, status: action };
    await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    load();
  }

  const filtered = cases.filter(c => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (c.title || "").toLowerCase().includes(s) || (c.summary || "").toLowerCase().includes(s) ||
      c.case_entities?.some(ce => ce.entities?.canonical_name?.toLowerCase().includes(s));
  });

  if (loading) return <div className="space-y-4 animate-pulse">{[1,2,3].map(i => <div key={i} className="h-40 rounded-xl bg-card" />)}</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Cases</h1>

      <div className="flex items-center gap-3">
        <Input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-xs h-9 text-sm" />
        <select className="h-9 bg-input border border-border rounded-lg px-3 text-sm text-foreground" value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="">All Open</option>
          <option value="pending">Pending Scan</option>
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
          const entities = c.case_entities?.filter(ce => ce.entities) || [];
          return (
            <Card key={c.id} className="group cursor-pointer border-border/50 hover:border-primary/40 transition-all" onClick={() => router.push(`/cases/${c.id}`)}>
              <CardContent className="p-0">
                {/* Title row */}
                <div className="px-5 pt-4 pb-2">
                  <h3 className="text-lg font-semibold text-foreground leading-snug">
                    {c.title || `Case ${c.id.slice(0, 8)}`}
                  </h3>
                  {c.summary && <p className="text-sm text-muted-foreground mt-1">{c.summary}</p>}
                </div>

                {/* Info grid — clear labeled fields */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border/50 mx-5 rounded-lg overflow-hidden mb-3">
                  <div className="bg-card p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Status</p>
                    <p className={`text-sm font-bold mt-0.5 ${STATUS_COLOR[c.status] || ""}`}>{c.status.replace("_", " ")}</p>
                  </div>
                  <div className="bg-card p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Urgency</p>
                    <p className={`text-sm font-bold mt-0.5 ${URG_COLOR[c.urgency] || ""}`}>{c.urgency}</p>
                  </div>
                  <div className="bg-card p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Importance</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-lg font-black ${IMP_COLOR(c.importance)}`}>{c.importance}</span>
                      <span className="text-xs text-muted-foreground">/10</span>
                      <div className="flex gap-[2px] mr-1">
                        {Array.from({ length: 10 }, (_, i) => (
                          <div key={i} className={`w-[5px] h-3 rounded-[1px] ${i < c.importance ? IMP_BG(c.importance).replace("bg-", "bg-").replace("dark:", "dark:") + " " + IMP_COLOR(c.importance).replace("text-", "bg-").split(" ")[0] : "bg-border"}`} />
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="bg-card p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Next Scan</p>
                    <p className="text-sm font-bold mt-0.5 text-foreground/80">
                      {c.next_scan_at ? timeAgo(c.next_scan_at) : "—"}
                    </p>
                  </div>
                </div>

                {/* Entities + meta row */}
                <div className="px-5 pb-4 flex items-center gap-3 flex-wrap">
                  {entities.length > 0 && (
                    <div className="flex gap-1.5 flex-wrap">
                      {entities.slice(0, 4).map((ce, i) => (
                        <span key={i} className="text-xs px-2 py-1 rounded-md bg-secondary text-secondary-foreground font-medium">
                          {ce.entities?.canonical_name}
                          <span className="opacity-50 ml-1">{ce.entities?.type}</span>
                        </span>
                      ))}
                      {entities.length > 4 && <span className="text-xs text-muted-foreground">+{entities.length - 4}</span>}
                    </div>
                  )}
                  <span className="text-xs text-muted-foreground">{c.message_count} msgs</span>
                  {c.last_message_at && <span className="text-xs text-muted-foreground">{timeAgo(c.last_message_at)}</span>}

                  <div className="flex gap-1.5 mr-auto opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                    <Button size="sm" variant="secondary" className="h-7 text-[11px]" onClick={() => act(c.id, "addressed")}>Addressed</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => act(c.id, "close")}>Close</Button>
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
