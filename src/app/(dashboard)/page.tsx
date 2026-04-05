"use client";
import { useEffect, useState, useCallback } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

/* ── types ── */
type Metrics = {
  attention: number; critical: number; open: number; handled: number; entities: number;
  pending_signals: number; signals_24h: number; signals_total: number; overdue_tasks: number;
};
type Scanner = { last_scan_ago_sec: number | null; next_scan_in_sec: number | null; cases_scanned_today: number };
type Gate = { id: string; type: string; display_name: string; status: string; metadata: Record<string, string> };
type ActivityItem = {
  id: string; case_id: string; empowerment_line: string | null;
  commands_executed: Record<string, unknown>[] | null; skills_pulled: string[] | null;
  created_at: string; case: { case_number: number; title: string | null; status: string } | null;
};
type DashboardData = {
  metrics: Metrics; scanner: Scanner; latest_empowerment: string | null;
  gates: Gate[]; recent_activity: ActivityItem[];
};
type CaseItem = {
  id: string; case_number: number; title: string | null; summary: string | null; status: string;
  urgency: number; importance: number; message_count: number;
  last_message_at: string | null; created_at: string; next_scan_at: string | null;
  case_entities: Array<{ role: string; entities: { canonical_name: string; type: string } | null }>;
};
type Signal = {
  id: string; gate_id: string; case_id: string | null;
  raw_payload: { content?: string; sender_name?: string; direction?: string; is_group?: boolean; chat_name?: string; phone?: string };
  status: string; occurred_at: string;
  gates: { type: string; display_name: string } | null;
  cases: { case_number: number; title: string } | null;
};
type Task = {
  id: string; case_id: string; title: string; description: string | null;
  status: "open" | "closed"; due_at: string | null; created_at: string;
  cases: { case_number: number; title: string } | null;
};

