"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";

type Signal = {
  id: string;
  gate_id: string;
  case_id: string | null;
  raw_payload: {
    content?: string; sender_name?: string; gate_type?: string;
    phone?: string; direction?: "incoming" | "outgoing";
    is_group?: boolean; chat_name?: string; media_type?: string | null;
  };
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
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function DirectionBadge({ direction, isGroup }: { direction?: string; isGroup?: boolean }) {
  if (direction === "outgoing") return <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400">ME→</span>;
  if (isGroup) return <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400">GRP→</span>;
  return <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">→ME</span>;
}

function senderDisplay(s: Signal) {
  const p = s.raw_payload;
  const phone = p.phone;
  const name = p.sender_name || s.sender_identifier;
  if (p.direction === "outgoing") return { primary: "Me", secondary: p.chat_name || s.channel_identifier };
  if (phone) return { primary: phone, secondary: name !== phone ? name : null };
  return { primary: name, secondary: null };
}

export default function SignalsPage() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [gateFilter, setGateFilter] = useState("");
  const [assignedFilter, setAssignedFilter] = useState("");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [gates, setGates] = useState<Array<{ id: string; type: string; display_name: string }>>([]);
  const router = useRouter();
  const refreshRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (gateFilter) params.set("gate_id", gateFilter);
      if (assignedFilter) params.set("assigned", assignedFilter);
      if (search) params.set("search", search);
      params.set("limit", "200");
      const res = await fetch(`/api/signals?${params}`);
      if (!res.ok) { setError(`API error: ${res.status}`); return; }
      const data = await res.json();
      setSignals(data.signals || []);
      setTotal(data.total || 0);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, gateFilter, assignedFilter, search]);

  useEffect(() => {
    load();
    fetch("/api/gates").then(r => r.json()).then(data => {
      if (Array.isArray(data)) setGates(data);
      else if (data?.data && Array.isArray(data.data)) setGates(data.data);
    }).catch(() => {});

    // Auto-refresh every 15s
    refreshRef.current = setInterval(load, 15000);

    const sb = createBrowserClient();
    const ch = sb.channel("signals-page").on("postgres_changes", { event: "*", schema: "public", table: "signals" }, () => load()).subscribe();
    return () => { sb.removeChannel(ch); clearInterval(refreshRef.current); };
  }, [load]);

  if (loading) return <div className="space-y-3 animate-pulse">{[1,2,3].map(i => <div key={i} className="h-16 rounded-xl bg-card" />)}</div>;

  if (error) return (
    <div className="text-center py-12">
      <p className="text-lg font-medium text-destructive">Failed to load signals</p>
      <p className="text-sm text-muted-foreground mt-1">{error}</p>
      <button onClick={() => { setError(null); setLoading(true); load(); }} className="mt-3 text-primary hover:underline text-sm">Retry</button>
    </div>
  );

  const counts = {
    total: total,
    pending: signals.filter(s => s.status === "pending").length,
    last24h: signals.filter(s => Date.now() - new Date(s.occurred_at).getTime() < 86400000).length,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Signals</h1>
          <p className="text-sm text-muted-foreground">
            {counts.total} total · {counts.pending} pending · {counts.last24h} in last 24h
            <span className="ml-2 text-[10px] text-emerald-500">● live</span>
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Input placeholder="Search content, sender, phone..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-xs h-9 text-sm" />
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
          const sender = senderDisplay(s);
          const p = s.raw_payload;
          return (
            <Card key={s.id} className="border-border/50 hover:border-primary/40 transition-all">
              <CardContent className="px-4 py-3">
                <div className="flex items-center gap-3 cursor-pointer" onClick={() => setExpanded(isExpanded ? null : s.id)}>
                  <DirectionBadge direction={p.direction} isGroup={p.is_group} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground/90 font-mono">{sender.primary}</span>
                      {sender.secondary && <span className="text-xs text-muted-foreground">{sender.secondary}</span>}
                      <Badge className={`text-[10px] ${st.color}`}>{st.label}</Badge>
                      {p.is_group && <span className="text-[10px] text-violet-500">{p.chat_name}</span>}
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{p.content?.slice(0, 120)}</p>
                  </div>
                  {s.cases && (
                    <button
                      className="text-xs text-primary hover:underline shrink-0"
                      onClick={e => { e.stopPropagation(); router.push(`/cases/${s.case_id}`); }}
                    >
                      #{s.cases.case_number}
                    </button>
                  )}
                  <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(s.occurred_at)}</span>
                </div>

                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
                    <div className="bg-muted/30 rounded-lg p-3">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">Full Content</p>
                      <p className="text-sm text-foreground/90 whitespace-pre-wrap">{p.content}</p>
                    </div>
                    {s.processing_decision?.reasoning && (
                      <div className="bg-muted/30 rounded-lg p-3">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">AI Decision</p>
                        <p className="text-sm text-foreground/80">{s.processing_decision.reasoning}</p>
                      </div>
                    )}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-muted-foreground bg-muted/20 rounded-lg p-3">
                      {p.phone && <div><span className="text-[10px] uppercase text-muted-foreground/60">Phone</span><br /><span className="font-mono">{p.phone}</span></div>}
                      <div><span className="text-[10px] uppercase text-muted-foreground/60">Direction</span><br />{p.direction === "outgoing" ? "Me → Them" : "Them → Me"}</div>
                      <div><span className="text-[10px] uppercase text-muted-foreground/60">Type</span><br />{p.is_group ? "Group" : "Conversation"}</div>
                      <div><span className="text-[10px] uppercase text-muted-foreground/60">Gate</span><br />{s.gates?.display_name || s.gates?.type}</div>
                      <div><span className="text-[10px] uppercase text-muted-foreground/60">Channel</span><br />{s.channel_identifier}</div>
                      <div><span className="text-[10px] uppercase text-muted-foreground/60">Occurred</span><br />{new Date(s.occurred_at).toLocaleString("he-IL")}</div>
                      <div><span className="text-[10px] uppercase text-muted-foreground/60">Received</span><br />{new Date(s.received_at).toLocaleString("he-IL")}</div>
                      {p.media_type && <div><span className="text-[10px] uppercase text-muted-foreground/60">Media</span><br />{p.media_type}</div>}
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
