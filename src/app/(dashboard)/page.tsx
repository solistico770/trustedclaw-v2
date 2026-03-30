"use client";
import { useEffect, useState, useCallback } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useRouter } from "next/navigation";

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

function fmtSec(s: number) { return s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`; }
function timeAgo(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

const STAT_TILES = [
  { key: "pending_signals", label: "Pending", href: "/signals?status=pending", color: "text-amber-600 dark:text-amber-400", icon: "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" },
  { key: "signals_24h", label: "24h Signals", href: "/signals", color: "text-cyan-600 dark:text-cyan-400", icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" },
  { key: "attention", label: "Attention", href: "/cases?status=action_needed,escalated", color: "text-red-600 dark:text-red-400", icon: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.962-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" },
  { key: "critical", label: "Critical", href: "/cases?filter=critical", color: "text-red-600 dark:text-red-400", icon: "M13 10V3L4 14h7v7l9-11h-7z" },
  { key: "open", label: "Open", href: "/cases", color: "text-blue-600 dark:text-blue-400", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" },
  { key: "overdue_tasks", label: "Overdue", href: "/tasks?due=overdue", color: "text-red-600 dark:text-red-400", icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" },
  { key: "handled", label: "Handled", href: "/cases?status=addressed,closed", color: "text-emerald-600 dark:text-emerald-400", icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" },
  { key: "entities", label: "Entities", href: "/entities", color: "text-violet-600 dark:text-violet-400", icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" },
];

const GATE_ICONS: Record<string, string> = { whatsapp: "WA", telegram: "TG", email: "EM", slack: "SL" };
const GATE_COLORS: Record<string, string> = {
  whatsapp: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  telegram: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
};

function gateStatus(meta: Record<string, string>): { text: string; cls: string } {
  if (!meta.last_heartbeat) return { text: "no data", cls: "text-zinc-500" };
  const mins = Math.floor((Date.now() - new Date(meta.last_heartbeat).getTime()) / 60000);
  if (mins < 10) return { text: "online", cls: "text-emerald-500" };
  if (mins < 30) return { text: `${mins}m ago`, cls: "text-amber-500" };
  return { text: "offline", cls: "text-red-500" };
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard");
      if (res.ok) setData(await res.json());
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

  if (loading) return <div className="space-y-3 animate-pulse">{[1,2,3].map(i => <div key={i} className="h-20 rounded-xl bg-card" />)}</div>;
  if (!data) return <p className="text-muted-foreground text-center py-12">Failed to load dashboard</p>;

  const { metrics, scanner, gates, recent_activity } = data;

  return (
    <div className="space-y-5">
      {/* Empowerment line */}
      {data.latest_empowerment && (
        <div className="bg-primary/5 dark:bg-primary/10 border border-primary/20 rounded-xl px-5 py-3 text-sm text-foreground/90 font-medium">
          {data.latest_empowerment}
        </div>
      )}

      {/* Metric tiles */}
      <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
        {STAT_TILES.map(s => {
          const val = metrics[s.key as keyof Metrics] || 0;
          const dimmed = val === 0 && (s.key === "attention" || s.key === "critical" || s.key === "overdue_tasks" || s.key === "pending_signals");
          return (
            <button key={s.key} onClick={() => router.push(s.href)}
              className="rounded-xl p-3 text-center transition-all border border-border/50 bg-card hover:border-primary/30">
              <svg className={`w-4 h-4 mx-auto mb-1 ${dimmed ? "text-foreground/20" : s.color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d={s.icon} />
              </svg>
              <p className={`text-xl font-black ${dimmed ? "text-foreground/20" : s.color}`}>{val}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{s.label}</p>
            </button>
          );
        })}
      </div>

      {/* System status bar */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground px-1">
        <span className="text-emerald-500">● live</span>
        <span>Last scan: {scanner.last_scan_ago_sec != null ? fmtSec(scanner.last_scan_ago_sec) + " ago" : "—"}</span>
        <span>{scanner.cases_scanned_today} scans today</span>
        <span>Next: {scanner.next_scan_in_sec != null ? fmtSec(scanner.next_scan_in_sec) : "—"}</span>
        <span>{metrics.signals_total} signals total</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Gate Health */}
        <Card className="border-border/50">
          <CardContent className="p-4 space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Gates</h2>
            {gates.length === 0 ? (
              <p className="text-xs text-muted-foreground">No gates configured</p>
            ) : gates.map(g => {
              const meta = g.metadata || {};
              const st = gateStatus(meta);
              const isConnected = meta.wa_status === "connected" || meta.tg_status === "connected";
              return (
                <div key={g.id} className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${GATE_COLORS[g.type] || "bg-primary/10 text-primary"}`}>
                    {GATE_ICONS[g.type] || "??"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{g.display_name}</span>
                      <span className={`text-[10px] font-medium ${st.cls}`}>● {st.text}</span>
                    </div>
                    <div className="flex gap-2 text-[10px] text-muted-foreground">
                      {meta.wa_phone && <span className="font-mono">{meta.wa_phone}</span>}
                      {meta.bot_username && <span className="font-mono">@{meta.bot_username}</span>}
                      {meta.message_count && <span>{meta.message_count} msgs</span>}
                    </div>
                  </div>
                  {isConnected && <Badge variant="outline" className="text-[10px] text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-500/30">Connected</Badge>}
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Recent AI Activity */}
        <Card className="border-border/50 lg:col-span-2">
          <CardContent className="p-4 space-y-2">
            <h2 className="text-sm font-semibold text-foreground">Recent AI Activity</h2>
            {recent_activity.length === 0 ? (
              <p className="text-xs text-muted-foreground">No recent AI activity</p>
            ) : recent_activity.map(a => (
              <div key={a.id}
                className="flex items-start gap-3 py-2 border-b border-border/30 last:border-0 cursor-pointer hover:bg-muted/30 rounded-lg px-2 -mx-2 transition-colors"
                onClick={() => router.push(`/cases/${a.case_id}`)}
              >
                <div className="shrink-0 w-8 text-right">
                  <span className="text-[10px] font-mono text-primary">#{a.case?.case_number}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{a.case?.title || `Case #${a.case?.case_number}`}</p>
                  {a.empowerment_line && (
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">{a.empowerment_line}</p>
                  )}
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
      </div>
    </div>
  );
}
