"use client";
import { useEffect, useState, useCallback } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";
import { DEMO_USER_ID } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
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

const STATUS_STYLE: Record<string, { bg: string; label: string }> = {
  pending: { bg: "bg-amber-500/20 text-amber-300 border-amber-500/30", label: "Pending Scan" },
  open: { bg: "bg-blue-500/20 text-blue-300 border-blue-500/30", label: "Open" },
  action_needed: { bg: "bg-red-500/20 text-red-300 border-red-500/30", label: "Action Needed" },
  in_progress: { bg: "bg-violet-500/20 text-violet-300 border-violet-500/30", label: "In Progress" },
  addressed: { bg: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30", label: "Addressed" },
  scheduled: { bg: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30", label: "Scheduled" },
  escalated: { bg: "bg-red-600/20 text-red-200 border-red-500/30", label: "Escalated" },
  closed: { bg: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30", label: "Closed" },
};

const URG_STYLE: Record<string, string> = {
  immediate: "text-red-400", soon: "text-orange-400", normal: "text-blue-400", low: "text-zinc-500",
};

function ImportanceBar({ level }: { level: number }) {
  const color = level >= 8 ? "bg-red-400" : level >= 5 ? "bg-amber-400" : "bg-blue-400";
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-[3px]">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className={`w-[6px] h-4 rounded-[2px] transition-all ${i < level ? color : "bg-muted"}`} />
        ))}
      </div>
      <span className="text-xs font-mono font-bold text-foreground/70">{level}</span>
    </div>
  );
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
      : { user_id: DEMO_USER_ID, status: action, reason: `Set ${action}` };
    await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    load();
  }

  const filtered = cases.filter(c => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (c.title || "").toLowerCase().includes(s) || (c.summary || "").toLowerCase().includes(s) ||
      c.case_entities?.some(ce => ce.entities?.canonical_name?.toLowerCase().includes(s));
  });

  if (loading) return (
    <div className="space-y-4 animate-pulse">
      {[1,2,3].map(i => <div key={i} className="h-32 rounded-xl bg-card" />)}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cases</h1>
          <p className="text-sm text-muted-foreground mt-1">{filtered.length} open cases</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Input
          placeholder="Search cases..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-xs h-9 text-sm"
        />
        <select
          className="h-9 bg-input border border-border rounded-lg px-3 text-sm text-foreground"
          value={filter}
          onChange={e => setFilter(e.target.value)}
        >
          <option value="">All Open</option>
          <option value="pending">Pending Scan</option>
          <option value="action_needed,escalated">Action Needed</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="scheduled">Scheduled</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-foreground/80">All clear</h3>
          <p className="text-sm text-muted-foreground mt-1">No open cases right now</p>
        </div>
      )}

      {/* Cases */}
      <div className="space-y-3">
        {filtered.map(c => {
          const st = STATUS_STYLE[c.status] || STATUS_STYLE.open;
          const activeEntities = c.case_entities?.filter(ce => ce.entities?.status === "active" || ce.entities?.status === "proposed") || [];

          return (
            <Card key={c.id}
              className="group cursor-pointer border-border/50 hover:border-primary/30 transition-all hover:shadow-lg hover:shadow-primary/5"
              onClick={() => router.push(`/cases/${c.id}`)}
            >
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  {/* Importance indicator */}
                  <div className="flex flex-col items-center gap-1 pt-0.5">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold ${
                      c.importance >= 8 ? "bg-red-500/15 text-red-400" :
                      c.importance >= 5 ? "bg-amber-500/15 text-amber-400" :
                      "bg-blue-500/15 text-blue-400"
                    }`}>
                      {c.importance}
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <Badge variant="outline" className={`text-[11px] font-medium border ${st.bg}`}>{st.label}</Badge>
                      <span className={`text-[11px] font-medium ${URG_STYLE[c.urgency]}`}>{c.urgency}</span>
                      <span className="text-[11px] text-muted-foreground">{c.message_count} msgs</span>
                      {c.last_message_at && (
                        <span className="text-[11px] text-muted-foreground">
                          {new Date(c.last_message_at).toLocaleString("he-IL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      )}
                      {c.next_scan_at && c.status !== "closed" && (
                        <span className="text-[11px] text-cyan-400/70 mr-auto">
                          scan: {new Date(c.next_scan_at).toLocaleString("he-IL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      )}
                    </div>

                    <h3 className="font-semibold text-[15px] text-foreground/90 leading-snug truncate">
                      {c.title || `Case ${c.id.slice(0, 8)}`}
                    </h3>

                    {c.summary && (
                      <p className="text-[13px] text-muted-foreground mt-1 line-clamp-2">{c.summary}</p>
                    )}

                    <div className="flex items-center gap-3 mt-3">
                      <ImportanceBar level={c.importance} />
                      {activeEntities.length > 0 && (
                        <div className="flex gap-1.5 flex-wrap">
                          {activeEntities.slice(0, 3).map((ce, i) => (
                            <span key={i} className="text-[11px] px-2 py-0.5 rounded-md bg-secondary text-secondary-foreground">
                              {ce.entities?.canonical_name}
                            </span>
                          ))}
                          {activeEntities.length > 3 && (
                            <span className="text-[11px] text-muted-foreground">+{activeEntities.length - 3}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Quick actions */}
                  <div className="flex flex-col gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
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