/* ── helpers ── */
function fmtSec(s: number) { return s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`; }
function timeAgo(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

const URGENCY_COLORS: Record<number, string> = {
  1: "bg-red-500 text-white", 2: "bg-orange-500 text-white", 3: "bg-amber-500 text-white",
  4: "bg-blue-500 text-white", 5: "bg-zinc-400 text-white",
};

const STATUS_DOT: Record<string, string> = {
  open: "bg-blue-500", action_needed: "bg-red-500", in_progress: "bg-violet-500",
  addressed: "bg-emerald-500", scheduled: "bg-cyan-500", escalated: "bg-red-600", closed: "bg-zinc-400",
};

const GATE_ICONS: Record<string, string> = { whatsapp: "WA", telegram: "TG", email: "EM", slack: "SL" };
const GATE_BG: Record<string, string> = {
  whatsapp: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  telegram: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
};

function gateStatus(meta: Record<string, string>): { text: string; dot: string } {
  if (!meta.last_heartbeat) return { text: "no data", dot: "bg-zinc-400" };
  const mins = Math.floor((Date.now() - new Date(meta.last_heartbeat).getTime()) / 60000);
  if (mins < 10) return { text: "online", dot: "bg-emerald-500" };
  if (mins < 30) return { text: `${mins}m`, dot: "bg-amber-500" };
  return { text: "offline", dot: "bg-red-500" };
}

function senderName(s: Signal) {
  const p = s.raw_payload || {};
  if (p.direction === "outgoing") return "Me";
  return p.sender_name || p.phone || "Unknown";
}

/* ── component ── */
export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCase, setExpandedCase] = useState<string | null>(null);
  const router = useRouter();

  const load = useCallback(async () => {
    try {
      const [dashRes, casesRes, sigRes, taskRes] = await Promise.all([
        fetch("/api/dashboard"),
        fetch("/api/cases?status=action_needed,escalated,open,in_progress"),
        fetch("/api/signals?limit=30"),
        fetch("/api/tasks?status=open"),
      ]);
      if (dashRes.ok) setData(await dashRes.json());
      const casesData = await casesRes.json();
      setCases(casesData?.data || (Array.isArray(casesData) ? casesData : []));
      const sigData = await sigRes.json();
      setSignals(sigData?.signals || []);
      const taskData = await taskRes.json();
      setTasks(taskData?.data || (Array.isArray(taskData) ? taskData : []));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    const sb = createBrowserClient();
    const ch = sb.channel("dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "cases" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "signals" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "case_events" }, () => load())
      .subscribe();
    return () => { sb.removeChannel(ch); clearInterval(interval); };
  }, [load]);

  if (loading) return (
    <div className="space-y-4 animate-pulse">
      <div className="h-16 rounded-2xl bg-card" />
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 h-96 rounded-2xl bg-card" />
        <div className="h-96 rounded-2xl bg-card" />
      </div>
    </div>
  );
  if (!data) return <p className="text-muted-foreground text-center py-12">Failed to load dashboard</p>;

  const { metrics, scanner, gates } = data;

  // Sort cases: attention first, then by urgency
  const sortedCases = [...cases].sort((a, b) => {
    const aAttn = a.status === "action_needed" || a.status === "escalated" ? 1 : 0;
    const bAttn = b.status === "action_needed" || b.status === "escalated" ? 1 : 0;
    if (bAttn !== aAttn) return bAttn - aAttn;
    return a.urgency - b.urgency;
  });

  const attentionCases = sortedCases.filter(c => c.status === "action_needed" || c.status === "escalated");
  const otherCases = sortedCases.filter(c => c.status !== "action_needed" && c.status !== "escalated");

  const overdueTasks = tasks.filter(t => t.due_at && new Date(t.due_at) < new Date());
  const upcomingTasks = tasks.filter(t => !t.due_at || new Date(t.due_at) >= new Date()).slice(0, 8);

  async function quickAction(caseId: string, action: string) {
    const endpoint = action === "close" ? `/api/cases/${caseId}/close` : `/api/cases/${caseId}/status`;
    const body = action === "close" ? { reason: "Closed" } : { status: action };
    await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    load();
  }

  return (
    <div className="space-y-6">
      {/* ── HEADER BAR: Metrics + System Status ── */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Live pulse */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
          </span>
          <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Live</span>
        </div>

        {/* Key metrics as compact pills */}
        <MetricPill value={metrics.attention} label="Attention" alert={metrics.attention > 0} onClick={() => router.push("/cases?status=action_needed,escalated")} />
        <MetricPill value={metrics.critical} label="Critical" alert={metrics.critical > 0} onClick={() => router.push("/cases?filter=critical")} />
        <MetricPill value={metrics.pending_signals} label="Pending" warn={metrics.pending_signals > 0} onClick={() => router.push("/signals?status=pending")} />
        <MetricPill value={metrics.overdue_tasks} label="Overdue" alert={metrics.overdue_tasks > 0} onClick={() => router.push("/tasks?due=overdue")} />
        <MetricPill value={metrics.open} label="Open" onClick={() => router.push("/cases")} />
        <MetricPill value={metrics.signals_24h} label="24h Signals" onClick={() => router.push("/signals")} />
        <MetricPill value={metrics.handled} label="Handled" muted onClick={() => router.push("/cases?status=addressed,closed")} />
        <MetricPill value={metrics.entities} label="Entities" muted onClick={() => router.push("/entities")} />

        {/* Scanner status */}
        <div className="mr-auto" />
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span>Scan: {scanner.last_scan_ago_sec != null ? fmtSec(scanner.last_scan_ago_sec) + " ago" : "—"}</span>
          <span className="text-foreground/30">|</span>
          <span>Next: {scanner.next_scan_in_sec != null ? fmtSec(scanner.next_scan_in_sec) : "—"}</span>
          <span className="text-foreground/30">|</span>
          <span>{scanner.cases_scanned_today} scans today</span>
        </div>
      </div>

      {/* ── Empowerment line ── */}
      {data.latest_empowerment && (
        <div className="bg-primary/5 dark:bg-primary/10 border border-primary/20 rounded-xl px-5 py-3 text-sm text-foreground/90 font-medium leading-relaxed">
          {data.latest_empowerment}
        </div>
      )}

      {/* ── MAIN GRID ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

        {/* ── LEFT: Cases ── */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-4">
          {/* Attention cases */}
          {attentionCases.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" /></span>
                <h2 className="text-sm font-bold text-red-600 dark:text-red-400 uppercase tracking-wider">Needs Attention</h2>
                <span className="text-xs text-muted-foreground">({attentionCases.length})</span>
              </div>
              <div className="space-y-2">
                {attentionCases.map(c => (
                  <CaseRow key={c.id} c={c} expanded={expandedCase === c.id}
                    onToggle={() => setExpandedCase(expandedCase === c.id ? null : c.id)}
                    onOpen={() => router.push(`/cases/${c.id}`)}
                    onAction={quickAction} highlight />
                ))}
              </div>
            </section>
          )}

          {/* Other open cases */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-sm font-bold text-foreground/70 uppercase tracking-wider">Open Cases</h2>
              <span className="text-xs text-muted-foreground">({otherCases.length})</span>
              <div className="flex-1" />
              <button onClick={() => router.push("/cases")} className="text-xs text-primary hover:underline">View all</button>
            </div>
            <div className="space-y-1.5">
              {otherCases.slice(0, 12).map(c => (
                <CaseRow key={c.id} c={c} expanded={expandedCase === c.id}
                  onToggle={() => setExpandedCase(expandedCase === c.id ? null : c.id)}
                  onOpen={() => router.push(`/cases/${c.id}`)}
                  onAction={quickAction} />
              ))}
              {otherCases.length === 0 && (
                <p className="text-sm text-muted-foreground py-6 text-center">No open cases</p>
              )}
            </div>
          </section>
        </div>

        {/* ── RIGHT: Signals + Tasks + Gates ── */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-5">
          {/* Live Signals Feed */}
          <Card className="border-border/40 overflow-hidden">
            <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between bg-card">
              <h2 className="text-sm font-bold text-foreground/80 uppercase tracking-wider">Signals</h2>
              <button onClick={() => router.push("/signals")} className="text-[11px] text-primary hover:underline">All</button>
            </div>
            <CardContent className="p-0 max-h-[420px] overflow-y-auto">
              {signals.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No signals yet</p>
              ) : signals.slice(0, 20).map(s => (
                <div key={s.id}
                  className="flex gap-3 px-4 py-2.5 border-b border-border/20 last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={() => s.case_id ? router.push(`/cases/${s.case_id}`) : undefined}>
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0 ${GATE_BG[s.gates?.type || ""] || "bg-muted text-muted-foreground"}`}>
                    {GATE_ICONS[s.gates?.type || ""] || "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-foreground/80 truncate">{senderName(s)}</span>
                      {s.cases && <span className="text-[10px] text-primary font-mono">#{s.cases.case_number}</span>}
                      <span className="mr-auto" />
                      <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(s.occurred_at)}</span>
                    </div>
                    <p className="text-[12px] text-muted-foreground truncate leading-relaxed">{s.raw_payload?.content?.slice(0, 80)}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Tasks Due */}
          <Card className="border-border/40 overflow-hidden">
            <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between bg-card">
              <h2 className="text-sm font-bold text-foreground/80 uppercase tracking-wider">Tasks</h2>
              <div className="flex items-center gap-2">
                {overdueTasks.length > 0 && <Badge className="bg-red-500/15 text-red-600 dark:text-red-400 text-[10px]">{overdueTasks.length} overdue</Badge>}
                <button onClick={() => router.push("/tasks")} className="text-[11px] text-primary hover:underline">All</button>
              </div>
            </div>
            <CardContent className="p-0">
              {/* Overdue first */}
              {overdueTasks.map(t => (
                <div key={t.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-border/20 bg-red-500/5 hover:bg-red-500/10 transition-colors cursor-pointer"
                  onClick={() => router.push(`/cases/${t.case_id}`)}>
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                  <span className="text-xs font-medium text-foreground/90 truncate flex-1">{t.title}</span>
                  {t.cases && <span className="text-[10px] text-primary font-mono shrink-0">#{t.cases.case_number}</span>}
                </div>
              ))}
              {/* Upcoming */}
              {upcomingTasks.map(t => (
                <div key={t.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-border/20 last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={() => router.push(`/cases/${t.case_id}`)}>
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                  <span className="text-xs text-foreground/80 truncate flex-1">{t.title}</span>
                  {t.cases && <span className="text-[10px] text-primary font-mono shrink-0">#{t.cases.case_number}</span>}
                  {t.due_at && <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(t.due_at)}</span>}
                </div>
              ))}
              {tasks.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No open tasks</p>}
            </CardContent>
          </Card>

          {/* Gates */}
          <Card className="border-border/40 overflow-hidden">
            <div className="px-4 py-3 border-b border-border/40 bg-card">
              <h2 className="text-sm font-bold text-foreground/80 uppercase tracking-wider">Gates</h2>
            </div>
            <CardContent className="p-3 space-y-2">
              {gates.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No gates configured</p>
              ) : gates.map(g => {
                const meta = g.metadata || {};
                const st = gateStatus(meta);
                return (
                  <div key={g.id} className="flex items-center gap-3 px-2 py-1.5">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${GATE_BG[g.type] || "bg-muted text-muted-foreground"}`}>
                      {GATE_ICONS[g.type] || "??"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium truncate block">{g.display_name}</span>
                      <div className="flex gap-2 text-[10px] text-muted-foreground">
                        {meta.wa_phone && <span className="font-mono">{meta.wa_phone}</span>}
                        {meta.bot_username && <span className="font-mono">@{meta.bot_username}</span>}
                        {meta.message_count && <span>{meta.message_count} msgs</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`w-2 h-2 rounded-full ${st.dot}`} />
                      <span className="text-[11px] text-muted-foreground">{st.text}</span>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Recent AI Activity */}
          {data.recent_activity.length > 0 && (
            <Card className="border-border/40 overflow-hidden">
              <div className="px-4 py-3 border-b border-border/40 bg-card">
                <h2 className="text-sm font-bold text-foreground/80 uppercase tracking-wider">AI Activity</h2>
              </div>
              <CardContent className="p-0">
                {data.recent_activity.slice(0, 6).map(a => (
                  <div key={a.id}
                    className="flex items-start gap-3 px-4 py-2.5 border-b border-border/20 last:border-0 cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => router.push(`/cases/${a.case_id}`)}>
                    <span className="text-[10px] font-mono text-primary shrink-0 mt-0.5">#{a.case?.case_number}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-foreground/80 truncate">{a.empowerment_line || a.case?.title || "Scan"}</p>
                      {a.skills_pulled && a.skills_pulled.length > 0 && (
                        <div className="flex gap-1 mt-1">
                          {a.skills_pulled.map((s, i) => (
                            <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400">{s}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(a.created_at)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Metric Pill ── */
function MetricPill({ value, label, alert, warn, muted, onClick }: {
  value: number; label: string; alert?: boolean; warn?: boolean; muted?: boolean; onClick: () => void;
}) {
  const zero = value === 0;
  let cls = "bg-card border-border/50 text-foreground/80";
  if (alert && !zero) cls = "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400";
  else if (warn && !zero) cls = "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400";
  else if (muted || zero) cls = "bg-card border-border/30 text-muted-foreground";

  return (
    <button onClick={onClick}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all hover:scale-[1.02] active:scale-[0.98] ${cls}`}>
      <span className="text-base font-black tabular-nums">{value}</span>
      <span className="opacity-70">{label}</span>
    </button>
  );
}

/* ── Case Row with inline expand ── */
function CaseRow({ c, expanded, onToggle, onOpen, onAction, highlight }: {
  c: CaseItem; expanded: boolean; onToggle: () => void; onOpen: () => void;
  onAction: (id: string, action: string) => void; highlight?: boolean;
}) {
  const entities = (c.case_entities || [])
    .filter((ce, i, arr) => ce.entities && arr.findIndex(x => x.entities?.canonical_name === ce.entities?.canonical_name) === i)
    .slice(0, 3);

  return (
    <div className={`rounded-xl border transition-all ${highlight ? "border-red-500/30 bg-red-500/[0.03] dark:bg-red-500/[0.06]" : "border-border/40 bg-card"} ${expanded ? "shadow-sm" : "hover:border-primary/30"}`}>
      {/* Main row */}
      <button className="w-full flex items-center gap-3 px-4 py-3 text-right" onClick={onToggle}>
        {/* Urgency badge */}
        <span className={`w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-bold shrink-0 ${URGENCY_COLORS[c.urgency] || URGENCY_COLORS[3]}`}>
          {c.urgency}
        </span>
        {/* Status dot */}
        <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[c.status] || "bg-zinc-400"}`} />
        {/* Case number */}
        <span className="text-[11px] font-mono text-muted-foreground shrink-0">#{c.case_number}</span>
        {/* Title */}
        <span className="text-sm font-semibold text-foreground truncate flex-1 text-right">{c.title || `Case #${c.case_number}`}</span>
        {/* Entities */}
        <div className="hidden sm:flex gap-1 shrink-0">
          {entities.map((ce, i) => (
            <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground truncate max-w-20">{ce.entities?.canonical_name}</span>
          ))}
        </div>
        {/* Signals count + time */}
        <span className="text-[11px] text-muted-foreground shrink-0 w-16 text-left">{c.message_count} sig · {timeAgo(c.created_at)}</span>
        {/* Expand chevron */}
        <svg className={`w-4 h-4 text-muted-foreground/50 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded inline detail */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-border/30 space-y-3">
          {c.summary && <p className="text-sm text-foreground/70 leading-relaxed">{c.summary}</p>}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary" className="text-[10px]">{c.status.replace(/_/g, " ")}</Badge>
            <span className="text-[10px] text-muted-foreground">U{c.urgency} I{c.importance}</span>
            {c.next_scan_at && <span className="text-[10px] text-muted-foreground">scan in {timeAgo(c.next_scan_at)}</span>}
            {entities.map((ce, i) => (
              <Badge key={i} variant="outline" className="text-[10px]">{ce.entities?.canonical_name} <span className="opacity-50 ml-1">{ce.entities?.type}</span></Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="default" className="h-7 text-xs px-3" onClick={onOpen}>Open Case</Button>
            {c.status !== "addressed" && <Button size="sm" variant="secondary" className="h-7 text-xs px-3" onClick={() => onAction(c.id, "addressed")}>Done</Button>}
            {c.status !== "in_progress" && <Button size="sm" variant="ghost" className="h-7 text-xs px-3" onClick={() => onAction(c.id, "in_progress")}>Working</Button>}
            <Button size="sm" variant="ghost" className="h-7 text-xs px-3 text-destructive" onClick={() => onAction(c.id, "close")}>Close</Button>
          </div>
        </div>
      )}
    </div>
  );
}
