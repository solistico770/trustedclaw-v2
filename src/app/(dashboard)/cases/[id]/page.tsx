"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { DEMO_USER_ID } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { URGENCY_LABELS, IMPORTANCE_LABELS, LEVEL_COLORS, getScanIntervalSeconds, getScanIntervalLabel } from "@/lib/scan-intervals";

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
  return <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold ${c.bg} ${c.text}`}>{level}</span>;
}

export default function CaseDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [tab, setTab] = useState<"messages" | "agent" | "history">("messages");

  const load = useCallback(async () => {
    const d = await (await fetch(`/api/cases/${id}`)).json();
    setData(d); setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function changeStatus(status: string) {
    await fetch(`/api/cases/${id}/status`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: DEMO_USER_ID, status }),
    });
    load();
  }

  async function scanNow() {
    setScanning(true);
    await fetch(`/api/agent/scan/${id}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: DEMO_USER_ID }),
    });
    await load(); setScanning(false);
  }

  if (loading) return <div className="h-64 rounded-xl bg-card animate-pulse" />;
  if (!data?.case) return <p className="text-muted-foreground">Case not found.</p>;
  const c = data.case;
  const st = STATUS_STYLE[c.status] || STATUS_STYLE.open;

  return (
    <div className="space-y-6">
      {/* Back */}
      <button onClick={() => router.push("/")} className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
        <svg className="w-4 h-4 rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        Back to Cases
      </button>

      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold text-foreground leading-tight">{c.title || `Case ${c.id.slice(0, 8)}`}</h1>
        {c.summary && <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{c.summary}</p>}
      </div>

      {/* Info grid */}
      {(() => {
        const scanInterval = getScanIntervalSeconds(c.urgency, c.importance);
        return (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border/50 rounded-xl overflow-hidden">
            <div className="bg-card p-4">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Status</p>
              <p className={`text-lg font-bold mt-1 ${st.color}`}>{st.label}</p>
            </div>
            <div className="bg-card p-4">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Urgency</p>
              <div className="flex items-center gap-2 mt-1">
                <LevelDot level={c.urgency} />
                <span className="text-sm font-medium">{URGENCY_LABELS[c.urgency]}</span>
              </div>
            </div>
            <div className="bg-card p-4">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Importance</p>
              <div className="flex items-center gap-2 mt-1">
                <LevelDot level={c.importance} />
                <span className="text-sm font-medium">{IMPORTANCE_LABELS[c.importance]}</span>
              </div>
            </div>
            <div className="bg-card p-4">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Next Scan</p>
              <p className="text-lg font-bold mt-1 text-foreground/80">
                {c.next_scan_at && c.status !== "closed"
                  ? new Date(c.next_scan_at).toLocaleString("he-IL", { hour: "2-digit", minute: "2-digit" })
                  : "—"}
              </p>
              <p className="text-[10px] text-muted-foreground">every {getScanIntervalLabel(scanInterval)}</p>
            </div>
          </div>
        );
      })()}

      {/* Entities */}
      {data.entities?.length > 0 && (
        <Card className="border-border/50">
          <CardContent className="p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">Connected Entities</p>
            <div className="flex gap-2 flex-wrap">
              {data.entities.map((ce: { entities: { canonical_name: string; type: string; status: string } | null }, i: number) => (
                <span key={i} className={`text-sm px-3 py-1.5 rounded-lg font-medium ${
                  ce.entities?.status === "active"
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"
                    : "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
                }`}>
                  {ce.entities?.canonical_name}
                  <span className="opacity-50 ml-1 text-xs">({ce.entities?.type})</span>
                  {ce.entities?.status === "proposed" && <span className="ml-1 text-xs">*</span>}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex gap-2 flex-wrap">
        <Button onClick={scanNow} disabled={scanning} className="bg-primary hover:bg-primary/90">
          {scanning ? "Scanning..." : "Scan Now"}
        </Button>
        {c.status !== "in_progress" && <Button variant="secondary" onClick={() => changeStatus("in_progress")}>Start Working</Button>}
        {c.status !== "addressed" && <Button variant="secondary" onClick={() => changeStatus("addressed")}>Addressed</Button>}
        {c.status !== "closed" && <Button variant="ghost" className="text-destructive" onClick={() => changeStatus("closed")}>Close</Button>}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-card rounded-xl p-1">
        {([
          { key: "messages", label: `Messages (${data.messages?.length || 0})` },
          { key: "agent", label: `Agent (${data.case_events?.length || 0})` },
          { key: "history", label: "Log" },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setTab(t.key as typeof tab)}
            className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
              tab === t.key ? "bg-primary/15 text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Messages */}
      {tab === "messages" && (
        <div className="space-y-2">
          {(data.messages || []).map((m: { id: string; raw_payload: Record<string, string>; sender_identifier: string; occurred_at: string }) => (
            <div key={m.id} className="flex gap-3 p-3 rounded-lg bg-card/50 hover:bg-card transition-colors">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                {(m.sender_identifier || "?")[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground/90">{m.sender_identifier}</span>
                  <span className="text-[11px] text-muted-foreground">{new Date(m.occurred_at).toLocaleString("he-IL")}</span>
                </div>
                <p className="text-sm text-foreground/80 mt-0.5 leading-relaxed">{m.raw_payload?.content}</p>
              </div>
            </div>
          ))}
          {(!data.messages || data.messages.length === 0) && <p className="text-sm text-muted-foreground text-center py-8">No messages yet.</p>}
        </div>
      )}

      {/* Agent History */}
      {tab === "agent" && (
        <div className="space-y-4">
          {(data.case_events || []).map((ev: {
            id: string; event_type: string; status?: string;
            in_context: Record<string, unknown>;
            out_raw: { reasoning?: string; decision?: string; commands?: Array<{ type: string; value?: unknown; name?: string }> };
            api_commands: Array<{ type: string; value?: unknown; name?: string }>;
            commands_executed?: Array<{ type: string; status: string; detail?: string }>;
            skills_pulled?: string[];
            tokens_used: number; duration_ms: number; error_message?: string; created_at: string;
          }) => (
            <Card key={ev.id} className="border-border/50">
              <CardContent className="p-4 space-y-3">
                {/* Header */}
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary" className="text-[11px]">{ev.event_type}</Badge>
                  <Badge className={`text-[10px] ${ev.status === "failed" ? "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-400" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400"}`}>{ev.status || "success"}</Badge>
                  <span className="text-[11px] text-muted-foreground">{new Date(ev.created_at).toLocaleString("he-IL")}</span>
                  <span className="text-[11px] text-muted-foreground mr-auto">{ev.tokens_used} tokens · {ev.duration_ms}ms</span>
                </div>

                {/* AI Response */}
                {ev.out_raw?.reasoning && (
                  <div className="bg-muted/30 rounded-lg p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">AI Response</p>
                    <p className="text-sm text-foreground/90">{ev.out_raw.reasoning}</p>
                    {ev.out_raw.decision && <p className="text-xs text-muted-foreground mt-1">Decision: <strong>{ev.out_raw.decision}</strong></p>}
                  </div>
                )}

                {/* Commands Requested by LLM */}
                {ev.api_commands?.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5">LLM Commands</p>
                    <div className="flex gap-1.5 flex-wrap">
                      {ev.api_commands.map((cmd: { type: string; value?: unknown; name?: string }, i: number) => (
                        <span key={i} className="text-[11px] px-2 py-1 rounded-md bg-secondary text-secondary-foreground font-mono">
                          {cmd.type}{cmd.value !== undefined ? `=${String(cmd.value).slice(0, 30)}` : cmd.name ? `=${cmd.name}` : ""}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Commands Executed (results) */}
                {ev.commands_executed && ev.commands_executed.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5">Execution Results</p>
                    {ev.commands_executed.map((cmd: { type: string; status: string; detail?: string }, j: number) => (
                      <div key={j} className="flex items-center gap-2 text-xs py-0.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${cmd.status === "ok" || cmd.status === "linked_existing" || cmd.status === "created" ? "bg-emerald-500" : "bg-red-500"}`} />
                        <span className="font-mono text-foreground/70">{cmd.type}</span>
                        <span className="text-muted-foreground">{cmd.status}</span>
                        {cmd.detail && <span className="text-muted-foreground/70 truncate">{cmd.detail}</span>}
                      </div>
                    ))}
                  </div>
                )}

                {/* Skills */}
                {ev.skills_pulled && ev.skills_pulled.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Skills pulled:</span>
                    {ev.skills_pulled.map((s: string, j: number) => <Badge key={j} className="bg-primary/15 text-primary text-[10px]">{s}</Badge>)}
                  </div>
                )}

                {/* Error */}
                {ev.error_message && <p className="text-xs text-red-500 font-mono bg-red-50 dark:bg-red-500/10 p-2 rounded">{ev.error_message}</p>}

                {/* Context (collapsible) */}
                <details>
                  <summary className="text-[11px] text-primary cursor-pointer hover:underline">Show full context sent to LLM</summary>
                  <pre className="mt-1 text-[10px] text-muted-foreground whitespace-pre-wrap bg-muted p-3 rounded-lg max-h-60 overflow-auto font-mono">
                    {JSON.stringify(ev.in_context, null, 2)}
                  </pre>
                </details>
              </CardContent>
            </Card>
          ))}
          {(!data.case_events || data.case_events.length === 0) && (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">No agent interactions yet</p>
              <Button size="sm" className="mt-3" onClick={scanNow} disabled={scanning}>{scanning ? "Scanning..." : "Run First Scan"}</Button>
            </div>
          )}
        </div>
      )}

      {/* Audit History */}
      {tab === "history" && (
        <div className="space-y-1">
          {(data.history || []).map((h: { id: string; actor: string; action_type: string; reasoning: string; created_at: string }, i: number) => (
            <div key={i} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-card/50 text-sm">
              <span className="text-[11px] text-muted-foreground w-32 shrink-0 font-mono">{new Date(h.created_at).toLocaleString("he-IL")}</span>
              <Badge variant="secondary" className="text-[10px] shrink-0">{h.actor}</Badge>
              <span className="text-foreground/70 text-[13px]">{h.action_type}</span>
              {h.reasoning && <span className="text-muted-foreground text-[12px] truncate mr-auto">{h.reasoning}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
