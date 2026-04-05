"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Gate = { id: string; type: string; display_name: string; status: string; metadata: Record<string, string>; created_at: string };
type Command = { id: string; command: string; params: Record<string, unknown>; status: string; created_at: string };
type Response = { id: string; command_id: string; data: Record<string, unknown>; created_at: string };
type Signal = { id: string; gate_id: string; sender_identifier: string; channel_identifier: string; raw_payload: Record<string, string>; status: string; created_at: string };

type ControlData = {
  gates: Gate[];
  commands: Command[];
  responses: Response[];
  signals: Signal[];
};

export default function WaControlPage() {
  const [data, setData] = useState<ControlData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLog, setActionLog] = useState<string[]>([]);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [tab, setTab] = useState<"overview" | "signals" | "commands" | "responses">("overview");
  const logRef = useRef<HTMLDivElement>(null);

  const log = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString();
    setActionLog(prev => [`[${ts}] ${msg}`, ...prev].slice(0, 200));
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/wa-control");
      if (res.ok) {
        setData(await res.json());
      }
    } catch (e) {
      log(`Fetch error: ${e}`);
    }
    setLoading(false);
  }, [log]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 5s
  useEffect(() => {
    const iv = setInterval(load, 5000);
    return () => clearInterval(iv);
  }, [load]);

  // Realtime updates
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return;
    const supabase = createClient(url, key);
    const channel = supabase.channel("wa-control-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "gates" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "signals" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "listener_commands" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "listener_responses" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  async function doAction(action: string, gateId?: string, params?: Record<string, unknown>) {
    setActiveAction(action);
    log(`> ${action}${gateId ? ` (gate: ${gateId.slice(0, 8)})` : ""}${params ? ` ${JSON.stringify(params)}` : ""}`);
    try {
      const res = await fetch("/api/wa-control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, gate_id: gateId, params }),
      });
      const result = await res.json();
      if (result.ok) {
        log(`  OK: ${result.message || "done"}`);
      } else {
        log(`  ERROR: ${result.error}`);
      }
      // If command was sent, poll for response
      if (result.command_id) {
        log(`  Command ID: ${result.command_id} — polling...`);
        const pollStart = Date.now();
        while (Date.now() - pollStart < 30000) {
          const pollRes = await fetch(`/api/listener/response?command_id=${result.command_id}`);
          const pollData = await pollRes.json();
          if (pollData?.data) {
            log(`  Response: ${JSON.stringify(pollData.data).slice(0, 300)}`);
            break;
          }
          await new Promise(r => setTimeout(r, 1500));
        }
      }
      await load();
    } catch (e) {
      log(`  FAIL: ${e}`);
    }
    setActiveAction(null);
  }

  function ago(ts: string) {
    const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
    return `${Math.floor(mins / 1440)}d ago`;
  }

  function heartbeat(meta: Record<string, string>) {
    if (!meta.last_heartbeat) return null;
    const mins = Math.floor((Date.now() - new Date(meta.last_heartbeat).getTime()) / 60000);
    if (mins < 10) return { label: "ONLINE", cls: "bg-emerald-500" };
    if (mins < 30) return { label: `${mins}m AGO`, cls: "bg-amber-500" };
    return { label: "OFFLINE", cls: "bg-red-500" };
  }

  if (loading) return <div className="p-6"><div className="h-32 bg-card rounded-xl animate-pulse" /></div>;

  const gates = data?.gates || [];
  const commands = data?.commands || [];
  const responses = data?.responses || [];
  const signals = data?.signals || [];

  const TABS = [
    { key: "overview" as const, label: "Overview", count: gates.length },
    { key: "signals" as const, label: "Signals", count: signals.length },
    { key: "commands" as const, label: "Commands", count: commands.length },
    { key: "responses" as const, label: "Responses", count: responses.length },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">WA Gate Control</h1>
          <p className="text-xs text-muted-foreground">Live control panel — auto-refreshes every 5s</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={load} disabled={!!activeAction}>Refresh</Button>
          <Button size="sm" variant="destructive" onClick={() => doAction("clear_commands")} disabled={!!activeAction}>
            Clear All Commands
          </Button>
        </div>
      </div>

      {/* Gate cards */}
      {gates.length === 0 ? (
        <Card><CardContent className="p-6 text-center text-muted-foreground text-sm">No WhatsApp gates found. Create one in Settings.</CardContent></Card>
      ) : gates.map(g => {
        const meta = g.metadata || {};
        const hb = heartbeat(meta);
        const isConnected = meta.wa_status === "connected";
        const gateSignals = signals.filter(s => s.gate_id === g.id);

        return (
          <Card key={g.id} className={isConnected ? "border-emerald-500/40" : "border-border/50"}>
            <CardContent className="p-4 space-y-3">
              {/* Header */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center text-sm font-bold text-emerald-600 dark:text-emerald-400 shrink-0">WA</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{g.display_name}</span>
                    {hb && <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold text-white ${hb.cls}`}>{hb.label}</span>}
                    <Badge variant="outline" className={`text-[10px] ${isConnected ? "text-emerald-600 border-emerald-300" : "text-red-500 border-red-300"}`}>
                      {meta.wa_status || "unknown"}
                    </Badge>
                  </div>
                  <div className="flex gap-4 mt-1 text-[11px] text-muted-foreground font-mono flex-wrap">
                    <span>ID: {g.id.slice(0, 8)}</span>
                    {meta.wa_phone && <span>Phone: {String(meta.wa_phone)}</span>}
                    {meta.message_count && <span>Msgs: {String(meta.message_count)}</span>}
                    <span>Signals: {gateSignals.length}</span>
                    {meta.last_heartbeat && <span>HB: {ago(String(meta.last_heartbeat))}</span>}
                    <span>Created: {ago(g.created_at)}</span>
                  </div>
                </div>
              </div>

              {/* Metadata dump */}
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground font-medium">Raw Metadata</summary>
                <pre className="mt-1 p-2 bg-muted/50 rounded-lg overflow-x-auto text-[10px] font-mono max-h-40 overflow-y-auto">{JSON.stringify(meta, null, 2)}</pre>
              </details>

              {/* Tracking config */}
              <div className="flex gap-3 items-center text-[11px]">
                <span className="text-muted-foreground font-medium uppercase tracking-wider text-[9px]">Track:</span>
                {["track_private", "track_groups", "track_status"].map(k => {
                  const v = meta[k];
                  const isOn = v === undefined || v === null ? k !== "track_status" : String(v) === "true";
                  return <span key={k} className={isOn ? "text-emerald-600" : "text-muted-foreground/50"}>{k.replace("track_", "")}: {isOn ? "ON" : "OFF"}</span>;
                })}
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2 pt-2 border-t border-border/30">
                <Button size="sm" variant="outline" className="h-7 text-[11px]" disabled={!!activeAction}
                  onClick={() => doAction("send_command", g.id, { command: "request_qr", command_params: { gate_id: g.id } })}>
                  Init (QR)
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-[11px]" disabled={!!activeAction}
                  onClick={() => doAction("send_command", g.id, { command: "disconnect_whatsapp", command_params: { gate_id: g.id } })}>
                  Disconnect
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-[11px]" disabled={!!activeAction}
                  onClick={() => doAction("send_command", g.id, { command: "get_stats", command_params: { gate_id: g.id } })}>
                  Get Stats
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-[11px]" disabled={!!activeAction}
                  onClick={() => doAction("send_command", g.id, { command: "pull_conversations", command_params: { gate_id: g.id } })}>
                  Pull Conversations
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-[11px]" disabled={!!activeAction}
                  onClick={() => doAction("send_command", g.id, { command: "rescan_history", command_params: { gate_id: g.id, hours: "24" } })}>
                  Rescan 24h
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-[11px] text-blue-600" disabled={!!activeAction}
                  onClick={() => doAction("push_dummy", g.id)}>
                  Push Dummy Msg
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-[11px] text-amber-600" disabled={!!activeAction}
                  onClick={() => doAction("reset_gate_status", g.id)}>
                  Reset Status
                </Button>
                <Button size="sm" variant="destructive" className="h-7 text-[11px]" disabled={!!activeAction}
                  onClick={() => { if (confirm("Clear ALL signals for this gate?")) doAction("clear_signals", g.id); }}>
                  Clear Signals
                </Button>
              </div>
              {activeAction && <p className="text-[11px] text-muted-foreground animate-pulse">Running: {activeAction}...</p>}
            </CardContent>
          </Card>
        );
      })}

      {/* Data tabs */}
      <div className="flex gap-1 bg-card rounded-xl p-1">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all ${
              tab === t.key ? "bg-primary/15 text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}>
            {t.label} <span className="text-[10px] opacity-60">({t.count})</span>
          </button>
        ))}
      </div>

      {/* Signals list */}
      {tab === "signals" && (
        <div className="space-y-1 max-h-[500px] overflow-y-auto">
          {signals.length === 0 ? <p className="text-sm text-muted-foreground p-4">No signals</p> :
            signals.map(s => (
              <div key={s.id} className="flex items-start gap-2 p-2 bg-card rounded-lg text-xs border border-border/30">
                <Badge variant="outline" className={`text-[9px] shrink-0 ${s.status === "pending" ? "text-amber-600" : s.status === "processed" ? "text-emerald-600" : "text-muted-foreground"}`}>
                  {s.status}
                </Badge>
                <div className="flex-1 min-w-0">
                  <div className="flex gap-2 items-center">
                    <span className="font-medium">{s.raw_payload?.sender_name || s.sender_identifier || "?"}</span>
                    <span className="text-muted-foreground">{ago(s.created_at)}</span>
                    <span className="font-mono text-[9px] text-muted-foreground/50">{s.id.slice(0, 8)}</span>
                  </div>
                  <p className="text-muted-foreground truncate">{s.raw_payload?.content || "—"}</p>
                </div>
              </div>
            ))
          }
        </div>
      )}

      {/* Commands list */}
      {tab === "commands" && (
        <div className="space-y-1 max-h-[500px] overflow-y-auto">
          {commands.length === 0 ? <p className="text-sm text-muted-foreground p-4">No commands</p> :
            commands.map(c => (
              <div key={c.id} className="flex items-center gap-2 p-2 bg-card rounded-lg text-xs border border-border/30">
                <Badge variant="outline" className={`text-[9px] ${c.status === "pending" ? "text-amber-600" : c.status === "completed" ? "text-emerald-600" : "text-muted-foreground"}`}>
                  {c.status}
                </Badge>
                <span className="font-mono font-medium">{c.command}</span>
                <span className="text-muted-foreground flex-1 truncate font-mono text-[10px]">{JSON.stringify(c.params)}</span>
                <span className="text-muted-foreground shrink-0">{ago(c.created_at)}</span>
                <span className="font-mono text-[9px] text-muted-foreground/50">{c.id.slice(0, 8)}</span>
              </div>
            ))
          }
        </div>
      )}

      {/* Responses list */}
      {tab === "responses" && (
        <div className="space-y-1 max-h-[500px] overflow-y-auto">
          {responses.length === 0 ? <p className="text-sm text-muted-foreground p-4">No responses</p> :
            responses.map(r => (
              <div key={r.id} className="p-2 bg-card rounded-lg text-xs border border-border/30">
                <div className="flex gap-2 items-center mb-1">
                  <span className="font-mono text-[10px]">cmd: {r.command_id.slice(0, 8)}</span>
                  <span className="text-muted-foreground">{ago(r.created_at)}</span>
                  <span className="font-mono text-[9px] text-muted-foreground/50">{r.id.slice(0, 8)}</span>
                </div>
                <pre className="text-[10px] font-mono bg-muted/50 rounded p-1.5 overflow-x-auto max-h-24 overflow-y-auto">{JSON.stringify(r.data, null, 2)}</pre>
              </div>
            ))
          }
        </div>
      )}

      {/* Overview - summary stats */}
      {tab === "overview" && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Gates", value: gates.length, sub: `${gates.filter(g => g.metadata?.wa_status === "connected").length} connected` },
            { label: "Pending Signals", value: signals.filter(s => s.status === "pending").length, sub: `of ${signals.length} total` },
            { label: "Pending Commands", value: commands.filter(c => c.status === "pending").length, sub: `of ${commands.length} total` },
            { label: "Responses", value: responses.length, sub: responses[0] ? `latest ${ago(responses[0].created_at)}` : "none" },
          ].map(s => (
            <Card key={s.label}><CardContent className="p-4">
              <p className="text-2xl font-bold">{s.value}</p>
              <p className="text-xs font-medium">{s.label}</p>
              <p className="text-[10px] text-muted-foreground">{s.sub}</p>
            </CardContent></Card>
          ))}
        </div>
      )}

      {/* Action log */}
      <Card>
        <CardContent className="p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Action Log</span>
            <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => setActionLog([])}>Clear</Button>
          </div>
          <div ref={logRef} className="max-h-48 overflow-y-auto font-mono text-[11px] space-y-0.5">
            {actionLog.length === 0 ? <p className="text-muted-foreground">No actions yet. Use the buttons above.</p> :
              actionLog.map((line, i) => (
                <div key={i} className={`${line.includes("ERROR") || line.includes("FAIL") ? "text-red-500" : line.includes("OK") ? "text-emerald-600" : "text-muted-foreground"}`}>
                  {line}
                </div>
              ))
            }
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
