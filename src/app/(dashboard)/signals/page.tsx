"use client";
import { useEffect, useState, useCallback } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";

type Signal = {
  id: string;
  gate_id: string;
  case_id: string | null;
  raw_payload: { content?: string; sender_name?: string; gate_type?: string };
  sender_identifier: string;
  channel_identifier: string;
  status: "pending" | "processed" | "ignored";
  processing_decision: { reasoning?: string; action?: string; case_id?: string } | null;
  occurred_at: string;
  received_at: string;
  gates: { type: string; display_name: string } | null;
  cases: { case_number: number; title: string } | null;
};

const STATUS_STYLE: Record<string, { color: string; label: string }> = {
  pending: { color: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400", label: "Pending" },
  processed: { color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400", label: "Processed" },
  ignored: { color: "bg-zinc-100 text-zinc-600 dark:bg-zinc-500/15 dark:text-zinc-400", label: "Ignored" },
};

function timeAgo(iso: string) {
  const h = Math.round((Date.now() - new Date(iso).getTime()) / 3600000);
  if (h < 1) return `${Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000))}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export default function SignalsPage() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [gateFilter, setGateFilter] = useState("");
  const [assignedFilter, setAssignedFilter] = useState("");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [gates, setGates] = useState<Array<{ id: string; type: string; display_name: string }>>([]);
  const router = useRouter();

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (gateFilter) params.set("gate_id", gateFilter);
    if (assignedFilter) params.set("assigned", assignedFilter);
    if (search) params.set("search", search);
    const res = await fetch(`/api/signals?${params}`);
    const data = await res.json();
    if (data.signals) setSignals(data.signals);
    setLoading(false);
  }, [statusFilter, gateFilter, assignedFilter, search]);

  useEffect(() => {
    load();
    // Load gates for filter
    fetch("/api/gates").then(r => r.json()).then(data => {
      if (Array.isArray(data)) setGates(data);
    });
    const sb = createBrowserClient();
    const ch = sb.channel("signals-page").on("postgres_changes", { event: "*", schema: "public", table: "signals" }, () => load()).subscribe();
    return () => { sb.removeChannel(ch); };
  }, [load]);

  if (loading) return <div className="space-y-3 animate-pulse">{[1,2,3].map(i => <div key={i} className="h-16 rounded-xl bg-card" />)}</div>;

  const counts = {
    total: signals.length,
    pending: signals.filter(s => s.status === "pending").length,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Signals</h1>
          <p className="text-sm text-muted-foreground">{counts.total} signals{counts.pending > 0 ? ` · ${counts.pending} pending` : ""}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Input placeholder="Search content, sender..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-xs h-9 text-sm" />
        <select className="h-9 bg-input border border-border rounded-lg px-3 text-sm text-foreground" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="processed">Processed</option>
          <option value="ignored">Ignored</option>
        </select>
        <select className="h-9 bg-input border border-border rounded-lg px-3 text-sm text-foreground" value={gateFilter} onChange={e => setGateFilter(e.target.value)}>
          <option value="">All Gates</option>
          {gates.map(g => <option key={g.id} value={g.id}>{g.display_name}</option>)}
        </select>
        <select className="h-9 bg-input border border-border rounded-lg px-3 text-sm text-foreground" value={assignedFilter} onChange={e => setAssignedFilter(e.target.value)}>
          <option value="">All Assignment</option>
          <option value="true">Assigned</option>
          <option value="false">Unassigned</option>
        </select>
      </div>

      {signals.length === 0 && (
        <div className="text-center py-12">
          <p className="text-lg font-medium text-foreground/80">No signals</p>
          <p className="text-sm text-muted-foreground mt-1">Signals will appear here as they arrive through gates</p>
        </div>
      )}

      {/* Signal list */}
      <div className="space-y-2">
        {signals.map(s => {
          const st = STATUS_STYLE[s.status];
          const isExpanded = expanded === s.id;
          return (
            <Card key={s.id} className="border-border/50 hover:border-primary/40 transition-all">
              <CardContent className="px-4 py-3">
                <div className="flex items-center gap-3 cursor-pointer" onClick={() => setExpanded(isExpanded ? null : s.id)}>
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                    {(s.sender_identifier || "?")[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground/90">{s.sender_identifier}</span>
                      <Badge className={`text-[10px] ${st.color}`}>{st.label}</Badge>
                      <span className="text-[10px] text-muted-foreground">{s.gates?.type || "unknown"}</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{s.raw_payload?.content?.slice(0, 100)}</p>
                  </div>
                  {s.cases && (
                    <button
                      className="text-xs text-primary hover:underline shrink-0"
                      onClick={e => { e.stopPropagation(); router.push(`/cases/${s.case_id}`); }}
                    >
                      #{s.cases.case_number}
                    </button>
                  )}
                  <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(s.received_at)}</span>
                </div>

                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
                    <div className="bg-muted/30 rounded-lg p-3">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">Full Content</p>
                      <p className="text-sm text-foreground/90 whitespace-pre-wrap">{s.raw_payload?.content}</p>
                    </div>
                    {s.processing_decision?.reasoning && (
                      <div className="bg-muted/30 rounded-lg p-3">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">AI Decision</p>
                        <p className="text-sm text-foreground/80">{s.processing_decision.reasoning}</p>
                      </div>
                    )}
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span>Gate: {s.gates?.display_name || s.gates?.type}</span>
                      <span>Channel: {s.channel_identifier}</span>
                      <span>Received: {new Date(s.received_at).toLocaleString("he-IL")}</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
